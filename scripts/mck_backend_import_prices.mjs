#!/usr/bin/env node
import { upsertMckDailyPriceBars } from "../modules/mck/market/importDailyPrices.mjs";

const result = upsertMckDailyPriceBars({ tickers: ["MCK", "SPY"] });
console.log("MCK backend daily price import complete");
console.log(JSON.stringify(result, null, 2));
