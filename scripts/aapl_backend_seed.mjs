#!/usr/bin/env node
import { seedAaplBackendDb } from "../modules/aapl/db/seed.mjs";

const result = await seedAaplBackendDb();
console.log("AAPL backend seed complete");
console.log(JSON.stringify(result, null, 2));
