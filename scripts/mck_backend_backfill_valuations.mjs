#!/usr/bin/env node
import { backfillMckValuationRuns } from "../apps/api/src/services/mckValuationService.mjs";
import { MCK_BACKEND_MODEL_VERSION } from "../modules/mck/valuation/modelVersion.mjs";

const scenarios = process.argv.includes("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const result = await backfillMckValuationRuns({
  scenarios,
  replace: !process.argv.includes("--append"),
  modelVersion: MCK_BACKEND_MODEL_VERSION.version,
});

console.log("MCK backend valuation backfill complete");
console.log(JSON.stringify({
  createdCount: result.createdCount,
  failedCount: result.failedCount,
  scenarios: result.scenarios,
  failed: result.failed,
}, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
