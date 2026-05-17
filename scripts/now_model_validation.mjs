#!/usr/bin/env node
import { existsSync } from "node:fs";
import { NOW_BACKEND_DB_PATH } from "../modules/now/db/schema.mjs";

console.log("NOW model validation");
console.log(JSON.stringify({
  status: existsSync(NOW_BACKEND_DB_PATH) ? "PASS" : "WARNING",
  dbPath: NOW_BACKEND_DB_PATH,
  note: existsSync(NOW_BACKEND_DB_PATH)
    ? "NOW backend database exists. Use npm run now:backend:validate for full backend validation."
    : "NOW backend database is missing. Run npm run now:backend:seed first.",
}, null, 2));
