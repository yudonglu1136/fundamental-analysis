#!/usr/bin/env node
import { createNocValuationRun } from "../apps/api/src/services/nocValuationService.mjs";
import { NOC_BACKEND_MODEL_VERSION } from "../modules/noc/valuation/modelVersion.mjs";

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const result = await createNocValuationRun({
  eventId: argValue("eventId") ?? undefined,
  asOfDate: argValue("asOfDate") ?? undefined,
  scenario: argValue("scenario") ?? "Base",
  modelVersion: argValue("modelVersion") ?? NOC_BACKEND_MODEL_VERSION.version,
});
console.log(JSON.stringify(result, null, 2));
