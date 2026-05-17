#!/usr/bin/env node
import { backfillNvdaValuationRuns } from "../apps/api/src/services/nvdaValuationService.mjs";
import { NVDA_BACKEND_MODEL_VERSION } from "../modules/nvda/valuation/modelVersion.mjs";

const scenariosArg = process.argv.find((arg) => arg.startsWith("--scenarios="));
const scenarios = scenariosArg ? scenariosArg.replace("--scenarios=", "").split(",").map((item) => item.trim()).filter(Boolean) : ["Bear", "Base", "Bull"];
const result = await backfillNvdaValuationRuns({
  scenarios,
  replace: !process.argv.includes("--append"),
  modelVersion: NVDA_BACKEND_MODEL_VERSION.version,
});
console.log("NVDA backend valuation backfill complete");
console.log(JSON.stringify({
  createdCount: result.createdCount,
  failedCount: result.failedCount,
  scenarios: result.scenarios,
  failed: result.failed,
}, null, 2));
if (result.failedCount > 0) process.exitCode = 1;
