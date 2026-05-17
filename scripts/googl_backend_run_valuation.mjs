#!/usr/bin/env node
import { createGooglValuationRun } from "../apps/api/src/services/googlValuationService.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createGooglValuationRun({
  eventId,
  scenario,
  modelVersion: "googl_v1_backend_pilot",
});

console.log(JSON.stringify(result, null, 2));
