import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { SearchEngineAdapter } from "../adapter.js";
import { rerank } from "../scoring.js";
import { timed } from "../timing.js";
import type { SearchHit, SearchRecord } from "../types.js";

const DB_PATH = resolve(
  process.cwd(),
  process.env.SQLITE_PATH || "data/bakeoff.sqlite",
);

const CANDIDATE_LIMIT = 500;
const FUZZY_FALLBACK_LIMIT = 3_000;

type Row = Omit<SearchRecord, "kind"> & { kind: string };

function mergeHits(primary: SearchHit[], fallback: SearchHit[], limit: number): SearchHit[] {
  const seen = new Set<string>();
  const merged: SearchHit[] = [];
  for (const hit of [...primary, ...fallback]) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    merged.push(hit);
    if (merged.length >= limit) break;
  }
  return merged;
}

function rowToRecord(row: Row): SearchRecord {
  return {
    ...row,
    rank: Number(row.rank) || 0,
    population: typeof row.population === "number" && Number.isFinite(row.population)
      ? row.population
      : undefined,
    latitude: typeof row.latitude === "number" && Number.isFinite(row.latitude)
      ? row.latitude
      : undefined,
    longitude: typeof row.longitude === "number" && Number.isFinite(row.longitude)
      ? row.longitude
      : undefined,
  };
}

function escapeFtsTerm(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildFtsQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^A-Za-z0-9]+/g, ""))
    .filter((term) => term.length >= 2);
  if (terms.length === 0) return escapeFtsTerm(query.trim());
  return terms.map(escapeFtsTerm).join(" OR ");
}

export const sqliteAdapter: SearchEngineAdapter = {
  id: "sqlite",
  displayName: "SQLite FTS5 (trigram)",
  homepage: "https://www.sqlite.org/fts5.html",
  license: "Public Domain",
  description:
    "Embedded FTS5 with trigram tokenizer plus a JS reranker that adds prefix and fuzzy scoring.",

  async sync(records) {
    await mkdir(dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.exec(`
      DROP TABLE IF EXISTS records;
      DROP TABLE IF EXISTS records_fts;
      CREATE TABLE records (
        id TEXT PRIMARY KEY,
        displayName TEXT NOT NULL,
        primaryText TEXT NOT NULL,
        secondaryText TEXT NOT NULL,
        kind TEXT NOT NULL,
        countryCode TEXT,
        adminCode TEXT,
        latitude REAL,
        longitude REAL,
        searchText TEXT NOT NULL,
        rank INTEGER NOT NULL,
        population INTEGER
      );
      CREATE INDEX records_rank_idx ON records(rank DESC);
      CREATE VIRTUAL TABLE records_fts USING fts5(
        id UNINDEXED,
        searchText,
        displayName,
        primaryText,
        secondaryText,
        tokenize='trigram'
      );
    `);

    const insertRecord = db.prepare(`
      INSERT INTO records (
        id, displayName, primaryText, secondaryText, kind, countryCode, adminCode,
        latitude, longitude, searchText, rank, population
      ) VALUES (
        @id, @displayName, @primaryText, @secondaryText, @kind, @countryCode,
        @adminCode, @latitude, @longitude, @searchText, @rank, @population
      )
    `);
    const insertFts = db.prepare(`
      INSERT INTO records_fts (id, searchText, displayName, primaryText, secondaryText)
      VALUES (@id, @searchText, @displayName, @primaryText, @secondaryText)
    `);

    const tx = db.transaction((items: readonly SearchRecord[]) => {
      for (const record of items) {
        const row = {
          ...record,
          countryCode: record.countryCode ?? null,
          adminCode: record.adminCode ?? null,
          latitude: record.latitude ?? null,
          longitude: record.longitude ?? null,
          population: record.population ?? null,
        };
        insertRecord.run(row);
        insertFts.run(row);
      }
    });
    tx(records);
    db.close();
  },

  async search(query, { limit }) {
    return timed(async () => {
      if (!existsSync(DB_PATH)) {
        throw new Error(
          `SQLite index missing at ${DB_PATH}. Run \`pnpm sync sqlite\` first.`,
        );
      }
      const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      try {
        const ftsQuery = buildFtsQuery(query);
        const rows = db
          .prepare(`
            SELECT r.*
            FROM records_fts f
            JOIN records r ON r.id = f.id
            WHERE records_fts MATCH ?
            ORDER BY bm25(records_fts), r.rank DESC
            LIMIT ?
          `)
          .all(ftsQuery, CANDIDATE_LIMIT) as Row[];

        const ranked = rerank(rows.map(rowToRecord), query, limit);
        if (ranked.length >= limit) return ranked;

        // Fallback: top-by-rank slice + JS fuzzy rescoring catches typo-prefix
        // queries that trigram FTS5 misses (e.g. "Sand Fr" -> "San Francisco").
        const fallback = db
          .prepare(`SELECT * FROM records ORDER BY rank DESC LIMIT ?`)
          .all(FUZZY_FALLBACK_LIMIT) as Row[];
        return mergeHits(
          ranked,
          rerank(fallback.map(rowToRecord), query, limit),
          limit,
        );
      } finally {
        db.close();
      }
    });
  },
};
