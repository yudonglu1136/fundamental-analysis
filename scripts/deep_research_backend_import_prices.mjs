#!/usr/bin/env node
import { DEEP_RESEARCH_BACKEND_SLUGS } from "../modules/deepResearchBackend/config.mjs";
import { importDeepResearchDailyPrices } from "../modules/deepResearchBackend/market/importDailyPrices.mjs";

function parseArgs(argv) {
  const args = { tickers: [], startDate: undefined, endDate: undefined, noProxyFallback: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ticker") args.tickers.push(argv[++index]);
    else if (arg === "--tickers") args.tickers.push(...String(argv[++index] ?? "").split(","));
    else if (arg === "--start-date") args.startDate = argv[++index];
    else if (arg === "--end-date") args.endDate = argv[++index];
    else if (arg === "--no-proxy-fallback") args.noProxyFallback = true;
  }
  args.tickers = args.tickers.map((ticker) => ticker.trim().toLowerCase()).filter(Boolean);
  return args;
}

const args = parseArgs(process.argv.slice(2));
const selected = args.tickers.length ? args.tickers : DEEP_RESEARCH_BACKEND_SLUGS;

for (const ticker of selected) {
  const result = await importDeepResearchDailyPrices(ticker, {
    startDate: args.startDate,
    endDate: args.endDate,
    allowProxyFallback: !args.noProxyFallback,
  });
  console.log(JSON.stringify({ ticker, ...result }, null, 2));
}
