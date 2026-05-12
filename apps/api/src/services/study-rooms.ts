import type { z } from "@hono/zod-openapi";
import type { database } from "@packages/db";
import {
	and,
	eq,
	gt,
	gte,
	lt,
	lte,
	or,
	type SQL,
	sql,
} from "@packages/db/drizzle";
import { studyRoom, studyRoomSlot } from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { studyRoomsQuerySchema } from "$schema";

type StudyRoomsServiceInput = z.infer<typeof studyRoomsQuerySchema>;

export class StudyRoomsService {
	constructor(private readonly db: ReturnType<typeof database>) {}

	async getRoomsWhere(conds: SQL | undefined) {
		return this.db
			.select({
				id: studyRoom.id,
				name: studyRoom.name,
				capacity: studyRoom.capacity,
				location: studyRoom.location,
				description: studyRoom.description,
				directions: studyRoom.directions,
				techEnhanced: studyRoom.techEnhanced,
				url: sql`COALESCE(${studyRoom.url}, CASE 
          WHEN ${studyRoom.location} = 'Anteater Learning Pavilion' THEN 'https://scheduler.oit.uci.edu/space/'
          ELSE 'https://spaces.lib.uci.edu/space/' END || ${studyRoom.id})`,
				slots:
					sql`ARRAY_REMOVE(COALESCE(ARRAY_AGG(CASE WHEN ${studyRoomSlot.studyRoomId} IS NULL THEN NULL
            ELSE JSONB_BUILD_OBJECT(
              'studyRoomId', ${studyRoomSlot.studyRoomId},
              'start', TO_CHAR((${studyRoomSlot.start} AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'),
              'end', TO_CHAR((${studyRoomSlot.end} AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'),
              'url', CASE
                WHEN ${studyRoom.url} IS NOT NULL THEN ${studyRoom.url}
                ELSE CASE
                  WHEN ${studyRoom.location} = 'Anteater Learning Pavilion' THEN 'https://scheduler.oit.uci.edu/space/'
                  ELSE 'https://spaces.lib.uci.edu/space/' END
                || ${studyRoom.id}
                || '?date='
                || TO_CHAR((${studyRoomSlot.start} AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                || '#submit_times'
              END,
              'isAvailable', ${studyRoomSlot.isAvailable}
            )
            END ORDER BY ${studyRoomSlot.start}), ARRAY[]::JSONB[]), NULL)`.as(
						"slots",
					),
			})
			.from(studyRoom)
			.leftJoin(studyRoomSlot, eq(studyRoom.id, studyRoomSlot.studyRoomId))
			.where(conds)
			.groupBy(studyRoom.id);
	}

	async getStudyRoomById(id: string) {
		const [room] = await this.getRoomsWhere(eq(studyRoom.id, id));
		return orNull(room);
	}

	async getStudyRooms(input: StudyRoomsServiceInput) {
		const conditions = [];
		if (input.location) conditions.push(eq(studyRoom.location, input.location));
		if (input.capacityMin)
			conditions.push(gte(studyRoom.capacity, input.capacityMin));
		if (input.capacityMax)
			conditions.push(lte(studyRoom.capacity, input.capacityMax));
		if (input.isTechEnhanced !== undefined)
			conditions.push(eq(studyRoom.techEnhanced, input.isTechEnhanced));
		if (input.dates)
			conditions.push(
				or(
					...input.dates.map((date) =>
						eq(
							sql`${studyRoomSlot.start}::DATE`,
							sql`${date.toISOString()}::DATE`,
						),
					),
				),
			);
		if (input.times)
			conditions.push(
				or(
					...input.times.map(([lower, upper]) =>
						and(
							// 1. the end time must be later than the lower bound of the user-specified range; otherwise, the slot is certainly too early
							gt(
								sql`${studyRoomSlot.end}::TIME`,
								sql`(${lower.getUTCHours().toString().padStart(2, "0")} || ${lower.getUTCMinutes().toString().padStart(2, "0")})::TIME`,
							),
							// 2. the start time must be earlier than the upper bound of the user-specified range; otherwise, the slot is certainly too late
							lt(
								sql`${studyRoomSlot.start}::TIME`,
								sql`(${upper.getUTCHours().toString().padStart(2, "0")} || ${upper.getUTCMinutes().toString().padStart(2, "0")})::TIME`,
							),
						),
					),
				),
			);

		return this.getRoomsWhere(
			conditions.length ? and(...conditions) : undefined,
		);
	}
}
