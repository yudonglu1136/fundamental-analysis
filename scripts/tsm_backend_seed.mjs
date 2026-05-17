#!/usr/bin/env node
import { seedTsmBackendDb } from "../modules/tsm/db/seed.mjs";

const result = await seedTsmBackendDb();
console.log("TSM backend seed complete");
console.log(JSON.stringify(result, null, 2));
