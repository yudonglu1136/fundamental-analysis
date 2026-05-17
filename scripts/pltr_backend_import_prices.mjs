#!/usr/bin/env node
import { importPltrDailyPrices } from "../modules/pltr/market/importDailyPrices.mjs";

const result = await importPltrDailyPrices();
console.log("PLTR backend price import complete");
console.log(JSON.stringify(result, null, 2));
