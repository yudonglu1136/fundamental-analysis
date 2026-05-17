#!/usr/bin/env node
import { backfillMetaValuationRuns } from "../apps/api/src/services/metaValuationService.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillMetaValuationRuns({
  scenarios,
  replace,
  modelVersion: "meta_v1_backend_pilot",
});

console.log("META backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
