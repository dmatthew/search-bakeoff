import { Meilisearch } from "meilisearch";
import type { SearchEngineAdapter } from "../adapter.js";
import { recordToHit } from "../scoring.js";
import { timed } from "../timing.js";
import type { SearchRecord } from "../types.js";

const INDEX = process.env.MEILISEARCH_INDEX || "bakeoff";
const HOST = process.env.MEILISEARCH_HOST || "http://127.0.0.1:7701";
const API_KEY = process.env.MEILISEARCH_API_KEY || "dev-master-key";

type Document = SearchRecord & { meiliId: string };

function client() {
  return new Meilisearch({ host: HOST, apiKey: API_KEY });
}

function toDocument(record: SearchRecord): Document {
  return {
    ...record,
    meiliId: Buffer.from(record.id).toString("base64url"),
  };
}

async function waitForTask(c: Meilisearch, task: { taskUid: number }) {
  const result = await c.tasks.waitForTask(task.taskUid, {
    timeOutMs: 120_000,
    intervalMs: 200,
  });
  if (result.status === "failed") {
    throw new Error(result.error?.message || `Task ${task.taskUid} failed`);
  }
}

export const meilisearchAdapter: SearchEngineAdapter = {
  id: "meilisearch",
  displayName: "Meilisearch",
  homepage: "https://www.meilisearch.com",
  license: "MIT",
  description:
    "Rust search engine with typo tolerance on by default and a declarative ranking rule pipeline.",

  async sync(records) {
    const c = client();
    await c.deleteIndexIfExists(INDEX);
    const create = await c.createIndex(INDEX, { primaryKey: "meiliId" });
    await waitForTask(c, create);

    const index = c.index(INDEX);
    const settings = await index.updateSettings({
      searchableAttributes: ["displayName", "primaryText", "secondaryText", "searchText"],
      displayedAttributes: [
        "id",
        "displayName",
        "primaryText",
        "secondaryText",
        "kind",
        "countryCode",
        "adminCode",
        "latitude",
        "longitude",
      ],
      sortableAttributes: ["rank", "population"],
      rankingRules: ["words", "typo", "proximity", "attribute", "exactness", "rank:desc"],
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 4, twoTypos: 7 },
      },
    });
    await waitForTask(c, settings);

    const add = await index.addDocuments(records.map(toDocument));
    await waitForTask(c, add);
  },

  async search(query, { limit }) {
    return timed(async () => {
      const index = client().index<Document>(INDEX);
      const result = await index.search(query, {
        limit,
        matchingStrategy: "all",
      });
      return result.hits.map((hit) => recordToHit(hit));
    });
  },
};
