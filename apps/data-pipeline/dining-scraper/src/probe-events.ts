import { z } from "zod";
import { queryAdobeECommerce } from "./query.ts";

const query = `
    query ProbeEvents($filter: AEM_EventModelFilter) {
        AEM_eventList(filter: $filter) {
            items{
                title
                location{
                    name
                }
                startDate
                startTime
                endDate
                endTime
            }
        }
    }
`;

const responseSchema = z.object({
  data: z
    .object({
      AEM_eventList: z.object({
        items: z.array(
          z.object({
            title: z.string().nullable(),
            location: z
              .object({
                name: z.string().nullish(),
              })
              .nullish(),
            _path: z.string().nullish(),
            startDate: z.string().nullish(),
            startTime: z.string().nullish(),
            endDate: z.string().nullish(),
            endTime: z.string().nullish(),
          }),
        ),
      }),
    })
    .nullish(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        locations: z
          .array(
            z.object({
              line: z.number(),
              column: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const campus = {
  _expressions: { _operator: "EQUALS", value: "campus" },
};

const filters = {
  all: { campus },
};

for (const [label, filter] of Object.entries(filters)) {
  console.log(`Fetching events for ${label}...`);
  const response = await queryAdobeECommerce(query, { filter }, responseSchema);

  if (!response) {
    throw new Error(`No response received for ${label}`);
  }

  if (response.errors?.length) {
    throw new Error(
      `GraphQL errors for ${label}: ${response.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const items = response.data?.AEM_eventList.items;

  if (!items) {
    throw new Error(`No items found for ${label}`);
  }
  const converedLocation = new Set(["brandywine", "the anteatery", "the oasis"]);
  const byLocaiton = new Map<string, { count: number; example: string | null }>();

  for (const event of items) {
    const location = event.location?.name?.trim() || "Unknown";
    const event_name = event.title?.trim() || null;
    const summary = byLocaiton.get(location) ?? { count: 0, example: null };

    summary.count += 1;
    summary.example ??= event_name;
    byLocaiton.set(location, summary);
  }

  const rows = [...byLocaiton.entries()]
    .map(([location, { count, example }]) => {
      const dates = items
        .filter((event) => (event.location?.name?.trim() || "Unknown") === location)
        .flatMap((event) => (event.startDate ? [event.startDate] : []))
        .sort();

      return {
        location,
        name: example ?? "Unknown",
        count,
        firstDate: dates[0] ?? "Unknown",
        lastDate: dates[dates.length - 1] ?? "Unknown",
        covered: converedLocation.has(location.toLowerCase()),
      };
    })
    .sort((a, b) => {
      if (a.lastDate === b.lastDate) return 0;
      if (a.lastDate === "Unknown") return 1;
      if (b.lastDate === "Unknown") return -1;
      return b.lastDate.localeCompare(a.lastDate);
    });

  console.log(`Event counts by location for ${label}:`);
  console.table(rows);
}
