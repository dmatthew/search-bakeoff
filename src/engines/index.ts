import type { SearchEngineAdapter } from "../adapter.js";
import { meilisearchAdapter } from "./meilisearch.js";
import { sqliteAdapter } from "./sqlite.js";
import { typesenseAdapter } from "./typesense.js";

// Add a new engine: import its adapter and append it to this array. The id
// becomes the URL slug (/search/:engine), and the rest is read by the UI.
export const engines: readonly SearchEngineAdapter[] = [
  typesenseAdapter,
  meilisearchAdapter,
  sqliteAdapter,
];

export function getEngine(id: string): SearchEngineAdapter | undefined {
  return engines.find((engine) => engine.id === id);
}
