import type { database } from "@packages/db";
import { diningEvent, diningRestaurant } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import z from "zod";
import { fetchEventImages } from "./fetch-event-images.ts";
import { restaurantNames } from "./model.ts";
import { queryAdobeECommerce } from "./query.ts";
import { restaurantIdFor } from "./util.ts";

function parseEventDate(dateStr: string | null, time: string | null): Date | null {
  if (!dateStr || !time) return null;
  return new Date(`${dateStr}T${time}`);
}

export const getAEMEventsQuery = `
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
const AEMEventListSchema = z.object({
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
  const response = await queryAdobeECommerce(getAEMEventsQuery, queryFilter, AEMEventListSchema);
  if (!response) {
    throw new Error(`Can't getAEMEvents for location ${location}`);
  }
  const events = response.data.AEM_eventList.items;
  const restaurantID = restaurantIdFor(
    (
      {
        "The Anteatery": "anteatery",
        Brandywine: "brandywine",
      } as const
    )[location],
  );

  return events.map((e) => {
    const startDate = parseEventDate(e.startDate, e.startTime);
    const endDate = e.endTime ? parseEventDate(e.endDate ?? e.startDate, e.endTime) : null;

    return {
      title: e.title,
      image: null,
      restaurantId: restaurantID,
      shortDescription: null,
      longDescription: e.description.markdown,
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
    const [brandywineEvents, anteateryEvents] = await Promise.all([
      getAEMEvents("Brandywine"),
      getAEMEvents("The Anteatery"),
    ]);

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

    console.log("Upserting restaurants before events...");
    const updatedAt = new Date();
    await db
      .insert(diningRestaurant)
      .values(
        restaurantNames.map((rName) => {
          return {
            id: restaurantIdFor(rName),
            name: rName,
            updatedAt,
          };
        }),
      )
      .onConflictDoUpdate({
        target: diningRestaurant.id,
        set: conflictUpdateSetAllCols(diningRestaurant),
      });

    console.log(`Upserting ${allEvents.length} events...`);
    await db
      .insert(diningEvent)
      .values(allEvents)
      .onConflictDoUpdate({
        target: [diningEvent.title, diningEvent.restaurantId, diningEvent.start],
        set: conflictUpdateSetAllCols(diningEvent),
      });
  } catch (error) {
    console.error(error, "updateEvents: Failed to fetch or upsert events.");
  }
}
