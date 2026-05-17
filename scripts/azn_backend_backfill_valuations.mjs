import { backfillAznValuationRuns } from "../apps/api/src/services/aznValuationService.mjs";
import { AZN_BACKEND_MODEL_VERSION } from "../modules/azn/valuation/modelVersion.mjs";

const scenarioArg = process.argv.find((arg) => arg.startsWith("--scenarios="));
const modelVersionArg = process.argv.find((arg) => arg.startsWith("--modelVersion="));
const scenarios = scenarioArg
  ? scenarioArg.replace("--scenarios=", "").split(",").map((item) => item.trim()).filter(Boolean)
  : ["Base"];
const modelVersion = modelVersionArg?.replace("--modelVersion=", "") || AZN_BACKEND_MODEL_VERSION.version;

const result = await backfillAznValuationRuns({ scenarios, modelVersion, replace: true });
console.log(JSON.stringify(result, null, 2));

if (result.failedCount > 0) {
  process.exitCode = 1;
}
