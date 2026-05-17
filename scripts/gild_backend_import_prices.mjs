#!/usr/bin/env node
import { upsertGildDailyPriceBars } from "../modules/gild/market/importDailyPrices.mjs";

const result = upsertGildDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
