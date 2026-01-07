import type { database } from "@packages/db";
import type { studyLocation, studyRoom } from "@packages/db/schema";
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

// Generates valid slots from an availability window given its duration
function generateSlotsFromAvailableWindow(
  studyRoomId: string,
  start: Date,
  end: Date,
  durationMinutes: number,
): Slot[] {
  const slots: Slot[] = [];

  const lastStartTime = new Date(end.getTime() - durationMinutes * 60 * 1000);
  let currentStart = new Date(start);

  while (currentStart <= lastStartTime) {
    const slotEnd = new Date(currentStart.getTime() + durationMinutes * 60 * 1000);

    slots.push({
      studyRoomId,
      start: new Date(currentStart),
      end: slotEnd,
      isAvailable: true,
    });

    currentStart = new Date(currentStart.getTime() + SLOT_INTERVAL_MINUTES * 60 * 1000);
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
    const start = new Date(item.startDateTime.dateTime);
    const end = new Date(item.endDateTime.dateTime);

    if (item.status === "BOOKINGSAVAILABILITYSTATUS_AVAILABLE") {
      const availableSlots = generateSlotsFromAvailableWindow(
        studyRoomId,
        start,
        end,
        durationMinutes,
      );
      slots.push(...availableSlots);
    }

    // Decide if the following data is needed or if we just delete
    // else if (item.status === "BOOKINGSAVAILABILITYSTATUS_BUSY") {
    //   slots.push({
    //     studyRoomId,
    //     start,
    //     end,
    //     isAvailable: false,
    //   });
    // }
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

  if (!res.ok) {
    throw new Error(`SERVICES_URL failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { service?: BookingsService[] };
  return data.service ?? [];
}

// given an array of staffIds, fetch the schedule within the given date
async function fetchStaffAvailability(
  staffIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<StaffAvailability[]> {
  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return {
      dateTime: `${year}-${month}-${day}T00:00:00`,
      timeZone: "Pacific Standard Time",
    };
  };

  const payload = {
    staffIds: staffIds,
    startDateTime: formatDateForAPI(startDate),
    endDateTime: formatDateForAPI(endDate),
  };

  const data = await fetch(AVAILABILITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  }).then((res): Promise<StaffAvailability[]> => res.json());

  const response = data as { staffAvailabilityResponse: StaffAvailability[] };

  if (!response.staffAvailabilityResponse || !Array.isArray(response.staffAvailabilityResponse)) {
    console.error("Invalid availability response:", data);
    throw new Error("Invalid availability response: missing staffAvailabilityResponse array");
  }

  return response.staffAvailabilityResponse;
}

/**
 * Parses ISO 8601 duration format to minutes
 * The duration of each staffId is stored inside each service in ISO8601 format (1hr, 2hr, 3hr)
 * we need to do this when we process the 51 services (iterate across 17 rooms * 3 durations = 51 services)
 */
function parseISO8601Duration(duration: string): number {
  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);

  const hours = hoursMatch ? Number.parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? Number.parseInt(minutesMatch[1], 10) : 0;

  return hours * 60 + minutes;
}

// bulk of the processing logic
async function scrapePlazaVerde(): Promise<{
  location: typeof studyLocation.$inferInsert;
  rooms: Array<typeof studyRoom.$inferInsert>;
  slots: Slot[];
}> {
  // note: maybe there's some way to cache the service data so we can skip this part
  const services = await fetchServices();

  // this is our list of 51 services
  const allStaffIdsWithDupes = services.flatMap((service) => service.staffMemberIds);
  // this is our list of 17 rooms to fetch availability with
  const allStaffIds = [...new Set(allStaffIdsWithDupes)];

  // gets slots for the current day and the one after it, same as original website
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 2);
  endDate.setHours(0, 0, 0, 0);

  const availabilities = await fetchStaffAvailability(allStaffIds, startDate, endDate);

  // have a map of rooms : its availability items
  const availabilityMap = new Map<string, AvailabilityItem[]>();
  for (const availability of availabilities) {
    availabilityMap.set(availability.staffId, availability.availabilityItems);
  }

  const rooms: Array<typeof studyRoom.$inferInsert> = [];
  const slots: Slot[] = [];

  for (const service of services) {
    // push room data for each service. technically we don't need to be updating all the room data every few min so if this is a big deal, we should change
    rooms.push({
      id: service.serviceId,
      name: service.title,
      capacity: null,
      location: STUDY_LOCATION_NAME,
      description: service.description || null,
      directions: null,
      techEnhanced: null,
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

  // create location record
  const location = {
    id: STUDY_LOCATION_ID,
    name: STUDY_LOCATION_NAME,
  };

  // testing logs
  console.log(`Total staff IDs (with duplicates): ${allStaffIdsWithDupes.length}`);
  console.log(`Unique staff IDs: ${allStaffIds.length}`);
  console.log(`Search date range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

  console.log(`Fetched availability for ${availabilities.length} staff members\n`);
  console.log("Scraping Summary: ");
  console.log(`Total rooms: ${rooms.length}`);
  console.log(
    `Total slots: ${slots.length} (It's a lot because we are searching for 51 rooms, 2 days, 15 min intervals)`,
  );
  console.log(
    `Available slots: ${slots.filter((s) => s.isAvailable).length} (should be all of them because we aren't adding unavailable slots)`,
  );

  console.log("\nSample Room (printing 3 from every service): ");
  if (rooms.length > 0) {
    console.log(JSON.stringify(rooms[0], null, 2));
  }

  const formatSlotTime = (date: Date) =>
    date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  console.log("\nSample Slots (first 3 per service):");
  services.forEach((service, idx) => {
    const durationMinutes = parseISO8601Duration(service.defaultDuration);
    const durationHours = durationMinutes / 60;

    const serviceSlots = slots.filter((slot) => slot.studyRoomId === service.serviceId).slice(0, 3);

    console.log(`${idx + 1}. ${service.title} (${service.serviceId}) — ${durationHours} hours`);

    if (serviceSlots.length === 0) {
      console.log("  No slots found for this service.");
      return;
    }

    serviceSlots.forEach((slot, i) => {
      console.log(
        `  ${i + 1}. ${slot.isAvailable ? "AVAILABLE" : "BUSY"}: ${formatSlotTime(slot.start)} - ${formatSlotTime(slot.end)}`,
      );
    });
  });

  console.log(
    "\nOnce data looks correct, uncomment and test the database transactions in doScrape()",
  );

  return { location, rooms, slots };
}

/**
 * main entry point. call scrape and insert to db
 */
export async function doScrape(db: ReturnType<typeof database>) {
  const { location, rooms, slots } = await scrapePlazaVerde();

  // uncomment this when ready to insert to database:
  /*
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
  */
}
