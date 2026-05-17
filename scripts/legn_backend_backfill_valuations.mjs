import { backfillLegnValuationRuns } from "../apps/api/src/services/legnValuationService.mjs";

const scenariosArg = process.argv.find((arg) => arg.startsWith("--scenarios="));
const scenarios = scenariosArg
  ? scenariosArg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean)
  : ["Bear", "Base", "Bull"];

const replace = !process.argv.includes("--append");
const result = await backfillLegnValuationRuns({ scenarios, replace });
console.log("LEGN backend valuation backfill complete");
console.log(JSON.stringify(result, null, 2));
