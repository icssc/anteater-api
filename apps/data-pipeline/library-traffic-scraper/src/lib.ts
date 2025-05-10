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

async function fetchLocation(id: string): Promise<RawRespOK["data"] | null> {
  const url = `https://www.lib.uci.edu/sites/all/scripts/occuspace.php?id=${id}`;
  try {
    const raw = await fetch(url).then((r) => r.text());

    const parsedOnce = JSON.parse(raw);
    const parsed = typeof parsedOnce === "string" ? JSON.parse(parsedOnce) : parsedOnce;

    if (parsed.data && typeof parsed.data === "object") {
      return (parsed as RawRespOK).data;
    }

    console.warn(`Location ID ${id} returned error: ${(parsed as RawRespErr).error}`);
  } catch (err) {
    console.error(`Unexpected error while fetching location ID ${id}:`, err);
    throw err;
  }
  return null;
}

async function getLocationIds(): Promise<string[]> {
  const html = await fetch("https://www.lib.uci.edu/where-do-you-want-study-today").then((r) =>
    r.text(),
  );
  const $ = load(html);

  const script = $("script")
    .toArray()
    .find((el) => {
      const content = $(el).html();
      return content?.includes("locationIds");
    });

  if (!script) {
    throw new Error("Could not find script containing locationIds");
  }

  const scriptContent = $(script).html();
  const match = scriptContent?.match(/locationIds\s*=\s*\[([^\]]+)\]/);

  if (!match) {
    throw new Error("Could not extract locationIds array");
  }

  return match[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
}

export async function doScrape(DB_URL: string) {
  console.log("Starting library traffic scrape.");
  const db = database(DB_URL);

  const locationIds = await getLocationIds();

  for (const id of locationIds) {
    const data = await fetchLocation(id);
    if (!data) {
      console.warn(`No data for location ID ${id}`);
      continue;
    }

    console.log(`Fetched "${data.name}": count=${data.count}, pct=${data.percentage}%`);

    await db
      .insert(libraryTraffic)
      .values([
        {
          id: data.id,
          locationName: data.name,
          trafficCount: data.count,
          trafficPercentage: String(data.percentage),
          timestamp: new Date(data.timestamp),
        },
      ])
      .onConflictDoUpdate({
        target: [libraryTraffic.id],
        set: {
          trafficCount: data.count,
          trafficPercentage: String(data.percentage),
          timestamp: new Date(data.timestamp),
        },
      });

    await db.insert(libraryTrafficHistory).values([
      {
        locationId: data.id,
        trafficCount: data.count,
        trafficPercentage: String(data.percentage),
        timestamp: new Date(data.timestamp),
      },
    ]);
  }

  console.log("Library traffic scrape complete.");
}
