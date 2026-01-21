import type { database } from "@packages/db";
import type { InsertStation, RestaurantId } from "@packages/db/schema";
import { stations } from "@packages/db/schema";
import { upsert } from "./utils";

export const upsertStation = async (db: ReturnType<typeof database>, station: InsertStation) =>
  await upsert(db, stations, station, {
    target: stations.id,
    set: station,
  });

/**
 * Upserts all stations present within `stationsInfo`.
 */
export async function upsertAllStations(
  db: ReturnType<typeof database>,
  restaurantId: RestaurantId,
  stationsInfo: Record<string, string>,
): Promise<void> {
  const stationsResult = await Promise.allSettled(
    Object.keys(stationsInfo).map((id) =>
      upsertStation(db, {
        id,
        restaurantId,
        name: stationsInfo[id] ?? "UNKNOWN STATION",
      }),
    ),
  );

  for (const station of stationsResult) {
    if (station.status === "rejected") {
      console.error("Failed to upsert station:", station.reason);
    }
  }
}

// export async function scrapeStations(db: ReturnType<typeof database>) {
//   try {
//     const LocationInfo = await getLocationInformation("brandywine", "ASC");

//     for (const [stationId, stationName] of Object.entries(LocationInfo.stationsInfo)) {
//       try {
//         await db
//           .insert(station)
//           .values({
//             id: stationId,
//             name: stationName,
//             updatedAt: new Date(),
//           })
//           .onConflictDoUpdate({
//             target: station.id,
//             set: {
//               name: stationName,
//               updatedAt: new Date(),
//             },
//           });
//       } catch (error) {
//         console.error(error);
//       }
//     }
//   } catch (error) {
//     console.error(error);
//     throw error;
//   }
// }
