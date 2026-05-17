#!/usr/bin/env node
import { createNowValuationRun } from "../apps/api/src/services/nowValuationService.mjs";
import { NOW_BACKEND_MODEL_VERSION } from "../modules/now/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createNowValuationRun({
  eventId,
  scenario,
  modelVersion: NOW_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
