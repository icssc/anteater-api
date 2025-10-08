import { z } from "zod";

export const locationListItemSchema = z.object({
  catId: z.coerce.number(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  id: z.coerce.string(),
  name: z.string(),
});

export const locationListSchema = z.array(locationListItemSchema);

export const locationDetailSchema = z.object({
  mediaUrlTypes: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string()).optional(),
});
