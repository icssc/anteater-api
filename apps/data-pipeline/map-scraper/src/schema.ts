import { z } from "zod";

export const locationListItemSchema = z.object({
  catId: z.coerce.number(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  id: z.string(),
  name: z.string(),
});

export const locationListSchema = z.array(locationListItemSchema);

export const locationDetailSchema = z.object({
  mediaURLTypes: z.array(z.string()).optional(),
  mediaURLs: z.array(z.string()).optional(),
});
