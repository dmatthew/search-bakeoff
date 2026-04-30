import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { datasets, loadDataset } from "./datasets.js";
import { engines, getEngine } from "./engines/index.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

const app = Fastify({ logger: true });

const publicDir = resolve(fileURLToPath(new URL("../public", import.meta.url)));
await app.register(fastifyStatic, { root: publicDir });

app.get("/api/engines", async () => ({
  engines: engines.map((engine) => ({
    id: engine.id,
    displayName: engine.displayName,
    homepage: engine.homepage,
    license: engine.license,
    description: engine.description,
  })),
}));

app.get("/api/datasets", async () => ({ datasets }));

app.get<{
  Querystring: { q?: string; limit?: string; engines?: string };
}>("/api/search", async (request, reply) => {
  const query = (request.query.q ?? "").trim();
  const limit = clampLimit(request.query.limit);
  const requested = parseEngineList(request.query.engines);

  if (!query) {
    return { query, results: {} };
  }

  const targets = requested
    ? requested.flatMap((id) => {
        const engine = getEngine(id);
        return engine ? [engine] : [];
      })
    : engines;

  const entries = await Promise.all(
    targets.map(async (engine) => {
      const result = await engine.search(query, { limit });
      return [engine.id, result] as const;
    }),
  );

  return {
    query,
    limit,
    results: Object.fromEntries(entries),
  };
});

app.post<{ Params: { engine: string }; Querystring: { dataset?: string } }>(
  "/api/sync/:engine",
  async (request, reply) => {
    const engine = getEngine(request.params.engine);
    if (!engine) return reply.code(404).send({ error: "Unknown engine" });
    const datasetId = request.query.dataset || datasets[0]?.id;
    if (!datasetId) return reply.code(400).send({ error: "No dataset configured" });

    const records = await loadDataset(datasetId);
    const start = performance.now();
    await engine.sync(records);
    const ms = Math.round(performance.now() - start);
    return { engine: engine.id, dataset: datasetId, recordCount: records.length, ms };
  },
);

function clampLimit(value: string | undefined): number {
  const parsed = value ? Number(value) : 10;
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(Math.floor(parsed), 25);
}

function parseEngineList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((id) => id.trim()).filter(Boolean);
}

try {
  await app.listen({ port: PORT, host: HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
