import { performance } from "node:perf_hooks";
import type { EngineSearchResult, SearchHit } from "./types.js";

export async function timed(
  fn: () => Promise<SearchHit[]>,
): Promise<EngineSearchResult> {
  const start = performance.now();
  try {
    const hits = await fn();
    return { ms: round(performance.now() - start), hits };
  } catch (error) {
    return {
      ms: round(performance.now() - start),
      hits: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
