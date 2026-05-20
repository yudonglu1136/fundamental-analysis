#!/usr/bin/env node
process.argv.push("--ticker", "bac");
await import("./deep_research_backend_seed.mjs");
