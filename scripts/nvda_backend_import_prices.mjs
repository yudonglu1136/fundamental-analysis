#!/usr/bin/env node
import { upsertNvdaDailyPriceBars } from "../modules/nvda/market/importDailyPrices.mjs";

const result = await upsertNvdaDailyPriceBars();
console.log("NVDA backend price import complete");
console.log(JSON.stringify(result, null, 2));
