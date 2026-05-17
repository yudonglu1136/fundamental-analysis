#!/usr/bin/env node
import { seedTriBackendDb } from "../modules/tri/db/seed.mjs";

const result = await seedTriBackendDb();
console.log("TRI backend seed complete");
console.log(JSON.stringify(result, null, 2));
