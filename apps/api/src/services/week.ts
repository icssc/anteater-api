import type { weekQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { and, getTableColumns, gte, lte, or } from "@packages/db/drizzle";
import { calendarTerm } from "@packages/db/schema";
import type { z } from "zod";

type WeekData = {
  weeks: [number] | [number, number];
  quarters: [string] | [string, string];
  display: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const FALL_OFFSET_MS = 4 * DAY_MS;

const quarters = ["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"] as const;

const getWeek = (date: Date, term: typeof calendarTerm.$inferSelect): number =>
  Math.floor(
    (date.valueOf() -
      (term.instructionStart.valueOf() + (term.quarter === "Fall" ? FALL_OFFSET_MS : 0))) /
      WEEK_MS,
  ) + 1;

const getQuarter = (year: string, quarter: (typeof quarters)[number]): string => {
  switch (quarter) {
    case "Summer1":
      return `Summer Session I ${year}`;
    case "Summer2":
      return `Summer Session II ${year}`;
    case "Summer10wk":
      return `Summer Session 10WK ${year}`;
    default:
      return `${quarter} Quarter ${year}`;
  }
};

type WeekServiceInput = z.infer<typeof weekQuerySchema>;

export class WeekService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getWeekData(input: WeekServiceInput): Promise<WeekData | null> {
    const { year, month, day } = input;
    const today = new Date();
    const y = year ?? today.getFullYear();
    const m = month ?? today.getMonth() + 1;
    const d = day ?? today.getDate();
    const date = new Date(Date.UTC(y, m - 1, d));

    const inInstructionCondition = and(
      lte(calendarTerm.instructionStart, date),
      gte(calendarTerm.instructionEnd, date),
    );
    const inFinalsCondition = and(
      lte(calendarTerm.finalsStart, date),
      gte(calendarTerm.finalsEnd, date),
    );

    const termsInProgress = await this.db
      .select({
        ...getTableColumns(calendarTerm),
        inInstruction: inInstructionCondition as NonNullable<typeof inInstructionCondition>,
        inFinals: inFinalsCondition as NonNullable<typeof inFinalsCondition>,
      })
      .from(calendarTerm)
      .where(or(inInstructionCondition, inFinalsCondition));

    const termsInInstruction = termsInProgress.filter((t) => t.inInstruction);
    const termsInFinals = termsInProgress.filter((t) => t.inFinals);

    if (!termsInInstruction.length && !termsInFinals.length) {
      return {
        weeks: [-1],
        quarters: ["N/A"],
        display: "Enjoy your break! 😎",
      };
    }
    if (termsInInstruction.length === 1 && !termsInFinals.length) {
      const [term] = termsInInstruction;
      const weeks: [number] = [getWeek(date, term)];
      const quarters: [string] = [getQuarter(term.year, term.quarter)];
      return {
        weeks,
        quarters,
        display: `Week ${weeks[0]} • ${quarters[0]}`,
      };
    }
    if (!termsInInstruction.length && termsInFinals.length === 1) {
      const [term] = termsInFinals;
      const quarters: [string] = [getQuarter(term.year, term.quarter)];
      return {
        weeks: [-1],
        quarters,
        display: `Finals${term.quarter === "Summer2" ? "" : " Week"} • ${quarters[0]}. Good luck! 🤞`,
      };
    }
    if (termsInInstruction.length === 2 && !termsInFinals.length) {
      const [week1, week2] = termsInInstruction.map((x) => getWeek(date, x)) as [number, number];
      const [quarter1, quarter2] = termsInInstruction.map(({ year, quarter }) =>
        getQuarter(year, quarter),
      ) as [string, string];
      const display: string =
        week1 === week2
          ? `Week ${week1} • ${quarter1} | ${quarter2}`
          : `Week ${week1} • ${quarter1} | Week ${week2} • ${quarter2}`;
      return {
        weeks: [week1, week2],
        quarters: [quarter1, quarter2],
        display,
      };
    }
    if (termsInInstruction.length === 1 && termsInFinals.length === 1) {
      const [termInProgress] = termsInInstruction;
      const [termInFinals] = termsInFinals;
      const weeks: [number, number] = [getWeek(date, termInProgress), -1];
      const quarters = [termInProgress, termInFinals].map(({ year, quarter }) =>
        getQuarter(year, quarter),
      ) as [string, string];
      return {
        weeks,
        quarters,
        display: `Finals • ${quarters[1]}. Good luck! 🤞 | Week ${weeks[0]} • ${quarters[0]}`,
      };
    }
    return null;
  }
}
