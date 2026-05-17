#!/usr/bin/env node
import { seedNocBackendDb } from "../modules/noc/db/seed.mjs";

const result = await seedNocBackendDb();
console.log(JSON.stringify(result, null, 2));
