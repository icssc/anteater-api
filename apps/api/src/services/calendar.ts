import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { calendarTerm } from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";
import type { calendarQuerySchema } from "$schema";

const toDateString = (d: Date): string => d.toISOString().split("T")[0];

const calendarTermMapper = (term: typeof calendarTerm.$inferSelect) => ({
	...term,
	instructionStart: toDateString(term.instructionStart),
	instructionEnd: toDateString(term.instructionEnd),
	finalsStart: toDateString(term.finalsStart),
	finalsEnd: toDateString(term.finalsEnd),
	socAvailable: toDateString(term.socAvailable),
});

type CalendarServiceInput = z.infer<typeof calendarQuerySchema>;

export class CalendarService {
	constructor(private readonly db: ReturnType<typeof database>) {}

	async getCalendarTerm(input: CalendarServiceInput) {
		const { year, quarter } = input;
		const [row] = await this.db
			.select()
			.from(calendarTerm)
			.where(eq(calendarTerm.id, `${year} ${quarter}`))
			.then((rows) => rows.map(calendarTermMapper));
		return orNull(row);
	}

	async getAllCalendarTerms() {
		return this.db
			.select()
			.from(calendarTerm)
			.then((rows) => rows.map(calendarTermMapper));
	}
}
