#!/usr/bin/env node
import { createCegValuationRun } from "../apps/api/src/services/cegValuationService.mjs";

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const result = await createCegValuationRun({
  eventId: arg("event-id"),
  asOfDate: arg("as-of-date"),
  scenario: arg("scenario", "Base"),
});
console.log(JSON.stringify(result, null, 2));
