#!/usr/bin/env node
import { createMaValuationRun } from "../apps/api/src/services/maValuationService.mjs";
import { MA_BACKEND_MODEL_VERSION } from "../modules/ma/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createMaValuationRun({
  eventId,
  scenario,
  modelVersion: MA_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
