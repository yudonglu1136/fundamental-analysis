#!/usr/bin/env node
import { backfillGooglValuationRuns } from "../apps/api/src/services/googlValuationService.mjs";

const args = new Set(process.argv.slice(2));
const scenarios = args.has("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
const replace = !args.has("--append");

const result = await backfillGooglValuationRuns({
  scenarios,
  replace,
  modelVersion: "googl_v1_backend_pilot",
});

console.log("GOOGL backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) process.exitCode = 1;
