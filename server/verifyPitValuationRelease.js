import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [baselineArg, firstArg, secondArg] = process.argv.slice(2);

if (!baselineArg || !firstArg || !secondArg) {
  throw new Error("Usage: node server/verifyPitValuationRelease.js <baseline.sqlite> <run1.sqlite> <run2.sqlite>");
}

const VALUATION_TABLES = new Set([
  "valuation_pit_source_metadata",
  "valuation_pit_financials",
  "valuation_pit_guidance",
  "valuation_pit_model_runs",
  "valuation_ticker_snapshots",
  "valuation_snapshots"
]);

function openDatabase(filePath) {
  return new DatabaseSync(path.resolve(filePath), { readOnly: true });
}

function tableCounts(db, { excludeValuation = false } = {}) {
  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
  return Object.fromEntries(tables
    .filter((table) => !excludeValuation || !VALUATION_TABLES.has(table))
    .map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count)]));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["generatedAt", "runCreatedAt"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child)]));
}

function canonicalJson(value) {
  try {
    return JSON.stringify(canonicalize(JSON.parse(value)));
  } catch {
    return String(value ?? "");
  }
}

function digestRows(rows) {
  const hash = crypto.createHash("sha256");
  for (const row of rows) hash.update(`${JSON.stringify(row)}\n`);
  return hash.digest("hex");
}

function modelSignature(db) {
  const rows = db.prepare(`
    SELECT ticker, fiscal_period, model_version, as_of_date,
           financial_available_at, guidance_max_observed_at, input_json, output_json
    FROM valuation_pit_model_runs
    ORDER BY ticker, fiscal_period, model_version
  `).all().map((row) => ({
    ...row,
    input_json: canonicalJson(row.input_json),
    output_json: canonicalJson(row.output_json)
  }));
  return digestRows(rows);
}

function snapshotSignature(db) {
  const rows = db.prepare(`
    SELECT ticker, payload_json
    FROM valuation_ticker_snapshots
    ORDER BY ticker
  `).all().map((row) => ({ ticker: row.ticker, payload_json: canonicalJson(row.payload_json) }));
  return digestRows(rows);
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function inspectModels(db) {
  const rows = db.prepare(`
    SELECT ticker, fiscal_period, as_of_date, financial_available_at,
           guidance_max_observed_at, input_json, output_json
    FROM valuation_pit_model_runs
    ORDER BY ticker, as_of_date
  `).all();
  const failures = [];
  let dcfRows = 0;
  let maxTerminalValueShare = 0;
  let minDcfSpread = Infinity;

  for (const row of rows) {
    const input = JSON.parse(row.input_json);
    const output = JSON.parse(row.output_json);
    const fairValue = finite(output.fairValue);
    const semantics = input.valuationSemantics || output.dataSnapshot?.valuationSemantics || {};
    const dcf = semantics.scoreInputs?.equityDcf || null;

    if (!(fairValue > 0)) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "invalid_fair_value" });
    if (row.financial_available_at > row.as_of_date) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_financial" });
    if (row.guidance_max_observed_at && row.guidance_max_observed_at > row.as_of_date) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_guidance" });
    }
    if (semantics.priceExcludedFromFairValue !== true) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "price_not_excluded" });
    }
    if (dcf) {
      dcfRows += 1;
      const discountRate = finite(dcf.discountRate);
      const terminalGrowth = finite(dcf.terminalGrowth);
      const terminalValueShare = finite(dcf.terminalValueShare);
      if (!(discountRate > terminalGrowth)) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "invalid_dcf_spread" });
      if (!(terminalValueShare > 0 && terminalValueShare < 0.9)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "terminal_value_concentration", terminalValueShare });
      }
      maxTerminalValueShare = Math.max(maxTerminalValueShare, terminalValueShare || 0);
      minDcfSpread = Math.min(minDcfSpread, (discountRate || 0) - (terminalGrowth || 0));
    }
  }

  return {
    rows: rows.length,
    dcfRows,
    failures,
    maxTerminalValueShare,
    minDcfSpread: Number.isFinite(minDcfSpread) ? minDcfSpread : null
  };
}

function latestTicker(db, ticker) {
  const row = db.prepare(`
    SELECT fiscal_period, as_of_date, input_json, output_json
    FROM valuation_pit_model_runs
    WHERE ticker = ?
    ORDER BY as_of_date DESC
    LIMIT 1
  `).get(ticker);
  if (!row) return null;
  const input = JSON.parse(row.input_json);
  const output = JSON.parse(row.output_json);
  const scoreInputs = input.valuationSemantics?.scoreInputs || output.dataSnapshot?.valuationSemantics?.scoreInputs || {};
  return {
    ticker,
    fiscalPeriod: row.fiscal_period,
    asOfDate: row.as_of_date,
    fairValue: finite(output.fairValue),
    targetPrice3Y: finite(output.targetPrice3Y),
    priceAtDate: finite(output.priceAtDate),
    method: output.method,
    dcfFairValue: finite(scoreInputs.equityDcf?.fairValue),
    discountRate: finite(scoreInputs.equityDcf?.discountRate),
    terminalGrowth: finite(scoreInputs.equityDcf?.terminalGrowth),
    terminalValueShare: finite(scoreInputs.equityDcf?.terminalValueShare),
    normalizedNetIncome: finite(scoreInputs.normalizedNetIncome),
    belowOperatingIncomeBurden: finite(scoreInputs.belowOperatingIncomeBurden)
  };
}

const baseline = openDatabase(baselineArg);
const first = openDatabase(firstArg);
const second = openDatabase(secondArg);

try {
  const firstIntegrity = first.prepare("PRAGMA integrity_check").get().integrity_check;
  const secondIntegrity = second.prepare("PRAGMA integrity_check").get().integrity_check;
  assert.equal(firstIntegrity, "ok");
  assert.equal(secondIntegrity, "ok");

  const baselineNonValuation = tableCounts(baseline, { excludeValuation: true });
  const firstNonValuation = tableCounts(first, { excludeValuation: true });
  const secondNonValuation = tableCounts(second, { excludeValuation: true });
  assert.deepEqual(firstNonValuation, baselineNonValuation);
  assert.deepEqual(secondNonValuation, baselineNonValuation);

  const firstCounts = tableCounts(first);
  const secondCounts = tableCounts(second);
  for (const table of VALUATION_TABLES) assert.equal(firstCounts[table], secondCounts[table]);
  assert.equal(firstCounts.valuation_ticker_snapshots, 141);
  assert.equal(firstCounts.valuation_pit_model_runs, 7612);

  const firstModelSignature = modelSignature(first);
  const secondModelSignature = modelSignature(second);
  const firstSnapshotSignature = snapshotSignature(first);
  const secondSnapshotSignature = snapshotSignature(second);
  assert.equal(firstModelSignature, secondModelSignature);
  assert.equal(firstSnapshotSignature, secondSnapshotSignature);

  const modelAudit = inspectModels(first);
  assert.deepEqual(modelAudit.failures, []);

  const rklx = JSON.parse(first.prepare("SELECT payload_json FROM valuation_ticker_snapshots WHERE ticker = 'RKLX'").get().payload_json);
  assert.equal(rklx.dataQuality?.valuationStatus, "not_applicable");

  console.log(JSON.stringify({
    status: "pass",
    valuationCounts: Object.fromEntries([...VALUATION_TABLES].map((table) => [table, firstCounts[table]])),
    nonValuationTablesPreserved: true,
    modelSignature: firstModelSignature,
    snapshotSignature: firstSnapshotSignature,
    modelAudit: {
      rows: modelAudit.rows,
      dcfRows: modelAudit.dcfRows,
      maxTerminalValueShare: modelAudit.maxTerminalValueShare,
      minDcfSpread: modelAudit.minDcfSpread
    },
    focusTickers: ["PLTR", "CHTR", "AZN", "LSEG"].map((ticker) => latestTicker(first, ticker))
  }, null, 2));
} finally {
  baseline.close();
  first.close();
  second.close();
}
