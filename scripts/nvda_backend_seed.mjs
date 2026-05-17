#!/usr/bin/env node
import { seedNvdaBackendDb } from "../modules/nvda/db/seed.mjs";

const result = await seedNvdaBackendDb();
console.log("NVDA backend seed complete");
console.log(JSON.stringify(result, null, 2));
