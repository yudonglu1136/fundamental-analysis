#!/usr/bin/env node
import { createBmyValuationRun } from "../apps/api/src/services/bmyValuationService.mjs";
import { BMY_BACKEND_MODEL_VERSION } from "../modules/bmy/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createBmyValuationRun({
  eventId,
  scenario,
  modelVersion: BMY_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
