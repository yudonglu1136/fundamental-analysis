#!/usr/bin/env node
import { createTriValuationRun } from "../apps/api/src/services/triValuationService.mjs";
import { closeTriBackendValuationAdapter } from "../modules/tri/valuation/adapter.mjs";
import { TRI_BACKEND_MODEL_VERSION } from "../modules/tri/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

let result;
try {
  result = await createTriValuationRun({
    eventId,
    scenario,
    modelVersion: TRI_BACKEND_MODEL_VERSION.version,
  });
} finally {
  await closeTriBackendValuationAdapter();
}

console.log(JSON.stringify(result, null, 2));
