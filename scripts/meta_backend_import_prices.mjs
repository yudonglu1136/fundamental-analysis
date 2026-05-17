#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { META_BACKEND_DB_PATH, META_BACKEND_SCHEMA_PATH } from "../modules/meta/db/schema.mjs";
import { upsertMetaDailyPriceBars } from "../modules/meta/market/importDailyPrices.mjs";

executescript(readFileSync(META_BACKEND_SCHEMA_PATH, "utf8"), META_BACKEND_DB_PATH);
const result = await upsertMetaDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
