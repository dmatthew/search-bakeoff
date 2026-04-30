import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { createGunzip } from "node:zlib";
import type { DatasetManifest, SearchRecord } from "./types.js";

const ROOT = resolve(process.cwd(), "datasets");

// Add a new dataset: drop a `.json.gz` file in datasets/ and append a manifest
// entry here. Records must conform to the SearchRecord shape.
export const datasets: readonly DatasetManifest[] = [
  {
    id: "us-and-world-locations",
    displayName: "US + World Locations",
    description:
      "US Census Gazetteer places, US states, and Natural Earth populated places worldwide.",
    source:
      "US Census 2025 Gazetteer (national places) + Natural Earth 1:10m populated places",
    license: "Public Domain (US Census) + CC0 (Natural Earth)",
    recordCount: 38_973,
    path: "us-and-world-locations.json.gz",
  },
];

export function getDataset(id: string): DatasetManifest | undefined {
  return datasets.find((dataset) => dataset.id === id);
}

export async function loadDataset(id: string): Promise<readonly SearchRecord[]> {
  const manifest = getDataset(id);
  if (!manifest) throw new Error(`Unknown dataset: ${id}`);
  const filePath = resolve(ROOT, manifest.path);

  const stream = createReadStream(filePath).pipe(createGunzip());
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  const json = Buffer.concat(chunks).toString("utf8");
  const parsed = JSON.parse(json) as SearchRecord[];
  return parsed;
}
