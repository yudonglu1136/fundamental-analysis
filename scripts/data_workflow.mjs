#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  BACKEND_TASKS,
  discoverBackendTickers,
  normalizeTicker,
  resolveTaskScript,
} from "./backend_manifest.mjs";

const repoRoot = process.cwd();

const WORKFLOWS = {
  update: {
    description: "Safe rerunnable default update: import prices, backfill valuations, then validate.",
    tasks: ["import-prices", "backfill-valuations", "validate"],
    defaultAll: true,
  },
  validate: {
    description: "Validate backend databases.",
    tasks: ["validate"],
    defaultAll: true,
  },
  prices: {
    description: "Import daily stock and benchmark price bars.",
    tasks: ["import-prices"],
    defaultAll: true,
  },
  backfill: {
    description: "Backfill persisted valuation runs.",
    tasks: ["backfill-valuations"],
    defaultAll: true,
  },
};

function parseArgs(argv) {
  const args = {
    all: false,
    continueOnError: true,
    dryRun: false,
    onlySupported: true,
    skip: new Set(),
    taskSequence: null,
    tickers: [],
    workflow: "update",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") args.all = true;
    else if (arg === "--continue-on-error") args.continueOnError = true;
    else if (arg === "--stop-on-error") args.continueOnError = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--include-unsupported") args.onlySupported = false;
    else if (arg === "--only-supported") args.onlySupported = true;
    else if (arg === "--skip") {
      for (const task of String(argv[++index] ?? "").split(",").map((item) => item.trim()).filter(Boolean)) args.skip.add(task);
    } else if (arg === "--task-sequence") {
      args.taskSequence = String(argv[++index] ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg === "--ticker") {
      args.tickers.push(normalizeTicker(argv[++index]));
    } else if (arg === "--tickers") {
      args.tickers.push(...String(argv[++index] ?? "").split(",").map(normalizeTicker));
    } else if (arg === "--workflow") {
      args.workflow = String(argv[++index] ?? "update");
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
  console.log(`Data workflow orchestrator

Usage:
  node scripts/data_workflow.mjs --workflow update --all
  node scripts/data_workflow.mjs --workflow update --ticker ma
  node scripts/data_workflow.mjs --workflow update --tickers v,now,anet,ma --dry-run
  node scripts/data_workflow.mjs --workflow update --all --skip validate
  node scripts/data_workflow.mjs --task-sequence import-prices,validate --ticker msft

Workflows:
${Object.entries(WORKFLOWS).map(([name, workflow]) => `  ${name.padEnd(12)} ${workflow.tasks.join(" -> ").padEnd(45)} ${workflow.description}`).join("\n")}

Tasks:
${Object.entries(BACKEND_TASKS).map(([task, meta]) => `  ${task.padEnd(20)} ${meta.writesData ? "writes" : "read-only"}  ${meta.description}`).join("\n")}
`);
}

function resolveTasks(args) {
  const workflow = WORKFLOWS[args.workflow];
  if (!workflow && !args.taskSequence) {
    throw new Error(`Unknown workflow "${args.workflow}". Use one of: ${Object.keys(WORKFLOWS).join(", ")}`);
  }
  const tasks = args.taskSequence ?? workflow.tasks;
  for (const task of tasks) {
    if (!BACKEND_TASKS[task]) throw new Error(`Unknown task "${task}". Use one of: ${Object.keys(BACKEND_TASKS).join(", ")}`);
  }
  return tasks.filter((task) => !args.skip.has(task));
}

function resolveTickers(args) {
  if (args.tickers.length > 0) return args.tickers;
  if (args.all || WORKFLOWS[args.workflow]?.defaultAll) return discoverBackendTickers(repoRoot);
  throw new Error("Provide --ticker <ticker>, --tickers <a,b>, or --all.");
}

function runOne(ticker, task, args) {
  const scriptPath = resolveTaskScript(ticker, task, repoRoot);
  if (!scriptPath) {
    return {
      ticker,
      task,
      status: args.onlySupported ? "SKIP" : "FAIL",
      detail: `No script for ${ticker}:${task}`,
    };
  }

  const relativeScript = path.relative(repoRoot, scriptPath);
  if (args.dryRun) {
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

function printPlan({ workflowName, tickers, tasks, args }) {
  console.log("Data workflow");
  console.log(`Workflow: ${workflowName}${args.taskSequence ? " (custom task sequence)" : ""}`);
  console.log(`Tickers: ${tickers.join(", ")}`);
  console.log(`Tasks: ${tasks.join(" -> ") || "none"}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "execute"}; ${args.continueOnError ? "continue on error" : "stop on error"}; ${args.onlySupported ? "skip unsupported tasks" : "fail unsupported tasks"}`);
}

function printSummary(results) {
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});
  const byTicker = new Map();
  for (const result of results) {
    const rows = byTicker.get(result.ticker) ?? [];
    rows.push(result);
    byTicker.set(result.ticker, rows);
  }

  console.log("\nData workflow summary");
  for (const [ticker, rows] of byTicker.entries()) {
    const tickerStatus = rows.some((row) => row.status === "FAIL") ? "FAIL" : rows.every((row) => row.status === "SKIP") ? "SKIP" : "PASS";
    console.log(`${tickerStatus}: ${ticker} - ${rows.map((row) => `${row.task}:${row.status}`).join(", ")}`);
    for (const row of rows.filter((item) => item.status === "FAIL" || item.status === "SKIP" || item.status === "DRY_RUN")) {
      console.log(`  ${row.status}: ${row.task} - ${row.detail}`);
    }
  }
  console.log(`Totals: ${JSON.stringify(counts)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tasks = resolveTasks(args);
  const tickers = resolveTickers(args);
  printPlan({ workflowName: args.workflow, tickers, tasks, args });

  const results = [];
  for (const ticker of tickers) {
    for (const task of tasks) {
      const result = runOne(ticker, task, args);
      results.push(result);
      if (result.status === "FAIL" && !args.continueOnError) {
        printSummary(results);
        process.exitCode = 1;
        return;
      }
    }
  }

  printSummary(results);
  if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
