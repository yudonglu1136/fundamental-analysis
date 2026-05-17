#!/usr/bin/env node
import { createAnetValuationRun } from "../apps/api/src/services/anetValuationService.mjs";
import { ANET_BACKEND_MODEL_VERSION } from "../modules/anet/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createAnetValuationRun({
  eventId,
  scenario,
  modelVersion: ANET_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
