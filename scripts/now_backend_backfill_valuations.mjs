#!/usr/bin/env node
import { backfillNowValuationRuns } from "../apps/api/src/services/nowValuationService.mjs";
import { NOW_BACKEND_MODEL_VERSION } from "../modules/now/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillNowValuationRuns({
  scenarios,
  replace,
  modelVersion: NOW_BACKEND_MODEL_VERSION.version,
});

console.log("NOW backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
