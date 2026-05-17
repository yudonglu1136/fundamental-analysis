import { readFileSync } from "node:fs";
import { executescript } from "../apps/api/src/db/client.mjs";
import { MSFT_BACKEND_DB_PATH, MSFT_BACKEND_SCHEMA_PATH } from "../modules/msft/db/schema.mjs";
import { upsertMsftDailyPriceBars } from "../modules/msft/market/importDailyPrices.mjs";

executescript(readFileSync(MSFT_BACKEND_SCHEMA_PATH, "utf8"), MSFT_BACKEND_DB_PATH);
const result = upsertMsftDailyPriceBars();
console.log(JSON.stringify(result, null, 2));
