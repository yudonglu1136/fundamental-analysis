#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  BACKEND_TASKS,
  buildBackendManifest,
  discoverBackendTickers,
  normalizeTicker,
  resolveTaskScript,
} from "./backend_manifest.mjs";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const args = {
    all: false,
    continueOnError: false,
    dryRun: false,
    list: false,
    task: null,
    tickers: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") args.all = true;
    else if (arg === "--continue-on-error") args.continueOnError = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--task") args.task = argv[++index];
    else if (arg === "--ticker") args.tickers.push(normalizeTicker(argv[++index]));
    else if (arg === "--tickers") args.tickers.push(...String(argv[++index] ?? "").split(",").map(normalizeTicker));
    else if (arg === "--help" || arg === "-h") {
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
  console.log(`Backend runner

Usage:
  node scripts/backend_runner.mjs --list
  node scripts/backend_runner.mjs --task validate --ticker ma
  node scripts/backend_runner.mjs --task validate --tickers v,now,anet,ma
  node scripts/backend_runner.mjs --task validate --all --continue-on-error
  node scripts/backend_runner.mjs --task import-prices --ticker ma --dry-run

Tasks:
${Object.entries(BACKEND_TASKS).map(([task, meta]) => `  ${task.padEnd(20)} ${meta.writesData ? "writes" : "read-only"}  ${meta.description}`).join("\n")}
`);
}

function printManifest() {
  const manifest = buildBackendManifest(repoRoot);
  console.log("Backend capability manifest");
  console.log(`Tickers with local backend DBs: ${manifest.length}`);
  console.log(["ticker", "db", ...Object.keys(BACKEND_TASKS)].join("\t"));
  for (const entry of manifest) {
    console.log([
      entry.ticker,
      entry.database.exists ? "yes" : "no",
      ...Object.keys(BACKEND_TASKS).map((task) => (entry.tasks[task]?.available ? "yes" : "-")),
    ].join("\t"));
  }
}

function resolveTickers(args) {
  if (args.all) return discoverBackendTickers(repoRoot);
  if (args.tickers.length > 0) return args.tickers;
  throw new Error("Provide --ticker <ticker>, --tickers <a,b>, --all, or --list.");
}

function runTask(ticker, task, { dryRun }) {
  const scriptPath = resolveTaskScript(ticker, task, repoRoot);
  if (!scriptPath) {
    return {
      ticker,
      task,
      status: "SKIP",
      detail: `No script for ${ticker}:${task}`,
    };
  }

  const relativeScript = path.relative(repoRoot, scriptPath);
  if (dryRun) {
    return {
      ticker,
      task,
      status: "DRY_RUN",
      detail: `node ${relativeScript}`,
    };
  }

  console.log(`\n[${ticker}] ${task}: node ${relativeScript}`);
  const result = spawnSync("node", [relativeScript], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 180 * 1024 * 1024,
    stdio: "inherit",
  });
  return {
    ticker,
    task,
    status: result.status === 0 ? "PASS" : "FAIL",
    detail: `exit=${result.status}`,
  };
}

function printSummary(results) {
  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  console.log("\nBackend runner summary");
  for (const result of results) {
    console.log(`${result.status}: ${result.ticker}:${result.task} - ${result.detail}`);
  }
  console.log(`Totals: ${JSON.stringify(counts)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    printManifest();
    return;
  }
  if (!args.task || !BACKEND_TASKS[args.task]) {
    throw new Error(`Provide --task with one of: ${Object.keys(BACKEND_TASKS).join(", ")}`);
  }

  const tickers = resolveTickers(args);
  const results = [];
  for (const ticker of tickers) {
    const result = runTask(ticker, args.task, args);
    results.push(result);
    if (result.status === "FAIL" && !args.continueOnError) break;
  }
  printSummary(results);
  if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
