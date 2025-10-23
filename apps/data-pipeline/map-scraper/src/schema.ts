import { z } from "zod";

export const locationListItemSchema = z.object({
  catId: z.coerce.number(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  id: z.coerce.string(),
  name: z.string(),
});

export const locationListSchema = z.array(locationListItemSchema);

export const concept3DShape = z.object({
  type: z.string().optional(),
  paths: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export type Concept3DShape = z.infer<typeof concept3DShape>;

export const locationDetailSchema = z.object({
  mediaUrlTypes: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string()).optional(),
  // sometimes, the API will return the shape as a string and other times an object but without paths
  // due to this we will prepare for either possibility
  shape: z.union([concept3DShape, z.string()]).optional(),
});
