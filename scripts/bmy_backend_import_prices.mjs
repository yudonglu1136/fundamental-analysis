#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { BMY_BACKEND_DB_PATH, BMY_BACKEND_SCHEMA_PATH } from "../modules/bmy/db/schema.mjs";
import { upsertBmyDailyPriceBars } from "../modules/bmy/market/importDailyPrices.mjs";

executescript(readFileSync(BMY_BACKEND_SCHEMA_PATH, "utf8"), BMY_BACKEND_DB_PATH);
const result = upsertBmyDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
