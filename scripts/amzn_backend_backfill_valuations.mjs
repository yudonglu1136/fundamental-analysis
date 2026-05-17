#!/usr/bin/env node
import { backfillAmznValuationRuns } from "../apps/api/src/services/amznValuationService.mjs";
import { AMZN_BACKEND_MODEL_VERSION } from "../modules/amzn/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillAmznValuationRuns({
  scenarios,
  replace,
  modelVersion: AMZN_BACKEND_MODEL_VERSION.version,
});

console.log("AMZN backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
