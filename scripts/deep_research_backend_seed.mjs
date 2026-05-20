#!/usr/bin/env node
import { DEEP_RESEARCH_BACKEND_SLUGS } from "../modules/deepResearchBackend/config.mjs";
import { seedDeepResearchBackendDb } from "../modules/deepResearchBackend/db/seed.mjs";

function parseTickers(argv) {
  const tickers = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--ticker") tickers.push(argv[++index]);
    else if (argv[index] === "--tickers") tickers.push(...String(argv[++index] ?? "").split(","));
  }
  return tickers.map((ticker) => ticker.trim().toLowerCase()).filter(Boolean);
}

const tickers = parseTickers(process.argv.slice(2));
const selected = tickers.length ? tickers : DEEP_RESEARCH_BACKEND_SLUGS;

for (const ticker of selected) {
  const result = await seedDeepResearchBackendDb(ticker);
  console.log(JSON.stringify({ ticker, ...result }, null, 2));
}
