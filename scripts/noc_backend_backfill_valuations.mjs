#!/usr/bin/env node
import { backfillNocValuationRuns } from "../apps/api/src/services/nocValuationService.mjs";
import { NOC_BACKEND_MODEL_VERSION } from "../modules/noc/valuation/modelVersion.mjs";

const scenarios = process.argv.includes("--all-scenarios") ? ["Bear", "Base", "Bull"] : ["Base"];
const replace = !process.argv.includes("--append");
const result = await backfillNocValuationRuns({
  scenarios,
  modelVersion: NOC_BACKEND_MODEL_VERSION.version,
  replace,
});
console.log(JSON.stringify(result, null, 2));
