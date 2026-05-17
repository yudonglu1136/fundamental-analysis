#!/usr/bin/env node
import { importTsmDailyPrices } from "../modules/tsm/market/importDailyPrices.mjs";

const result = await importTsmDailyPrices();
console.log("TSM backend price import complete");
console.log(JSON.stringify(result, null, 2));
