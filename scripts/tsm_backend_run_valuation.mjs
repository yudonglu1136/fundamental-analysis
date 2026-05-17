#!/usr/bin/env node
import { createTsmValuationRun } from "../apps/api/src/services/tsmValuationService.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    return [key, valueParts.join("=") || true];
  }),
);

const result = await createTsmValuationRun({
  eventId: args.get("eventId") || undefined,
  asOfDate: args.get("asOfDate") || undefined,
  scenario: args.get("scenario") || "Base",
});

console.log("TSM backend valuation run complete");
console.log(JSON.stringify(result, null, 2));
