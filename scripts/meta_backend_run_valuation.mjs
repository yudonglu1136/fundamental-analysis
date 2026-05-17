#!/usr/bin/env node
import { createMetaValuationRun } from "../apps/api/src/services/metaValuationService.mjs";

const scenario = process.argv[2] ?? "Base";
const eventId = process.argv[3];

const result = await createMetaValuationRun({
  eventId,
  scenario,
  modelVersion: "meta_v1_backend_pilot",
});

console.log(JSON.stringify(result, null, 2));
