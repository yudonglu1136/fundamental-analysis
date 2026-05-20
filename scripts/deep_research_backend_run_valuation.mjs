#!/usr/bin/env node
import { deepResearchStockBackendRegistry } from "../apps/api/src/services/deepResearchBackendService.mjs";

function parseArgs(argv) {
  const args = { ticker: null, scenario: "Base", eventId: undefined, asOfDate: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ticker") args.ticker = String(argv[++index] ?? "").toLowerCase();
    else if (arg === "--scenario") args.scenario = argv[++index];
    else if (arg === "--event-id") args.eventId = argv[++index];
    else if (arg === "--as-of-date") args.asOfDate = argv[++index];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.ticker) throw new Error("Provide --ticker <slug>.");
const backend = deepResearchStockBackendRegistry[args.ticker];
if (!backend) throw new Error(`No deep research backend registered for ${args.ticker}`);
const result = await backend.createValuationRun({
  scenario: args.scenario,
  eventId: args.eventId,
  asOfDate: args.asOfDate,
});
console.log(JSON.stringify(result, null, 2));
