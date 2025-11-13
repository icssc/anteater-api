import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { eq, isNull, or } from "@packages/db/drizzle";
import { instructor, instructorToWebsocInstructor, websocInstructor } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { sleep } from "@packages/stdlib";
import fetch from "cross-fetch";
import he from "he";
import { base64ToString } from "uint8array-extras";
import winston from "winston";

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

const DIRECTORY_URL = "https://directory.uci.edu/";

const HEADERS_INIT = {
  "Content-Type": "application/x-www-form-urlencoded",
};

const FILTER_KEYWORDS = ["professor", "lecturer", "faculty"];

const MAX_DELAY_MS = 8_000;

const INSTRUCTOR_MAX_SURNAME_LENGTH = 14;

type DirectoryEntry = {
  UCInetID: string;
  Name: string;
  Title: string;
  Department: string;
  Email: string;
  "Student's Level"?: string;
};

type DirectoryResponse = [number, DirectoryEntry][];

async function fetchDirectoryWithDelay(name: string, delayMs = 1000): Promise<DirectoryResponse> {
  try {
    logger.info("Making request to UCI Directory");
    await sleep(delayMs);
    const res = await fetch(DIRECTORY_URL, {
      method: "POST",
      headers: HEADERS_INIT,
      body: new URLSearchParams({ uciKey: name, filter: "all" }),
    }).then((x) => x.json());
    logger.info("Request succeeded");
    return res;
  } catch {
    const delay = Math.min(2 * delayMs, MAX_DELAY_MS);
    logger.warn(`Rate limited, waiting for ${delay} ms`);
    return await fetchDirectoryWithDelay(name, delay);
  }
}

const toTitleCase = (s: string) =>
  s
    .toLocaleLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const studentEntry: typeof instructor.$inferInsert = {
  ucinetid: "student",
  name: "REDACTED REDACTED",
  email: "noreply@uci.edu",
  department: "REDACTED",
  title: "REDACTED",
};

const transformDirectoryEntry = ({
  UCInetID,
  Name,
  Email,
  Department,
  Title,
  "Student's Level": studentLevel,
}: DirectoryEntry): typeof instructor.$inferInsert =>
  studentLevel
    ? studentEntry
    : {
        ucinetid: he.decode(UCInetID),
        name: toTitleCase(he.decode(Name)),
        email: base64ToString(Email),
        department: he.decode(Department),
        title: he.decode(Title),
      };

const nameFilterFor =
  (normalizedLastName: string, normalizedFirstInitials: string) =>
  ({ Name }: { Name: string }) => {
    const nameChunks = he
      .decode(Name)
      .toLowerCase()
      .split(" ")
      .map((x) => x.trim());

    const firstInitialsChunks = normalizedFirstInitials.split(" ").map((x) => x.trim());
    const lastNameChunks = normalizedLastName.split(" ").map((x) => x.trim());
    const firstInitialsCondition = nameChunks
      .slice(0, firstInitialsChunks.length)
      .every((x, i) => x.startsWith(firstInitialsChunks[i]));

    const chunkLength =
      nameChunks.length - (lastNameChunks.length - 1) - firstInitialsChunks.length;

    const lastNameCondition =
      lastNameChunks.length === 1
        ? nameChunks
            .slice(firstInitialsChunks.length)
            .some((x) =>
              normalizedLastName.length >= INSTRUCTOR_MAX_SURNAME_LENGTH
                ? x.startsWith(normalizedLastName)
                : x === normalizedLastName,
            )
        : chunkLength > 0 &&
          Array(chunkLength)
            .fill(0)
            .map((_, i) => i + firstInitialsChunks.length)
            .some((x) =>
              nameChunks
                .slice(x, x + lastNameChunks.length)
                .every((y, i) => y.startsWith(lastNameChunks[i])),
            );
    return firstInitialsCondition && lastNameCondition;
  };

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);
  logger.info("instructor-scraper starting");

  const names = await db
    .select({ name: websocInstructor.name })
    .from(websocInstructor)
    .leftJoin(
      instructorToWebsocInstructor,
      eq(instructorToWebsocInstructor.websocInstructorName, websocInstructor.name),
    )
    .where(
      or(
        isNull(instructorToWebsocInstructor.websocInstructorName),
        isNull(instructorToWebsocInstructor.instructorUcinetid),
      ),
    )
    .then((rows) =>
      rows
        .map(({ name }) => {
          return name;
        })
        .filter((x) => x !== "STAFF"),
    );

  logger.info(`Found ${names.length} WebSoc instructors without associated instructors`);

  const shortNamesToUcinetids = new Map<string, Array<string | null>>();
  const ucinetidToInstructorObject = new Map<string, typeof instructor.$inferInsert>();

  for (const name of names) {
    const normalizedName = name.toLowerCase().replaceAll(/, ?/g, " ").trim();
    const fullyNormalizedName = normalizedName.replaceAll(/\./g, " ").trim();
    const indexOfLastSpace = normalizedName.lastIndexOf(" ");

    const normalizedLastName =
      indexOfLastSpace === -1
        ? normalizedName
        : normalizedName.slice(0, normalizedName.lastIndexOf(" ")).replaceAll(/\./g, " ").trim();

    const normalizedFirstInitials =
      indexOfLastSpace === -1
        ? ""
        : normalizedName.slice(normalizedName.lastIndexOf(" ")).replaceAll(/\./g, " ").trim();

    logger.info(`Fetching directory for instructor with WebSoc name '${name}'`);

    logger.info(
      `(fully normalized name = '${fullyNormalizedName}', normalized last name = '${normalizedLastName}', normalized first initial(s) = '${normalizedFirstInitials}')`,
    );

    const initRes = await fetchDirectoryWithDelay(fullyNormalizedName).then((x) =>
      x
        .map(([_, entry]) => entry)
        .filter(nameFilterFor(normalizedLastName, normalizedFirstInitials)),
    );

    if (initRes.length === 0) {
      logger.warn("Did not find any entries for this instructor.");
      logger.warn("Assigning this instructor a null UCInetID.");

      if (shortNamesToUcinetids.has(name)) {
        shortNamesToUcinetids.get(name)?.push(null);
      } else {
        shortNamesToUcinetids.set(name, [null]);
      }

      continue;
    }

    if (initRes.length === 1) {
      logger.info("Found exactly one entry for this instructor.");

      const instructor = transformDirectoryEntry(initRes[0]);

      if (instructor.ucinetid === "student") {
        logger.warn("This instructor appears to be a student.");
        logger.warn("Mapping this instructor to the UCInetID 'student'.");
      }

      if (shortNamesToUcinetids.has(name)) {
        shortNamesToUcinetids.get(name)?.push(instructor.ucinetid);
      } else {
        shortNamesToUcinetids.set(name, [instructor.ucinetid]);
      }

      ucinetidToInstructorObject.set(instructor.ucinetid, instructor);
      continue;
    }

    logger.warn("Found multiple entries for this instructor; attempting to narrow search.");

    let isolatedInstructor = false;

    for (const keyword of FILTER_KEYWORDS) {
      logger.info(
        `Fetching directory with '${keyword}' appended to normalized name (Exact Directory Search: ${fullyNormalizedName} ${keyword}).`,
      );

      const filterRes = await fetchDirectoryWithDelay(`${fullyNormalizedName} ${keyword}`).then(
        (x) =>
          x
            .map(([_, entry]) => entry)
            .filter(({ Title }) => {
              return (
                Title.includes(keyword.substring(0, 1).toUpperCase() + keyword.substring(1)) ||
                Title.includes(keyword.substring(0, 1).toLocaleLowerCase() + keyword.substring(1))
              );
            })
            .filter(nameFilterFor(normalizedLastName, normalizedFirstInitials)),
      );

      if (filterRes.length === 1) {
        logger.info(`Found exactly one entry for this instructor based on the ${keyword} filter.`);

        const instructor = transformDirectoryEntry(filterRes[0]);

        if (instructor.ucinetid === "student") {
          logger.warn("This instructor appears to be a student.");
          logger.warn("Mapping this instructor to the UCInetID 'student'.");
        }

        if (shortNamesToUcinetids.has(name)) {
          shortNamesToUcinetids.get(name)?.push(instructor.ucinetid);
        } else {
          shortNamesToUcinetids.set(name, [instructor.ucinetid]);
        }

        ucinetidToInstructorObject.set(instructor.ucinetid, instructor);
        isolatedInstructor = true;

        break;
      }

      if (filterRes.length === 0) {
        logger.warn(`Did not find any entries when narrowing for '${keyword}'.`);
      } else {
        logger.warn(
          `Still found multiple entries for this instructor when narrowing for '${keyword}'.`,
        );
      }
    }

    if (isolatedInstructor) {
      continue;
    }

    logger.error(`Cannot find a unique match for instructor with WebSoc name '${name}'.`);
    logger.error("Assigning this instructor a null UCInetID.");

    if (shortNamesToUcinetids.has(name)) {
      shortNamesToUcinetids.get(name)?.push(null);
    } else {
      shortNamesToUcinetids.set(name, [null]);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(instructor)
      .values(ucinetidToInstructorObject.values().toArray())
      .onConflictDoUpdate({
        target: instructor.ucinetid,
        set: conflictUpdateSetAllCols(instructor),
      });
    await tx
      .insert(instructorToWebsocInstructor)
      .values(
        Array.from(shortNamesToUcinetids).flatMap(([websocInstructorName, ucinetIds]) =>
          ucinetIds.map((instructorUcinetid) => ({ instructorUcinetid, websocInstructorName })),
        ),
      )
      .onConflictDoUpdate({
        target: [
          instructorToWebsocInstructor.instructorUcinetid,
          instructorToWebsocInstructor.websocInstructorName,
        ],
        set: conflictUpdateSetAllCols(instructorToWebsocInstructor),
      });
  });
  exit(0);
}

main().then();
