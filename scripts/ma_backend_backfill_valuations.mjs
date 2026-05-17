#!/usr/bin/env node
import { backfillMaValuationRuns } from "../apps/api/src/services/maValuationService.mjs";
import { MA_BACKEND_MODEL_VERSION } from "../modules/ma/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillMaValuationRuns({
  scenarios,
  replace,
  modelVersion: MA_BACKEND_MODEL_VERSION.version,
});

console.log("MA backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
