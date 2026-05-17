#!/usr/bin/env node
import { upsertLsegDailyPriceBars } from "../modules/lseg/market/importDailyPrices.mjs";

const result = upsertLsegDailyPriceBars();

console.log("LSEG daily price import complete");
console.log(JSON.stringify(result, null, 2));

if (result.imported.some((row) => row.rowCount === 0)) {
  process.exitCode = 1;
}
