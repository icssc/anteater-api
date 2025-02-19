import { z } from "@hono/zod-openapi";

export const slotSchema = z.object({
  studyRoomId: z.string().openapi({
    example: "langson-401",
    description: "Unique identifier for the study room",
  }),
  start: z.string().datetime({ offset: true }).openapi({
    example: "2024-01-06T08:00:00-08:00",
    description: "Start time of the slot (in PST/PDT)",
  }),
  end: z.string().datetime({ offset: true }).openapi({
    example: "2024-01-06T08:30:00-08:00",
    description: "End time of the slot (in PST/PDT)",
  }),
  isAvailable: z.boolean().openapi({
    example: true,
    description: "Whether the slot is available for booking",
  }),
});

export const studyRoomSchema = z.object({
  id: z.string().openapi({
    example: "langson-401",
    description: "Unique identifier for the study room",
  }),
  name: z.string().openapi({
    example: "Langson Library Study Room 401",
    description: "Display name of the study room",
  }),
  capacity: z.number().int().openapi({
    example: 6,
    description: "Maximum number of people the room can accommodate",
  }),
  location: z.string().openapi({
    example: "Langson Library 4th Floor",
    description: "Location of the study room",
  }),
  description: z.string().optional().openapi({
    example: "Group study room with whiteboard and large display",
    description: "Additional details about the room",
  }),
  directions: z.string().optional().openapi({
    example: "Take the elevator to the 4th floor, turn right, room is at the end of the hall",
    description: "Directions to find the room",
  }),
  techEnhanced: z.boolean().openapi({
    example: true,
    description: "Whether the room has technology enhancements (display, etc.)",
  }),
  slots: z.array(slotSchema).openapi({
    example: [
      {
        studyRoomId: "langson-401",
        start: "2024-01-06T08:00:00-08:00",
        end: "2024-01-06T08:30:00-08:00",
        isAvailable: true,
      },
    ],
    description: "Available time slots for this room",
  }),
});

export const studyRoomsPathSchema = z.object({
  id: z.string().openapi({
    example: "langson-401",
    description: "Study room identifier",
    param: {
      name: "id",
      in: "path",
    },
  }),
});

export const studyRoomsQuerySchema = z.object({
  location: z.string().optional().openapi({
    example: "Langson Library",
    description: "Filter rooms by location",
  }),
  capacityMin: z.coerce.number().int().optional().openapi({
    example: 4,
    description: "Minimum room capacity",
  }),
  capacityMax: z.coerce.number().int().optional().openapi({
    example: 8,
    description: "Maximum room capacity",
  }),
  isTechEnhanced: z.coerce.boolean().optional().openapi({
    example: true,
    description: "Filter for rooms with technology enhancements",
  }),
});
