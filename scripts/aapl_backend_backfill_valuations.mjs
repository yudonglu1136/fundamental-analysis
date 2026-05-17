#!/usr/bin/env node
import { backfillAaplValuationRuns } from "../apps/api/src/services/aaplValuationService.mjs";
import { AAPL_BACKEND_MODEL_VERSION } from "../modules/aapl/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillAaplValuationRuns({
  scenarios,
  replace,
  modelVersion: AAPL_BACKEND_MODEL_VERSION.version,
});

console.log("AAPL backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
