import process from "node:process";
import { scrapeBadReviews } from "./scrape-core.mjs";

function getArg(name, fallback = "") {
  const key = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(key));
  return hit ? hit.slice(key.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function run() {
  const url = getArg("url");
  if (!url) {
    console.error("Missing --url argument.");
    console.error(
      "Example: npm run scrape:bad-reviews -- --url=\"https://www.google.com/maps/place/...\"",
    );
    process.exit(1);
  }

  const maxRating = toNumber(getArg("max-rating", "2"), 2);
  const limit = toNumber(getArg("limit", "50"), 50);
  const headless = hasFlag("headless");
  const trySortLowest = hasFlag("try-sort-lowest");
  const outFile = getArg("out", "bad-reviews.json");

  try {
    const payload = await scrapeBadReviews({
      url,
      maxRating,
      limit,
      headless,
      outFile,
      trySortLowest,
    });
    console.log(`Saved ${payload.count} bad reviews to ${payload.savedTo || outFile}`);
  } catch (error) {
    console.error("Scraper failed:", error.message);
    process.exit(1);
  }
}
run();
