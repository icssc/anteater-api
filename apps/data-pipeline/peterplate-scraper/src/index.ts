import { getLocationInformation } from "./lib";

//test scraper code
async function main() {
  try {
    console.log("Starting dining scraper test...");

    const result = await getLocationInformation("brandywine", "ASC");

    console.log("Scraper succeeded");
    console.dir(result, { depth: null });
  } catch (err) {
    console.error("Scraper failed");
    console.error(err);
    process.exit(1);
  }
}

main();
