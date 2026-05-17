#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { RTX_BACKEND_DB_PATH, RTX_BACKEND_SCHEMA_PATH } from "../modules/rtx/db/schema.mjs";
import { upsertRtxDailyPriceBars } from "../modules/rtx/market/importDailyPrices.mjs";

executescript(readFileSync(RTX_BACKEND_SCHEMA_PATH, "utf8"), RTX_BACKEND_DB_PATH);
const force = process.argv.includes("--force");
const result = await upsertRtxDailyPriceBars({ force });
console.log(JSON.stringify(result, null, 2));
