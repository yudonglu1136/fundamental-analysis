#!/usr/bin/env node
import { seedDgeBackendDb } from "../modules/dge/db/seed.mjs";

const result = await seedDgeBackendDb();

console.log("DGE.L backend seed complete");
console.log(JSON.stringify(result, null, 2));
