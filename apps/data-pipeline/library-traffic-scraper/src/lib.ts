import { database } from "@packages/db";
import { libraryTraffic, libraryTrafficHistory } from "@packages/db/schema";
import fetch from "cross-fetch";

const locationIds = [
  "245",
  "210",
  "205",
  "206",
  "207",
  "208",
  "211",
  "209",
  "212",
  "664",
  "678",
  "679",
  "676",
  "675",
  "677",
  "672",
  "666",
  "673",
  "669",
  "786",
  "674",
  "787",
];

const floors = [
  "-GSC-2",
  "B",
  "1",
  "2",
  "2H",
  "3",
  "3C",
  "4",
  "4N",
  "-SL-L",
  "-SL-MRC-C",
  "-SL-MRC-O",
  "-SL-2-A",
  "-SL-2-G",
  "-SL-3",
  "-SL-4",
  "-SL-4-L",
  "-SL-5",
  "-SL-5-C",
  "-SL-5-I",
  "-SL-6",
  "-SL-6-F",
];

const locationMappings = floors.map((f, i) => ({ id: locationIds[i] }));

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
    const txt = await fetch(url).then((r) => r.text());
    let parsed = JSON.parse(txt);

    if (typeof parsed === "string") parsed = JSON.parse(parsed);

    if (parsed.data && typeof parsed.data === "object") {
      return parsed.data;
    }

    console.warn(`Location ID ${id} returned error: ${(parsed as RawRespErr).error}`);
  } catch (err) {
    console.error(`Failed to fetch location ID ${id}:`, err);
  }
  return null;
}

export async function doScrape(DB_URL: string) {
  const db = database(DB_URL);
  console.log("Starting library traffic scrape.");

  for (const { id } of locationMappings) {
    const data = await fetchLocation(id);
    if (!data) {
      console.error(`Failed to fetch data for location ID ${id}`);
      continue;
    }
    console.log(
      `Fetched data for "${data.name}": id=${data.id}, count=${data.count}, percentage=${data.percentage}`,
    );

    await db
      .insert(libraryTraffic)
      .values([
        {
          id: data.id,
          name: data.name,
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
