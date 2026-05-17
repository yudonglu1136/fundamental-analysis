#!/usr/bin/env node
import { seedGooglBackendDb } from "../modules/googl/db/seed.mjs";
import { backfillGooglValuationRuns } from "../apps/api/src/services/googlValuationService.mjs";

const result = await seedGooglBackendDb();
console.log("GOOGL backend seed complete");
console.log(JSON.stringify(result, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const backfill = await backfillGooglValuationRuns({
    scenarios: ["Base"],
    replace: true,
    modelVersion: "googl_v1_backend_pilot",
  });
  console.log("GOOGL backend Base valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) process.exitCode = 1;
}
