import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { and, eq, inArray } from "@packages/db/drizzle";
import {
  type SampleProgramEntry,
  type StandingYearType,
  catalogProgram,
  course,
  sampleProgramVariation,
} from "@packages/db/schema";
import { orNull, sleep } from "@packages/stdlib";
import { type Cheerio, load } from "cheerio";
import fetch from "cross-fetch";
import type { AnyNode } from "domhandler";
import { diffString } from "json-diff";
import readlineSync from "readline-sync";
import sortKeys from "sort-keys";
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

const CATALOGUE_URL = "https://catalogue.uci.edu" as const;

const MAX_DELAY_MS = 8_000 as const;

// Holds raw scraped data from HTML tables before transformation.
// This is used transformed to SampleProgramEntry via transformToTermStructure().
type ScrapedSampleYear = {
  year: StandingYearType;
  curriculum: string[][];
};

async function fetchWithDelay(url: string, delayMs = 1000): Promise<string> {
  try {
    logger.info(`Making request to ${url}`);
    await sleep(delayMs);
    const res = await fetch(url, { headers: { Connection: "keep-alive" } }).then((x) => x.text());
    logger.info("Request succeeded");
    return res;
  } catch {
    const delay = Math.min(2 * delayMs, MAX_DELAY_MS);
    logger.warn(`Rate limited, waiting for ${delay} ms`);
    return await fetchWithDelay(url, delay);
  }
}

async function fetchSchoolsPath(): Promise<string[]> {
  const schoolsAndPrograms = await fetchWithDelay(`${CATALOGUE_URL}/schoolsandprograms/`);
  const $ = load(schoolsAndPrograms);

  const schoolAndProgramPaths: string[] = [];
  $("#textcontainer h4 a").each((_, a) => {
    const href = $(a).attr("href");
    if (href?.startsWith("/")) {
      schoolAndProgramPaths.push(href);
    }
  });
  return schoolAndProgramPaths;
}

async function collectProgramPathsFromSchools(): Promise<string[]> {
  const schools = await fetchSchoolsPath();
  const programPaths: string[] = [];

  for (const schoolPath of schools) {
    const html = await fetchWithDelay(`${CATALOGUE_URL}${schoolPath}`);
    const $ = load(html);

    const container = $("#majorsminorsandgraduateprogramstextcontainer");
    if (!container.length) {
      continue;
    }
    container.find("ul li a").each((_, a) => {
      const href = $(a).attr("href");
      if (href?.startsWith("/")) {
        programPaths.push(href);
      }
    });
  }
  return Array.from(new Set(programPaths));
}

/*
 * Extracts a unique ID from the catalogue URL
 * Example: https://catalogue.uci.edu/.../computerscience_bs/ => "computerscience_bs"
 */
function generateProgramId(url: string): string {
  // Regex pulls the final path segment from the catalogue URL (e.g. /foo/bar/ -> bar).
  const match = url.match(/\/([^/]+)\/?$/);
  if (!match) {
    logger.warn(`Could not extract ID from URL: ${url}`);
    return "";
  }
  return match[1];
}

/*
 * Transforms the original sample program format to have a Fall, Winter, Spring structure
 * @param sampleYears The original sample years data from the scraper
 * @returns The transformed data with Fall, Winter, Spring structure
 */
function transformToTermStructure(sampleYears: ScrapedSampleYear[]): SampleProgramEntry[] {
  const transformedProgram: SampleProgramEntry[] = [];

  for (const yearData of sampleYears) {
    const fall: string[] = [];
    const winter: string[] = [];
    const spring: string[] = [];

    const curriculum = yearData.curriculum;

    for (const row of curriculum) {
      if (row.length >= 1 && row[0].trim()) {
        fall.push(row[0].trim());
      }
      if (row.length >= 2 && row[1].trim()) {
        winter.push(row[1].trim());
      }
      if (row.length >= 3 && row[2].trim()) {
        spring.push(row[2].trim());
      }
    }

    transformedProgram.push({
      year: yearData.year,
      fall,
      winter,
      spring,
    });
  }

  return transformedProgram;
}

// Parse course code into department and course number for functionality lookup
function parseCourseCode(courseCode: string): { dept: string; num: string } | null {
  // Match pattern: letters/spaces/& followed by numbers and optional letters
  const match = courseCode.match(/^([A-Z0-9&\s]+?)(\d+[A-Z]*)$/);

  if (!match) return null;

  return {
    dept: match[1].trim(),
    num: match[2],
  };
}

async function lookupCourseId(
  db: ReturnType<typeof database>,
  courseCode: string,
): Promise<string | null> {
  try {
    const parsed = parseCourseCode(courseCode);

    if (!parsed) {
      return null;
    }

    const [foundCourse] = await db
      .select({ id: course.id })
      .from(course)
      .where(and(eq(course.department, parsed.dept), eq(course.courseNumber, parsed.num)))
      .limit(1);

    return foundCourse?.id ?? null;
  } catch (error) {
    logger.warn(`Failed to lookup course: ${courseCode}`, error);
    return null;
  }
}

/*
 * Transforms course code strings to course IDs by looking them up in the database.
 * Falls back to original string if course not found.
 */
async function transformCourseCodesToIds(
  db: ReturnType<typeof database>,
  scrapedPrograms: {
    majorId: string;
    programName: string;
    variations: { label?: string; sampleProgram: SampleProgramEntry[]; variationNotes: string[] }[];
  }[],
) {
  logger.info("Transforming course codes to IDs...");

  const transformed = [];

  for (const program of scrapedPrograms) {
    const transformedVariations = [];

    for (const variation of program.variations) {
      const transformedSampleProgram = [];

      for (const year of variation.sampleProgram) {
        // Transform each term's courses in parallel
        const [fall, winter, spring] = await Promise.all([
          Promise.all(
            year.fall.map(async (code) => {
              const id = await lookupCourseId(db, code);
              return id ?? code; // Use ID if found, otherwise keep string
            }),
          ),
          Promise.all(
            year.winter.map(async (code) => {
              const id = await lookupCourseId(db, code);
              return id ?? code;
            }),
          ),
          Promise.all(
            year.spring.map(async (code) => {
              const id = await lookupCourseId(db, code);
              return id ?? code;
            }),
          ),
        ]);

        transformedSampleProgram.push({ year: year.year, fall, winter, spring });
      }

      transformedVariations.push({
        label: variation.label,
        sampleProgram: transformedSampleProgram,
        variationNotes: variation.variationNotes,
      });
    }

    transformed.push({
      majorId: program.majorId,
      programName: program.programName,
      variations: transformedVariations,
    });
  }

  logger.info("Course code transformation complete");
  return transformed;
}

async function storeSampleProgramsInDB(
  db: ReturnType<typeof database>,
  scrapedPrograms: {
    majorId: string;
    programName: string;
    variations: { label?: string; sampleProgram: SampleProgramEntry[]; variationNotes: string[] }[];
  }[],
) {
  if (!scrapedPrograms.length) {
    logger.info("No sample programs to store.");
    return;
  }

  // Transform course codes to IDs
  const transformedPrograms = await transformCourseCodesToIds(db, scrapedPrograms);

  logger.info("Fetching sample programs from database...");

  // Prepare parent table rows (catalogue_program)
  const catalogueRows = transformedPrograms.map((program) => ({
    id: program.majorId,
    programName: program.programName,
  }));

  // Prepare child table rows (sample_program_variation)
  const variationRows = transformedPrograms.flatMap((program) =>
    program.variations.map((variation) => ({
      programId: program.majorId,
      label: orNull(variation.label),
      sampleProgram: variation.sampleProgram,
      variationNotes: variation.variationNotes,
    })),
  );

  const programIds = catalogueRows.map((r) => r.id);

  const existingCatalogPrograms = await db
    .select()
    .from(catalogProgram)
    .where(inArray(catalogProgram.id, programIds));

  const existingVariations = await db
    .select()
    .from(sampleProgramVariation)
    .where(inArray(sampleProgramVariation.programId, programIds));

  // Combine into unified structure for comparison
  const dbData = { catalogPrograms: existingCatalogPrograms, variations: existingVariations };
  const scrapedData = { catalogPrograms: catalogueRows, variations: variationRows };

  // Sort both structures
  const sortedDbData = sortKeys(
    {
      catalogPrograms: dbData.catalogPrograms.sort((a, b) => a.id.localeCompare(b.id)),
      variations: dbData.variations.sort((a, b) => a.programId.localeCompare(b.programId)),
    },
    { deep: true },
  );

  const sortedScrapedData = sortKeys(
    {
      catalogPrograms: scrapedData.catalogPrograms.sort((a, b) => a.id.localeCompare(b.id)),
      variations: scrapedData.variations.sort((a, b) => a.programId.localeCompare(b.programId)),
    },
    { deep: true },
  );

  const programDiff = diffString(sortedDbData, sortedScrapedData);

  if (!programDiff.length) {
    logger.info("Database already up to date - no changes needed");
    return;
  }

  console.log("Difference between database and scraped sample program data:");
  console.log(programDiff);

  if (!readlineSync.keyInYNStrict("Is this ok")) {
    logger.error("Cancelling sample program update.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(catalogProgram).where(inArray(catalogProgram.id, programIds));

    await tx.insert(catalogProgram).values(catalogueRows);

    await tx.insert(sampleProgramVariation).values(variationRows);
  });

  logger.info(`Successfully stored ${catalogueRows.length} sample programs`);
}

// HELPER: Parse a single table and return its data
function parseTable($: ReturnType<typeof load>, $table: Cheerio<AnyNode>): ScrapedSampleYear[] {
  const sampleYears: ScrapedSampleYear[] = [];
  let currentYear: StandingYearType | null = null;
  let currentCurriculum: string[][] = [];

  // Look for year headers INSIDE the table (most common)
  let foundYearHeader = false;
  $table.find("tr").each((_j, tr_el) => {
    const $tr = $(tr_el);

    // Skip empty header rows and term rows
    if ($tr.hasClass("plangridyear") && !$tr.find("th").text().trim()) return;
    if ($tr.hasClass("plangridterm")) return;

    // Check if this is a year header row
    if ($tr.hasClass("plangridyear")) {
      foundYearHeader = true;
      const yearText = $tr.find("th").text().trim();
      if (yearText) {
        if (currentYear !== null) {
          sampleYears.push({ year: currentYear, curriculum: currentCurriculum });
        }
        currentYear = yearText as StandingYearType;
        currentCurriculum = [];
      }
    } else {
      // Parse course row
      const rowData: string[] = [];
      $tr.find("td").each((_k, td_el) => {
        $(td_el).find("sup").remove();
        rowData.push($(td_el).text().replace(/\s+/g, " ").trim());
      });

      if (rowData.some((cell) => cell.length > 0)) {
        currentCurriculum.push(rowData);
      }
    }
  });

  // Save final year from inside-table parsing
  if (currentYear !== null) {
    sampleYears.push({ year: currentYear, curriculum: currentCurriculum });
  }

  // Year might be OUTSIDE table (Dance programs, etc)
  if (!foundYearHeader && currentCurriculum.length > 0) {
    // Look for heading before the table
    const prevHeading = $table.prevAll("h4, h5, h6, p").first();
    let yearText: StandingYearType = "Freshman"; // Default fallback specifically for dance programs

    if (prevHeading.length) {
      const headingText = prevHeading.text().trim();
      // Extract year from headings like "Sample Program for Freshmen"
      if (headingText.match(/freshmen|freshman/i)) {
        yearText = "Freshman";
      } else if (headingText.match(/sophomore/i)) {
        yearText = "Sophomore";
      } else if (headingText.match(/junior/i)) {
        yearText = "Junior";
      } else if (headingText.match(/senior/i)) {
        yearText = "Senior";
      } else {
        // Fallback to "Freshman" for unrecognized year text
        logger.warn(`Unrecognized year text: "${headingText}", defaulting to Freshman`);
        yearText = "Freshman";
      }
    }

    sampleYears.push({ year: yearText, curriculum: currentCurriculum });
    logger.info(`Found year outside table: "${yearText}"`);
  }

  return sampleYears;
}

function parseFootnotes($: ReturnType<typeof load>, element: Cheerio<AnyNode>): string[] {
  const notes: string[] = [];

  // Check if the element itself is a dl.sc_footnotes
  const dlElements = element.is("dl.sc_footnotes") ? element : element.find("dl.sc_footnotes");

  dlElements.each((_i, dl_el) => {
    $(dl_el)
      .find("dd")
      .each((_j, dd_el) => {
        const noteText = $(dd_el).find("p").text().trim() || $(dd_el).text().trim();
        if (noteText.length > 0) {
          notes.push(noteText);
        }
      });
  });

  return notes;
}

async function scrapeSamplePrograms(programPath: string) {
  const url = `${CATALOGUE_URL}${programPath}`;
  logger.info(`Scraping ${programPath}...`);
  const html = await fetchWithDelay(url);
  const $ = load(html);

  const programName = $("h1.page-title").text().normalize("NFKD").split("(")[0].trim();

  if (!programName) {
    logger.warn(`Could not extract program name from ${url}`);
    return null;
  }

  const sampleProgramContainer = $("#sampleprogramtextcontainer");
  if (!sampleProgramContainer.length) return null;

  // Find all sample program tables
  const allTables = sampleProgramContainer.find("table.sc_plangrid");
  const tableCount = allTables.length;

  logger.info(`Found ${tableCount} sample program table(s) for ${programName}`);
  if (tableCount === 0) return null;

  // CASE 1: Single Table - No Label Needed
  const variations: Array<{
    label?: string;
    sampleProgram: SampleProgramEntry[];
    variationNotes: string[];
  }> = [];

  if (tableCount === 1) {
    logger.info("Parsing single table (no variations)");

    const $table = allTables.first();
    const sampleYears = parseTable($, $table);

    if (sampleYears.length > 0) {
      const sampleProgram = transformToTermStructure(sampleYears);
      // For single-table programs, use comprehensive note parsing
      const variationNotes: string[] = [];

      // Look for "NOTES:" heading with paragraphs
      // Notes appear in two formats:
      // 1. Series of <p> tags after "NOTES:" heading
      // 2. Single <ol> list with <li> items
      sampleProgramContainer.find("p").each((_i, p_el) => {
        const pText = $(p_el).text().trim();
        if (pText.match(/^NOTES\s*:\s*/i)) {
          const remainingText = pText.replace(/^NOTES\s*:\s*/i, "").trim();
          if (remainingText.length > 0) {
            variationNotes.push(remainingText);
          }
          let currentElement = $(p_el).next();
          // Walk through subsequent elements until we hit a heading or table
          // This handles cases where notes span multiple <p> tags or <ol> lists
          while (currentElement.length && !currentElement.is("h1, h2, h3, h4, h5, h6, table")) {
            if (currentElement.is("p")) {
              const paragraphContent = currentElement.text().trim();
              if (paragraphContent.length > 0 && !paragraphContent.match(/^NOTES\s*:\s*/i)) {
                variationNotes.push(paragraphContent);
              }
            } else if (currentElement.is("ol")) {
              // If we find an <ol>, all notes are in the list items no need to continue walking through siblings
              currentElement.find("li").each((_k, li_el) => {
                variationNotes.push($(li_el).text().trim());
              });
              break;
            }
            currentElement = currentElement.next();
          }
        }
      });

      // This is a second-priority fallback for programs that use a different HTML structure
      if (variationNotes.length === 0) {
        variationNotes.push(...parseFootnotes($, sampleProgramContainer));
      }

      // Look for paragraphs starting with asterisks or numbers format notes as standalone paragraphs without explicit "NOTES:" heading
      if (variationNotes.length === 0) {
        sampleProgramContainer.find("p").each((_i, p_el) => {
          const pText = $(p_el).text().trim();
          if ((pText.startsWith("*") || pText.match(/^\d+\./)) && !pText.match(/^NOTES\s*:\s*/i)) {
            if (!$(p_el).closest("dl.sc_footnotes").length) {
              variationNotes.push(pText);
            }
          }
        });
      }

      logger.info(`Found ${variationNotes.length} notes for single variation`);

      variations.push({
        sampleProgram: sampleProgram,
        variationNotes,
      });
    } else {
      logger.warn("Single table has no data, skipping program");
      return null;
    }
  }

  // CASE 2: Multiple Tables - Labels Required
  else {
    logger.warn(`${programName} has ${tableCount} variations!`);

    allTables.each((index, tableEl) => {
      const $table = $(tableEl);
      let label = "";

      // Look for <p> immediately before table
      const prevP = $table.prev("p");
      if (prevP.length && prevP.text().trim()) {
        label = prevP.text().trim();
      }

      // Look for nearest heading before table
      if (!label) {
        const prevHeading = $table.prevAll("h3, h4, h5, h6").first();
        if (prevHeading.length && prevHeading.text().trim()) {
          label = prevHeading.text().trim();
        }
      }

      // Look for any text in previous sibling elements
      if (!label) {
        let prevElement = $table.prev();
        while (prevElement.length && !prevElement.is("table")) {
          const text = prevElement.text().trim();
          if (text && text.length > 0) {
            label = text;
            break;
          }
          prevElement = prevElement.prev();
        }
      }

      // If still no label, check the parent div's previous heading
      if (!label) {
        const parentDiv = $table.closest("div");
        const prevHeadingOutside = parentDiv.prevAll("h3, h4, h5").first();
        if (prevHeadingOutside.length) {
          label = prevHeadingOutside.text().trim();
        }
      }

      // Clean up label
      label = label
        .replace(/^Sample Program\s*[—–-]\s*/i, "")
        .replace(/^&nbsp;\s*/g, "")
        .trim();

      logger.info(`Parsing variation ${index + 1}: "${label}"`);

      const sampleYears = parseTable($, $table);

      if (sampleYears.length > 0) {
        const sampleProgram = transformToTermStructure(sampleYears);

        // Parse notes immediately after this table
        const variationNotes: string[] = [];

        // Find the next <dl class="sc_footnotes"> after this table
        let nextElement = $table.next();
        while (nextElement.length && !nextElement.is("table, h1, h2, h3, h4, h5, h6")) {
          if (nextElement.is("dl.sc_footnotes")) {
            variationNotes.push(...parseFootnotes($, nextElement));
            break; // Stop after finding footnotes
          }
          nextElement = nextElement.next();
        }

        logger.info(`Found ${variationNotes.length} notes for variation "${label}"`);

        variations.push({
          label: label || undefined,
          sampleProgram,
          variationNotes,
        });
      } else {
        logger.warn(`Variation "${label}" has no data, skipping`);
      }
    });
  }

  if (variations.length === 0) {
    logger.warn(`No valid variations found for ${programName}`);
    return null;
  }

  const majorId = generateProgramId(url);
  const res = {
    majorId,
    programName,
    variations,
  };
  logger.info(`Successfully scraped ${programName}`);
  return res;
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  logger.info("sample-program-scraper starting");
  const programs = await collectProgramPathsFromSchools();
  logger.info(`Found ${programs.length} programs to scrape`);
  const scrapedPrograms = [];
  for (const programPath of programs) {
    try {
      const sampleProgramData = await scrapeSamplePrograms(programPath);
      if (sampleProgramData) {
        scrapedPrograms.push(sampleProgramData);
      }
    } catch (error) {
      logger.error(`Error processing ${programPath}:`, error);
    }
  }
  logger.info(
    `Successfully scraped ${scrapedPrograms.length} sample programs out of ${programs.length} total programs`,
  );
  await storeSampleProgramsInDB(db, scrapedPrograms);
  logger.info("All done!");
  exit(0);
}

main().then();
