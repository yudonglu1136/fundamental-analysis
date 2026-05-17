#!/usr/bin/env node
import { existsSync } from "node:fs";
import { MA_BACKEND_DB_PATH } from "../modules/ma/db/schema.mjs";

console.log("MA model validation");
console.log(JSON.stringify({
  status: existsSync(MA_BACKEND_DB_PATH) ? "PASS" : "WARNING",
  dbPath: MA_BACKEND_DB_PATH,
  note: existsSync(MA_BACKEND_DB_PATH)
    ? "MA backend database exists. Use npm run ma:backend:validate for full backend validation."
    : "MA backend database is missing. Run npm run ma:backend:seed first.",
}, null, 2));
