#!/usr/bin/env node
import { buildBackendManifest } from "./backend_manifest.mjs";

const SOURCE_TASKS = ["fetch-official", "fetch-transcripts", "build-dataset", "build-metrics", "build-qa-pairs"];
const STANDARD_TASKS = ["import-prices", "backfill-valuations", "validate"];

function parseArgs(argv) {
  const args = {
    json: false,
    tickers: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg === "--ticker") args.tickers.push(String(argv[++index] ?? "").trim().toLowerCase());
    else if (arg === "--tickers") {
      args.tickers.push(...String(argv[++index] ?? "").split(",").map((ticker) => ticker.trim().toLowerCase()).filter(Boolean));
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  args.tickers = [...new Set(args.tickers.filter(Boolean))];
  return args;
}

function printHelp() {
  console.log(`Data source audit

Usage:
  node scripts/data_source_audit.mjs
  node scripts/data_source_audit.mjs --tickers ma,aapl,msft
  node scripts/data_source_audit.mjs --json

Notes:
  This script reports source workflow visibility from backend manifest metadata only.
  It does not infer freshness dates unless a future manifest field tracks them.
`);
}

function statusFor(entry, task) {
  return entry.tasks[task]?.available ? "supported" : "not supported";
}

function buildAudit(repoRoot = process.cwd(), tickers = []) {
  const selected = new Set(tickers);
  return buildBackendManifest(repoRoot)
    .filter((entry) => selected.size === 0 || selected.has(entry.ticker))
    .map((entry) => {
      const standardizedWorkflow = Object.fromEntries(STANDARD_TASKS.map((task) => [task, statusFor(entry, task)]));
      const sourceWorkflows = Object.fromEntries(SOURCE_TASKS.map((task) => [task, statusFor(entry, task)]));
      const manualReviewRequired = SOURCE_TASKS.some((task) => !entry.tasks[task]?.available);
      return {
        ticker: entry.ticker,
        database: {
          exists: entry.database.exists,
          sizeBytes: entry.database.sizeBytes,
          freshness: "not tracked",
        },
        standardizedWorkflow,
        sourceWorkflows,
        sourceFreshness: "unknown",
        manualReviewRequired,
      };
    });
}

function printTable(rows) {
  console.log("Data source audit");
  console.log("Freshness is reported as unknown/not tracked unless explicitly present in manifest metadata.");
  console.log([
    "ticker",
    "db",
    "prices",
    "backfill",
    "validate",
    "official",
    "transcripts",
    "dataset",
    "metrics",
    "qa",
    "freshness",
    "manual_review",
  ].join("\t"));
  for (const row of rows) {
    console.log([
      row.ticker,
      row.database.exists ? "yes" : "no",
      row.standardizedWorkflow["import-prices"],
      row.standardizedWorkflow["backfill-valuations"],
      row.standardizedWorkflow.validate,
      row.sourceWorkflows["fetch-official"],
      row.sourceWorkflows["fetch-transcripts"],
      row.sourceWorkflows["build-dataset"],
      row.sourceWorkflows["build-metrics"],
      row.sourceWorkflows["build-qa-pairs"],
      row.sourceFreshness,
      row.manualReviewRequired ? "yes" : "no",
    ].join("\t"));
  }
}

const args = parseArgs(process.argv.slice(2));
const rows = buildAudit(process.cwd(), args.tickers);
if (args.json) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
} else {
  printTable(rows);
}
