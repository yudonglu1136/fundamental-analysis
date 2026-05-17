#!/usr/bin/env node
import { seedMaBackendDb } from "../modules/ma/db/seed.mjs";

const result = await seedMaBackendDb();
console.log("MA backend seed complete");
console.log(JSON.stringify(result, null, 2));
