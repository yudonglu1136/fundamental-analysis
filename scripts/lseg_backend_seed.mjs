import { seedLsegBackendDb } from "../modules/lseg/db/seed.mjs";
import { backfillLsegValuationRuns } from "../apps/api/src/services/lsegValuationService.mjs";

const result = seedLsegBackendDb();
console.log("LSEG backend seed complete");
console.log(JSON.stringify(result, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const backfill = await backfillLsegValuationRuns({
    scenarios: ["Base"],
    replace: true,
    modelVersion: "lseg_v1_backend_pilot",
  });
  console.log("LSEG backend Base valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) {
    process.exitCode = 1;
  }
}
