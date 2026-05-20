#!/usr/bin/env node
process.argv.push("--ticker", "eqt");
await import("./deep_research_backend_validation.mjs");
