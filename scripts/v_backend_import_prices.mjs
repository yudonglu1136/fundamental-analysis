#!/usr/bin/env node
import { upsertVDailyPriceBars } from "../modules/v/market/importDailyPrices.mjs";

const result = upsertVDailyPriceBars();
console.log("V backend price import complete");
console.log(JSON.stringify(result, null, 2));
