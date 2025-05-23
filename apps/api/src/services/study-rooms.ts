import type { studyRoomsQuerySchema } from "$schema";
import type { z } from "@hono/zod-openapi";
import type { database } from "@packages/db";
import { and, eq, gte, lte, or, sql } from "@packages/db/drizzle";
import { studyRoom, studyRoomSlot } from "@packages/db/schema";

type StudyRoomsServiceInput = z.infer<typeof studyRoomsQuerySchema>;

export class StudyRoomsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

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
    console.log(input);
    if (input.dates)
      conditions.push(
        or(
          ...input.dates.map((date) =>
            eq(
              sql`(${studyRoomSlot.start} AT TIME ZONE 'America/Los_Angeles')::DATE`,
              sql`${date.toISOString()}::DATE`,
            ),
          ),
        ),
      );

    return this.db
      .select({
        id: studyRoom.id,
        name: studyRoom.name,
        capacity: studyRoom.capacity,
        location: studyRoom.location,
        description: studyRoom.description,
        directions: studyRoom.directions,
        techEnhanced: studyRoom.techEnhanced,
        slots:
          sql`ARRAY_REMOVE(COALESCE(ARRAY_AGG(CASE WHEN ${studyRoomSlot.studyRoomId} IS NULL THEN NULL
            ELSE JSONB_BUILD_OBJECT(
              'studyRoomId', ${studyRoomSlot.studyRoomId},
              'start', to_json(${studyRoomSlot.start} AT TIME ZONE 'America/Los_Angeles'),
              'end', to_json(${studyRoomSlot.end} AT TIME ZONE 'America/Los_Angeles'),
              'isAvailable', ${studyRoomSlot.isAvailable}
            )
            END), ARRAY[]::JSONB[]), NULL)`.as("slots"),
      })
      .from(studyRoom)
      .leftJoin(studyRoomSlot, eq(studyRoom.id, studyRoomSlot.studyRoomId))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(studyRoom.id);
  }
}
