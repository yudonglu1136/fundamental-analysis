#!/usr/bin/env node
import { seedNowBackendDb } from "../modules/now/db/seed.mjs";

const result = await seedNowBackendDb();
console.log("NOW backend seed complete");
console.log(JSON.stringify(result, null, 2));
