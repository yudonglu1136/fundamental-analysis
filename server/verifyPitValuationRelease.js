import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  sp500AliasEntries,
  sp500CanonicalTicker,
  sp500CompanyTickers,
  sp500UniverseSummary
} from "./sp500ValuationUniverse.js";

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
    .filter(([key]) => !["generatedAt", "runCreatedAt", "fetchedAt"].includes(key))
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
  const tickerRows = db.prepare(`
    SELECT ticker, payload_json
    FROM valuation_ticker_snapshots
    ORDER BY ticker
  `).all().map((row) => ({ ticker: row.ticker, payload_json: canonicalJson(row.payload_json) }));
  const dashboardRows = db.prepare(`
    SELECT id, payload_json
    FROM valuation_snapshots
    ORDER BY id
  `).all().map((row) => ({ id: row.id, payload_json: canonicalJson(row.payload_json) }));
  return digestRows([
    ...tickerRows.map((row) => ({ type: "ticker", ...row })),
    ...dashboardRows.map((row) => ({ type: "dashboard", ...row }))
  ]);
}

function finite(value) {
  if (value == null || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function ratioMagnitude(left, right) {
  const a = finite(left);
  const b = finite(right);
  if (a == null || b == null || a === 0 || b === 0) return null;
  return Math.max(Math.abs(a / b), Math.abs(b / a));
}

function signChanged(left, right) {
  const a = finite(left);
  const b = finite(right);
  return a != null && b != null && a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b);
}

function daysBetween(left, right) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(b - a) / 86_400_000;
}

function modelRows(db) {
  return db.prepare(`
    SELECT ticker, fiscal_period, as_of_date, financial_available_at,
           guidance_max_observed_at, input_json, output_json
    FROM valuation_pit_model_runs
    ORDER BY ticker, as_of_date, fiscal_period
  `).all().map((row) => ({
    ...row,
    ticker: String(row.ticker).toUpperCase(),
    input: JSON.parse(row.input_json),
    output: JSON.parse(row.output_json)
  }));
}

function snapshotRows(db) {
  return db.prepare(`
    SELECT ticker, payload_json
    FROM valuation_ticker_snapshots
    ORDER BY ticker
  `).all().map((row) => ({
    ticker: String(row.ticker).toUpperCase(),
    payload: JSON.parse(row.payload_json)
  }));
}

function expectedTickerSet(baselineDb) {
  const sp500Tickers = new Set(sp500CompanyTickers());
  const extras = snapshotRows(baselineDb)
    .map((row) => sp500CanonicalTicker(row.ticker))
    .filter((ticker) => !sp500Tickers.has(ticker));
  return new Set([...sp500Tickers, ...extras]);
}

function inspectUniverseManifest() {
  const summary = sp500UniverseSummary();
  const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, "utf8"));
  const companies = Array.isArray(manifest.companies) ? manifest.companies : [];
  const tickers = companies.map((company) => String(company.ticker || "").toUpperCase());
  const ciks = companies.map((company) => String(company.cik || "")).filter(Boolean);
  const shareClasses = companies.flatMap((company) => company.shareClasses || []);
  const aliases = sp500AliasEntries();
  return {
    asOf: summary.asOf,
    manifestPath: summary.manifestPath,
    securityCount: summary.securityCount,
    companyCount: summary.companyCount,
    uniqueTickerCount: new Set(tickers).size,
    uniqueCikCount: new Set(ciks).size,
    shareClassCount: shareClasses.length,
    aliasCount: aliases.length,
    aliases: aliases.map(([alias, canonical]) => ({ alias, canonical }))
  };
}

function inspectSp500PriceCoverage(db) {
  const summary = sp500UniverseSummary();
  const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, "utf8"));
  const snapshots = new Map(snapshotRows(db).map((row) => [row.ticker, row.payload]));
  const failures = [];
  let positiveLatestPrices = 0;
  let nonPositiveStoredPoints = 0;
  let storedPoints = 0;
  let latestPriceDate = null;

  for (const company of manifest.companies || []) {
    const ticker = String(company.ticker).toUpperCase();
    const snapshot = snapshots.get(ticker);
    const history = Array.isArray(snapshot?.priceHistory) ? snapshot.priceHistory : [];
    const positiveHistory = history.filter((point) => finite(point?.close) > 0);
    const latestPositivePoint = positiveHistory.at(-1) || null;
    storedPoints += history.length;
    nonPositiveStoredPoints += history.length - positiveHistory.length;
    const latestPrice = finite(snapshot?.latest?.latestPrice);
    if (latestPrice > 0) positiveLatestPrices += 1;
    latestPriceDate = [latestPriceDate, snapshot?.latest?.latestPriceDate].filter(Boolean).sort().at(-1) || null;
    if (!(latestPrice > 0)) failures.push({ ticker, code: "missing_positive_latest_price" });
    if (!latestPositivePoint) failures.push({ ticker, code: "missing_positive_price_history" });
    if (company.lastPriceDate && String(latestPositivePoint?.date || "") < String(company.lastPriceDate)) {
      failures.push({
        ticker,
        code: "price_history_older_than_manifest_source",
        latestPriceDate: latestPositivePoint?.date || null,
        manifestPriceDate: company.lastPriceDate
      });
    }
  }
  return {
    companies: (manifest.companies || []).length,
    positiveLatestPrices,
    storedPoints,
    nonPositiveStoredPoints,
    latestPriceDate,
    failures
  };
}

function inspectTrackedPriceCoverage(db, expectedTickers) {
  const snapshots = new Map(snapshotRows(db).map((row) => [row.ticker, row.payload]));
  const failures = [];
  let storedPoints = 0;

  for (const ticker of [...expectedTickers].sort()) {
    const snapshot = snapshots.get(ticker);
    if (!snapshot) {
      failures.push({ ticker, code: "missing_snapshot" });
      continue;
    }
    const history = Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [];
    const invalidPoints = history.filter((point) => !(finite(point?.close) > 0));
    storedPoints += history.length;
    if (invalidPoints.length) {
      failures.push({ ticker, code: "nonpositive_stored_price", count: invalidPoints.length });
    }
    if (!history.some((point) => finite(point?.close) > 0)) {
      failures.push({ ticker, code: "missing_positive_price_history" });
    }
    if (!(finite(snapshot.latest?.latestPrice) > 0)) {
      failures.push({ ticker, code: "missing_positive_latest_price" });
    }
  }

  return {
    tickers: expectedTickers.size,
    storedPoints,
    failures
  };
}

function sourceMetadata(db) {
  return Object.fromEntries(db.prepare(`
    SELECT key, value
    FROM valuation_pit_source_metadata
    ORDER BY key
  `).all().map((row) => [row.key, row.value]));
}

function inspectReleasePathLeaks(db) {
  const checks = [
    ["valuation_pit_source_metadata", "value"],
    ["valuation_pit_guidance", "payload_json"],
    ["valuation_pit_model_runs", "input_json"],
    ["valuation_pit_model_runs", "output_json"],
    ["valuation_ticker_snapshots", "payload_json"],
    ["valuation_snapshots", "payload_json"]
  ];
  const localPrefixes = ["/Users/", "/tmp/", "/var/folders/", "/home/"];
  const failures = [];
  for (const [table, column] of checks) {
    const rows = db.prepare(`SELECT rowid AS id, ${column} AS value FROM ${table}`).all();
    for (const row of rows) {
      const prefix = localPrefixes.find((candidate) => String(row.value || "").includes(candidate));
      if (prefix) failures.push({ table, column, id: row.id, prefix });
    }
  }
  return { checks: checks.length, failures };
}

function selectedFinancialPeriods(db) {
  const grouped = new Map();
  for (const row of db.prepare(`
    SELECT ticker, fiscal_period, dimension, available_at, payload_json
    FROM valuation_pit_financials
    ORDER BY ticker, fiscal_year, fiscal_quarter, dimension
  `).all()) {
    const key = `${String(row.ticker).toUpperCase()}::${row.fiscal_period}`;
    grouped.set(key, [...(grouped.get(key) || []), { ...row, payload: JSON.parse(row.payload_json) }]);
  }
  const hasCoreFinancials = (row) =>
    row?.payload?.revenue_m != null || row?.payload?.net_income_m != null || row?.payload?.cfo_m != null;
  return [...grouped.entries()].map(([key, candidates]) => {
    const arq = candidates.find((row) => row.dimension === "ARQ" && hasCoreFinancials(row));
    const art = candidates.find((row) => row.dimension === "ART" && hasCoreFinancials(row));
    const base = arq || art;
    if (!base) return null;
    return {
      key,
      ticker: String(base.ticker).toUpperCase(),
      fiscalPeriod: base.fiscal_period,
      availableAt: [base.available_at, art?.available_at].filter(Boolean).sort().at(-1),
      base: base.payload,
      trailing: (art || base).payload
    };
  }).filter(Boolean);
}

function inspectUnmodeledFinancialPeriods(db) {
  const modeled = new Set(db.prepare(`
    SELECT ticker, fiscal_period
    FROM valuation_pit_model_runs
  `).all().map((row) => `${String(row.ticker).toUpperCase()}::${row.fiscal_period}`));
  const profiles = new Map();
  for (const row of [...modelRows(db)].reverse()) {
    if (!profiles.has(row.ticker)) {
      profiles.set(row.ticker, row.input.valuationSemantics?.scoreInputs?.profile || null);
    }
  }
  const financialProfiles = new Set(["bank", "insurance", "card_network_lender", "credit_services", "capital_markets"]);
  const earningsProfiles = new Set(["asset_manager", "insurance_broker"]);
  const gaps = [];

  for (const period of selectedFinancialPeriods(db)) {
    if (modeled.has(period.key)) continue;
    const data = period.trailing || period.base;
    const profile = profiles.get(period.ticker) || null;
    const revenue = finite(data.revenue_m);
    const netIncome = finite(data.net_income_m);
    const cfo = finite(data.cfo_m);
    const capex = finite(data.capex_m);
    const fcf = cfo != null && capex != null ? cfo - capex : finite(data.fcf_after_capex_m);
    const shares = finite(data.shares_m ?? period.base?.shares_m);
    const equity = finite(data.equity_m ?? period.base?.equity_m);
    const cash = finite(data.cash_m ?? period.base?.cash_m) || 0;
    const debt = finite(data.debt_m ?? period.base?.debt_m) || 0;
    let reason;
    let unexpectedlyModelable = false;

    if (!(shares > 0)) {
      reason = "missing_positive_diluted_shares";
    } else if (period.ticker === "MSTR") {
      reason = String(period.availableAt) < "2020-08-11"
        ? "specialized_bitcoin_treasury_model_not_applicable_before_strategy"
        : "bitcoin_fair_value_not_point_in_time_visible";
    } else if (revenue == null && netIncome == null) {
      reason = "incomplete_provider_income_statement";
    } else if (!(revenue > 0)) {
      reason = Math.abs(revenue || 0) < 1 && Math.abs(equity || 0) < 10
        ? "predecessor_shell_or_preoperating_entity"
        : "precommercial_no_positive_revenue";
    } else if (financialProfiles.has(profile) && !(equity > 0)) {
      reason = "nonpositive_reported_equity_for_roe_book_model";
    } else if (earningsProfiles.has(profile) && !(netIncome > 0)) {
      reason = "no_positive_through_cycle_earnings";
    } else if (!(netIncome > 0) && !(fcf > 0)) {
      reason = "no_positive_earnings_or_owner_cash_flow";
    } else if (["emerging_biotech", "emerging_health_ai"].includes(profile) && revenue * 2 + cash - debt <= 0) {
      reason = "no_positive_equity_value_after_net_debt";
    } else {
      reason = "financials_appear_modelable_but_no_valuation_was_emitted";
      unexpectedlyModelable = true;
    }

    gaps.push({
      ticker: period.ticker,
      fiscalPeriod: period.fiscalPeriod,
      availableAt: period.availableAt,
      profile,
      reason,
      unexpectedlyModelable,
      inputs: { revenue, netIncome, fcf, shares, equity, cash, debt }
    });
  }

  const reasonCounts = Object.fromEntries([...gaps.reduce((counts, gap) => {
    counts.set(gap.reason, (counts.get(gap.reason) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  return {
    selectedFinancialPeriods: selectedFinancialPeriods(db).length,
    modeledPeriods: modeled.size,
    explicitlyUnmodeledPeriods: gaps.length,
    affectedTickers: new Set(gaps.map((gap) => gap.ticker)).size,
    reasonCounts,
    unexpected: gaps.filter((gap) => gap.unexpectedlyModelable),
    gaps
  };
}

function collectForbiddenPriceInputs(value, pathParts = [], matches = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectForbiddenPriceInputs(child, [...pathParts, String(index)], matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (/^(?:priceAtDate|currentPrice|marketPrice|valuationAnchorPrice)$/i.test(key) && child != null) {
      matches.push(nextPath.join("."));
    }
    collectForbiddenPriceInputs(child, nextPath, matches);
  }
  return matches;
}

function closeEnough(actual, expected, tolerance = 1e-7) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected));
}

function inspectModels(db) {
  const rows = modelRows(db);
  const failures = [];
  let dcfRows = 0;
  let maxTerminalValueShare = 0;
  let minDcfSpread = Infinity;
  let sourceDateChecks = 0;
  let metricSourceDateChecks = 0;
  let priceInputChecks = 0;
  let fcfCapChecks = 0;
  let profileMethodChecks = 0;

  for (const row of rows) {
    const input = row.input;
    const output = row.output;
    const fairValue = finite(output.fairValue);
    const semantics = input.valuationSemantics || output.dataSnapshot?.valuationSemantics || {};
    const scoreInputs = semantics.scoreInputs || {};
    const dcf = scoreInputs.equityDcf || null;
    const sharesM = finite(scoreInputs.sharesM);
    const profile = String(scoreInputs.profile || "");
    const methodOutputKeys = new Set((output.methodOutputs || []).map((entry) => entry?.key).filter(Boolean));
    const forbiddenPriceInputs = collectForbiddenPriceInputs(input);

    if (!(fairValue > 0)) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "invalid_fair_value" });
    if (!(sharesM > 0)) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "invalid_share_count", sharesM });
    if (row.financial_available_at > row.as_of_date) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_financial" });
    if (row.guidance_max_observed_at && row.guidance_max_observed_at > row.as_of_date) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_guidance" });
    }
    if (semantics.priceExcludedFromFairValue !== true) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "price_not_excluded" });
    }
    priceInputChecks += 1;
    if (forbiddenPriceInputs.length) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "market_price_in_model_input", paths: forbiddenPriceInputs });
    }
    let rowFinancialSourceDateChecks = 0;
    for (const [recordType, sourceRecord] of Object.entries({
      base: input.sourceRecord || {},
      trailing_twelve_months: input.trailingTwelveMonthsSourceRecord || {}
    })) {
      for (const [field, filed] of Object.entries({
        datekey: sourceRecord.datekey,
        eventDate: sourceRecord.eventDate,
        filedAt: sourceRecord.filedAt
      })) {
        if (!filed) continue;
        sourceDateChecks += 1;
        rowFinancialSourceDateChecks += 1;
        if (filed > row.as_of_date) {
          failures.push({
            ticker: row.ticker,
            period: row.fiscal_period,
            code: "future_financial_source",
            recordType,
            field,
            filed
          });
        }
        if (filed > row.financial_available_at) {
          failures.push({
            ticker: row.ticker,
            period: row.fiscal_period,
            code: "financial_source_after_recorded_availability",
            recordType,
            field,
            filed,
            financialAvailableAt: row.financial_available_at
          });
        }
      }
    }
    if (rowFinancialSourceDateChecks === 0) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "missing_financial_source_date" });
    }
    for (const [metric, source] of Object.entries(output.dataSnapshot?.secCompanyFacts?.sourceTags || {})) {
      const filed = source?.filed;
      if (!filed) continue;
      sourceDateChecks += 1;
      metricSourceDateChecks += 1;
      if (filed > row.as_of_date) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_metric_source", metric, filed });
      }
      if (filed > row.financial_available_at) {
        failures.push({
          ticker: row.ticker,
          period: row.fiscal_period,
          code: "metric_source_after_recorded_availability",
          metric,
          filed,
          financialAvailableAt: row.financial_available_at
        });
      }
    }
    for (const evidence of input.guidance?.evidence || []) {
      const observedAt = evidence?.observedAt;
      if (!observedAt) continue;
      sourceDateChecks += 1;
      if (observedAt > row.as_of_date) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_guidance_evidence", observedAt });
      }
    }
    for (const conversion of input.guidance?.fxConversions || []) {
      for (const field of ["sourceRateDate", "targetRateDate"]) {
        const rateDate = conversion?.[field];
        if (!rateDate) continue;
        sourceDateChecks += 1;
        if (rateDate > row.as_of_date) {
          failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "future_fx_rate", field, rateDate });
        }
      }
    }
    const rawFcf = finite(scoreInputs.rawValuationFreeCashFlow);
    const valuationFcf = finite(scoreInputs.valuationFreeCashFlow);
    const valuationRevenue = finite(scoreInputs.valuationRevenue ?? scoreInputs.ttmRevenue);
    const valuationFcfCapMargin = finite(scoreInputs.valuationFreeCashFlowCapMargin);
    if (rawFcf != null || valuationFcf != null) {
      fcfCapChecks += 1;
      if (rawFcf != null && valuationFcf != null && valuationFcf > Math.max(0, rawFcf) + 1e-7) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "fcf_cap_increased_input", rawFcf, valuationFcf });
      }
      if (!(valuationFcfCapMargin >= 0.08 && valuationFcfCapMargin <= 0.650001)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "missing_or_invalid_fcf_sustainability_cap", valuationFcfCapMargin });
      }
      if (valuationFcf > 0 && valuationRevenue > 0 && valuationFcf / valuationRevenue > valuationFcfCapMargin + 1e-7) {
        failures.push({
          ticker: row.ticker,
          period: row.fiscal_period,
          code: "fcf_margin_above_sustainability_cap",
          fcfMargin: valuationFcf / valuationRevenue,
          valuationFcfCapMargin
        });
      }
    }
    const burdenPct = finite(scoreInputs.belowOperatingIncomeBurden);
    if (burdenPct != null && !(burdenPct >= 0 && burdenPct <= 25.000001)) {
      failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "below_operating_burden_out_of_bounds", burdenPct });
    }
    if (["asset_manager", "insurance_broker"].includes(profile)) {
      profileMethodChecks += 1;
      if (dcf || methodOutputKeys.has("fcfe-dcf") || methodOutputKeys.has("roe-implied-book-value")) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "customer_cash_flow_or_book_value_method_used", profile });
      }
      if (!(finite(scoreInputs.normalizedEps) > 0) || !methodOutputKeys.has("through-cycle-eps")) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "missing_through_cycle_eps_method", profile });
      }
    }
    if (["bank", "insurance", "card_network_lender", "credit_services", "capital_markets"].includes(profile)) {
      profileMethodChecks += 1;
      if (dcf || methodOutputKeys.has("fcfe-dcf")) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "financial_customer_cash_flow_used_in_dcf", profile });
      }
    }
    if (dcf) {
      dcfRows += 1;
      const discountRate = finite(dcf.discountRate);
      const terminalGrowth = finite(dcf.terminalGrowth);
      const terminalValueShare = finite(dcf.terminalValueShare);
      const presentValueM = finite(dcf.presentValueM);
      const terminalValueM = finite(dcf.terminalValueM);
      const terminalPresentValueM = finite(dcf.terminalPresentValueM);
      const dcfFairValue = finite(dcf.fairValue);
      const cycleHaircut = finite(semantics.scoreInputs?.cycleHaircut) ?? 1;
      const annualCashFlows = Array.isArray(dcf.annualCashFlows) ? dcf.annualCashFlows : [];
      if (!(discountRate > terminalGrowth)) failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "invalid_dcf_spread" });
      if (!(discountRate >= 0.085 && discountRate <= 0.18)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "discount_rate_out_of_bounds", discountRate });
      }
      if (!(terminalGrowth >= 0.01 && terminalGrowth <= 0.04)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "terminal_growth_out_of_bounds", terminalGrowth });
      }
      if (!(terminalValueShare > 0 && terminalValueShare < 0.9)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "terminal_value_concentration", terminalValueShare });
      }
      if (annualCashFlows.length !== 5) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "invalid_dcf_horizon", years: annualCashFlows.length });
      }
      for (const cashFlow of annualCashFlows) {
        const year = finite(cashFlow.year);
        const fcfM = finite(cashFlow.fcfM);
        const cashFlowPresentValueM = finite(cashFlow.presentValueM);
        const expectedPresentValueM = fcfM != null && year != null && discountRate != null
          ? fcfM / (1 + discountRate) ** year
          : null;
        if (!closeEnough(cashFlowPresentValueM, expectedPresentValueM)) {
          failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "dcf_cash_flow_math", year });
        }
      }
      const finalFcfM = finite(annualCashFlows.at(-1)?.fcfM);
      const expectedTerminalValueM = finalFcfM != null && discountRate != null && terminalGrowth != null
        ? finalFcfM * (1 + terminalGrowth) / (discountRate - terminalGrowth)
        : null;
      const expectedTerminalPresentValueM = expectedTerminalValueM != null && discountRate != null
        ? expectedTerminalValueM / (1 + discountRate) ** 5
        : null;
      const expectedPresentValueM = annualCashFlows.reduce((sum, cashFlow) => sum + (finite(cashFlow.presentValueM) || 0), 0) + (terminalPresentValueM || 0);
      const expectedDcfFairValue = presentValueM != null && sharesM != null ? presentValueM / sharesM * cycleHaircut : null;
      if (!closeEnough(terminalValueM, expectedTerminalValueM)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "dcf_terminal_value_math" });
      }
      if (!closeEnough(terminalPresentValueM, expectedTerminalPresentValueM)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "dcf_terminal_discount_math" });
      }
      if (!closeEnough(presentValueM, expectedPresentValueM)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "dcf_present_value_math" });
      }
      if (!closeEnough(dcfFairValue, expectedDcfFairValue)) {
        failures.push({ ticker: row.ticker, period: row.fiscal_period, code: "dcf_per_share_math" });
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
    minDcfSpread: Number.isFinite(minDcfSpread) ? minDcfSpread : null,
    sourceDateChecks,
    metricSourceDateChecks,
    priceInputChecks,
    fcfCapChecks,
    profileMethodChecks
  };
}

function inspectTemporalContinuity(db) {
  const byTicker = new Map();
  for (const row of modelRows(db)) {
    byTicker.set(row.ticker, [...(byTicker.get(row.ticker) || []), row]);
  }
  const changes = [];
  const metricNames = [
    "ttmRevenue",
    "ttmNetIncome",
    "normalizedNetIncome",
    "marginBasedNetIncome",
    "rawValuationFreeCashFlow",
    "valuationFreeCashFlow",
    "normalizedFreeCashFlow",
    "cycleFreeCashFlow",
    "normalizedEps",
    "cycleEps",
    "equityM",
    "cashM",
    "debtM",
    "cryptoFairValueM",
    "treasuryValueM",
    "softwareValueM"
  ];

  for (const [ticker, rows] of byTicker) {
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      const previousFairValue = finite(previous.output.fairValue);
      const currentFairValue = finite(current.output.fairValue);
      if (!(previousFairValue > 0) || !(currentFairValue > 0)) continue;
      const fairValueRatio = ratioMagnitude(previousFairValue, currentFairValue);
      if (!(fairValueRatio >= 4) || Math.abs(currentFairValue - previousFairValue) < 5 || Math.max(previousFairValue, currentFairValue) < 10) {
        continue;
      }

      const previousScore = previous.input.valuationSemantics?.scoreInputs || {};
      const currentScore = current.input.valuationSemantics?.scoreInputs || {};
      const reasons = [];
      const reportingGapDays = daysBetween(previous.as_of_date, current.as_of_date);
      if (reportingGapDays > 550) reasons.push("reporting_gap_over_550_days");
      if (previousScore.profile !== currentScore.profile) reasons.push("valuation_profile_changed");
      if (previous.output.method !== current.output.method) reasons.push("valuation_method_changed");

      const usableComponents = (row) => (row.output.methodOutputs || [])
        .filter((entry) => finite(entry?.value) > 0)
        .map((entry) => entry.key)
        .sort();
      if (JSON.stringify(usableComponents(previous)) !== JSON.stringify(usableComponents(current))) {
        reasons.push("positive_method_component_availability_changed");
      }

      const previousShares = finite(previousScore.sharesM);
      const currentShares = finite(currentScore.sharesM);
      if ((ratioMagnitude(previousShares, currentShares) || 0) >= 1.5) reasons.push("share_basis_changed");
      const splitWarnings = [...(previous.output.warnings || []), ...(current.output.warnings || [])]
        .some((warning) => /split|share-basis/i.test(String(warning)));
      if (splitWarnings) reasons.push("explicit_split_basis_adjustment");

      for (const metric of metricNames) {
        const left = previousScore[metric];
        const right = currentScore[metric];
        if (signChanged(left, right)) reasons.push(`${metric}_sign_changed`);
        const threshold = metric === "ttmRevenue" ? 2 : 3;
        if ((ratioMagnitude(left, right) || 0) >= threshold) reasons.push(`${metric}_scale_changed`);
      }

      const previousCycleSamples = finite(previousScore.cycleSampleCount);
      const currentCycleSamples = finite(currentScore.cycleSampleCount);
      if ((previousCycleSamples != null && previousCycleSamples < 4) || (currentCycleSamples != null && currentCycleSamples < 4)) {
        reasons.push("sparse_through_cycle_history");
      }
      if (previousCycleSamples != null && currentCycleSamples != null && Math.abs(currentCycleSamples - previousCycleSamples) >= 3) {
        reasons.push("through_cycle_sample_set_changed");
      }
      for (const metric of ["normalizedMargin", "operatingMargin", "cycleOperatingMargin", "cycleNetMargin", "cycleFcfMargin"]) {
        const left = finite(previousScore[metric]);
        const right = finite(currentScore[metric]);
        if (left != null && right != null && Math.abs(right - left) >= 10) reasons.push(`${metric}_shifted_10pp`);
      }
      for (const metric of ["targetPE", "targetPB", "evSalesMultiple", "targetFCFYield"]) {
        if ((ratioMagnitude(previousScore[metric], currentScore[metric]) || 0) >= 1.75) reasons.push(`${metric}_changed_materially`);
      }

      const previousGuidanceCount = finite(previous.output.dataSnapshot?.guidanceCandidateCount) || 0;
      const currentGuidanceCount = finite(current.output.dataSnapshot?.guidanceCandidateCount) || 0;
      if ((previousGuidanceCount === 0) !== (currentGuidanceCount === 0)) reasons.push("guidance_availability_changed");
      if (previous.input.sourceRecord?.dimension !== current.input.sourceRecord?.dimension) reasons.push("financial_source_dimension_changed");
      if (previous.output.dataSnapshot?.annualizedFromSinglePeriod !== current.output.dataSnapshot?.annualizedFromSinglePeriod) {
        reasons.push("annualization_basis_changed");
      }

      changes.push({
        ticker,
        fromPeriod: previous.fiscal_period,
        toPeriod: current.fiscal_period,
        fromAsOfDate: previous.as_of_date,
        toAsOfDate: current.as_of_date,
        fromFairValue: previousFairValue,
        toFairValue: currentFairValue,
        fairValueRatio,
        reportingGapDays,
        reasons: [...new Set(reasons)].sort()
      });
    }
  }

  return {
    materialChanges: changes.length,
    affectedTickers: new Set(changes.map((change) => change.ticker)).size,
    unexplained: changes.filter((change) => change.reasons.length === 0),
    changes
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
  const universeManifest = inspectUniverseManifest();
  assert.equal(universeManifest.securityCount, 503);
  assert.equal(universeManifest.companyCount, 500);
  assert.equal(universeManifest.uniqueTickerCount, 500);
  assert.equal(universeManifest.uniqueCikCount, 500);
  assert.equal(universeManifest.shareClassCount, 503);
  const sp500PriceCoverage = inspectSp500PriceCoverage(first);
  assert.deepEqual(sp500PriceCoverage.failures, []);
  assert.equal(sp500PriceCoverage.positiveLatestPrices, universeManifest.companyCount);
  assert.equal(sp500PriceCoverage.nonPositiveStoredPoints, 0);
  const expectedTickers = expectedTickerSet(baseline);
  const firstSnapshots = snapshotRows(first);
  const secondSnapshots = snapshotRows(second);
  const firstTickerSet = new Set(firstSnapshots.map((row) => row.ticker));
  const secondTickerSet = new Set(secondSnapshots.map((row) => row.ticker));
  assert.equal(firstCounts.valuation_ticker_snapshots, expectedTickers.size);
  assert.deepEqual([...firstTickerSet].sort(), [...expectedTickers].sort());
  assert.deepEqual([...secondTickerSet].sort(), [...expectedTickers].sort());
  const trackedPriceCoverage = inspectTrackedPriceCoverage(first, expectedTickers);
  assert.deepEqual(trackedPriceCoverage.failures, []);
  const releasePathAudit = inspectReleasePathLeaks(first);
  assert.deepEqual(releasePathAudit.failures, []);

  const notApplicableTickers = firstSnapshots
    .filter((row) => row.payload?.dataQuality?.valuationStatus === "not_applicable")
    .map((row) => row.ticker);
  const modelCounts = new Map(first.prepare(`
    SELECT ticker, COUNT(*) AS count
    FROM valuation_pit_model_runs
    GROUP BY ticker
  `).all().map((row) => [String(row.ticker).toUpperCase(), Number(row.count)]));
  for (const ticker of expectedTickers) {
    if (notApplicableTickers.includes(ticker)) continue;
    assert.ok((modelCounts.get(ticker) || 0) > 0, `No historical valuation nodes for ${ticker}`);
  }
  assert.ok(firstCounts.valuation_pit_model_runs >= expectedTickers.size - notApplicableTickers.length);

  const metadata = sourceMetadata(first);
  const financialCoverage = JSON.parse(metadata.financial_coverage_summary || "{}");
  const guidanceCoverage = JSON.parse(metadata.guidance_coverage_summary || "{}");
  const noQuantifiedGuidance = JSON.parse(metadata.guidance_no_quantified_tickers || "[]");
  assert.deepEqual(financialCoverage, { annual_only: 2, covered: 530, derived: 1 });
  assert.deepEqual(guidanceCoverage, {
    covered: 518,
    covered_official_filing: 8,
    no_quantified_official_guidance: 6
  });
  assert.equal(Number(metadata.guidance_coverage_ticker_count), expectedTickers.size - notApplicableTickers.length);
  assert.deepEqual(noQuantifiedGuidance, ["BRK.B", "DGE.L", "ERIE", "FER", "NVR", "PGR"]);
  assert.match(metadata.source_fingerprint || "", /^[a-f0-9]{64}$/);
  assert.ok(String(metadata.source || "").includes("Sharadar"));
  assert.ok(String(metadata.revision_policy || "").includes("earliest datekey"));
  assert.ok(String(metadata.paid_api_latest_financial_available_at || "") >= universeManifest.asOf);
  const modelVersions = first.prepare("SELECT DISTINCT model_version FROM valuation_pit_model_runs ORDER BY model_version").all();
  assert.deepEqual(modelVersions.map((row) => row.model_version), [metadata.model_version]);

  const financialCoverageStats = first.prepare(`
    SELECT COUNT(*) AS rows, COUNT(DISTINCT ticker) AS tickers,
           MIN(available_at) AS first_available_at, MAX(available_at) AS latest_available_at
    FROM valuation_pit_financials
  `).get();
  assert.equal(Number(financialCoverageStats.tickers), expectedTickers.size - notApplicableTickers.length);
  assert.ok(Number(financialCoverageStats.rows) > 60_000);
  assert.ok(String(financialCoverageStats.latest_available_at) >= universeManifest.asOf);
  const guidanceStats = first.prepare(`
    SELECT COUNT(*) AS events, COUNT(DISTINCT ticker) AS tickers,
           COUNT(DISTINCT ticker || '::' || fiscal_period) AS periods,
           MIN(observed_at) AS first_observed_at, MAX(observed_at) AS latest_observed_at
    FROM valuation_pit_guidance
  `).get();
  assert.equal(Number(guidanceStats.tickers), expectedTickers.size - notApplicableTickers.length - noQuantifiedGuidance.length);
  assert.ok(Number(guidanceStats.events) > 60_000);
  assert.ok(Number(guidanceStats.periods) > 13_000);

  const firstModelSignature = modelSignature(first);
  const secondModelSignature = modelSignature(second);
  const firstSnapshotSignature = snapshotSignature(first);
  const secondSnapshotSignature = snapshotSignature(second);
  assert.equal(firstModelSignature, secondModelSignature);
  assert.equal(firstSnapshotSignature, secondSnapshotSignature);

  const modelAudit = inspectModels(first);
  assert.deepEqual(modelAudit.failures, []);
  assert.ok(modelAudit.sourceDateChecks >= modelAudit.rows, "Every valuation node must audit at least one PIT source date");
  const temporalAudit = inspectTemporalContinuity(first);
  assert.deepEqual(temporalAudit.unexplained, []);
  const unmodeledPeriodAudit = inspectUnmodeledFinancialPeriods(first);
  assert.deepEqual(unmodeledPeriodAudit.unexpected, []);
  assert.equal(
    unmodeledPeriodAudit.selectedFinancialPeriods,
    unmodeledPeriodAudit.modeledPeriods + unmodeledPeriodAudit.explicitlyUnmodeledPeriods
  );

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
      minDcfSpread: modelAudit.minDcfSpread,
      sourceDateChecks: modelAudit.sourceDateChecks,
      metricSourceDateChecks: modelAudit.metricSourceDateChecks,
      priceInputChecks: modelAudit.priceInputChecks,
      fcfCapChecks: modelAudit.fcfCapChecks,
      profileMethodChecks: modelAudit.profileMethodChecks
    },
    universe: {
      ...universeManifest,
      expectedTickers: expectedTickers.size,
      modeledTickers: modelCounts.size,
      notApplicableTickers,
      priceCoverage: sp500PriceCoverage,
      trackedPriceCoverage
    },
    sourceCoverage: {
      metadata,
      financial: financialCoverageStats,
      guidance: guidanceStats
    },
    releasePathAudit,
    temporalAudit,
    unmodeledPeriodAudit,
    focusTickers: ["PLTR", "CHTR", "GOOGL", "MSFT", "NVDA", "AON", "APO", "IBKR", "AZN", "LSEG"]
      .map((ticker) => latestTicker(first, ticker))
  }, null, 2));
} finally {
  baseline.close();
  first.close();
  second.close();
}
