#!/usr/bin/env node
import { upsertNowDailyPriceBars } from "../modules/now/market/importDailyPrices.mjs";

const result = upsertNowDailyPriceBars();
console.log("NOW backend price import complete");
console.log(JSON.stringify(result, null, 2));
