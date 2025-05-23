import { z } from "@hono/zod-openapi";

export const slotSchema = z.object({
  studyRoomId: z.string(),
  start: z.string().datetime({ offset: true }).openapi({
    description: "The start time of this slot",
    example: "2021-01-06T08:00:00-08:00",
  }),
  end: z.string().datetime({ offset: true }).openapi({
    description: "The end time of this slot",
    example: "2021-01-06T08:30:00-08:00",
  }),
  isAvailable: z.boolean().openapi({
    description: "Whether this slot is available",
    example: false,
  }),
});

export const studyRoomSchema = z.object({
  id: z.string().openapi({
    description: "The ID of this study room, internal to the UCI Libraries system",
    example: "44670",
  }),
  name: z.string().openapi({
    description: "A human-readable name for this room",
    example: "Science 471",
  }),
  capacity: z.number().int().openapi({
    description: "The stated capacity in persons of this room",
    example: 4,
  }),
  location: z.string().openapi({
    description: "The location of the room, typically a building",
    example: "Science Library",
  }),
  description: z.string().optional().openapi({
    description: "If present, additional notes about the nature of this location",
    example: "Located on the 4th Floor Drum.",
  }),
  directions: z.string().optional().openapi({
    description: "Additional data about this room, specifically for directions to the room",
    example: "Located on the main level of Gateway Study Center.",
  }),
  techEnhanced: z.boolean().openapi({
    description:
      "Whether this room is tech enhanced, typically indicating the presence of an external monitor, AC outlets, and/or a PC.",
    example: true,
  }),
  slots: z.array(slotSchema).openapi({
    description: "The time slots available for this room",
  }),
});

export const studyRoomsPathSchema = z.object({
  id: z.string().openapi({ description: "The ID of a room", example: "44670" }),
});

export const studyRoomsQuerySchema = z.object({
  location: z.string().optional().openapi({
    description: "If present, returned rooms will be in this location",
    example: "Science Library",
  }),
  capacityMin: z.coerce.number().int().optional().openapi({
    description: "If present, returned rooms can seat at least this many persons",
    example: 4,
  }),
  capacityMax: z.coerce.number().int().optional().openapi({
    description: "If present, returned rooms can seat at most this many persons",
    example: 8,
  }),
  isTechEnhanced: z.coerce.boolean().optional().openapi({
    description: 'If present, returned rooms will have this value for "techEnhanced"',
    example: true,
  }),
});
