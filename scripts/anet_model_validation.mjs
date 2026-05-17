#!/usr/bin/env node
import { existsSync } from "node:fs";
import { ANET_BACKEND_DB_PATH } from "../modules/anet/db/schema.mjs";

console.log("ANET model validation");
console.log(JSON.stringify({
  status: existsSync(ANET_BACKEND_DB_PATH) ? "PASS" : "WARNING",
  dbPath: ANET_BACKEND_DB_PATH,
  note: existsSync(ANET_BACKEND_DB_PATH)
    ? "ANET backend database exists. Use npm run anet:backend:validate for full backend validation."
    : "ANET backend database is missing. Run npm run anet:backend:seed first.",
}, null, 2));
