#!/usr/bin/env node
import { seedVBackendDb } from "../modules/v/db/seed.mjs";

const result = await seedVBackendDb();
console.log("V backend seed complete");
console.log(JSON.stringify(result, null, 2));
