import type { studyRoomSchema, studyRoomsQuerySchema } from "$schema";
import type { z } from "@hono/zod-openapi";
import type { database } from "@packages/db";
import { and, eq, gte, lte, sql } from "@packages/db/drizzle";
import { studyRoom, studyRoomSlot } from "@packages/db/schema";

type StudyRoomsServiceInput = z.infer<typeof studyRoomsQuerySchema>;

export class StudyRoomsService {
  constructor(private readonly db: ReturnType<typeof database>) { }

  async getStudyRoomById(id: string) {
    const [room] = await this.db.select().from(studyRoom).where(eq(studyRoom.id, id));
    return room || null;
  }

  async getStudyRooms(input: StudyRoomsServiceInput) {
    const conditions = [];
    if (input.location) conditions.push(eq(studyRoom.location, input.location));
    if (input.capacityMin) conditions.push(gte(studyRoom.capacity, input.capacityMin));
    if (input.capacityMax) conditions.push(lte(studyRoom.capacity, input.capacityMax));
    if (input.isTechEnhanced !== undefined)
      conditions.push(eq(studyRoom.techEnhanced, input.isTechEnhanced));

    return this.db
      .select({
        id: studyRoom.id,
        name: studyRoom.name,
        capacity: studyRoom.capacity,
        location: studyRoom.location,
        description: studyRoom.description,
        directions: studyRoom.directions,
        techEnhanced: studyRoom.techEnhanced,
        slots: sql`ARRAY_AGG(JSONB_BUILD_OBJECT(
          'studyRoomId', ${studyRoomSlot.studyRoomId},
          'start', to_json(${studyRoomSlot.start} AT TIME ZONE 'America/Los_Angeles'),
          'end', to_json(${studyRoomSlot.end} AT TIME ZONE 'America/Los_Angeles'),
          'isAvailable', ${studyRoomSlot.isAvailable}
        ))`.as("slots"),
      })
      .from(studyRoom)
      .leftJoin(studyRoomSlot, eq(studyRoom.id, studyRoomSlot.studyRoomId))
      .groupBy(studyRoom.id)
      .where(conditions.length ? and(...conditions) : undefined);
  }
}
