#!/usr/bin/env node
import { seedAnetBackendDb } from "../modules/anet/db/seed.mjs";

const result = await seedAnetBackendDb();
console.log("ANET backend seed complete");
console.log(JSON.stringify(result, null, 2));
