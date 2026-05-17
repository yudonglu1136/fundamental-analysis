#!/usr/bin/env node
import { existsSync } from "node:fs";
import { V_BACKEND_DB_PATH } from "../modules/v/db/schema.mjs";

console.log("V model validation");
console.log(JSON.stringify({
  status: existsSync(V_BACKEND_DB_PATH) ? "PASS" : "WARNING",
  dbPath: V_BACKEND_DB_PATH,
  note: existsSync(V_BACKEND_DB_PATH)
    ? "V backend database exists. Use npm run v:backend:validate for full backend validation."
    : "V backend database is missing. Run npm run v:backend:seed first.",
}, null, 2));
