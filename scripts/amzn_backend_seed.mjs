#!/usr/bin/env node
import { seedAmznBackendDb } from "../modules/amzn/db/seed.mjs";

const result = await seedAmznBackendDb();
console.log("AMZN backend seed complete");
console.log(JSON.stringify(result, null, 2));
