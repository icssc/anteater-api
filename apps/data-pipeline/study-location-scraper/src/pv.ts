import type { database } from "@packages/db";
import { inArray, sql } from "@packages/db/drizzle";
import { studyLocation, studyRoom, studyRoomSlot } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import fetch from "cross-fetch";
import { z } from "zod";

// Schemas
const bookingsServiceSchema = z.object({
  serviceId: z.string(),
  title: z.string(),
  description: z.string(),
  defaultDuration: z.string(),
  staffMemberIds: z.string().array(),
  webUrl: z.string(),
});

const availabilityStatusSchema = z.enum([
  "BOOKINGSAVAILABILITYSTATUS_AVAILABLE",
  "BOOKINGSAVAILABILITYSTATUS_BUSY",
  "BOOKINGSAVAILABILITYSTATUS_OUT_OF_OFFICE",
]);

const bookingsDateTimeSchema = z.object({
  dateTime: z.string(),
  timeZone: z.string(),
});

const availabilityItemSchema = z.object({
  status: availabilityStatusSchema,
  startDateTime: bookingsDateTimeSchema,
  endDateTime: bookingsDateTimeSchema,
  serviceId: z.string(),
});

const staffAvailabilitySchema = z.object({
  staffId: z.string(),
  availabilityItems: availabilityItemSchema.array(),
});

const servicesResponseSchema = z.object({
  service: bookingsServiceSchema.array(),
});

const staffAvailabilityResponseSchema = z.object({
  staffAvailabilityResponse: staffAvailabilitySchema.array(),
});

type BookingsService = z.infer<typeof bookingsServiceSchema>;
type AvailabilityItem = z.infer<typeof availabilityItemSchema>;
type StaffAvailability = z.infer<typeof staffAvailabilitySchema>;
type BookingsDateTime = z.infer<typeof bookingsDateTimeSchema>;

type Slot = {
  studyRoomId: string;
  start: Date;
  end: Date;
  isAvailable: boolean;
};

// Constants
const BOOKINGS_BASE_URL =
  "https://outlook.office365.com/BookingsService/api/V1/bookingBusinessesc2/PlazaVerde3@americancampus.onmicrosoft.com";

const SERVICES_URL = `${BOOKINGS_BASE_URL}/services`;
const AVAILABILITY_URL = `${BOOKINGS_BASE_URL}/GetStaffAvailability`;

const STUDY_LOCATION_ID = "pv1";
const STUDY_LOCATION_NAME = "Plaza Verde";
const SLOT_INTERVAL_MINUTES = 15;
const DAYS_TO_FETCH = 2;

// Generates valid slots from an availability window given its duration
function generateSlotsFromAvailableWindow(
  studyRoomId: string,
  start: Date,
  end: Date,
  durationMinutes: number,
): Slot[] {
  const slots: Slot[] = [];

  const lastStartTime = new Date(end.getTime() - durationMinutes * 60 * 1000);

  for (
    let currentStart = new Date(start.getTime());
    currentStart <= lastStartTime;
    currentStart.setTime(currentStart.getTime() + SLOT_INTERVAL_MINUTES * 60 * 1000)
  ) {
    const slotEnd = new Date(currentStart.getTime() + durationMinutes * 60 * 1000);

    slots.push({
      studyRoomId,
      start: new Date(currentStart.getTime()),
      end: slotEnd,
      isAvailable: true,
    });
  }

  return slots;
}

// Each service has "availability slots/items". Find the ones marked AVAILABLE and generate the slots
function processAvailabilityItems(
  studyRoomId: string,
  availabilityItems: AvailabilityItem[],
  durationMinutes: number,
): Slot[] {
  const slots: Slot[] = [];

  for (const item of availabilityItems) {
    // Treat the returned wall-clock time as UTC to avoid timezone shifting on storage.
    const start = new Date(`${item.startDateTime.dateTime}Z`);
    const end = new Date(`${item.endDateTime.dateTime}Z`);

    if (item.status === "BOOKINGSAVAILABILITYSTATUS_AVAILABLE") {
      const availableSlots = generateSlotsFromAvailableWindow(
        studyRoomId,
        start,
        end,
        durationMinutes,
      );
      slots.push(...availableSlots);
    }
  }

  return slots;
}

async function fetchServices(): Promise<BookingsService[]> {
  const payload = {
    queryOptions: {
      filter: {
        or: {
          filters: [
            {
              attributeFilter: {
                attributeName: "BookingServiceCategory",
                operator: "FILTER_OPERATOR_TYPE_EQUAL",
                stringValue: "BOOKING_SERVICE_CATEGORY_SCHEDULED",
              },
            },
            {
              attributeFilter: {
                attributeName: "BookingServiceCategory",
                operator: "FILTER_OPERATOR_TYPE_EQUAL",
                stringValue: "BOOKING_SERVICE_CATEGORY_ON_DEMAND",
              },
            },
          ],
        },
      },
    },
  };

  const res = await fetch(SERVICES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = servicesResponseSchema.parse(await res.json());
  return data.service;
}

/**
 * Adds days to a date string formatted by Intl (M/D/YYYY or MM/DD/YYYY).
 * Uses Date.UTC as a naive date container for calendar math,
 * then formats back with timeZone: 'UTC' to avoid timezone conversion.
 */
function addDaysToIntlDate(intlDateString: string, daysToAdd: number): string {
  const [month, day, year] = intlDateString.split("/").map(Number);

  const newDate = new Date(Date.UTC(year, month - 1, day + daysToAdd));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(newDate);
}

/**
 * Converts an Intl-formatted date string (M/D/YYYY or MM/DD/YYYY) to the API format.
 */
function formatDateForAPI(intlDateString: string, boundary: "start" | "end") {
  const [month, day, year] = intlDateString.split("/").map(Number);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return {
    // note: start time is always 00:00 to work around an API bug. Currently, the API response always starts
    // with an AVAILABLE interval. If the query starts during an ongoing BUSY interval, the response still
    // treats the interval as AVAILABLE and creates a new AVAILABLE interval from start time until the next
    // existing interval. Thus, the time range returned by this function makes us fetch all slots for the
    // current day, including ones that have passed. Slots starting before the current time are filtered out in scrapePlazaVerde().
    dateTime: boundary === "end" ? `${year}-${mm}-${dd}T23:59:00` : `${year}-${mm}-${dd}T00:00:00`,
    // note: "Pacific Standard Time" handles both PST/PDT automatically; there is no separate PDT timezone in this API.
    timeZone: "Pacific Standard Time",
  };
}

/**
 * The duration of each staffId is stored inside each service in ISO 8601 duration format (e.g., PT1H, PT2H, PT3H).
 * Returns the duration in minutes.
 */
function parseISO8601Duration(duration: string): number {
  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);

  const hours = hoursMatch ? Number.parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? Number.parseInt(minutesMatch[1], 10) : 0;

  return hours * 60 + minutes;
}

// given an array of staffIds, fetch the schedule within the given date
async function fetchStaffAvailability(
  staffIds: string[],
  startDateTime: BookingsDateTime,
  endDateTime: BookingsDateTime,
): Promise<StaffAvailability[]> {
  const payload = {
    staffIds,
    startDateTime,
    endDateTime,
  };

  const res = await fetch(AVAILABILITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = staffAvailabilityResponseSchema.parse(await res.json());

  return data.staffAvailabilityResponse;
}

// bulk of the processing logic
async function scrapePlazaVerde(): Promise<{
  location: typeof studyLocation.$inferInsert;
  rooms: (typeof studyRoom.$inferInsert)[];
  slots: Slot[];
}> {
  // note: maybe there's some way to cache the service data so we can skip this part
  const services = await fetchServices();

  // Plaza Verde represents the study rooms using "staff members", each with their own availability. The set of staff IDs is the set of unique rooms:
  const allStaffIds = [...new Set(services.flatMap((service) => service.staffMemberIds))];

  const now = new Date();

  // Get today's date formatted in LA timezone as a string (M/D/YYYY)
  const dateInLA = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(now);

  const endDateInLA = addDaysToIntlDate(dateInLA, DAYS_TO_FETCH);

  const startDateTime = formatDateForAPI(dateInLA, "start");
  const endDateTime = formatDateForAPI(endDateInLA, "end");

  console.log(
    `PV study rooms scraped from ${startDateTime.dateTime} to ${endDateTime.dateTime} Pacific Standard Time`,
  );
  const availabilities = await fetchStaffAvailability(allStaffIds, startDateTime, endDateTime);

  const availabilityMap = new Map<string, AvailabilityItem[]>();
  for (const availability of availabilities) {
    availabilityMap.set(availability.staffId, availability.availabilityItems);
  }

  const rooms: (typeof studyRoom.$inferInsert)[] = [];
  const slots: Slot[] = [];

  for (const service of services) {
    // push room data for each service
    rooms.push({
      id: service.serviceId,
      name: service.title,
      capacity: null,
      location: STUDY_LOCATION_NAME,
      description: service.description,
      directions: "",
      techEnhanced: null,
      // pv does not support deep linking to specific time slots.
      // all slots will link to the booking page for its respective pv room.
      url: service.webUrl,
      studyLocationId: STUDY_LOCATION_ID,
    });

    const durationMinutes = parseISO8601Duration(service.defaultDuration);

    // iterate through service.staffMemberIds, although it's usually an array with 1 element
    for (const staffId of service.staffMemberIds) {
      const availabilityItems = availabilityMap.get(staffId);
      if (availabilityItems) {
        const roomSlots = processAvailabilityItems(
          service.serviceId,
          availabilityItems,
          durationMinutes,
        );
        slots.push(...roomSlots);
      }
    }
  }

  // filter slots so that we only return those that are yet to start
  const filteredSlots = slots.filter((s) => s.start >= now);

  // create location record
  const location = {
    id: STUDY_LOCATION_ID,
    name: STUDY_LOCATION_NAME,
  };

  return { location, rooms, slots: filteredSlots };
}

/**
 * main entry point. call scrape and insert to db
 */
export async function doPVScrape(db: ReturnType<typeof database>) {
  const { location, rooms, slots } = await scrapePlazaVerde();
  const roomIds = rooms.map((room) => room.id);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET TIME ZONE 'America/Los_Angeles';`);

    await tx
      .insert(studyLocation)
      .values(location)
      .onConflictDoUpdate({
        target: studyLocation.id,
        set: conflictUpdateSetAllCols(studyLocation),
      });

    await tx
      .insert(studyRoom)
      .values(rooms)
      .onConflictDoUpdate({
        target: studyRoom.id,
        set: conflictUpdateSetAllCols(studyRoom),
      });

    await tx.delete(studyRoomSlot).where(inArray(studyRoomSlot.studyRoomId, roomIds));

    await tx
      .insert(studyRoomSlot)
      .values(slots)
      .onConflictDoUpdate({
        target: [studyRoomSlot.studyRoomId, studyRoomSlot.start, studyRoomSlot.end],
        set: conflictUpdateSetAllCols(studyRoomSlot),
      });
  });
}
