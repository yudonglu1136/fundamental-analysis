import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const BACKEND_TASKS = {
  seed: {
    description: "Create or refresh the ticker research database from local seed data.",
    scriptSuffix: "backend_seed",
    writesData: true,
  },
  "import-prices": {
    description: "Import daily stock and benchmark price bars into the ticker research database.",
    scriptSuffix: "backend_import_prices",
    writesData: true,
  },
  "backfill-valuations": {
    description: "Backfill persisted valuation runs for reporting events.",
    scriptSuffix: "backend_backfill_valuations",
    writesData: true,
  },
  "run-valuation": {
    description: "Run one ad hoc backend valuation for the ticker.",
    scriptSuffix: "backend_run_valuation",
    writesData: true,
  },
  validate: {
    description: "Run the ticker backend validation script.",
    scriptSuffix: "backend_validation",
    writesData: false,
  },
  "fetch-official": {
    description: "Fetch official source data where a ticker-specific fetcher exists.",
    scriptSuffix: "fetch_official_data",
    writesData: true,
  },
  "fetch-transcripts": {
    description: "Fetch transcript source data where a ticker-specific fetcher exists.",
    scriptSuffix: "fetch_transcripts",
    writesData: true,
  },
  "build-dataset": {
    description: "Build an official dataset snapshot where a ticker-specific builder exists.",
    scriptSuffix: "build_official_dataset",
    writesData: true,
  },
  "build-metrics": {
    description: "Build a metric database or metric JSON snapshot where supported.",
    scriptSuffix: "build_metric_database",
    writesData: true,
  },
  "build-qa-pairs": {
    description: "Build transcript QA pairs where supported.",
    scriptSuffix: "build_qa_pairs",
    writesData: true,
  },
  "model-validate": {
    description: "Run ticker model validation where a model validation script exists.",
    scriptSuffix: "model_validation",
    writesData: false,
  },
};

const SCRIPT_ALIASES = {
  azn: {
    "model-validate": "azn-model-validation.mjs",
    "fetch-official": "azn_fetch_public_data.mjs",
  },
  dge: {
    "model-validate": "dge-model-validation.mjs",
  },
  legn: {
    "model-validate": "legn-model-validation.mjs",
  },
  lseg: {
    "model-validate": "lseg_model_validation.mjs",
  },
  msft: {
    "model-validate": "msft-model-validation.mjs",
  },
  pltr: {
    "model-validate": "pltr-model-validation.mjs",
  },
};

export function normalizeTicker(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function discoverBackendTickers(repoRoot = process.cwd()) {
  const backendRoot = path.join(repoRoot, "data", "local");
  if (!existsSync(backendRoot)) return [];
  return readdirSync(backendRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((ticker) => existsSync(path.join(backendRoot, ticker, "backend", `${ticker}_research.sqlite`)))
    .sort();
}

export function resolveTaskScript(ticker, task, repoRoot = process.cwd()) {
  const normalizedTicker = normalizeTicker(ticker);
  const taskDefinition = BACKEND_TASKS[task];
  if (!taskDefinition) return null;
  const alias = SCRIPT_ALIASES[normalizedTicker]?.[task];
  const scriptName = alias ?? `${normalizedTicker}_${taskDefinition.scriptSuffix}.mjs`;
  const scriptPath = path.join(repoRoot, "scripts", scriptName);
  return existsSync(scriptPath) ? scriptPath : null;
}

export function getBackendDatabaseInfo(ticker, repoRoot = process.cwd()) {
  const normalizedTicker = normalizeTicker(ticker);
  const dbPath = path.join(repoRoot, "data", "local", normalizedTicker, "backend", `${normalizedTicker}_research.sqlite`);
  if (!existsSync(dbPath)) {
    return { exists: false, path: dbPath, sizeBytes: 0 };
  }
  return {
    exists: true,
    path: dbPath,
    sizeBytes: statSync(dbPath).size,
  };
}

export function buildBackendManifest(repoRoot = process.cwd()) {
  const tickers = discoverBackendTickers(repoRoot);
  return tickers.map((ticker) => {
    const tasks = Object.fromEntries(
      Object.keys(BACKEND_TASKS).map((task) => {
        const scriptPath = resolveTaskScript(ticker, task, repoRoot);
        return [
          task,
          {
            available: Boolean(scriptPath),
            script: scriptPath ? path.relative(repoRoot, scriptPath) : null,
            writesData: BACKEND_TASKS[task].writesData,
            description: BACKEND_TASKS[task].description,
          },
        ];
      }),
    );
    return {
      ticker,
      database: getBackendDatabaseInfo(ticker, repoRoot),
      tasks,
    };
  });
}

export function listAvailableTasksForTicker(ticker, repoRoot = process.cwd()) {
  const normalizedTicker = normalizeTicker(ticker);
  return Object.keys(BACKEND_TASKS).filter((task) => resolveTaskScript(normalizedTicker, task, repoRoot));
}
