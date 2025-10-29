import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { inArray } from "@packages/db/drizzle";
import {
  type SampleProgramEntry,
  type StandingYearType,
  catalogProgram,
  sampleProgramVariation,
} from "@packages/db/schema";
import { sleep } from "@packages/stdlib";
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

const HEADERS_INIT = {
  Connection: "keep-alive",
};

type SampleYear = {
  year: StandingYearType;
  curriculum: string[][];
};

async function fetchWithDelay(url: string, delayMs = 1000): Promise<string> {
  try {
    logger.info(`Making request to ${url}`);
    await sleep(delayMs);
    const res = await fetch(url, { headers: HEADERS_INIT }).then((x) => x.text());
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
 * Example: https://catalogue.uci.edu/.../computerscience_bs/ → "computerscience_bs"
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
function transformToTermStructure(sampleYears: SampleYear[]): {
  sampleProgram: SampleProgramEntry[];
} {
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

  return { sampleProgram: transformedProgram };
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

  logger.info("Fetching sample programs from database...");

  // Prepare parent table rows (catalogue_program)
  const catalogueRows = scrapedPrograms.map((program) => ({
    id: program.majorId,
    programName: program.programName,
  }));

  // Prepare child table rows (sample_program_variation)
  const variationRows = scrapedPrograms.flatMap((program) =>
    program.variations.map((variation) => ({
      programId: program.majorId,
      label: variation.label || null,
      sampleProgram: variation.sampleProgram,
      variationNotes: variation.variationNotes,
    })),
  );

  // Fetch existing data
  const existingCatalogPrograms = await db
    .select()
    .from(catalogProgram)
    .where(
      inArray(
        catalogProgram.id,
        catalogueRows.map((r) => r.id),
      ),
    );

  const existingVariations = await db
    .select()
    .from(sampleProgramVariation)
    .where(
      inArray(
        sampleProgramVariation.programId,
        catalogueRows.map((r) => r.id),
      ),
    );

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
    logger.info("No difference found between database and scraped sample program data.");
    return;
  }

  console.log("Difference between database and scraped sample program data:");
  console.log(programDiff);

  if (!readlineSync.keyInYNStrict("Is this ok")) {
    logger.error("Cancelling sample program update.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(catalogProgram).where(
      inArray(
        catalogProgram.id,
        catalogueRows.map((r) => r.id),
      ),
    );

    // Insert parent rows
    await tx.insert(catalogProgram).values(catalogueRows);

    // Insert child rows (variations)
    await tx.insert(sampleProgramVariation).values(variationRows);
  });

  logger.info(`Successfully stored ${catalogueRows.length} sample programs`);
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

  // HELPER: Parse a single table and return its data

  const parseTable = ($table: Cheerio<AnyNode>): SampleYear[] => {
    const sampleYears: SampleYear[] = [];
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
          yearText = headingText as StandingYearType;
        }
      }

      sampleYears.push({ year: yearText, curriculum: currentCurriculum });
      logger.info(`Found year outside table: "${yearText}"`);
    }

    return sampleYears;
  };

  // CASE 1: Single Table - No Label Needed

  const variations: Array<{
    label?: string;
    sampleProgram: SampleProgramEntry[];
    variationNotes: string[];
  }> = [];

  if (tableCount === 1) {
    logger.info("Parsing single table (no variations)");

    const $table = allTables.first();
    const sampleYears = parseTable($table);

    if (sampleYears.length > 0) {
      const transformedResult = transformToTermStructure(sampleYears);
      // For single-table programs, use comprehensive note parsing
      const variationNotes: string[] = [];

      // Look for "NOTES:" heading with paragraphs
      sampleProgramContainer.find("p").each((_i, p_el) => {
        const pText = $(p_el).text().trim();
        if (pText.match(/^NOTES\s*:\s*/i)) {
          const remainingText = pText.replace(/^NOTES\s*:\s*/i, "").trim();
          if (remainingText.length > 0) {
            variationNotes.push(remainingText);
          }
          let currentElement = $(p_el).next();
          while (currentElement.length && !currentElement.is("h1, h2, h3, h4, h5, h6, table")) {
            if (currentElement.is("p")) {
              const paragraphContent = currentElement.text().trim();
              if (paragraphContent.length > 0 && !paragraphContent.match(/^NOTES\s*:\s*/i)) {
                variationNotes.push(paragraphContent);
              }
            } else if (currentElement.is("ol")) {
              currentElement.find("li").each((_k, li_el) => {
                variationNotes.push($(li_el).text().trim());
              });
              break;
            }
            currentElement = currentElement.next();
          }
        }
      });

      // Look for <dl class="sc_footnotes">
      if (variationNotes.length === 0) {
        sampleProgramContainer.find("dl.sc_footnotes").each((_i, dl_el) => {
          $(dl_el)
            .find("dd")
            .each((_j, dd_el) => {
              const noteText = $(dd_el).find("p").text().trim() || $(dd_el).text().trim();
              if (noteText.length > 0) {
                variationNotes.push(noteText);
              }
            });
        });
      }

      // Look for paragraphs starting with asterisks or numbers
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

      // Look for <ol> after table
      if (variationNotes.length === 0) {
        sampleProgramContainer.find("ol").each((_i, ol_el) => {
          const prevElement = $(ol_el).prev();
          if (
            prevElement.is("table") ||
            prevElement.is("h6") ||
            (prevElement.is("p") && prevElement.text().toLowerCase().includes("notes"))
          ) {
            $(ol_el)
              .find("li")
              .each((_j, li_el) => {
                variationNotes.push($(li_el).text().trim());
              });
          }
        });
      }

      logger.info(`Found ${variationNotes.length} notes for single variation`);

      variations.push({
        sampleProgram: transformedResult.sampleProgram,
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

      const sampleYears = parseTable($table);

      if (sampleYears.length > 0) {
        const transformedResult = transformToTermStructure(sampleYears);

        // Parse notes immediately after this table
        const variationNotes: string[] = [];

        // Find the next <dl class="sc_footnotes"> after this table
        let nextElement = $table.next();
        while (nextElement.length && !nextElement.is("table, h1, h2, h3, h4, h5, h6")) {
          if (nextElement.is("dl.sc_footnotes")) {
            nextElement.find("dd").each((_i, dd_el) => {
              const noteText = $(dd_el).find("p").text().trim() || $(dd_el).text().trim();
              if (noteText.length > 0) {
                variationNotes.push(noteText);
              }
            });
            break; // Stop after finding footnotes
          }
          nextElement = nextElement.next();
        }

        logger.info(`Found ${variationNotes.length} notes for variation "${label}"`);

        variations.push({
          label: label || undefined,
          sampleProgram: transformedResult.sampleProgram,
          variationNotes,
        });
      } else {
        logger.warn(`Variation "${label}" has no data, skipping`);
      }
    });
  }

  if (variations.length === 0) {
    logger.warn("No valid variations found for ${programName}");
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
  logger.info(`Successfully scraped ${scrapedPrograms.length}/${programs.length} programs`);
  await storeSampleProgramsInDB(db, scrapedPrograms);
  logger.info("All done!");
  exit(0);
}

main().then();
