#!/usr/bin/env node
import { seedIsrgBackendDb } from "../modules/isrg/db/seed.mjs";
import { upsertIsrgDailyPriceBars } from "../modules/isrg/market/importDailyPrices.mjs";
import { backfillIsrgValuationRuns } from "../apps/api/src/services/isrgValuationService.mjs";

const result = seedIsrgBackendDb();
console.log("ISRG backend seed complete");
console.log(JSON.stringify(result, null, 2));

const priceImport = upsertIsrgDailyPriceBars();
console.log("ISRG daily price import complete");
console.log(JSON.stringify(priceImport, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const backfill = await backfillIsrgValuationRuns({
    scenarios: ["Bear", "Base", "Bull"],
    replace: true,
    modelVersion: "isrg_v1_backend_pilot",
  });
  console.log("ISRG backend valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) process.exitCode = 1;
}
