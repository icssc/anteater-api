import type { database } from "@packages/db";
import { and, eq, gte, lte } from "@packages/db/drizzle";
import { studyRoom } from "@packages/db/schema";

type StudyRoomsServiceInput = {
  location?: string;
  capacityMin?: number;
  capacityMax?: number;
  isTechEnhanced?: boolean;
};

export class StudyRoomsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getAllStudyRooms() {
    return this.db
      .select()
      .from(studyRoom)
      .then((rows) => rows);
  }

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
      .where(and(...conditions))
      .then((rows) => rows);
  }
}
