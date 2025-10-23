import { exit } from "node:process";
import { database } from "@packages/db";
import { mapLocation } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import type { Concept3DShape } from "./schema";
import { locationDetailSchema, locationListSchema } from "./schema.ts";

interface BuildingLocation {
  name: string;
  catId: string;
  lat: number;
  lng: number;
  imageURLs: string[];
  polygon: number[][] | null;
}

// this is UCI's Concept3D map ID, and is needed to scope all location and detail queries on and around campus
const UCI_MAP_ID = "463" as const;

// const CATEGORIES: Set<number> = new Set([
//   8424, 8309, 8311, 8392, 8405, 44392, 44393, 44394, 44395, 44396, 44397, 44398, 44400, 44401,
//   44402, 44538, 44537, 44399, 8396, 11907, 8400, 10486, 11906, 11889, 8310, 8312, 8393, 8394, 8397,
//   8398, 8399, 8404, 8407, 8408, 11891, 11892, 11899, 11900, 11902, 21318, 8406, 11908, 11935,
// ]);

// all locations yields 3782 entries
//lots of uncleaned data - may need to manually filter out--
// "REMOVE"
// "DELETE"
// "Unrequested Alteration"
// "3D"
// spacing is not consisent (e.g. "LOT  5")
// "APPROVED"
// "NOT APPROVED"
// "EDIT"
// empty names
// "polygon title"
// "polyline title"
// "circle title"
// "rectangle title"
// "polymarker title"
// "marker title"
// "LABEL EDIT"
// "Label: Change color"
// Label: Remove
// Visual: Remove trees
// Visual: Remove railing
// Visual: Adjust rail transition
// data feed test
// Receiving
// Label: Remove Bike Shop
// Visual: Add roadway entrance
// Label: Art Culture & Technology
// Label: Children's Center
// Label: Extended Day Center
// Visual: Building Outline
// Label: Move Anteatery
// Landscape: Add bushes and grass
// Landscape: Add trees
// Label: Ecological Preserve
// Add label: Verano Place
// Data
// Clean Up CMS categories.
// Add labels to cateogry. not on main index
// Move CoHS Bldg. Label
// Label: Nursing & Health Sciences Hall
// Add wall
// upload new label png to TIFs folder. on drive.
// Please remove
// Adjust bike racks
// Remove solar panels
// Add stairs
// Adjust 2nd level of structure
// remove circle.
// Add bikeway
// Remove section of pathway
// Change to roadway
// Remove  trees
// Move level 3 ramp
// Add stairs
// Add pathway
// test
// test popup
// Aldrich hall test
// fix boundary
// update path
// Complimentary Art Books
// Show missing building
// Add roadway entrance
// Extend sidewalk
// Fix building footprints
// Adjust roadways to match image
// Show sidewalk
// Extend pathways
// Adjust pathway
// Remove racks
// Recolor to white pathway & add trees
// Adjust to align with existing sidewalk
// Straighten green boundary
// all gender restroom test
// html feed test
// Edit - Aldrich Hall Ramp
// "Add ""GINSBURG CT"" Street Label"
// Add green gap
// New Building: Mesa Court Expansion
// Fix ramp
// Add Missing Ramp (Aldrich Hall)
// Add flagpoles

// the following are stems that never appear in UCI locations.
// as of October 2025, a clear strategy for eliminating these location entries has not been identified.
const INVALID_STEMS = [
  // editor artifacts / workflows
  "label",
  "visual",
  "landscape",
  "edit",
  "update",
  "approved",
  "approval",
  "unrequested",
  "upload",
  "data",
  "category",
  "datafeed",
  "feed",
  "test",
  "popup",
  "cms",

  // geometry/editor objects
  "polygon",
  "polyline",
  "rectangle",
  "circle",
  "polymarker",
  "marker",

  // work verbs
  "add",
  "remove",
  "delete",
  "move",
  "fix",
  "adjust",
  "change",
  "extend",
  "straighten",
  "recolor",
  "show",
] as const;

// creating a regex for each stem (optional ":" and case insensitivity)
const INVALID_PATTERNS = INVALID_STEMS.map((s) => new RegExp(String.raw`\b${s}(?:\:)?\b`, "i"));

//normalizes spacing
const normalize = (s: string | null | undefined) => (s ?? "").trim();

export function isInvalidEntry(name: string | null | undefined): boolean {
  const n = normalize(name);
  if (!n) return true;
  return INVALID_PATTERNS.some((rx) => rx.test(n));
}

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

function capturePolygon(shape: Concept3DShape | string | undefined): [number, number][] | null {
  if (!shape || typeof shape === "string") return null;

  if (shape.type && shape.type.toLowerCase() !== "polygon") return null;

  if (!Array.isArray(shape.paths)) return null;

  return shape.paths;
}

async function fetchDetail(id: string): Promise<{
  imageURLs: string[];
  polygon: number[][] | null;
}> {
  try {
    const res = await fetch(locationDetailUrl(id));
    if (!res.ok) {
      console.warn(`[detail] ${id} HTTP ${res.status}`);
      return { imageURLs: [], polygon: null };
    }
    const parsedDetail = locationDetailSchema.parse(await res.json());

    const imageURLs: string[] = [];
    // zod guarantees that mediaURLs is a string[], but we still use Math.min to ignore any trailing entries if the API
    // returns arrays of differing lengths
    const mediaUrlTypes = parsedDetail.mediaUrlTypes ?? [];
    const mediaUrls = parsedDetail.mediaUrls ?? [];
    for (let i = 0; i < Math.min(mediaUrlTypes.length, mediaUrls.length); i++) {
      if (mediaUrlTypes[i] === "image") imageURLs.push(mediaUrls[i]);
    }

    const polygon = capturePolygon(parsedDetail.shape);
    return { imageURLs: imageURLs, polygon: polygon };
  } catch (e) {
    console.warn(`[detail] ${id} failed:`, e);
    return { imageURLs: [], polygon: null };
  }
}

async function fetchLocations(): Promise<Map<string, BuildingLocation>> {
  const locationsCatalogue = new Map<string, BuildingLocation>();
  const seenIds = new Set<string>();

  const res = await fetch(locationsListUrl());
  if (!res.ok) throw new Error("HTTP error");
  const locations = locationListSchema.parse(await res.json());

  for (const location of locations) {
    if (isInvalidEntry(location.name) || seenIds.has(location.id)) continue;

    const { imageURLs, polygon } = await fetchDetail(location.id);

    locationsCatalogue.set(location.id, {
      name: location.name,
      catId: String(location.catId),
      lat: location.lat,
      lng: location.lng,
      imageURLs: imageURLs,
      polygon: polygon,
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
    catId: d.catId,
    name: d.name,
    latitude: d.lat,
    longitude: d.lng,
    imageURLs: d.imageURLs,
    polygon: d.polygon ?? null,
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
