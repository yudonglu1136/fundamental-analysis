#!/usr/bin/env node
import { createMsftValuationRun } from "../apps/api/src/services/msftValuationService.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createMsftValuationRun({
  eventId,
  scenario,
  modelVersion: "msft_v1_backend_pilot",
});

console.log(JSON.stringify(result, null, 2));
