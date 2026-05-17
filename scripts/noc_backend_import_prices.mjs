#!/usr/bin/env node
import { upsertNocDailyPriceBars } from "../modules/noc/market/importDailyPrices.mjs";

const force = process.argv.includes("--force");
const result = await upsertNocDailyPriceBars({ force });
console.log(JSON.stringify(result, null, 2));
