import { backfillBaValuationRuns } from "../apps/api/src/services/baValuationService.mjs";
import { BA_BACKEND_MODEL_VERSION } from "../modules/ba/valuation/modelVersion.mjs";

const scenariosArg = process.argv.find((arg) => arg.startsWith("--scenarios="));
const scenarios = scenariosArg ? scenariosArg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean) : ["Base"];

const result = await backfillBaValuationRuns({
  scenarios,
  replace: !process.argv.includes("--append"),
  modelVersion: BA_BACKEND_MODEL_VERSION.version,
});

console.log("BA.L backend valuation backfill complete");
console.log(JSON.stringify({
  createdCount: result.createdCount,
  failedCount: result.failedCount,
  scenarios: result.scenarios,
  modelVersion: result.modelVersion,
}, null, 2));

if (result.failedCount > 0) {
  console.log(JSON.stringify(result.failed, null, 2));
  process.exitCode = 1;
}
