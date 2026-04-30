import Typesense from "typesense";
import type { SearchEngineAdapter } from "../adapter.js";
import { recordToHit } from "../scoring.js";
import { timed } from "../timing.js";
import type { SearchRecord } from "../types.js";

const COLLECTION = process.env.TYPESENSE_COLLECTION || "bakeoff";
const HOST = process.env.TYPESENSE_HOST || "127.0.0.1";
const PORT = Number(process.env.TYPESENSE_PORT || 8109);
const PROTOCOL = process.env.TYPESENSE_PROTOCOL || "http";
const API_KEY = process.env.TYPESENSE_API_KEY || "dev-typesense-key";

type Document = SearchRecord & { population: number };

function client() {
  return new Typesense.Client({
    nodes: [{ host: HOST, port: PORT, protocol: PROTOCOL }],
    apiKey: API_KEY,
    connectionTimeoutSeconds: 3,
  });
}

function isNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { httpStatus?: number; statusCode?: number });
  return (
    status.httpStatus === 404 ||
    status.statusCode === 404 ||
    /404|not found/i.test(error.message)
  );
}

export const typesenseAdapter: SearchEngineAdapter = {
  id: "typesense",
  displayName: "Typesense",
  homepage: "https://typesense.org",
  license: "GPL-3.0",
  description:
    "C++ search engine with built-in typo tolerance, prefix matching on every field, and explicit ranking rules.",

  async sync(records) {
    const c = client();
    await c.collections(COLLECTION).delete().catch((error) => {
      if (!isNotFound(error)) throw error;
    });
    await c.collections().create({
      name: COLLECTION,
      fields: [
        { name: "displayName", type: "string" },
        { name: "primaryText", type: "string" },
        { name: "secondaryText", type: "string" },
        { name: "searchText", type: "string" },
        { name: "rank", type: "int64" },
        { name: "population", type: "int64" },
        { name: "countryCode", type: "string", facet: true, optional: true },
        { name: "kind", type: "string", facet: true },
      ],
      default_sorting_field: "rank",
    });
    const documents: Document[] = records.map((record) => ({
      ...record,
      population: record.population ?? 0,
    }));
    await c
      .collections<Document>(COLLECTION)
      .documents()
      .import(documents, { action: "create" });
  },

  async search(query, { limit }) {
    return timed(async () => {
      const result = await client()
        .collections<Document>(COLLECTION)
        .documents()
        .search({
          q: query,
          query_by: "displayName,primaryText,secondaryText,searchText",
          prefix: "true,true,true,true",
          num_typos: "2,2,2,2",
          per_page: limit,
          sort_by: "_text_match:desc,rank:desc",
        });
      return (result.hits ?? []).flatMap((hit) =>
        hit.document ? [recordToHit(hit.document)] : [],
      );
    });
  },
};
