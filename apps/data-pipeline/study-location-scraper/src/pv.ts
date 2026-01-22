import type { database } from "@packages/db";
import { lt, sql } from "@packages/db/drizzle";
import { studyLocation, studyRoom, studyRoomSlot } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import fetch from "cross-fetch";

// Types
// Consider switching to Zod because Dante mentioned that
type BookingsService = {
  serviceId: string;
  title: string;
  description: string;
  defaultDuration: string;
  staffMemberIds: string[];
};

type AvailabilityStatus =
  | "BOOKINGSAVAILABILITYSTATUS_AVAILABLE"
  | "BOOKINGSAVAILABILITYSTATUS_BUSY"
  | "BOOKINGSAVAILABILITYSTATUS_OUT_OF_OFFICE";

type BookingsDateTime = {
  dateTime: string;
  timeZone: string;
};

type AvailabilityItem = {
  status: AvailabilityStatus;
  startDateTime: BookingsDateTime;
  endDateTime: BookingsDateTime;
  serviceId: string;
};

type StaffAvailability = {
  staffId: string;
  availabilityItems: AvailabilityItem[];
};

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
    let currentStart = new Date(start);
    currentStart <= lastStartTime;
    currentStart.setTime(currentStart.getTime() + SLOT_INTERVAL_MINUTES * 60 * 1000)
  ) {
    const slotEnd = new Date(currentStart.getTime() + durationMinutes * 60 * 1000);

    slots.push({
      studyRoomId,
      start: new Date(currentStart),
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
    // convert from API response timezone (which is PST) to UTC.
    const startOffset = item.startDateTime.timeZone.match(/UTC([+-]\d{2}:\d{2})/)?.[1] ?? "-08:00";
    const endOffset = item.endDateTime.timeZone.match(/UTC([+-]\d{2}:\d{2})/)?.[1] ?? "-08:00";
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

  const data = (await res.json()) as { service?: BookingsService[] };
  return data.service ?? [];
}

// used in fetchStaffAvailability
function formatDateForAPI(date: Date) {
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
    dateTime: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00`,
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
    startDateTime: formatDateForAPI(startDate),
    endDateTime: formatDateForAPI(endDate),
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

  const response = data as { staffAvailabilityResponse: StaffAvailability[] };

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

  // this is our list of 17 rooms to fetch availability with
  const allStaffIds = [...new Set(services.flatMap((service) => service.staffMemberIds))];

  // we need to be careful be here about using functions that use local timezone like setHours(0,0,0,0). we only convert to PST later
  // gets slots for the current day and the one after it, same as original website
  const startDate = new Date();
  // This offset ensures that our interval starts on an interval that PV uses (every 15 minutes)
  const timeOffset =
    (SLOT_INTERVAL_MINUTES - (startDate.getMinutes() % SLOT_INTERVAL_MINUTES)) * 60 * 1000;
  startDate.setTime(startDate.getTime() + timeOffset);

  const endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + DAYS_TO_FETCH);

  console.log(`We are going from ${startDate} to ${endDate}`);
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
  console.log(`Search date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`Total rooms: ${rooms.length}`);
  console.log(`Available slots: ${slots.filter((s) => s.isAvailable).length}`);
  return { location, rooms, slots };
}

/**
 * main entry point. call scrape and insert to db
 */
export async function doPVScrape(db: ReturnType<typeof database>) {
  const { location, rooms, slots } = await scrapePlazaVerde();

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

    await tx
      .insert(studyRoomSlot)
      .values(slots)
      .onConflictDoUpdate({
        target: [studyRoomSlot.studyRoomId, studyRoomSlot.start, studyRoomSlot.end],
        set: conflictUpdateSetAllCols(studyRoomSlot),
      });

    await tx.delete(studyRoomSlot).where(lt(studyRoomSlot.end, new Date()));
  });
}
