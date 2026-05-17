#!/usr/bin/env node
import { upsertDgeDailyPriceBars } from "../modules/dge/market/importDailyPrices.mjs";

const result = await upsertDgeDailyPriceBars();

console.log("DGE.L backend daily price import complete");
console.log(JSON.stringify(result, null, 2));
