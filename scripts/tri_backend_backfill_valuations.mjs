#!/usr/bin/env node
import { backfillTriValuationRuns } from "../apps/api/src/services/triValuationService.mjs";
import { closeTriBackendValuationAdapter } from "../modules/tri/valuation/adapter.mjs";
import { TRI_BACKEND_MODEL_VERSION } from "../modules/tri/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

let result;
try {
  result = await backfillTriValuationRuns({
    scenarios,
    replace,
    modelVersion: TRI_BACKEND_MODEL_VERSION.version,
  });
} finally {
  await closeTriBackendValuationAdapter();
}

console.log("TRI backend valuation backfill complete");
console.log(JSON.stringify({
  ticker: result.ticker,
  modelVersion: result.modelVersion,
  scenarios: result.scenarios,
  replace: result.replace,
  createdCount: result.createdCount,
  failedCount: result.failedCount,
  firstCreated: result.created[0] ?? null,
  latestCreated: result.created[result.created.length - 1] ?? null,
  failed: result.failed,
}, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
