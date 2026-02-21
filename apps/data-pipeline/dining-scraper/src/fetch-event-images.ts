import z from "zod";

const eventImageResponseSchema = z.object({
  data: z.object({
    eventList: z.object({
      items: z.array(
        z.object({
          title: z.string().min(1),
          image: z.object({
            _dynamicUrl: z.string(),
            height: z.number(),
            width: z.number(),
          }),
        }),
      ),
    }),
  }),
});

/**
 * Returns a map of the event name to its corresponding event image URL.
 */
export async function fetchEventImages(): Promise<Map<string, string>> {
  const response = await fetch(
    "https://uci.mydininghub.com/graphql/execute.json/elevate/events;root=/content/dam/cf/ch/uci/en/events/;campus=campus",
    {
      headers: {
        Referer: "https://uci.mydininghub.com/en/locations/events",
        "X-API-Key": "a1781e57-440f-4c70-9d65-89c8755dc5ad",
      },
    },
  ).then((r) => r.json());

  const fetched = eventImageResponseSchema.parse(response);
  const eventMap = new Map<string, string>();

  for (const item of fetched.data.eventList.items) {
    const imageID = item.image._dynamicUrl.slice(36).split("/")[0] ?? "";

    eventMap.set(item.title, `https://images.elevate-dxp.com/adobe/assets/urn:aaid:aem:${imageID}`);
  }

  return eventMap;
}
