#!/usr/bin/env node
import { DEEP_RESEARCH_BACKEND_SLUGS } from "../modules/deepResearchBackend/config.mjs";
import { deepResearchStockBackendRegistry } from "../apps/api/src/services/deepResearchBackendService.mjs";

function parseArgs(argv) {
  const args = { tickers: [], scenarios: ["Base"], replace: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ticker") args.tickers.push(argv[++index]);
    else if (arg === "--tickers") args.tickers.push(...String(argv[++index] ?? "").split(","));
    else if (arg === "--scenarios") args.scenarios = String(argv[++index] ?? "Base").split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--append") args.replace = false;
  }
  args.tickers = args.tickers.map((ticker) => ticker.trim().toLowerCase()).filter(Boolean);
  return args;
}

const args = parseArgs(process.argv.slice(2));
const selected = args.tickers.length ? args.tickers : DEEP_RESEARCH_BACKEND_SLUGS;

for (const ticker of selected) {
  const backend = deepResearchStockBackendRegistry[ticker];
  if (!backend) throw new Error(`No deep research backend registered for ${ticker}`);
  const result = await backend.backfillValuationRuns({ scenarios: args.scenarios, replace: args.replace });
  console.log(JSON.stringify(result, null, 2));
}
