#!/usr/bin/env node
import { seedBmyBackendDb } from "../modules/bmy/db/seed.mjs";

const result = await seedBmyBackendDb();
console.log("BMY backend seed complete");
console.log(JSON.stringify(result, null, 2));
