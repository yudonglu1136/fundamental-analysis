#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { AMZN_BACKEND_DB_PATH, AMZN_BACKEND_SCHEMA_PATH } from "../modules/amzn/db/schema.mjs";
import { upsertAmznDailyPriceBars } from "../modules/amzn/market/importDailyPrices.mjs";

executescript(readFileSync(AMZN_BACKEND_SCHEMA_PATH, "utf8"), AMZN_BACKEND_DB_PATH);
const result = await upsertAmznDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
