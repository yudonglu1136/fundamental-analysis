import { seedBaBackendDb } from "../modules/ba/db/seed.mjs";
import { backfillBaValuationRuns } from "../apps/api/src/services/baValuationService.mjs";
import { BA_BACKEND_MODEL_VERSION } from "../modules/ba/valuation/modelVersion.mjs";
import { upsertBaDailyPriceBars } from "../modules/ba/market/importDailyPrices.mjs";

const result = seedBaBackendDb();
console.log("BA.L backend seed complete");
console.log(JSON.stringify(result, null, 2));

const priceImport = upsertBaDailyPriceBars();
console.log("BA.L daily price import complete");
console.log(JSON.stringify(priceImport, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const backfill = await backfillBaValuationRuns({
    scenarios: ["Base"],
    replace: true,
    modelVersion: BA_BACKEND_MODEL_VERSION.version,
  });
  console.log("BA.L backend Base valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) {
    console.log(JSON.stringify(backfill.failed, null, 2));
    process.exitCode = 1;
  }
}
