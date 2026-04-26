import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createCasePageFromPayload,
  DEFAULT_PUBLIC_BASE,
} from "./create-case-page.mjs";

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveReviewsPath(root, slug) {
  const candidates = [
    path.resolve(root, slug, "reviews.json"),
    path.resolve(root, "cases", slug, "reviews.json"),
  ];
  return candidates;
}

async function run() {
  const projectRoot = process.cwd();
  const registryPath = path.resolve(projectRoot, "cases", "index.json");
  const baseUrlArg =
    process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=")[1] ||
    DEFAULT_PUBLIC_BASE;

  const registry = await readJsonSafe(registryPath);
  if (!Array.isArray(registry) || registry.length === 0) {
    console.log("No cases found in cases/index.json");
    return;
  }

  let refreshed = 0;
  let skipped = 0;

  for (const entry of registry) {
    const slug = String(entry?.slug || "").trim();
    const company = String(entry?.company || "").trim();
    if (!slug || !company) {
      skipped += 1;
      continue;
    }

    const reviewPathCandidates = resolveReviewsPath(projectRoot, slug);
    let payload = null;
    for (const candidate of reviewPathCandidates) {
      payload = await readJsonSafe(candidate);
      if (payload) break;
    }

    if (!payload) {
      skipped += 1;
      continue;
    }

    await createCasePageFromPayload({
      scrapePayload: payload,
      company,
      slug,
      baseUrl: baseUrlArg,
      outputRoot: projectRoot,
      pathPrefix: "",
      source: "refresh-all",
      maxRating: Number(payload.maxRating || 2),
    });

    refreshed += 1;
    console.log(`Refreshed: /${slug}/`);
  }

  console.log(`Done. Refreshed: ${refreshed}, skipped: ${skipped}`);
}

run().catch((error) => {
  console.error("case:refresh-all failed:", error.message);
  process.exit(1);
});
