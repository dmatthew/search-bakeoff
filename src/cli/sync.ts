import { datasets, loadDataset } from "../datasets.js";
import { engines, getEngine } from "../engines/index.js";

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];
  const datasetId = args[1] || datasets[0]?.id;

  if (!datasetId) {
    console.error("No dataset configured.");
    process.exit(1);
  }

  const targets = !target || target === "all"
    ? engines
    : (() => {
        const engine = getEngine(target);
        if (!engine) {
          console.error(`Unknown engine: ${target}`);
          console.error(`Available: ${engines.map((e) => e.id).join(", ")}, all`);
          process.exit(1);
        }
        return [engine];
      })();

  console.log(`Loading dataset: ${datasetId}`);
  const records = await loadDataset(datasetId);
  console.log(`  ${records.length.toLocaleString()} records loaded`);

  let failed = false;
  for (const engine of targets) {
    console.log(`\nSyncing ${engine.displayName}...`);
    const start = performance.now();
    try {
      await engine.sync(records);
      const ms = Math.round(performance.now() - start);
      console.log(`  done in ${ms.toLocaleString()}ms`);
    } catch (error) {
      failed = true;
      console.error(`  failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
