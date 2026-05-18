#!/usr/bin/env node
import { seedCegBackendDb } from "../modules/ceg/db/seed.mjs";

const result = await seedCegBackendDb();
console.log(JSON.stringify(result, null, 2));
