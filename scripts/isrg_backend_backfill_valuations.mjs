#!/usr/bin/env node
import { backfillIsrgValuationRuns } from "../apps/api/src/services/isrgValuationService.mjs";
import { ISRG_BACKEND_MODEL_VERSION } from "../modules/isrg/valuation/modelVersion.mjs";

const scenarios = process.argv.includes("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const result = await backfillIsrgValuationRuns({
  scenarios,
  replace: !process.argv.includes("--append"),
  modelVersion: ISRG_BACKEND_MODEL_VERSION.version,
});

console.log("ISRG backend valuation backfill complete");
console.log(JSON.stringify({
  createdCount: result.createdCount,
  failedCount: result.failedCount,
  scenarios: result.scenarios,
  failed: result.failed,
}, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
