import { seedAznBackendDb } from "../modules/azn/db/seed.mjs";
import { upsertAznDailyPriceBars } from "../modules/azn/market/importDailyPrices.mjs";
import { backfillAznValuationRuns } from "../apps/api/src/services/aznValuationService.mjs";

const scenarioArg = process.argv.find((arg) => arg.startsWith("--scenarios="));
const scenarios = scenarioArg ? scenarioArg.replace("--scenarios=", "").split(",").map((item) => item.trim()).filter(Boolean) : ["Base"];

const seedResult = await seedAznBackendDb();
const priceImportResult = upsertAznDailyPriceBars();
const backfillResult = await backfillAznValuationRuns({ scenarios, replace: true });

console.log(JSON.stringify({
  ...seedResult,
  priceImport: priceImportResult,
  valuationBackfill: {
    scenarios,
    createdCount: backfillResult.createdCount,
    failedCount: backfillResult.failedCount,
  },
}, null, 2));
