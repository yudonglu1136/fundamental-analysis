#!/usr/bin/env node
import { upsertCegDailyPriceBars } from "../modules/ceg/market/importDailyPrices.mjs";

const result = upsertCegDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
