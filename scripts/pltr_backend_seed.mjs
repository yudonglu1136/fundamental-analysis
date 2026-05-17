#!/usr/bin/env node
import { seedPltrBackendDb } from "../modules/pltr/db/seed.mjs";

const result = await seedPltrBackendDb();
console.log("PLTR backend seed complete");
console.log(JSON.stringify(result, null, 2));
