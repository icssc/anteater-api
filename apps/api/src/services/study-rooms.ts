import type { studyRoomsQuerySchema } from "$schema";
import type { z } from "@hono/zod-openapi";
import type { database } from "@packages/db";
import { and, eq, gte, lte } from "@packages/db/drizzle";
import { studyRoom } from "@packages/db/schema";

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

    return await this.db
      .select()
      .from(studyRoom)
      .where(conditions.length ? and(...conditions) : undefined);
  }
}
