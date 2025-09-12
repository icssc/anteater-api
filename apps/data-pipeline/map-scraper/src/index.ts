import { exit } from "node:process";
import { database } from "@packages/db";
import { mapLocation } from "@packages/db/schema";

interface LocationListData {
  catId: number;
  lat: number;
  lng: number;
  id: string;
  name: string;
}

interface LocationDetailData {
  mediaUrlTypes?: string[];
  mediaUrls?: string[];
}

interface BuildingLocation {
  name: string;
  lat: number;
  lng: number;
  imageURLs: string[];
}

// API key, categories, Map ID values of non-secret constants are hardcoded.
// Possible other solutions will be applied in the future.

const CATEGORIES: Set<number> = new Set([
  8424, 8309, 8311, 8392, 8405, 44392, 44393, 44394, 44395, 44396, 44397, 44398, 44400, 44401,
  44402, 44538, 44537, 44399, 8396, 11907, 8400, 10486, 11906, 11889, 8310, 8312, 8393, 8394, 8397,
  8398, 8399, 8404, 8407, 8408, 11891, 11892, 11899, 11900, 11902, 21318, 8406, 11908, 11935,
]);
const LOCATIONS_LIST_API =
  "https://api.concept3d.com/locations?map=463&key=0001085cc708b9cef47080f064612ca5";

const getLocationDetail = (id: string) =>
  `https://api.concept3d.com/locations/${id}?map=463&key=0001085cc708b9cef47080f064612ca5`;

const locationsCatalogue = new Map<string, BuildingLocation>();
const seenIds = new Set<string>();

async function fetchImageUrls(id: string): Promise<string[]> {
  try {
    const res = await fetch(getLocationDetail(id));
    if (!res.ok) {
      console.warn(`[detail] ${id} HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as LocationDetailData;
    const types = Array.isArray(data.mediaUrlTypes) ? data.mediaUrlTypes : [];
    const urls = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];

    const out: string[] = [];
    for (let i = 0; i < Math.min(types.length, urls.length); i++) {
      if (types[i] === "image" && typeof urls[i] === "string") out.push(urls[i]);
    }
    return out;
  } catch (e) {
    console.warn(`[detail] ${id} failed:`, e);
    return [];
  }
}

async function fetchLocations() {
  const locationsListResponse: Response = await fetch(LOCATIONS_LIST_API);
  const locations: LocationListData[] = (await locationsListResponse.json()) as LocationListData[];
  for (const location of locations) {
    const id = location.id;
    if (!CATEGORIES.has(location.catId) || seenIds.has(id)) continue;

    const imageURLs = await fetchImageUrls(id);

    locationsCatalogue.set(id, {
      name: location.name,
      lat: location.lat,
      lng: location.lng,
      imageURLs: imageURLs,
    });
    seenIds.add(id);
  }
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);

  console.log("started map scraper");
  await fetchLocations();
  console.log("upserting…");

  let upserts = 0;

  await db.transaction(async (tx) => {
    for (const [id, data] of locationsCatalogue) {
      await tx
        .insert(mapLocation)
        .values({
          id,
          name: data.name,
          latitude: data.lat,
          longitude: data.lng,
          imageURLs: data.imageURLs,
        })
        .onConflictDoUpdate({
          target: mapLocation.id,
          set: {
            name: data.name,
            latitude: data.lat,
            longitude: data.lng,
            imageURLs: data.imageURLs,
          },
        });
      upserts++;
    }
  });
  console.log(`committed upserts = ${upserts}`);

  exit(0);
}

main().then();
