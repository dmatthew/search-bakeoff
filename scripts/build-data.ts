/**
 * Build a gzipped dataset file from a source JSON.
 *
 * Usage:
 *   pnpm build:data <source.json> <out-id>
 *
 * Example:
 *   pnpm build:data ./raw/cities.json us-and-world-locations
 *
 * The source file must be a JSON array of records matching the SearchRecord
 * shape (see src/types.ts). This script validates the shape, sorts by rank
 * descending for deterministic output, and writes a gzipped JSON file to
 * `datasets/<out-id>.json.gz`.
 *
 * To regenerate the bundled US + world locations dataset specifically, run a
 * generator that pulls from these public-domain sources:
 *   - US Census 2025 Gazetteer (national places):
 *     https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
 *   - Natural Earth 1:10m populated places:
 *     https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
 * Then pipe the resulting JSON through this script.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const REQUIRED_FIELDS = [
  "id",
  "displayName",
  "primaryText",
  "secondaryText",
  "searchText",
  "kind",
  "rank",
] as const;

async function main() {
  const [sourcePath, outId] = process.argv.slice(2);
  if (!sourcePath || !outId) {
    console.error("Usage: pnpm build:data <source.json> <out-id>");
    process.exit(1);
  }

  const raw = await readFile(resolve(process.cwd(), sourcePath), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Source must be a JSON array of records.");
  }

  for (const [index, record] of parsed.entries()) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in record)) {
        throw new Error(`Record ${index} missing required field "${field}".`);
      }
    }
  }

  parsed.sort((a: { rank: number }, b: { rank: number }) => b.rank - a.rank);

  const outPath = resolve(process.cwd(), "datasets", `${outId}.json.gz`);
  const compressed = gzipSync(Buffer.from(JSON.stringify(parsed)), { level: 9 });
  await writeFile(outPath, compressed);

  console.log(`Wrote ${parsed.length.toLocaleString()} records to ${outPath}`);
  console.log(`  ${(compressed.byteLength / 1024 / 1024).toFixed(2)} MB compressed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
