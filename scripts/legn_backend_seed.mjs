import { seedLegnBackendDb } from "../modules/legn/db/seed.mjs";

const result = await seedLegnBackendDb();
console.log("LEGN backend seed complete");
console.log(JSON.stringify(result, null, 2));
