#!/usr/bin/env node
import { backfillDgeValuationRuns } from "../apps/api/src/services/dgeValuationService.mjs";
import { DGE_BACKEND_MODEL_VERSION } from "../modules/dge/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--all-scenarios") ? ["Bear", "Base", "Bull"] : ["Base"];
const replace = !args.has("--append");

const result = await backfillDgeValuationRuns({
  scenarios,
  replace,
  modelVersion: DGE_BACKEND_MODEL_VERSION.version,
});

console.log("DGE.L backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
