#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { AAPL_BACKEND_DB_PATH, AAPL_BACKEND_SCHEMA_PATH } from "../modules/aapl/db/schema.mjs";
import { upsertAaplDailyPriceBars } from "../modules/aapl/market/importDailyPrices.mjs";

executescript(readFileSync(AAPL_BACKEND_SCHEMA_PATH, "utf8"), AAPL_BACKEND_DB_PATH);
const result = upsertAaplDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
