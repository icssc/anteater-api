import { z } from "@hono/zod-openapi";

export const slotSchema = z.object({
  studyRoomId: z.string(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  isAvailable: z.boolean(),
});

export const studyRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  location: z.string(),
  description: z.string().optional(),
  directions: z.string().optional(),
  techEnhanced: z.boolean(),
  slots: z.array(slotSchema),
});

export const studyRoomsPathSchema = z.object({
  id: z.string(),
});

export const studyRoomsQuerySchema = z.object({
  location: z.string().optional(),
  capacityMin: z.coerce.number().int().optional(),
  capacityMax: z.coerce.number().int().optional(),
  isTechEnhanced: z.coerce.boolean().optional(),
});
