#!/usr/bin/env node
import { createAmznValuationRun } from "../apps/api/src/services/amznValuationService.mjs";
import { AMZN_BACKEND_MODEL_VERSION } from "../modules/amzn/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createAmznValuationRun({
  eventId,
  scenario,
  modelVersion: AMZN_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
