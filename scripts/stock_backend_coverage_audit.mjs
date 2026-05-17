import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const strict = process.argv.includes("--strict");
const frontendRoot = path.join(repoRoot, "src/stocks");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const packageScripts = packageJson.scripts ?? {};

const REQUIRED_TABLES = ["reporting_events", "valuation_runs", "daily_price_bars"];
const REQUIRED_BACKEND_SCRIPTS = [
  "backend:seed",
  "backend:import-prices",
  "backend:backfill-valuations",
  "backend:validate",
];
const QUARTERLY_8Y_EVENT_TARGET = 32;
const MIN_PRICE_BAR_TARGET = 1800;

const pythonBridge = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
conn.row_factory = sqlite3.Row
try:
    rows = conn.execute(payload["sql"], payload.get("params", [])).fetchall()
    print(json.dumps([dict(row) for row in rows]))
finally:
    conn.close()
`;

function sqliteQuery(dbPath, sql, params = []) {
  const result = spawnSync("python3", ["-c", pythonBridge], {
    input: JSON.stringify({ dbPath, sql, params }),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `SQLite query failed for ${dbPath}`);
  }
  return result.stdout ? JSON.parse(result.stdout) : [];
}

function discoverFrontendSlugs() {
  return fs
    .readdirSync(frontendRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(frontendRoot, slug, "config.ts")))
    .sort();
}

function tableExists(dbPath, tableName) {
  const rows = sqliteQuery(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  );
  return rows.length > 0;
}

function safeQuery(dbPath, sql, params = []) {
  try {
    return { ok: true, rows: sqliteQuery(dbPath, sql, params) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), rows: [] };
  }
}

function yearsBetween(minDate, maxDate) {
  if (!minDate || !maxDate) return 0;
  const start = new Date(`${minDate}T00:00:00Z`);
  const end = new Date(`${maxDate}T00:00:00Z`);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())) return 0;
  return Math.max(0, (end.valueOf() - start.valueOf()) / (365.25 * 24 * 60 * 60 * 1000));
}

function scanFrontendMapping(slug) {
  const stockDir = path.join(frontendRoot, slug);
  const files = [];
  const stack = [stockDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  const needles = [
    `/api/${slug}/historical-valuations`,
    `/api/stocks/${slug}/historical-valuations`,
    `/api/${slug}/backtests`,
    `/api/stocks/${slug}/backtests`,
    "historical-valuations",
    "Backend Historical",
  ];

  const matchedFiles = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (needles.some((needle) => text.includes(needle))) {
      matchedFiles.push(path.relative(repoRoot, file));
    }
  }

  return {
    mapped: matchedFiles.length > 0,
    files: matchedFiles,
  };
}

function auditSlug(slug) {
  const moduleDir = path.join(repoRoot, "modules", slug);
  const migrationPath = path.join(repoRoot, "apps/api/src/db/migrations", `001_${slug}_schema.sql`);
  const dbPath = path.join(repoRoot, "data/local", slug, "backend", `${slug}_research.sqlite`);
  const backendScripts = Object.fromEntries(
    REQUIRED_BACKEND_SCRIPTS.map((scriptSuffix) => [`${slug}:${scriptSuffix}`, Boolean(packageScripts[`${slug}:${scriptSuffix}`])]),
  );
  const frontendMapping = scanFrontendMapping(slug);

  const result = {
    slug,
    moduleDir: fs.existsSync(moduleDir),
    schema: fs.existsSync(path.join(moduleDir, "db/schema.mjs")),
    migration: fs.existsSync(migrationPath),
    db: fs.existsSync(dbPath),
    backendScripts,
    frontendMapping,
    tables: {},
    eventCount: 0,
    eventMinDate: null,
    eventMaxDate: null,
    eventYearSpan: 0,
    valuationRunCount: 0,
    baseValuationRunCount: 0,
    baseValuationEventCount: 0,
    priceTickers: [],
    stockPriceBars: 0,
    spyPriceBars: 0,
    issues: [],
    warnings: [],
  };

  if (!result.moduleDir) result.issues.push("missing modules/<slug> backend directory");
  if (!result.schema) result.issues.push("missing modules/<slug>/db/schema.mjs");
  if (!result.migration) result.issues.push("missing DB migration");
  for (const [scriptName, exists] of Object.entries(backendScripts)) {
    if (!exists) result.issues.push(`missing package script ${scriptName}`);
  }
  if (!result.frontendMapping.mapped) result.issues.push("frontend valuation tab does not appear to map backend historical/backtest APIs");
  if (!result.db) {
    result.issues.push("missing backend SQLite DB");
    return result;
  }

  for (const tableName of REQUIRED_TABLES) {
    result.tables[tableName] = tableExists(dbPath, tableName);
    if (!result.tables[tableName]) result.issues.push(`missing table ${tableName}`);
  }

  if (result.tables.reporting_events) {
    const eventRows = safeQuery(dbPath, "SELECT COUNT(*) AS count, MIN(eventDate) AS minDate, MAX(eventDate) AS maxDate FROM reporting_events").rows;
    const eventSummary = eventRows[0] ?? {};
    result.eventCount = Number(eventSummary.count ?? 0);
    result.eventMinDate = eventSummary.minDate ?? null;
    result.eventMaxDate = eventSummary.maxDate ?? null;
    result.eventYearSpan = yearsBetween(result.eventMinDate, result.eventMaxDate);
    if (result.eventCount < QUARTERLY_8Y_EVENT_TARGET) {
      result.warnings.push(`event coverage is below ${QUARTERLY_8Y_EVENT_TARGET} quarterly anchors`);
    }
    if (result.eventYearSpan < 7.5) {
      result.warnings.push("event history is shorter than roughly eight years");
    }
  }

  if (result.tables.valuation_runs) {
    const valuationRows = safeQuery(
      dbPath,
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN scenario = 'Base' THEN 1 ELSE 0 END) AS baseCount,
        COUNT(DISTINCT CASE WHEN scenario = 'Base' THEN reportingEventId END) AS baseEventCount
       FROM valuation_runs`,
    ).rows;
    const valuationSummary = valuationRows[0] ?? {};
    result.valuationRunCount = Number(valuationSummary.total ?? 0);
    result.baseValuationRunCount = Number(valuationSummary.baseCount ?? 0);
    result.baseValuationEventCount = Number(valuationSummary.baseEventCount ?? 0);
    if (result.eventCount > 0 && result.baseValuationEventCount < result.eventCount) {
      result.issues.push("Base valuation runs do not cover every reporting event");
    }
  }

  if (result.tables.daily_price_bars) {
    const priceRows = safeQuery(
      dbPath,
      "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS minDate, MAX(priceDate) AS maxDate FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    ).rows;
    result.priceTickers = priceRows.map((row) => ({
      ticker: row.ticker,
      count: Number(row.count ?? 0),
      minDate: row.minDate,
      maxDate: row.maxDate,
    }));
    result.stockPriceBars = result.priceTickers
      .filter((row) => row.ticker && row.ticker.toUpperCase() !== "SPY")
      .reduce((sum, row) => sum + row.count, 0);
    result.spyPriceBars = result.priceTickers.find((row) => row.ticker === "SPY")?.count ?? 0;
    if (result.stockPriceBars < MIN_PRICE_BAR_TARGET) result.warnings.push("stock daily price history is shorter than expected");
    if (result.spyPriceBars < MIN_PRICE_BAR_TARGET) result.warnings.push("SPY benchmark daily price history is shorter than expected");
  }

  return result;
}

function readiness(result) {
  if (result.issues.length > 0) return "FAIL";
  if (result.warnings.length > 0) return "WARN";
  return "PASS";
}

function formatBool(value) {
  return value ? "yes" : "no";
}

function printAudit(results) {
  const summary = results.reduce(
    (acc, result) => {
      acc[readiness(result).toLowerCase()] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  console.log("Stock backend coverage audit");
  console.log(`Frontend modules: ${results.length}`);
  console.log(`PASS ${summary.pass} | WARN ${summary.warn} | FAIL ${summary.fail}`);
  console.log("");
  console.log([
    "slug",
    "status",
    "db",
    "events",
    "years",
    "base events",
    "runs",
    "prices",
    "frontend API",
  ].join("\t"));

  for (const result of results) {
    console.log([
      result.slug,
      readiness(result),
      formatBool(result.db),
      result.eventCount,
      result.eventYearSpan ? result.eventYearSpan.toFixed(1) : "0.0",
      `${result.baseValuationEventCount}/${result.eventCount}`,
      result.valuationRunCount,
      result.priceTickers.map((row) => `${row.ticker}:${row.count}`).join(",") || "-",
      result.frontendMapping.mapped ? result.frontendMapping.files.slice(0, 2).join(",") : "no",
    ].join("\t"));
  }

  console.log("");
  for (const result of results) {
    if (result.issues.length === 0 && result.warnings.length === 0) continue;
    console.log(`${result.slug.toUpperCase()} ${readiness(result)}`);
    for (const issue of result.issues) console.log(`  issue: ${issue}`);
    for (const warning of result.warnings) console.log(`  warning: ${warning}`);
  }
}

const results = discoverFrontendSlugs().map(auditSlug);
printAudit(results);

if (strict && results.some((result) => result.issues.length > 0 || result.warnings.length > 0)) {
  process.exitCode = 1;
}
