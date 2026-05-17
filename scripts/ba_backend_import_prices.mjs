import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { BA_BACKEND_DB_PATH, BA_BACKEND_SCHEMA_PATH } from "../modules/ba/db/schema.mjs";
import { upsertBaDailyPriceBars } from "../modules/ba/market/importDailyPrices.mjs";

executescript(readFileSync(BA_BACKEND_SCHEMA_PATH, "utf8"), BA_BACKEND_DB_PATH);
const result = upsertBaDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
