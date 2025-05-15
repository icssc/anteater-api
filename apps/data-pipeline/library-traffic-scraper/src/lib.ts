import { database } from "@packages/db";
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

export async function doScrape(DB_URL: string) {
  console.log("Starting library traffic scrape …");
  const db = database(DB_URL);
  const lookup = await collectLocationMeta();

  for (const [id, meta] of Object.entries(lookup)) {
    const data = await fetchLocation(id);
    if (!data) continue;

    console.log(
      `[${meta.libraryName.padEnd(18)}] "${meta.locationLabel}": ` +
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
