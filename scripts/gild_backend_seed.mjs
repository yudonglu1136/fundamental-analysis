#!/usr/bin/env node
import { seedGildBackendDb } from "../modules/gild/db/seed.mjs";
import { backfillGildValuationRuns } from "../apps/api/src/services/gildValuationService.mjs";
import { GILD_BACKEND_MODEL_VERSION } from "../modules/gild/valuation/modelVersion.mjs";

const result = await seedGildBackendDb();
console.log("GILD backend seed complete");
console.log(JSON.stringify(result, null, 2));

if (!process.argv.includes("--no-valuations")) {
  const scenarios = process.argv.includes("--base-only") ? ["Base"] : ["Bear", "Base", "Bull"];
  const backfill = await backfillGildValuationRuns({
    scenarios,
    replace: true,
    modelVersion: GILD_BACKEND_MODEL_VERSION.version,
  });
  console.log("GILD backend valuation backfill complete");
  console.log(JSON.stringify({
    createdCount: backfill.createdCount,
    failedCount: backfill.failedCount,
    scenarios: backfill.scenarios,
  }, null, 2));
  if (backfill.failedCount > 0) process.exitCode = 1;
}
