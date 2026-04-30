import type { EngineSearchResult, SearchOptions, SearchRecord } from "./types.js";

export interface SearchEngineAdapter {
  /** Stable machine identifier, e.g. "typesense". Used in URLs and the registry. */
  readonly id: string;
  /** Human-readable name, e.g. "Typesense". */
  readonly displayName: string;
  /** Project homepage. */
  readonly homepage: string;
  /** SPDX license identifier of the engine itself. */
  readonly license: string;
  /** One-line description for the UI. */
  readonly description: string;

  /**
   * (Re)create the index/collection/table and bulk-load the records.
   * Implementations should be idempotent: dropping prior state is expected.
   */
  sync(records: readonly SearchRecord[]): Promise<void>;

  /** Run a query and return the top `options.limit` hits. */
  search(query: string, options: SearchOptions): Promise<EngineSearchResult>;
}
