#!/usr/bin/env node
import { backfillAnetValuationRuns } from "../apps/api/src/services/anetValuationService.mjs";
import { ANET_BACKEND_MODEL_VERSION } from "../modules/anet/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillAnetValuationRuns({
  scenarios,
  replace,
  modelVersion: ANET_BACKEND_MODEL_VERSION.version,
});

console.log("ANET backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
