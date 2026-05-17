#!/usr/bin/env node
import { createAaplValuationRun } from "../apps/api/src/services/aaplValuationService.mjs";
import { AAPL_BACKEND_MODEL_VERSION } from "../modules/aapl/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createAaplValuationRun({
  eventId,
  scenario,
  modelVersion: AAPL_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
