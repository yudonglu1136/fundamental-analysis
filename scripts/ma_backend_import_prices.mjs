#!/usr/bin/env node
import { upsertMaDailyPriceBars } from "../modules/ma/market/importDailyPrices.mjs";

const result = upsertMaDailyPriceBars();
console.log("MA backend price import complete");
console.log(JSON.stringify(result, null, 2));
