#!/usr/bin/env node
import { upsertGooglDailyPriceBars } from "../modules/googl/market/importDailyPrices.mjs";

const result = upsertGooglDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
