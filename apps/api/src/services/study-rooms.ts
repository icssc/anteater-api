import type { studyRoomSchema, studyRoomsQuerySchema } from "$schema";
import type { z } from "@hono/zod-openapi";
import type { database } from "@packages/db";
import { and, eq, gte, lte } from "@packages/db/drizzle";
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

    return this.db
      .select()
      .from(studyRoom)
      .leftJoin(studyRoomSlot, eq(studyRoom.id, studyRoomSlot.studyRoomId))
      .where(conditions.length ? and(...conditions) : undefined)
      .then((data) => {
        // map is faster than object
        const map = data.reduce(
          (acc, row) => {
            if (!acc.has(row.study_room.id)) {
              acc.set(row.study_room.id, {
                ...row.study_room,
                slots: [],
              });
            }

            if (row.study_room_slot !== null) {
              const slot = {
                ...row.study_room_slot,
                start: row.study_room_slot.start.toISOString(),
                end: row.study_room_slot.end.toISOString(),
              };
              acc.get(row.study_room.id)?.slots?.push(slot);
            }

            return acc;
          },
          new Map() as Map<string, z.infer<typeof studyRoomSchema>>,
        );
        return Array.from(map.values());
      });
  }
}
