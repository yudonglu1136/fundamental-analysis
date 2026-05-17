#!/usr/bin/env node
import { seedRtxBackendDb } from "../modules/rtx/db/seed.mjs";

const result = await seedRtxBackendDb();
console.log("RTX backend seed complete");
console.log(JSON.stringify(result, null, 2));
