#!/usr/bin/env node
process.argv.push("--ticker", "qcom");
await import("./deep_research_backend_seed.mjs");
