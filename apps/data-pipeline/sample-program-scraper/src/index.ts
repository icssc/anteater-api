import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { inArray } from "@packages/db/drizzle";
import { type SampleProgramEntry, sampleProgram } from "@packages/db/schema";
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

const CATALOGUE_URL = "https://catalogue.uci.edu";

const MAX_DELAY_MS = 8_000;

const HEADERS_INIT = {
  Connection: "keep-alive",
};

type SampleYear = {
  year: string;
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

async function fetchSchoolsPath(catalogue: string): Promise<string[]> {
  const schoolsAndPrograms = await fetchWithDelay(`${catalogue}/schoolsandprograms/`);
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
  const schools = await fetchSchoolsPath(CATALOGUE_URL);
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

/**
 * Extracts a unique ID from the catalogue URL
 * Example: https://catalogue.uci.edu/.../computerscience_bs/ → "computerscience_bs"
 */
function generateProgramId(url: string): string {
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
    const Fall: string[] = [];
    const Winter: string[] = [];
    const Spring: string[] = [];

    const curriculum = yearData.curriculum;

    for (const row of curriculum) {
      if (row.length >= 1 && row[0].trim()) {
        Fall.push(row[0].trim());
      }
      if (row.length >= 2 && row[1].trim()) {
        Winter.push(row[1].trim());
      }
      if (row.length >= 3 && row[2].trim()) {
        Spring.push(row[2].trim());
      }
    }

    transformedProgram.push({
      year: yearData.year,
      Fall,
      Winter,
      Spring,
    });
  }

  return { sampleProgram: transformedProgram };
}

async function storeSampleProgramsInDB(
  db: ReturnType<typeof database>,
  scrapedPrograms: {
    id: string;
    programName: string;
    sampleProgram: SampleProgramEntry[];
    programNotes: string[];
  }[],
) {
  if (!scrapedPrograms.length) {
    logger.info("No sample programs to store.");
    return;
  }

  logger.info("Fetching sample programs from database...");
  const dbPrograms = await db
    .select()
    .from(sampleProgram)
    .where(
      inArray(
        sampleProgram.id,
        scrapedPrograms.map((program) => program.id),
      ),
    );

  const sortedDbPrograms = sortKeys(dbPrograms, { deep: true });
  const sortedScrapedPrograms = sortKeys(scrapedPrograms, { deep: true });

  const programDiff = diffString(sortedDbPrograms, sortedScrapedPrograms);
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
    await tx.delete(sampleProgram).where(
      inArray(
        sampleProgram.id,
        scrapedPrograms.map((program) => program.id),
      ),
    );

    await tx.insert(sampleProgram).values(
      scrapedPrograms.map((program) => ({
        id: program.id,
        programName: program.programName,
        sampleProgram: program.sampleProgram,
        programNotes: program.programNotes,
      })),
    );
  });

  logger.info(`Successfully stored ${scrapedPrograms.length} sample programs`);
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

  const sampleYears: SampleYear[] = [];
  const notes: string[] = [];

  const parseTable = (table: Cheerio<AnyNode>, year: string) => {
    const curriculum: string[][] = [];

    table.find("tr").each((_j, tr_el) => {
      const $tr = $(tr_el);

      if ($tr.hasClass("plangridyear") && !$tr.find("th").text().trim()) return;
      if ($tr.hasClass("plangridterm")) return;

      const rowData: string[] = [];
      $tr.find("th, td").each((_k, cell_el) => {
        rowData.push($(cell_el).text().replace(/\s+/g, " ").trim());
      });

      if (rowData.some((cell) => cell.length > 0)) {
        curriculum.push(rowData);
      }
    });

    sampleYears.push({ year, curriculum });
  };

  if (sampleProgramContainer.children("table.sc_plangrid").length > 0) {
    let currentYear: string | null = null;
    let currentCurriculum: string[][] = [];

    sampleProgramContainer.find("table.sc_plangrid tr").each((_j, tr_el) => {
      const $tr = $(tr_el);

      if ($tr.hasClass("plangridyear")) {
        const yearText = $tr.find("th").text().trim();
        if (yearText) {
          if (currentYear !== null) {
            sampleYears.push({ year: currentYear, curriculum: currentCurriculum });
          }
          currentYear = yearText;
          currentCurriculum = [];
        }
      } else if (!$tr.hasClass("plangridterm")) {
        const rowData: string[] = [];
        $tr.find("td").each((_k, td_el) => {
          rowData.push($(td_el).text().replace(/\s+/g, " ").trim());
        });

        if (rowData.some((cell) => cell.length > 0)) {
          currentCurriculum.push(rowData);
        }
      }
    });

    if (currentYear !== null) {
      sampleYears.push({ year: currentYear, curriculum: currentCurriculum });
    }
  } else {
    sampleProgramContainer.find("h4").each((_i, h4_el) => {
      const yearTitle = $(h4_el).text().trim();
      const contentTable = $(h4_el).next("div").find("table.sc_plangrid");

      if (yearTitle && contentTable.length) {
        logger.debug(`Found H4 "${yearTitle}" with nested table for ${programPath}.`);
        parseTable(contentTable, yearTitle);
      }
    });
  }

  sampleProgramContainer.find("h6:contains('NOTES')").each((_i, h6_el) => {
    $(h6_el)
      .nextUntil("h1, h2, h3, h4, h5, h6, table")
      .filter("p")
      .each((_j, p_el) => {
        notes.push($(p_el).text().trim());
      });
    $(h6_el)
      .next("ol")
      .find("li")
      .each((_j, li_el) => {
        notes.push($(li_el).text().trim());
      });
  });

  sampleProgramContainer.find("p").each((_i, p_el) => {
    const pText = $(p_el).text().trim();
    if (pText.match(/^NOTES\s*:\s*/i)) {
      const remainingText = pText.replace(/^NOTES\s*:\s*/i, "").trim();
      if (remainingText.length > 0) {
        notes.push(remainingText);
      }
      let currentElement = $(p_el).next();
      while (currentElement.length && !currentElement.is("h1, h2, h3, h4, h5, h6, table")) {
        if (currentElement.is("p")) {
          const paragraphContent = currentElement.text().trim();
          if (paragraphContent.length > 0 && !paragraphContent.match(/^NOTES\s*:\s*/i)) {
            notes.push(paragraphContent);
          }
        } else if (currentElement.is("ol")) {
          currentElement.find("li").each((_k, li_el) => {
            notes.push($(li_el).text().trim());
          });
          break;
        }
        currentElement = currentElement.next();
      }
    }
  });

  sampleProgramContainer.find("dl.sc_footnotes").each((_i, dl_el) => {
    $(dl_el)
      .find("dd")
      .each((_j, dd_el) => {
        const noteText = $(dd_el).find("p").text().trim();
        if (noteText.length > 0) {
          notes.push(noteText);
        }
      });
  });

  sampleProgramContainer.find("p").each((_i, p_el) => {
    const pText = $(p_el).text().trim();
    if (
      (pText.startsWith("*") || pText.match(/^<sup>\s*\d+\s*<\/sup>/i)) &&
      !pText.match(/^NOTES\s*:\s*/i)
    ) {
      if (!$(p_el).closest("dl.sc_footnotes").length) {
        notes.push(pText);
      }
    }
  });

  if (notes.length === 0) {
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
            notes.push($(li_el).text().trim());
          });
      }
    });
  }

  if (sampleYears.length === 0) return null;

  const transformedTermsResult = transformToTermStructure(sampleYears);

  const sampleProgram = sampleYears.map((_, i) => ({
    ...transformedTermsResult.sampleProgram[i],
  }));

  const res = {
    id: generateProgramId(url),
    programName,
    sampleProgram,
    programNotes: notes,
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
