#!/usr/bin/env node
import { backfillRtxValuationRuns } from "../apps/api/src/services/rtxValuationService.mjs";
import { RTX_BACKEND_MODEL_VERSION } from "../modules/rtx/valuation/modelVersion.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillRtxValuationRuns({
  scenarios,
  replace,
  modelVersion: RTX_BACKEND_MODEL_VERSION.version,
});

console.log("RTX backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
