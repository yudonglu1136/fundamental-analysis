#!/usr/bin/env node
import { refreshPortfolioMarketData } from "../apps/api/src/services/portfolioService.mjs";

const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

const options = {
  prices: args.includes("--prices") || (!args.includes("--prices") && !args.includes("--dividends")),
  dividends: args.includes("--dividends") || (!args.includes("--prices") && !args.includes("--dividends")),
  force: args.includes("--force"),
  limit: argValue("--limit") == null ? undefined : Number(argValue("--limit")),
  symbols: argValue("--symbols") ?? argValue("--symbol") ?? undefined,
};

try {
  const result = await refreshPortfolioMarketData(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
