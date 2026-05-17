import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { LEGN_BACKEND_DB_PATH, LEGN_BACKEND_SCHEMA_PATH } from "../modules/legn/db/schema.mjs";
import { upsertLegnDailyPriceBars } from "../modules/legn/market/importDailyPrices.mjs";

executescript(readFileSync(LEGN_BACKEND_SCHEMA_PATH, "utf8"), LEGN_BACKEND_DB_PATH);
const result = upsertLegnDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
