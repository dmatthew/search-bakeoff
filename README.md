<p align="center">
  <img src="./assets/chef.png" alt="Search Bakeoff chef mascot" width="220">
</p>

<p align="center">
  Side-by-side full-text search engine comparison, runnable on your laptop.
</p>

# Search Bakeoff

Drop a query in, see how each engine answers it, in real time, against the same dataset. Built to make engine choice an empirical decision instead of a vibes-based one.

Bundled engines:

| Engine | License | Notes |
| --- | --- | --- |
| [Typesense](https://typesense.org) | GPL-3.0 | C++, prefix matching on every field, explicit ranking rules |
| [Meilisearch](https://www.meilisearch.com) | MIT | Rust, typo tolerance on by default |
| [SQLite FTS5 (trigram)](https://www.sqlite.org/fts5.html) | Public Domain | Embedded, plus a JS reranker for fuzzy/prefix scoring |

Bundled dataset: 38,922 US Census Gazetteer and Natural Earth populated places + 51 US states/DC. Public domain / CC0.

## Quickstart

Requirements: Node 20+, pnpm, Docker (for Meilisearch and Typesense).

```sh
pnpm install
docker compose up -d           # starts meilisearch + typesense
pnpm sync all                  # builds all three indexes from the bundled dataset
pnpm dev                       # http://127.0.0.1:3000
```

Containers bind to host ports **7701** (Meilisearch) and **8109** (Typesense) instead of the defaults, so this can coexist with another local Meili/Typesense instance.

Type a query in the UI and watch all three engines respond side-by-side. Try misspellings ("yosemiti", "san fransicko") to see how typo tolerance differs.

## Project layout

```
src/
  adapter.ts        SearchEngineAdapter interface — the only abstraction
  engines/          One file per engine
  datasets.ts       Dataset registry + gzipped loader
  scoring.ts        Shared rerank/scoring used by SQLite engine
  server.ts         Fastify API + static frontend
  cli/sync.ts       `pnpm sync <engine|all>`
public/             Vanilla HTML/CSS/JS — no bundler, no framework
datasets/           Gzipped datasets checked into the repo
scripts/build-data.ts  Validate + gzip a source JSON into a dataset
docker-compose.yml  Meilisearch + Typesense
```

## Adding an engine

1. Create `src/engines/<your-engine>.ts` exporting an object that satisfies `SearchEngineAdapter` (see `src/adapter.ts`).
2. Append it to the array in `src/engines/index.ts`.
3. If it needs a server, add it to `docker-compose.yml`.

That's it. The UI reads `/api/engines` and renders a card per engine automatically.

## Adding a dataset

1. Produce a JSON array of records matching `SearchRecord` (see `src/types.ts`).
2. Run `pnpm build:data ./your-source.json <id>` to validate and gzip it into `datasets/`.
3. Append a manifest entry in `src/datasets.ts`.
4. `pnpm sync all <id>` to load it into every engine.

## Regenerating the bundled dataset

The bundled `us-and-world-locations.json.gz` was built from:

- US Census 2025 Gazetteer national places — <https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html>
- Natural Earth 1:10m populated places — <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/>

Both sources are in the public domain (US Census) or CC0 (Natural Earth). To rebuild, write a generator that produces `SearchRecord[]` JSON from those sources, then pipe it through `pnpm build:data`.

## Configuration

All engine connection settings have sensible defaults for the bundled `docker-compose.yml`. Override via environment variables if you point at hosted instances:

```
TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_PROTOCOL, TYPESENSE_API_KEY, TYPESENSE_COLLECTION
MEILISEARCH_HOST, MEILISEARCH_API_KEY, MEILISEARCH_INDEX
SQLITE_PATH
PORT, HOST
```

## License

MIT.
