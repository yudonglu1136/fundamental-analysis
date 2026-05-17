#!/usr/bin/env node
import { backfillGildValuationRuns } from "../apps/api/src/services/gildValuationService.mjs";
import { GILD_BACKEND_MODEL_VERSION } from "../modules/gild/valuation/modelVersion.mjs";

const scenarios = process.argv.includes("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const result = await backfillGildValuationRuns({
  scenarios,
  replace: !process.argv.includes("--append"),
  modelVersion: GILD_BACKEND_MODEL_VERSION.version,
});

console.log("GILD backend valuation backfill complete");
console.log(JSON.stringify({
  createdCount: result.createdCount,
  failedCount: result.failedCount,
  scenarios: result.scenarios,
  failed: result.failed,
}, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
