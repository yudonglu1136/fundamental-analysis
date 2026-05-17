#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { TRI_BACKEND_DB_PATH, TRI_BACKEND_SCHEMA_PATH } from "../modules/tri/db/schema.mjs";
import { upsertTriDailyPriceBars } from "../modules/tri/market/importDailyPrices.mjs";

executescript(readFileSync(TRI_BACKEND_SCHEMA_PATH, "utf8"), TRI_BACKEND_DB_PATH);
const result = upsertTriDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
