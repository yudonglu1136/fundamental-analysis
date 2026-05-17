#!/usr/bin/env node
import { seedMckBackendDb } from "../modules/mck/db/seed.mjs";
import { backfillMckValuationRuns } from "../apps/api/src/services/mckValuationService.mjs";
import { MCK_BACKEND_MODEL_VERSION } from "../modules/mck/valuation/modelVersion.mjs";
import { upsertMckDailyPriceBars } from "../modules/mck/market/importDailyPrices.mjs";

const result = await seedMckBackendDb();
console.log("MCK backend seed complete");
console.log(JSON.stringify(result, null, 2));

const prices = upsertMckDailyPriceBars({ tickers: ["MCK", "SPY"] });
console.log("MCK backend daily price import complete");
console.log(JSON.stringify({
  imported: prices.imported,
  counts: prices.counts,
  warnings: prices.warnings,
}, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const scenarios = process.argv.includes("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
  const backfill = await backfillMckValuationRuns({
    scenarios,
    replace: true,
    modelVersion: MCK_BACKEND_MODEL_VERSION.version,
  });
  console.log("MCK backend valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) process.exitCode = 1;
}
