#!/usr/bin/env node
import { upsertAnetDailyPriceBars } from "../modules/anet/market/importDailyPrices.mjs";

const result = upsertAnetDailyPriceBars();
console.log("ANET backend price import complete");
console.log(JSON.stringify(result, null, 2));
