#!/usr/bin/env node
import { seedMsftBackendDb } from "../modules/msft/db/seed.mjs";
import { backfillMsftValuationRuns } from "../apps/api/src/services/msftValuationService.mjs";

const result = await seedMsftBackendDb();
console.log("MSFT backend seed complete");
console.log(JSON.stringify(result, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const backfill = await backfillMsftValuationRuns({
    scenarios: ["Base"],
    replace: true,
    modelVersion: "msft_v1_backend_pilot",
  });
  console.log("MSFT backend Base valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) process.exitCode = 1;
}
