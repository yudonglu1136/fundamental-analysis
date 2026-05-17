#!/usr/bin/env node
import { seedMetaBackendDb } from "../modules/meta/db/seed.mjs";
import { backfillMetaValuationRuns } from "../apps/api/src/services/metaValuationService.mjs";

const result = await seedMetaBackendDb();
console.log("META backend seed complete");
console.log(JSON.stringify(result, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const backfill = await backfillMetaValuationRuns({
    scenarios: ["Base"],
    replace: true,
    modelVersion: "meta_v1_backend_pilot",
  });
  console.log("META backend Base valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) process.exitCode = 1;
}
