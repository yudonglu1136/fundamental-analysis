#!/usr/bin/env node
import { createNvdaValuationRun } from "../apps/api/src/services/nvdaValuationService.mjs";
import { NVDA_BACKEND_MODEL_VERSION } from "../modules/nvda/valuation/modelVersion.mjs";

const eventArg = process.argv.find((arg) => arg.startsWith("--eventId="));
const scenarioArg = process.argv.find((arg) => arg.startsWith("--scenario="));
const asOfArg = process.argv.find((arg) => arg.startsWith("--asOfDate="));

const result = await createNvdaValuationRun({
  eventId: eventArg?.replace("--eventId=", ""),
  asOfDate: asOfArg?.replace("--asOfDate=", ""),
  scenario: scenarioArg?.replace("--scenario=", "") || "Base",
  modelVersion: NVDA_BACKEND_MODEL_VERSION.version,
});

console.log("NVDA backend valuation run complete");
console.log(JSON.stringify({
  id: result.id,
  valuationRun: result.valuationRun,
}, null, 2));
