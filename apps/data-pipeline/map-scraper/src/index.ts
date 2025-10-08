import { exit } from "node:process";
import { database } from "@packages/db";
import { mapLocation } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { locationDetailSchema, locationListSchema } from "./schema.ts";

interface BuildingLocation {
  name: string;
  lat: number;
  lng: number;
  imageURLs: string[];
}

// this is UCI's Concept3D map ID, and is needed to scope all location and detail queries on and around campus
const UCI_MAP_ID = "463" as const;

// const CATEGORIES: Set<number> = new Set([
//   8424, 8309, 8311, 8392, 8405, 44392, 44393, 44394, 44395, 44396, 44397, 44398, 44400, 44401,
//   44402, 44538, 44537, 44399, 8396, 11907, 8400, 10486, 11906, 11889, 8310, 8312, 8393, 8394, 8397,
//   8398, 8399, 8404, 8407, 8408, 11891, 11892, 11899, 11900, 11902, 21318, 8406, 11908, 11935,
// ]);

// this key is provided to browsers by CONCEPT_3D and is meant to be public.
const CONCEPT_3D_API_KEY = "0001085cc708b9cef47080f064612ca5" as const;

function buildConcept3DUrl(path: string, params: Record<string, string | number>): string {
  const url = new URL(`https://api.concept3d.com${path}`);
  url.searchParams.set("map", UCI_MAP_ID);
  url.searchParams.set("key", CONCEPT_3D_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function locationsListUrl(): string {
  return buildConcept3DUrl("/locations", {});
}

function locationDetailUrl(id: string): string {
  return buildConcept3DUrl(`/locations/${id}`, {});
}

async function fetchImageUrls(id: string): Promise<string[]> {
  try {
    const res = await fetch(locationDetailUrl(id));
    if (!res.ok) {
      console.warn(`[detail] ${id} HTTP ${res.status}`);
      return [];
    }
    const { mediaUrlTypes = [], mediaUrls = [] } = locationDetailSchema.parse(await res.json());

    const out: string[] = [];
    // zod guarantees that mediaURLs is a string[], but we still use Math.min to ignore any trailing entries if the API
    // returns arrays of differing lengths
    for (let i = 0; i < Math.min(mediaUrlTypes.length, mediaUrls.length); i++) {
      if (mediaUrlTypes[i] === "image") out.push(mediaUrls[i]);
    }
    return out;
  } catch (e) {
    console.warn(`[detail] ${id} failed:`, e);
    return [];
  }
}

async function fetchLocations(): Promise<Map<string, BuildingLocation>> {
  const locationsCatalogue = new Map<string, BuildingLocation>();
  const seenIds = new Set<string>();

  const res = await fetch(locationsListUrl());
  if (!res.ok) throw new Error("HTTP error");
  const locations = locationListSchema.parse(await res.json());

  for (const location of locations) {
    if (seenIds.has(location.id)) continue;

    const imageURLs = await fetchImageUrls(location.id);

    locationsCatalogue.set(location.id, {
      name: location.name,
      lat: location.lat,
      lng: location.lng,
      imageURLs: imageURLs,
    });
    seenIds.add(location.id);
  }

  return locationsCatalogue;
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);

  console.log("started map scraper...");
  const locationsCatalogue = await fetchLocations();
  console.log("upserting...");

  const rows = Array.from(locationsCatalogue, ([id, d]) => ({
    id,
    name: d.name,
    latitude: d.lat,
    longitude: d.lng,
    imageURLs: d.imageURLs,
  }));

  if (rows.length === 0) {
    console.log("nothing to upsert.");
    exit(0);
  }

  const res = await db
    .insert(mapLocation)
    .values(rows)
    .onConflictDoUpdate({
      target: mapLocation.id,
      set: conflictUpdateSetAllCols(mapLocation),
    })
    .returning({ id: mapLocation.id });

  console.log(`committed ${res.length} upserts.`);
  exit(0);
}

main().then();
