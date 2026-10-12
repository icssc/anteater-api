import type { database } from "@packages/db";
import { isNotNull, isNull } from "@packages/db/drizzle";
import { diningEvent, diningRestaurant } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import z from "zod";
import { fetchEventImages } from "./fetch-event-images.ts";
import { restaurantIds } from "./model.ts";
import { queryAdobeECommerce } from "./query.ts";

function parseEventDate(dateStr: string | null, time: string | null): Date | null {
  if (!dateStr || !time) return null;

  // convert out of UCI time
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);

  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const laStr = naive.toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour12: false });
  const laDate = new Date(laStr);

  const offset = naive.getTime() - laDate.getTime();
  return new Date(naive.getTime() + offset);
}

const getAEMEventsQuery = `
query AEM_eventList($filter: AEM_EventModelFilter) {
  AEM_eventList(filter: $filter) {
    items {
      title
      subtitle
      description {
        markdown
      }
      startDate
      endDate
      startTime
      endTime
    }
  }
}
`;

/* Represents the schema of the return data from GraphQL resource AEM_eventList */
const aemEventListSchema = z.object({
  data: z.object({
    AEM_eventList: z.object({
      items: z.array(
        z.object({
          title: z.string().min(1),
          subtitle: z.string().min(1),
          description: z.object({
            markdown: z.string(),
          }),
          startDate: z.iso.date().nullable(),
          endDate: z.iso.date().nullable(),
          startTime: z.iso.time().nullable(),
          endTime: z.iso.time().nullable(),
        }),
      ),
    }),
  }),
});

export type AEMEventListQueryRestaurant = "The Anteatery" | "Brandywine";

/**
 * Fetches list of events for a given location
 * Returns list of InsertEvent objects to be upserted into DB
 */
async function getAEMEvents(
  location: AEMEventListQueryRestaurant,
): Promise<(typeof diningEvent.$inferInsert)[]> {
  const queryFilter = {
    filter: {
      campus: {
        _expressions: {
          _operator: "EQUALS",
          value: "campus",
        },
      },
      location: {
        name: {
          _expressions: {
            _operator: "EQUALS",
            value: location,
          },
        },
      },
    },
  };

  const updatedAt = new Date();
  const response = await queryAdobeECommerce(getAEMEventsQuery, queryFilter, aemEventListSchema);
  if (!response) {
    throw new Error(`Can't getAEMEvents for location ${location}`);
  }
  const events = response.data.AEM_eventList.items;
  const restaurantID = (
    {
      "The Anteatery": "anteatery",
      Brandywine: "brandywine",
    } as const
  )[location];

  return events.map((e) => {
    const startDate = parseEventDate(e.startDate, e.startTime);
    const endDate = e.endTime ? parseEventDate(e.endDate ?? e.startDate, e.endTime) : null;

    return {
      title: e.title,
      image: null,
      restaurantId: restaurantID,
      description: e.description.markdown,
      start: startDate,
      end: endDate,
      updatedAt,
    };
  });
}

/**
 * Query the GraphQL Events Endpoint for both restaurants and upsert them into
 * the database.
 * @param db The Drizzle database instance to insert into.
 */
export async function updateEvents(db: ReturnType<typeof database>): Promise<void> {
  try {
    const [brandywineEvents, anteateryEvents] = [
      await getAEMEvents("Brandywine"),
      await getAEMEvents("The Anteatery"),
    ];

    const allEvents = [...brandywineEvents, ...anteateryEvents];
    const eventImages = await fetchEventImages();

    console.log(`Found images for events ${Array.from(eventImages.keys()).join(", ")}`);
    for (const event of allEvents) {
      const imageURL = eventImages.get(event.title);
      if (imageURL) {
        event.image = imageURL;
      } else {
        console.log(`Could not find image for event ${event.title}.`);
      }
    }

    console.log("Upserting restaurants before upserting events...");
    const updatedAt = new Date();
    await db
      .insert(diningRestaurant)
      .values(
        restaurantIds.map((rId) => {
          return {
            id: rId,
            updatedAt,
          };
        }),
      )
      .onConflictDoUpdate({
        target: diningRestaurant.id,
        set: conflictUpdateSetAllCols(diningRestaurant),
      });

    console.log(`Upserting ${allEvents.length} events...`);
    // If an event has a start time, we target unique on [restaurantId, start, end] which means
    // different titles for an event happening at the same place and time is considered a rename of the same event
    await db
      .insert(diningEvent)
      .values(allEvents.filter((e) => e.start))
      .onConflictDoUpdate({
        target: [diningEvent.restaurantId, diningEvent.start, diningEvent.end],
        targetWhere: isNotNull(diningEvent.start),
        set: conflictUpdateSetAllCols(diningEvent),
      });

    // If an event has neither a start nor end time (i.e. Amnesty Week), we target a unique title in order to prevent
    // duplicate events from being added each scrape
    await db
      .insert(diningEvent)
      .values(allEvents.filter((e) => !e.start))
      .onConflictDoUpdate({
        target: [diningEvent.restaurantId, diningEvent.title],
        targetWhere: isNull(diningEvent.start),
        set: conflictUpdateSetAllCols(diningEvent),
      });
  } catch (error) {
    console.error(error, "updateEvents: Failed to fetch or upsert events.");
  }
}
