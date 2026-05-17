#!/usr/bin/env node
import { createRtxValuationRun } from "../apps/api/src/services/rtxValuationService.mjs";
import { RTX_BACKEND_MODEL_VERSION } from "../modules/rtx/valuation/modelVersion.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createRtxValuationRun({
  eventId,
  scenario,
  modelVersion: RTX_BACKEND_MODEL_VERSION.version,
});

console.log(JSON.stringify(result, null, 2));
