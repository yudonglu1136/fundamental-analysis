#!/usr/bin/env node
import { createVValuationRun } from "../apps/api/src/services/vValuationService.mjs";
import { V_BACKEND_MODEL_VERSION } from "../modules/v/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createVValuationRun({
  eventId,
  scenario,
  modelVersion: V_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
