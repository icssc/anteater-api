import type { database } from "@packages/db";
import { and, eq } from "@packages/db/drizzle";
import { type Term, larcSection } from "@packages/db/schema";
import { websocCourse } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { sleep } from "@packages/stdlib";
import { load } from "cheerio";
import { fetch } from "cross-fetch";

type LarcSection = {
  days: string;
  time: string;
  instructor: string;
  bldg: string;
};

type FlattenedLarcResponse = {
  year: string;
  quarter: Term;
  courseNumber: string;
} & LarcSection;

const quarterToLarcSuffix = (year: number, quarter: Exclude<Term, "Summer10wk">): string => {
  switch (quarter) {
    case "Fall":
      return year > 2022 ? "92,s1" : "92,1";
    case "Winter":
      return "03,1";
    case "Spring":
      return "14,1";
    case "Summer1":
      return "25,s1";
    case "Summer2":
      return "76,s2";
  }
};

const fmtDays = (days: string): string =>
  days
    .replace("Mon", "M")
    .replace("Tue", "Tu")
    .replace("Wed", "W")
    .replace("Thu", "Th")
    .replace("Fri", "F")
    .replace("/", "");

const fmtTime = (time: string): string =>
  time.replace(/ /g, "").replace("AM", "a").replace("PM", "p");

const fmtBldg = (building: string): string => (building === "Online" ? "ON LINE" : building);

const EARLIEST_YEAR = 2019;

export async function doScrape(db: ReturnType<typeof database>) {
  const data: Array<FlattenedLarcResponse> = [];
  const quarters = ["Fall", "Winter", "Spring", "Summer1", "Summer2"] as const;
  for (let year = EARLIEST_YEAR; year < new Date().getFullYear() + 2; ++year) {
    for (const quarter of quarters) {
      console.log(`Scraping ${year} ${quarter}`);
      const html = await fetch(
        `https://enroll.larc.uci.edu/${year}${quarterToLarcSuffix(year, quarter)}`,
      ).then((response) => response.text());

      const $ = load(html);

      const courses = $(".tutorial-group")
        .toArray()
        .flatMap((card) => {
          const match = $(card)
            .find(".card-header")
            .text()
            .trim()
            .match(
              /(?<courseNumber>[^()]*)( \(same as (?<sameAs>.*)\))? - (.*) \((?<courseName>.*)\)/,
            );

          const sections = $(card)
            .find(".list-group")
            .toArray()
            .map((group) => {
              const rows = $(group).find(".col-lg-4");

              const [days, time] = $(rows[0])
                .find(".col")
                .map((_, col) => $(col).text().trim());

              const [instructor, building] = $(rows[1])
                .find(".col")
                .map((_, col) => $(col).text().trim());

              return {
                days: fmtDays(days),
                time: fmtTime(time),
                instructor,
                bldg: fmtBldg(building),
              };
            });

          return sections.map((section) => ({
            ...section,
            courseNumber: match?.groups?.courseNumber ?? "",
          }));
        });
      data.push(...courses.map((course) => ({ ...course, year: year.toString(10), quarter })));
      await sleep(1000);
    }
  }
  const courseToSections = data
    .map(({ year, quarter, courseNumber, ...rest }): [string, LarcSection] => [
      `${year},${quarter},${courseNumber}`,
      rest,
    ])
    .reduce(
      (acc, [k, v]) => acc.set(k, [...(acc.get(k) ?? []), v]),
      new Map<string, LarcSection[]>(),
    );
  const courseToCourseId = new Map<string, string>();
  for (const k of courseToSections.keys()) {
    const [year, quarter, fullCourseNumber] = k.split(",", 3);
    const deptCode = fullCourseNumber.slice(0, fullCourseNumber.lastIndexOf(" ")).trim();
    const courseNumber = fullCourseNumber.slice(fullCourseNumber.lastIndexOf(" ")).trim();
    courseToCourseId.set(
      k,
      await db
        .select({ id: websocCourse.id })
        .from(websocCourse)
        .where(
          and(
            eq(websocCourse.year, year),
            eq(websocCourse.quarter, quarter as Term),
            eq(websocCourse.deptCode, deptCode),
            eq(websocCourse.courseNumber, courseNumber),
          ),
        )
        .then((rows) => rows[0]?.id),
    );
  }
  await db.transaction(async (tx) => {
    for (const [k, v] of courseToSections) {
      const courseId = courseToCourseId.get(k);
      if (!courseId) {
        continue;
      }
      await tx
        .insert(larcSection)
        .values(v.map((x) => ({ ...x, courseId })))
        .onConflictDoUpdate({
          target: larcSection.id,
          set: conflictUpdateSetAllCols(larcSection),
        });
    }
  });
}
