#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { defaultIsrgDbPath } from "../apps/api/src/services/isrgSnapshotService.mjs";
import { upsertIsrgDailyPriceBars } from "../modules/isrg/market/importDailyPrices.mjs";

executescript(readFileSync("apps/api/src/db/migrations/001_isrg_schema.sql", "utf8"), defaultIsrgDbPath);
const result = upsertIsrgDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
