#!/usr/bin/env node
import { createDgeValuationRun } from "../apps/api/src/services/dgeValuationService.mjs";
import { DGE_BACKEND_MODEL_VERSION } from "../modules/dge/valuation/modelVersion.mjs";

const args = process.argv.slice(2);
const eventIdArg = args.find((arg) => arg.startsWith("--event="));
const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));

const result = await createDgeValuationRun({
  eventId: eventIdArg ? eventIdArg.split("=")[1] : undefined,
  scenario: scenarioArg ? scenarioArg.split("=")[1] : "Base",
  modelVersion: DGE_BACKEND_MODEL_VERSION.version,
});

console.log("DGE.L backend valuation run complete");
console.log(JSON.stringify(result, null, 2));
