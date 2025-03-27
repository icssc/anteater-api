import { exit } from "node:process";
import { database } from "@packages/db";
import { mapLocation } from "@packages/db/schema";

interface LocationListData {
  catId: number;
  lat: number;
  lng: number;
  id: number;
  name: string;
}

interface LocationDetailData {
  mediaUrlTypes: string[];
  mediaUrls: string[];
}

interface BuildingLocation {
  name: string;
  lat: number;
  lng: number;
  imageURLs: string[];
}

const CATEGORIES: Set<number> = new Set([
  8424, 8309, 8311, 8392, 8405, 44392, 44393, 44394, 44395, 44396, 44397, 44398, 44400, 44401,
  44402, 44538, 44537, 44399, 8396, 11907, 8400, 10486, 11906, 11889, 8310, 8312, 8393, 8394, 8397,
  8398, 8399, 8404, 8407, 8408, 11891, 11892, 11899, 11900, 11902, 21318, 8406, 11908, 11935,
]);
const LOCATIONS_LIST_API =
  "https://api.concept3d.com/locations?map=463&key=0001085cc708b9cef47080f064612ca5";
const LOCATIONS_DETAIL_API = (id: number) =>
  `https://api.concept3d.com/locations/${id}?map=463&key=0001085cc708b9cef47080f064612ca5`;
const locationsCatalogue: Record<number, BuildingLocation> = {};
const locationIds: Record<string, number> = {};

function sleep(ms: number): Promise<number> {
  return new Promise((resolve) => setTimeout(() => resolve(ms), ms));
}

async function fetchLocations() {
  const locationsListResponse: Response = await fetch(LOCATIONS_LIST_API);
  const locations: LocationListData[] = (await locationsListResponse.json()) as LocationListData[];
  for (const location of locations) {
    // Check if location was already recorded
    const locationExists: boolean = Object.values(locationsCatalogue).some(
      (existingLocation) => existingLocation.name === location.name,
    );

    if (!CATEGORIES.has(location.catId)) {
      continue;
    }
    if (locationExists) {
      continue;
    }

    // If one of the locations belongs to one of the categories above, and is not a duplicate
    // Hits location data API to get details on location
    const locationsDetailResponse: Response = await fetch(LOCATIONS_DETAIL_API(location.id));
    const locationData: LocationDetailData =
      (await locationsDetailResponse.json()) as LocationDetailData;

    const imgUrls: string[] = [];

    // Collects image URLs by checking if type is an image
    // { 'mediaUrlTypes': ['image', '...', 'image'], 'mediaUrls': ['xyz.jpg', '...', 'abc.png']}
    if (locationData.mediaUrlTypes !== undefined) {
      for (const [i, media] of locationData.mediaUrlTypes.entries()) {
        if (media === "image") {
          imgUrls.push(locationData.mediaUrls[i]);
        }
      }
    }

    locationsCatalogue[location.id] = {
      name: location.name,
      lat: location.lat,
      lng: location.lng,
      imageURLs: imgUrls,
    };

    const locationName: string = location.name.includes("(")
      ? location.name.substring(location.name.indexOf("(") + 1, location.name.indexOf(")"))
      : location.name;
    locationIds[locationName] = location.id;

    await sleep(250);
  }
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  console.log("map-scrapper starting...");
  await fetchLocations();
  await db.transaction(async (tx) => {
    for (const locationId in locationsCatalogue) {
      const locationData = locationsCatalogue[locationId];
      await tx
        .insert(mapLocation)
        .values({
          id: locationId,
          name: locationData.name,
          latitude: locationData.lat.toString(),
          longitude: locationData.lng.toString(),
          imageURLs: locationData.imageURLs,
        })
        .onConflictDoUpdate({
          target: mapLocation.id,
          set: {
            name: locationData.name,
            latitude: locationData.lat.toString(),
            longitude: locationData.lng.toString(),
          },
        });
    }
  });
  const buildingInterfaceStr = `
export interface Building {
imageURLs: string[];
lat: number;
lng: number;
name: string;
}\n\n`;

  const buildingCatalogueStr = `
const buildingCatalogue: Record<string, Building> = ${JSON.stringify(
    locationsCatalogue,
    null,
    4,
  )};\nexport default buildingCatalogue;`;

  const locationStr = `
const locations: Record<string, number> = ${JSON.stringify(locationIds, null, 4)};
\nexport default locations;`;
  console.log(buildingInterfaceStr + buildingCatalogueStr + locationStr);
  exit(0);
}

main().then();
