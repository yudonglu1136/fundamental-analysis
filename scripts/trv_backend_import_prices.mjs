#!/usr/bin/env node
process.argv.push("--ticker", "trv");
await import("./deep_research_backend_import_prices.mjs");
