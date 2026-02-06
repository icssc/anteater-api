import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { and, eq, ilike, not } from "@packages/db/drizzle";
import {
  websocCourse,
  websocDepartment,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "@packages/db/schema";

import winston from "winston";

// the purpose of this resolver is to fix an issue caused by the new instructor naming system,
// previously, we have been storing section associations by linking the section ID to the instructor_name that appears in websoc
// which is in the old format (LAST_NAME, FIRST_INITIAL) as opposed to the new format (NAME DELIMETER SCHOOL DELIMETER)
// we can't just drop the whole table and repopulate it since there's important historical connections we want to maintain
// so this resolver attempts to identify the instructor's newly formatted entry in the instructor table and update it accordingly
// - Hayden K.

//! If you need to run this resolver after the original migration of instructors, make sure to update this list
//! with new schools/names.
const departmentRelations = new Map<string, string[]>([
  [
    "Charlie Dunlop School of Biological Sciences",
    ["School of Pharmacy and Pharmaceutical Sciences"],
  ],
  ["Claire Trevor School of the Arts", []],
  ["Donald Bren School of Information and Computer Sciences", []],
  ["Henry Samueli School of Engineering", ["School of Physical Sciences"]],
  ["Joe C. Wen School of Population and Public Health", []],
  ["Paul Merage School of Business", []],
  ["School of Education", []],
  ["School of Humanities", []],
  [
    "School of Medicine",
    [
      "School of Pharmacy and Pharmaceutical Sciences",
      "Joe C. Wen School of Population and Public Health",
    ],
  ],
  ["School of Pharmacy and Pharmaceutical Sciences", []],
  ["School of Physical Sciences", ["Henry Samueli School of Engineering"]],
  ["School of Social Ecology", []],
  ["School of Social Sciences", []],
  ["Sue & Bill Gross School of Nursing", []],
]);

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaultFormat = [
  winston.format.timestamp(),
  winston.format.printf((info) => `[${info.timestamp} ${info.level}] ${info.message}`),
];

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(...defaultFormat),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), ...defaultFormat),
    }),
    new winston.transports.File({
      filename: `${__dirname}/../logs/${Date.now()}.log`,
    }),
  ],
});

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);

  const legacySections = await db
    .select()
    .from(websocSectionToInstructor)
    .where(
      and(
        not(eq(websocSectionToInstructor.instructorName, "STAFF")),
        not(ilike(websocSectionToInstructor.instructorName, "%&|*%")),
      ),
    );

  logger.info(`Found ${legacySections.length} legacy sections`);

  for (const sectionAssociation of legacySections) {
    const possibleInstructors = await db
      .select()
      .from(websocInstructor)
      .where(eq(websocInstructor.identifier, sectionAssociation.instructorName));

    if (possibleInstructors.length === 0) {
      logger.warn(
        `0 instructors found for name ${sectionAssociation.instructorName}, it will keep its legacy reference (${sectionAssociation.instructorName})`,
      );
    } else if (possibleInstructors.length === 1) {
      logger.info(
        `Found a single matching instructor for course (${sectionAssociation.sectionId})`,
      );

      await db
        .update(websocSectionToInstructor)
        .set({ instructorName: possibleInstructors[0].name })
        .where(eq(websocSectionToInstructor.id, sectionAssociation.id));

      logger.info(
        `Updated instructor name from ${sectionAssociation.instructorName} to ${possibleInstructors[0].name} (${sectionAssociation.sectionId})`,
      );
    } else {
      logger.info(
        `Found multiple matching instructors for course (${sectionAssociation.sectionId}, ${possibleInstructors.map((w) => w.name).join(",")})`,
      );

      const searchData = (
        await db
          .select()
          .from(websocSection)
          .leftJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
          .leftJoin(websocDepartment, eq(websocDepartment.id, websocCourse.departmentId))
          .where(eq(websocSection.id, sectionAssociation.sectionId))
      )[0];

      const courseInfo = searchData.websoc_course;
      const deptInfo = searchData.websoc_department;

      logger.info(`Attempting to match with department data (${deptInfo?.deptName}).`);

      let mostSimilarInstructor = possibleInstructors[0];
      let highestSimilarityScore = 0;

      for (let i = 0; i < possibleInstructors.length; i++) {
        let similarityScore = 0;

        if (possibleInstructors[i].department === deptInfo?.deptName) {
          mostSimilarInstructor = possibleInstructors[i];
          break;
        }

        if (possibleInstructors[i].school === courseInfo?.schoolName) {
          similarityScore += 2;
        }

        const instructorSchool = possibleInstructors[i].school;

        if (
          courseInfo?.schoolName &&
          instructorSchool &&
          departmentRelations.get(courseInfo?.schoolName)?.includes(instructorSchool)
        ) {
          similarityScore += 1;
        }

        if (similarityScore > highestSimilarityScore) {
          mostSimilarInstructor = possibleInstructors[i];
          highestSimilarityScore = similarityScore;
        }
      }

      await db
        .update(websocSectionToInstructor)
        .set({ instructorName: mostSimilarInstructor.name })
        .where(eq(websocSectionToInstructor.id, sectionAssociation.id));

      logger.info(
        `Determined matching instructor (${mostSimilarInstructor.name}, ${mostSimilarInstructor.department})`,
      );
    }
  }

  exit(0);
}

main().then();
