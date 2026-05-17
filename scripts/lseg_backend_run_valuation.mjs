#!/usr/bin/env node
import { createLsegValuationRun } from "../apps/api/src/services/lsegValuationService.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createLsegValuationRun({
  eventId,
  scenario,
  modelVersion: "lseg_v1_backend_pilot",
});

console.log(JSON.stringify(result, null, 2));
