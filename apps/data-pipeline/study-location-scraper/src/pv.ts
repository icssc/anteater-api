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
    // Parse the UTC offset from the API response timezone
    const startOffset = item.startDateTime.timeZone.match(/UTC([+-]\d{2}:\d{2})/)?.[1];
    const endOffset = item.endDateTime.timeZone.match(/UTC([+-]\d{2}:\d{2})/)?.[1];
    const start = new Date(`${item.startDateTime.dateTime}${startOffset}`);
    const end = new Date(`${item.endDateTime.dateTime}${endOffset}`);

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

function formatDateForAPI(date: Date, boundary: "start" | "end") {
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // avoid midnight being 24:00
    timeZone: "America/Los_Angeles",
  });

  const p = Object.fromEntries(formatter.formatToParts(date).map((x) => [x.type, x.value]));

  return {
    // note: the start time should be 00:00 because of a bug where if you start
    // in the middle of some BUSY interval, the API incorrectly assumes its AVAILABLE
    dateTime:
      boundary === "end"
        ? `${p.year}-${p.month}-${p.day}T23:59:00`
        : `${p.year}-${p.month}-${p.day}T00:00:00`,
    // note: it looks microsoft timezone automatically switches between PST and PDT.
    // there is not separate PDT timezone (and the API will not accept it)
    // if this ends up not being true, we can fix it
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
  startDate: Date,
  endDate: Date,
): Promise<StaffAvailability[]> {
  const payload = {
    staffIds,
    startDateTime: formatDateForAPI(startDate, "start"),
    endDateTime: formatDateForAPI(endDate, "end"),
  };
  console.log(payload);
  const data = await fetch(AVAILABILITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  }).then((res) => res.json());

  const response = staffAvailabilityResponseSchema.parse(data);

  return response.staffAvailabilityResponse;
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

  // we need to be careful be here about using functions that use local timezone like setHours(0,0,0,0). we only convert to PST later
  // gets slots for the current day and the one after it, same as original website
  const startDate = new Date();
  const endDate = new Date(startDate.getTime());
  endDate.setUTCDate(endDate.getUTCDate() + DAYS_TO_FETCH);

  console.log(`We are going from ${startDate} to ${endDate} [local time]`);
  const availabilities = await fetchStaffAvailability(allStaffIds, startDate, endDate);

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
      description: service.description ?? "",
      directions: "",
      techEnhanced: null,
      studyLocationId: STUDY_LOCATION_ID,
    });

    const durationMinutes = parseISO8601Duration(service.defaultDuration);

    // iterate through service.staffMemberIds, although it's usually an array with 1 element
    for (const staffId of service.staffMemberIds) {
      const availabilityItems = availabilityMap.get(staffId);
      if (availabilityItems) {
        // console.log(availabilityItems);
        const roomSlots = processAvailabilityItems(
          service.serviceId,
          availabilityItems,
          durationMinutes,
        );
        slots.push(...roomSlots);
      }
    }
  }

  // create location record
  const location = {
    id: STUDY_LOCATION_ID,
    name: STUDY_LOCATION_NAME,
  };

  // testing logs
  console.log(`Search date range: ${startDate.toISOString()} to ${endDate.toISOString()} [UTC]`);
  console.log(`Total rooms: ${rooms.length}`);
  console.log(`Available slots: ${slots.filter((s) => s.isAvailable).length}`);
  return { location, rooms, slots };
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
