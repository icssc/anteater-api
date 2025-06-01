import type { database } from "@packages/db";
import { libraryTraffic, libraryTrafficHistory } from "@packages/db/schema";
import { load } from "cheerio";
import fetch from "cross-fetch";

type RawRespOK = {
  message: "OK";
  data: {
    id: number;
    name: string;
    count: number;
    percentage: number;
    timestamp: string;
  };
};

type RawRespErr = { error: string };

export interface LocationMeta {
  id: string;
  libraryName: string;
  locationLabel: string;
  floorCode: string;
}

function parseArray(src: string): string[] {
  return src
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

async function collectLocationMeta(): Promise<Record<string, LocationMeta>> {
  const html = await fetch("https://www.lib.uci.edu/where-do-you-want-study-today").then((r) =>
    r.text(),
  );
  const $ = load(html);

  const scriptText = $("script")
    .toArray()
    .map((el) => $(el).html() ?? "")
    .find((txt) => /let\s+locationIds\s*=\s*\[/s.test(txt));

  if (!scriptText) throw new Error("Could not find <script> containing locationIds");

  const locMatch = scriptText.match(/let\s+locationIds\s*=\s*\[([\s\S]*?)]/);
  const floorMatch = scriptText.match(/let\s+floors\s*=\s*\[([\s\S]*?)]/);
  if (!locMatch || !floorMatch) throw new Error("Unable to capture locationIds or floors array");

  const ids = parseArray(locMatch[1]);
  const codes = parseArray(floorMatch[1]);

  if (ids.length !== codes.length)
    throw new Error("locationIds and floors arrays are different lengths");

  const codeToLibrary = (code: string): string => {
    if (code.includes("GSC")) return "Gateway Study Center";
    if (code.includes("-SL-")) return "Science Library"; // SL prefix in list
    return "Langson Library"; // fallback
  };

  const meta: Record<string, LocationMeta> = {};

  ids.forEach((id, idx) => {
    const code = codes[idx];
    const root = $(`#leftSide${code}`);

    const primary = root.find("h2.card-title").first().text().trim();

    const sub = root.find("span.subLocation").first().text().trim().replace(/\s+/g, " ");

    const label = sub ? `${primary} - ${sub}` : primary || "Unknown";

    meta[id] = {
      id,
      floorCode: code,
      libraryName: codeToLibrary(code),
      locationLabel: label,
    };
  });

  return meta;
}

async function fetchLocation(id: string): Promise<RawRespOK["data"] | null> {
  const url = `https://www.lib.uci.edu/sites/all/scripts/occuspace.php?id=${id}`;
  try {
    const raw = await fetch(url).then((r) => r.text());
    const parsedOnce = JSON.parse(raw);
    const parsed = typeof parsedOnce === "string" ? JSON.parse(parsedOnce) : parsedOnce;
    if (parsed.data && typeof parsed.data === "object") return (parsed as RawRespOK).data;
    console.warn(`ID ${id} responded with error: ${(parsed as RawRespErr).error}`);
  } catch (err) {
    console.error(`Unexpected error while fetching ID ${id}:`, err);
    throw err;
  }
  return null;
}

// - "active": Library location is open — perform scrape every 15 minutes.
// - "idle": Library is closed — perform scrape every 60 minutes.
// - "skip": Library is nonexistent — do not scrape at all.
type ScrapeStatus = "active" | "idle" | "skip";

export function getScrapeStatus(library: "LL" | "SL" | "LGSC"): ScrapeStatus {
  const pacificTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const hour = pacificTime.getHours();
  const day = pacificTime.getDay();

  if (library === "LL" || library === "SL") {
    if (day >= 1 && day <= 4 && hour >= 8 && hour < 23) return "active"; // Mon–Thu: 8am–11pm
    if (day === 5 && hour >= 8 && hour < 18) return "active"; // Fri: 8am–6pm
    if (day === 6 && hour >= 13 && hour < 17) return "active"; // Sat: 1pm–5pm
    if (day === 0 && hour >= 13 && hour < 21) return "active"; // Sun: 1pm–9pm
    return "idle";
  }

  if (library === "LGSC") {
    if (day >= 1 && day <= 4 && (hour >= 8 || hour < 3)) return "active"; // Mon–Thu: 8am–3am
    if (day === 5 && hour >= 8 && hour < 21) return "active"; // Fri: 8am–9pm
    if (day === 6 && hour >= 17 && hour < 21) return "active"; // Sat: 5pm–9pm
    if (day === 0 && (hour >= 17 || hour < 3)) return "active"; // Sun: 5pm–3am
    return "idle";
  }
  return "skip";
}

export async function doScrape(db: ReturnType<typeof database>) {
  console.log("Starting library traffic scrape.");
  // const db = database(DB_URL);
  const lookup = await collectLocationMeta();

  const dateNow = new Date();
  const minutes = dateNow.getMinutes();

  for (const [id, meta] of Object.entries(lookup)) {
    const libraryCodeMap = {
      "Langson Library": "LL",
      "Science Library": "SL",
      "Gateway Study Center": "LGSC",
    } as const;

    const code = libraryCodeMap[meta.libraryName as keyof typeof libraryCodeMap];
    const status = getScrapeStatus(code);

    if (status === "skip") {
      console.error(`Skipping ${meta.libraryName} — unknown library code.`);
      continue;
    }

    // Scrape hourly within the first 15 minutes while library is closed.
    if (status === "idle" && minutes >= 15) {
      console.log(`Skipping ${meta.libraryName} (idle) — scraping only on the hour.`);
      continue;
    }

    const data = await fetchLocation(id);
    if (!data) continue;

    console.log(
      `[${meta.libraryName.padEnd(20)}] "${meta.locationLabel}": ` +
        `count=${data.count}, pct=${data.percentage}`,
    );

    await db
      .insert(libraryTraffic)
      .values([
        {
          id: data.id,
          libraryName: meta.libraryName,
          locationName: meta.locationLabel,
          trafficCount: data.count,
          trafficPercentage: data.percentage,
          timestamp: new Date(data.timestamp),
        },
      ])
      .onConflictDoUpdate({
        target: [libraryTraffic.id],
        set: {
          libraryName: meta.libraryName,
          locationName: meta.locationLabel,
          trafficCount: data.count,
          trafficPercentage: data.percentage,
          timestamp: new Date(data.timestamp),
        },
      });

    await db.insert(libraryTrafficHistory).values([
      {
        locationId: data.id,
        trafficCount: data.count,
        trafficPercentage: data.percentage,
        timestamp: new Date(data.timestamp),
      },
    ]);
  }

  console.log("Library traffic scrape complete.");
}
