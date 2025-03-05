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

interface FloorMapping {
  floor: string;
  id: string;
}

interface FloorData {
  id: number;
  name: string;
  count: number;
  percentage: number;
  timestamp: string;
  isActive: boolean;
  childCounts: unknown | null;
}

const floorMappings: FloorMapping[] = floors.map((f, i) => ({
  floor: `progressBar${f}`,
  id: locationIds[i],
}));

async function fetchFloorData(mapping: FloorMapping): Promise<void> {
  const url = `https://www.lib.uci.edu/sites/all/scripts/occuspace.php?id=${mapping.id}`;
  try {
    const response = await fetch(url);
    const text = await response.json();
    const parsed = JSON.parse(text);

    if (parsed.data && typeof parsed.data === "object") {
      const data: FloorData = parsed.data;
      console.log(
        `Floor ${mapping.floor} (${data.name}) - Count: ${data.count}, Percentage: ${Math.round(data.percentage * 100)}%`,
      );
    } else if (parsed.error) {
      console.warn(`Floor ${mapping.floor} (ID ${mapping.id}) returned error: ${parsed.error}`);
    } else {
      console.warn(
        `Floor ${mapping.floor} (ID ${mapping.id}) returned unexpected response: ${parsed.text}`,
      );
    }
  } catch (error) {
    console.error(`Error fetching data for floor ${mapping.floor} (ID ${mapping.id}):`, error);
  }
}

async function main(): Promise<void> {
  console.log("Fetching floor busyness data.");
  for (const mapping of floorMappings) {
    await fetchFloorData(mapping);
  }
  console.log("All floor data fetched.");
}

main().catch(console.error);
