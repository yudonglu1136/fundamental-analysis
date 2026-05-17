import { upsertAznDailyPriceBars } from "../modules/azn/market/importDailyPrices.mjs";

const result = upsertAznDailyPriceBars();
console.log(JSON.stringify(result, null, 2));

if (result.imported.some((row) => row.rowCount < 2)) {
  process.exitCode = 1;
}
