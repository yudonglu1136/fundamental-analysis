import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  attachMstrCryptoMetrics,
  buildValuationRows,
  compactTicker,
  digestGuidanceMetrics,
  hasExplicitValuationProfile,
  profileSettings,
  readPriceHistoryFromDb,
  updateTickerSnapshot
} from "./importSecQuarterlyValuations.js";

const TARGET_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const SOURCE_DB_PATH = process.env.PIT_VALUATION_SOURCE_PATH || path.join(process.cwd(), "server/data/valuation-pit-source.sqlite");
const MODEL_VERSION = process.env.PIT_VALUATION_MODEL_VERSION || "pit-valuation-v14-growth-guidance-2026-08-29";
const SEC_FACTS_CACHE_DIR = process.env.SEC_FACTS_CACHE_DIR || path.join(process.cwd(), "server/data/sec-companyfacts");
const PIT_SOURCE_LABEL = "valuation-pit-source";
const PIT_GUIDANCE_LABEL = "valuation-pit-guidance";
const APPLY = process.argv.includes("--apply");
const ALLOW_INCOMPLETE = process.argv.includes("--allow-incomplete");

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function margin(numerator, denominator) {
  return numerator != null && denominator ? numerator / denominator * 100 : null;
}

function maxDate(...dates) {
  return dates.filter(Boolean).sort().at(-1) || null;
}

function sanitizeReleasePayload(value, key = "") {
  if (Array.isArray(value)) return value.map((child) => sanitizeReleasePayload(child, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitizeReleasePayload(child, childKey)])
    );
  }
  if (
    typeof value === "string" &&
    /(path|file|database|root)$/i.test(key) &&
    path.isAbsolute(value)
  ) {
    return `source-artifact://${path.basename(value)}`;
  }
  return value;
}

function normalizePeriod(period) {
  const value = String(period || "").trim().toUpperCase().replace(/\s+/g, "");
  const leadingQuarter = value.match(/^Q([1-4])(?:FY)?(20\d{2})$/);
  if (leadingQuarter) return `Q${leadingQuarter[1]}${leadingQuarter[2]}`;
  const trailingQuarter = value.match(/^(20\d{2})-?Q([1-4])$/);
  if (trailingQuarter) return `Q${trailingQuarter[2]}${trailingQuarter[1]}`;
  return value;
}

function cleanSnapshot(snapshot) {
  const inferredCik = snapshot.cik ||
    snapshot.dataQuality?.secCompanyFacts?.cik ||
    [...(snapshot.history || [])].reverse().find((row) => row?.dataSnapshot?.secCompanyFacts?.cik)
      ?.dataSnapshot?.secCompanyFacts?.cik ||
    null;
  return {
    ticker: snapshot.ticker,
    key: snapshot.key,
    name: snapshot.name,
    sector: snapshot.sector,
    industry: snapshot.industry,
    currency: snapshot.currency,
    description: snapshot.description,
    cik: inferredCik,
    cusip: snapshot.cusip,
    aliases: Array.isArray(snapshot.aliases) ? snapshot.aliases : [],
    valuationProfile: hasExplicitValuationProfile(snapshot.ticker)
      ? profileSettings(snapshot.ticker).profile
      : snapshot.valuationProfile,
    sp500MembershipAsOf: snapshot.sp500MembershipAsOf,
    priceHistory: Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [],
    priceSource: snapshot.priceSource,
    latest: {
      latestPrice: snapshot.latest?.latestPrice ?? null,
      latestPriceDate: snapshot.latest?.latestPriceDate ?? null,
      latestPriceSource: snapshot.latest?.latestPriceSource ?? null
    },
    dataQuality: {
      pricePoints: snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0,
      hasLivePriceSeries: Boolean(snapshot.priceHistory?.length)
    }
  };
}

function compactPriceHistory(points, maxPoints = 1800) {
  const sorted = [...(Array.isArray(points) ? points : [])]
    .filter((point) => point?.date && finiteNumber(point.close) > 0)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  if (sorted.length <= maxPoints) return sorted;
  const recentCount = Math.min(260, Math.floor(maxPoints / 3));
  const recent = sorted.slice(-recentCount);
  const older = sorted.slice(0, -recentCount);
  const olderBudget = maxPoints - recent.length;
  const sampled = [];
  for (let index = 0; index < olderBudget; index += 1) {
    const sourceIndex = Math.min(
      older.length - 1,
      Math.floor(index * (older.length - 1) / Math.max(1, olderBudget - 1))
    );
    const point = older[sourceIndex];
    if (!sampled.length || sampled.at(-1).date !== point.date) sampled.push(point);
  }
  return [...sampled, ...recent];
}

function compactSnapshotPriceHistory(snapshot) {
  const validHistory = (Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [])
    .filter((point) => point?.date && finiteNumber(point.close) > 0);
  const fullCount = validHistory.length;
  const priceHistory = compactPriceHistory(validHistory);
  return {
    ...snapshot,
    priceHistory,
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints: fullCount,
      storedPricePoints: priceHistory.length,
      priceStoragePolicy: "stratified history plus latest 260 daily observations"
    }
  };
}

function ensurePitTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS valuation_pit_source_metadata (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS valuation_pit_financials (
      ticker TEXT NOT NULL, source_ticker TEXT NOT NULL, fiscal_period TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL, fiscal_quarter TEXT NOT NULL, dimension TEXT NOT NULL,
      available_at TEXT NOT NULL, report_period TEXT, currency TEXT NOT NULL,
      payload_json TEXT NOT NULL, imported_at TEXT NOT NULL,
      PRIMARY KEY (ticker, fiscal_period, dimension)
    );
    CREATE INDEX IF NOT EXISTS idx_valuation_pit_financials_ticker_available
      ON valuation_pit_financials (ticker, available_at);
    CREATE TABLE IF NOT EXISTS valuation_pit_guidance (
      source_database TEXT NOT NULL, source_id TEXT NOT NULL, ticker TEXT NOT NULL,
      fiscal_period TEXT, observed_at TEXT, metric_name TEXT, amount REAL, unit TEXT,
      currency TEXT, growth_yoy REAL, growth_qoq REAL, margin_pct REAL, value_text TEXT,
      quality_status TEXT, confidence REAL, speaker TEXT, source_url TEXT,
      evidence_excerpt TEXT, payload_json TEXT NOT NULL, imported_at TEXT NOT NULL,
      PRIMARY KEY (source_database, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_valuation_pit_guidance_ticker_period
      ON valuation_pit_guidance (ticker, fiscal_period, observed_at);
    CREATE TABLE IF NOT EXISTS valuation_pit_model_runs (
      ticker TEXT NOT NULL, fiscal_period TEXT NOT NULL, model_version TEXT NOT NULL,
      as_of_date TEXT NOT NULL, financial_available_at TEXT NOT NULL,
      guidance_max_observed_at TEXT, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      PRIMARY KEY (ticker, fiscal_period, model_version)
    );
    CREATE INDEX IF NOT EXISTS idx_valuation_pit_model_runs_ticker_asof
      ON valuation_pit_model_runs (ticker, as_of_date);
  `);
}

function buildQuarterlyRows(sourceRows, guidanceByPeriod, ticker, sourceTicker) {
  const parsed = sourceRows.map((row) => parseJson(row.payload_json, {}));
  const hasCoreFinancials = (row) =>
    row.revenue_m != null || row.net_income_m != null || row.cfo_m != null;
  const rowsByPeriod = new Map();
  for (const row of parsed) {
    const key = `${row.fiscalYear}::${row.fiscalQuarter}`;
    rowsByPeriod.set(key, [...(rowsByPeriod.get(key) || []), row]);
  }
  const selected = [...rowsByPeriod.values()]
    .map((candidates) => {
      const arq = candidates.find((row) => row.sourceDimension === "ARQ" && hasCoreFinancials(row));
      const art = candidates.find((row) => row.sourceDimension === "ART" && hasCoreFinancials(row));
      const base = arq || art;
      if (!base) return null;
      return {
        ...base,
        pitTrailingTwelveMonths: art || null,
        trailingTwelveMonthsSourceRecord: art?.sourceRecord || null,
        trailingTwelveMonthsAvailableAt: art?.asOfDate || null
      };
    })
    .filter(Boolean);
  const byPeriod = new Map(selected.map((row) => [`${row.fiscalYear}::${row.fiscalQuarter}`, row]));
  return selected
    .map((row) => {
      const prior = byPeriod.get(`${row.fiscalYear - 1}::${row.fiscalQuarter}`);
      const guidanceKey = `${ticker}::Q${String(row.fiscalQuarter).replace("Q", "")}${row.fiscalYear}`;
      const sourceGuidanceKey = `${sourceTicker}::Q${String(row.fiscalQuarter).replace("Q", "")}${row.fiscalYear}`;
      const guidance = guidanceByPeriod.get(guidanceKey) || guidanceByPeriod.get(sourceGuidanceKey) || null;
      const financialAvailableAt = maxDate(row.asOfDate, row.trailingTwelveMonthsAvailableAt);
      const asOfDate = maxDate(financialAvailableAt, guidance?.maxObservedAt);
      return {
        ...row,
        asOfDate,
        financialAvailableAt,
        revenue_growth_pct: row.revenue_m != null && prior?.revenue_m
          ? (row.revenue_m / prior.revenue_m - 1) * 100
          : null,
        gross_margin_pct: margin(row.gross_profit_m, row.revenue_m),
        operating_margin_pct: margin(row.operating_income_m, row.revenue_m),
        fcf_after_capex_m: row.cfo_m != null && row.capex_m != null
          ? row.cfo_m - row.capex_m
          : row.fcf_after_capex_m
      };
    })
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
}

function attachPointInTimeSupplements(ticker, rows, existingSnapshot) {
  if (ticker !== "MSTR") return rows;
  const historicalCik = [...(existingSnapshot?.history || [])].reverse()
    .find((row) => row?.dataSnapshot?.secCompanyFacts?.cik)
    ?.dataSnapshot?.secCompanyFacts?.cik;
  const cik = String(
    existingSnapshot?.cik || existingSnapshot?.dataQuality?.secCompanyFacts?.cik || historicalCik || ""
  )
    .replace(/\D/g, "")
    .padStart(10, "0");
  const cachePath = path.join(SEC_FACTS_CACHE_DIR, `${cik}.json`);
  if (!cik || !fs.existsSync(cachePath)) return rows;
  const payload = parseJson(fs.readFileSync(cachePath, "utf8"), {});
  return attachMstrCryptoMetrics(payload?.facts || {}, rows, { pointInTime: true }).map((row) => {
    const supplementalDates = Object.values(row.sources || {}).map((source) => source?.filed).filter(Boolean);
    return {
      ...row,
      asOfDate: maxDate(row.asOfDate, ...supplementalDates),
      financialAvailableAt: maxDate(row.financialAvailableAt, ...supplementalDates),
      sourceRecord: {
        ...(row.sourceRecord || {}),
        supplementalSource: "SEC CompanyFacts crypto-asset disclosures only",
        supplementalCachePath: `sec-companyfacts-cache/${path.basename(cachePath)}`,
        supplementalPitPolicy: "earliest filing date per fiscal period"
      }
    };
  });
}

function readPitGuidance(source, tickers) {
  const placeholders = tickers.map(() => "?").join(",");
  if (!placeholders) return { rows: [], byPeriod: new Map() };
  const rows = source.prepare(`
    SELECT *
    FROM pit_guidance_events
    WHERE ticker IN (${placeholders})
      AND actual_or_guidance = 'guidance'
      AND fiscal_period IS NOT NULL
      AND quality_status IN ('clear', 'ambiguous')
    ORDER BY ticker, fiscal_period, observed_at, id
  `).all(...tickers);
  const targetCurrencies = new Map(source.prepare(`
    SELECT ticker, MAX(currency) AS currency
    FROM pit_financial_periods
    WHERE ticker IN (${placeholders})
    GROUP BY ticker
  `).all(...tickers).map((row) => [String(row.ticker).toUpperCase(), String(row.currency).toUpperCase()]));
  const hasFxRates = Boolean(source.prepare(`
    SELECT 1 AS present FROM sqlite_master
    WHERE type='table' AND name='pit_fx_reference_rates'
  `).get());
  const fxRates = new Map();
  if (hasFxRates) {
    for (const row of source.prepare(`
      SELECT currency, rate_date, units_per_eur, source_url
      FROM pit_fx_reference_rates
      ORDER BY currency, rate_date
    `).all()) {
      const currency = String(row.currency).toUpperCase();
      fxRates.set(currency, [...(fxRates.get(currency) || []), row]);
    }
  }
  const rateAtOrBefore = (currency, observedAt) => {
    if (currency === "EUR") return { rate_date: observedAt, units_per_eur: 1, source_url: "ECB EUR reference base" };
    const candidates = fxRates.get(currency) || [];
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      if (String(candidates[index].rate_date) <= String(observedAt)) return candidates[index];
    }
    return null;
  };
  const grouped = new Map();
  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase();
    const fiscalPeriod = normalizePeriod(row.fiscal_period);
    if (!ticker || !fiscalPeriod) continue;
    const key = `${ticker}::${fiscalPeriod}`;
    const targetCurrency = targetCurrencies.get(ticker) || null;
    const sourceCurrency = String(row.currency || "").toUpperCase() || null;
    let modelAmountM = finiteNumber(row.amount);
    let fxConversion = null;
    if (modelAmountM != null && sourceCurrency && targetCurrency && sourceCurrency !== targetCurrency) {
      const sourceRate = rateAtOrBefore(sourceCurrency, row.observed_at);
      const targetRate = rateAtOrBefore(targetCurrency, row.observed_at);
      if (sourceRate && targetRate) {
        const conversionRate = Number(targetRate.units_per_eur) / Number(sourceRate.units_per_eur);
        modelAmountM *= conversionRate;
        fxConversion = {
          sourceCurrency,
          targetCurrency,
          sourceAmountM: Number(row.amount),
          modelAmountM,
          conversionRate,
          sourceRateDate: sourceRate.rate_date,
          targetRateDate: targetRate.rate_date,
          source: targetRate.source_url || sourceRate.source_url
        };
      } else {
        modelAmountM = null;
      }
    }
    grouped.set(key, [...(grouped.get(key) || []), {
      ...row,
      model_amount_m: modelAmountM,
      model_currency: targetCurrency,
      fx_conversion: fxConversion,
      evidence_id: row.id,
      evidence_url: row.source_url,
      excerpt: row.evidence_excerpt
    }]);
  }
  const byPeriod = new Map();
  for (const [key, metrics] of grouped) {
    byPeriod.set(key, digestGuidanceMetrics(metrics, { sourceDatabase: PIT_GUIDANCE_LABEL }));
  }
  return { rows, byPeriod };
}

function insertRawGuidance(db, rows, importedAt) {
  const insert = db.prepare(`
    INSERT INTO valuation_pit_guidance (
      source_database, source_id, ticker, fiscal_period, observed_at, metric_name,
      amount, unit, currency, growth_yoy, growth_qoq, margin_pct, value_text,
      quality_status, confidence, speaker, source_url, evidence_excerpt,
      payload_json, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    const releasePayload = sanitizeReleasePayload({
      ...row,
      payload_json: parseJson(row.payload_json, row.payload_json)
    });
    insert.run(
      row.source_type || "pit_management_guidance",
      String(row.id),
      String(row.ticker || "").toUpperCase(),
      normalizePeriod(row.fiscal_period),
      row.observed_at || null,
      row.metric_name || null,
      finiteNumber(row.amount),
      row.unit || null,
      row.currency || null,
      finiteNumber(row.growth_yoy),
      finiteNumber(row.growth_qoq),
      finiteNumber(row.margin_pct),
      row.value_text || null,
      row.quality_status || null,
      finiteNumber(row.extraction_confidence),
      row.speaker || null,
      row.source_url || null,
      row.evidence_excerpt || null,
      JSON.stringify(releasePayload),
      importedAt
    );
  }
}

function updateDashboard(db, previousDashboard, snapshots, generatedAt, sourceMetadata) {
  const compact = snapshots.map(compactTicker).sort((left, right) =>
    String(left.ticker || "").localeCompare(String(right.ticker || ""))
  );
  const summary = {
    ...(previousDashboard.summary || {}),
    tickerCount: snapshots.length,
    historyRows: snapshots.reduce((sum, ticker) => sum + (ticker.history?.length || 0), 0),
    pricePointCount: snapshots.reduce((sum, ticker) => sum + (ticker.priceHistory?.length || 0), 0),
    livePriceTickerCount: snapshots.filter((ticker) =>
      finiteNumber(ticker.latest?.latestPrice) > 0 &&
      (ticker.priceHistory || []).some((point) => finiteNumber(point?.close) > 0)
    ).length,
    positiveUpsideCount: snapshots.filter((ticker) => finiteNumber(ticker.latest?.upsideToBase) > 0).length,
    negativeUpsideCount: snapshots.filter((ticker) => finiteNumber(ticker.latest?.upsideToBase) < 0).length,
    pitFinancialTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.pitFinancialRows > 0).length,
    quarterlyBackendValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.pitValuationRows > 0).length,
    unsupportedValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.valuationStatus === "not_applicable").length,
    latestPriceDate: snapshots.map((ticker) => ticker.latest?.latestPriceDate).filter(Boolean).sort().at(-1) || null
  };
  const payload = {
    ...previousDashboard,
    generatedAt,
    source: {
      upstreamLabel: "Jansen Sharadar as-reported PIT financials + event-visible management guidance",
      modelVersion: MODEL_VERSION,
      sourceFingerprint: sourceMetadata.get("source_fingerprint") || null,
      pitCutoffField: "datekey",
      revisionPolicy: "earliest datekey per fiscal period; later restatements excluded",
      transcriptPolicy: "guidance only; transcript/Q&A retained separately"
    },
    summary,
    tickers: compact
  };
  db.prepare(`
    INSERT INTO valuation_snapshots (id, generated_at, payload_json)
    VALUES ('latest', ?, ?)
    ON CONFLICT(id) DO UPDATE SET generated_at = excluded.generated_at, payload_json = excluded.payload_json
  `).run(generatedAt, JSON.stringify(payload));
}

function main() {
  if (!fs.existsSync(SOURCE_DB_PATH)) throw new Error(`PIT valuation source not found: ${SOURCE_DB_PATH}`);
  if (!fs.existsSync(TARGET_DB_PATH)) throw new Error(`Target database not found: ${TARGET_DB_PATH}`);
  const source = new DatabaseSync(SOURCE_DB_PATH, { readOnly: true });
  const target = new DatabaseSync(TARGET_DB_PATH);
  try {
    ensurePitTables(target);
    const previousDashboard = parseJson(
      target.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = 'latest'").get()?.payload_json,
      {}
    );
    const currentSnapshots = new Map(
      target.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots").all()
        .map((row) => [String(row.ticker).toUpperCase(), parseJson(row.payload_json, {})])
    );
    const coverage = source.prepare("SELECT * FROM pit_financial_coverage ORDER BY ticker").all();
    const guidanceCoverage = source.prepare("SELECT * FROM pit_guidance_coverage ORDER BY ticker").all();
    const sourceMetadata = new Map(
      source.prepare("SELECT key, value FROM pit_source_metadata").all().map((row) => [row.key, row.value])
    );
    const countStatuses = (rows) => Object.fromEntries(
      [...rows.reduce((counts, row) => {
        const status = String(row.status || "unknown");
        counts.set(status, (counts.get(status) || 0) + 1);
        return counts;
      }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right))
    );
    sourceMetadata.set("financial_coverage_summary", JSON.stringify(countStatuses(coverage)));
    sourceMetadata.set("guidance_coverage_summary", JSON.stringify(countStatuses(guidanceCoverage)));
    sourceMetadata.set("guidance_coverage_ticker_count", String(guidanceCoverage.length));
    sourceMetadata.set("guidance_no_quantified_tickers", JSON.stringify(
      guidanceCoverage
        .filter((row) => row.status === "no_quantified_official_guidance")
        .map((row) => String(row.ticker).toUpperCase())
        .sort()
    ));
    const blockers = coverage.filter((row) => row.status === "missing" || row.status === "external_required");
    const modelTickers = coverage.filter((row) => ["covered", "annual_only"].includes(row.status));
    const acceptableGuidanceStatuses = new Set([
      "covered",
      "covered_official_filing",
      "no_quantified_official_guidance"
    ]);
    const modelTickerSet = new Set(modelTickers.map((row) => String(row.ticker).toUpperCase()));
    for (const row of guidanceCoverage) {
      const ticker = String(row.ticker || "").toUpperCase();
      if (modelTickerSet.has(ticker) && !acceptableGuidanceStatuses.has(row.status)) {
        blockers.push({
          ticker,
          status: `guidance_${row.status || "missing"}`,
          note: row.note || "Management guidance coverage has not passed the PIT evidence review."
        });
      }
    }
    const evidenceTickers = [...new Set(modelTickers.flatMap((row) => [row.ticker, row.source_ticker]).filter(Boolean))];
    const pitGuidance = readPitGuidance(source, evidenceTickers);
    const guidanceByPeriod = pitGuidance.byPeriod;
    const rawGuidance = pitGuidance.rows;
    const generatedAt = new Date().toISOString();
    const nextSnapshots = [];
    const modelRuns = [];
    const results = [];

    for (const coverageRow of modelTickers) {
      const ticker = String(coverageRow.ticker).toUpperCase();
      const sourceTicker = String(coverageRow.source_ticker || ticker).toUpperCase();
      if (!hasExplicitValuationProfile(ticker)) {
        blockers.push({ ticker, status: "missing_valuation_profile", note: "Covered PIT ticker has no explicit valuation profile." });
        continue;
      }
      const existing = currentSnapshots.get(ticker);
      if (!existing) {
        blockers.push({ ticker, status: "missing_target_snapshot", note: "No current ticker metadata or price history." });
        continue;
      }
      const sourceRows = source.prepare(`
        SELECT * FROM pit_financial_periods WHERE ticker = ? ORDER BY available_at, dimension
      `).all(ticker);
      const quarterlyRows = attachPointInTimeSupplements(
        ticker,
        buildQuarterlyRows(sourceRows, guidanceByPeriod, ticker, sourceTicker),
        existing
      );
      const existingPrices = Array.isArray(existing.priceHistory) ? existing.priceHistory : [];
      const databasePrices = ["AZN", "LSEG"].includes(ticker) || ticker.endsWith(".L")
        ? []
        : readPriceHistoryFromDb(target, ticker, 10_000);
      const snapshotBase = cleanSnapshot({
        ...existing,
        ticker,
        priceHistory: databasePrices.length > existingPrices.length ? databasePrices : existingPrices
      });
      const valuationRows = buildValuationRows({
        ticker,
        trinityTicker: sourceTicker,
        snapshot: snapshotBase,
        companyModel: { ticker: sourceTicker, company: existing.name, cik: existing.cik || null },
        factsUrl: `jansen-sharadar://fundamentals/${sourceTicker}`,
        quarterlyRows,
        youtubeByPeriod: guidanceByPeriod,
        financialSource: {
          sourceType: "jansen_pit_quarterly_model",
          annualSourceType: "jansen_pit_annual_model",
          sourceQuality: "jansen-sharadar-as-reported-quarterly",
          annualSourceQuality: "jansen-sharadar-as-reported-annual",
          sourceName: "Jansen Sharadar SF1 as-reported",
          eventType: "pit_quarterly_fundamental_guidance_model",
          periodIdPrefix: "jansen-pit",
          modelVersion: MODEL_VERSION
        }
      });
      if (!valuationRows.length) {
        blockers.push({
          ticker,
          sourceTicker,
          status: "zero_valuation_rows",
          financialRows: quarterlyRows.length,
          note: "PIT financials were available, but the valuation model produced no auditable historical node."
        });
        results.push({
          ticker,
          sourceTicker,
          financialRows: quarterlyRows.length,
          valuationRows: 0,
          guidancePeriods: 0
        });
        continue;
      }
      const youtubePeriods = valuationRows.filter((row) => row.dataSnapshot?.youtubeEarnings?.guidanceMetricCount).length;
      const next = updateTickerSnapshot({
        ticker,
        snapshot: snapshotBase,
        valuationRows,
        coverage: {
          source: "Jansen Sharadar PIT",
          sourceLabel: "Jansen Sharadar as-reported financials + PIT management guidance",
          sourceNote: "Each historical point uses the first as-reported datekey record and guidance observable by that event date.",
          modelType: "Point-in-time Fundamental Analysis model",
          methodCardLabel: "PIT financial + guidance model",
          methodCardDescription: "Constant-method historical replay using only financials and management guidance visible at each event.",
          sourcePath: PIT_SOURCE_LABEL,
          sourceFingerprint: sourceMetadata.get("source_fingerprint") || null,
          sourceTicker,
          quarterlyFinancialRows: quarterlyRows.length,
          secRows: valuationRows.length,
          valuationRows: valuationRows.length,
          youtubePeriods,
          modelVersion: MODEL_VERSION,
          priceExcludedFromFairValue: true,
          modelInputPolicy: "as-reported PIT financials + event-visible management guidance; market price comparison only"
        }
      });
      next.dataQuality = {
        ...next.dataQuality,
        pitFinancialRows: quarterlyRows.length,
        pitValuationRows: valuationRows.length,
        pitGuidancePeriods: youtubePeriods,
        modelVersion: MODEL_VERSION,
        sourceFingerprint: sourceMetadata.get("source_fingerprint") || null,
        revisionPolicy: "earliest datekey per fiscal period"
      };
      nextSnapshots.push(compactSnapshotPriceHistory(next));
      for (const output of valuationRows) {
        const fiscalPeriod = `${output.fiscalYear}-${output.fiscalQuarter}`;
        const financial = quarterlyRows.find((row) => row.fiscalYear === output.fiscalYear && row.fiscalQuarter === output.fiscalQuarter);
        const guidance = output.dataSnapshot?.youtubeEarnings || null;
        modelRuns.push({
          ticker,
          fiscalPeriod,
          asOfDate: output.asOfDate,
          financialAvailableAt: financial?.financialAvailableAt || output.asOfDate,
          guidanceMaxObservedAt: guidance?.maxObservedAt || null,
          input: {
            financial: output.dataSnapshot?.fiscalFinancials || null,
            trailingTwelveMonths: output.dataSnapshot?.trailingTwelveMonths || null,
            guidance,
            valuationSemantics: output.dataSnapshot?.valuationSemantics || null,
            sourceRecord: output.dataSnapshot?.financialSource?.record || null,
            trailingTwelveMonthsSourceRecord: output.dataSnapshot?.financialSource?.trailingTwelveMonthsRecord || null
          },
          output
        });
      }
      results.push({ ticker, sourceTicker, financialRows: quarterlyRows.length, valuationRows: valuationRows.length, guidancePeriods: youtubePeriods });
    }

    const derivedCoverage = coverage.filter((row) => row.status === "derived");
    for (const coverageRow of derivedCoverage) {
      const ticker = String(coverageRow.ticker || "").toUpperCase();
      const sourceTicker = String(coverageRow.source_ticker || ticker).toUpperCase();
      const existing = currentSnapshots.get(ticker);
      if (!existing) continue;
      const snapshotBase = cleanSnapshot(existing);
      nextSnapshots.push(compactSnapshotPriceHistory({
        ...snapshotBase,
        modelType: "Derived instrument without issuer financial statements",
        latest: {
          ...snapshotBase.latest,
          valuationAnchorPrice: null,
          valuationAnchorDate: null,
          baseFairValue: null,
          fairValueSource: null,
          fairValueInputPolicy: "No issuer PIT model available for derived instruments",
          upsideToBase: null,
          targetPrice3Y: null,
          expectedReturn3Y: null
        },
        scenarios: [],
        history: [],
        methodCards: [],
        assumptions: {},
        warnings: [coverageRow.note || "Derived instrument; no issuer financial statement model."],
        dataQuality: {
          ...snapshotBase.dataQuality,
          pitFinancialRows: 0,
          pitValuationRows: 0,
          pitGuidancePeriods: 0,
          modelVersion: MODEL_VERSION,
          sourceFingerprint: sourceMetadata.get("source_fingerprint") || null,
          valuationStatus: "not_applicable",
          derivedInstrument: true,
          sourceTicker,
          sourceNote: coverageRow.note || null,
          priceExcludedFromFairValue: true
        }
      }));
      results.push({
        ticker,
        sourceTicker,
        financialRows: 0,
        valuationRows: 0,
        guidancePeriods: 0,
        derived: true
      });
    }
    if (blockers.length && !ALLOW_INCOMPLETE) {
      console.log(JSON.stringify({ apply: false, modelVersion: MODEL_VERSION, results, blockers, derivedCoverage }, null, 2));
      throw new Error(`PIT valuation import blocked by ${blockers.length} incomplete ticker(s).`);
    }
    if (!APPLY) {
      console.log(JSON.stringify({ apply: false, modelVersion: MODEL_VERSION, results, blockers, derivedCoverage, rawGuidanceRows: rawGuidance.length }, null, 2));
      return;
    }

    target.exec("BEGIN IMMEDIATE");
    try {
      target.exec(`
        DELETE FROM valuation_pit_source_metadata;
        DELETE FROM valuation_pit_financials;
        DELETE FROM valuation_pit_guidance;
        DELETE FROM valuation_pit_model_runs;
        DELETE FROM valuation_ticker_snapshots;
        DELETE FROM valuation_snapshots;
      `);
      const insertMeta = target.prepare("INSERT INTO valuation_pit_source_metadata (key, value, imported_at) VALUES (?, ?, ?)");
      for (const [key, value] of sourceMetadata) insertMeta.run(key, value, generatedAt);
      insertMeta.run("model_version", MODEL_VERSION, generatedAt);
      const insertFinancial = target.prepare(`
        INSERT INTO valuation_pit_financials (
          ticker, source_ticker, fiscal_period, fiscal_year, fiscal_quarter, dimension,
          available_at, report_period, currency, payload_json, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of source.prepare("SELECT * FROM pit_financial_periods ORDER BY ticker, available_at, dimension").iterate()) {
        insertFinancial.run(
          row.ticker, row.source_ticker, row.fiscal_period, row.fiscal_year, row.fiscal_quarter,
          row.dimension, row.available_at, row.report_period, row.currency, row.payload_json, generatedAt
        );
      }
      insertRawGuidance(target, rawGuidance, generatedAt);
      const insertSnapshot = target.prepare(`
        INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json) VALUES (?, ?, ?)
      `);
      for (const snapshot of nextSnapshots) insertSnapshot.run(snapshot.ticker, generatedAt, JSON.stringify(snapshot));
      const insertRun = target.prepare(`
        INSERT INTO valuation_pit_model_runs (
          ticker, fiscal_period, model_version, as_of_date, financial_available_at,
          guidance_max_observed_at, input_json, output_json, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const run of modelRuns) {
        insertRun.run(
          run.ticker, run.fiscalPeriod, MODEL_VERSION, run.asOfDate, run.financialAvailableAt,
          run.guidanceMaxObservedAt, JSON.stringify(run.input), JSON.stringify(run.output), generatedAt
        );
      }
      updateDashboard(target, previousDashboard, nextSnapshots, generatedAt, sourceMetadata);
      target.exec("COMMIT");
    } catch (error) {
      target.exec("ROLLBACK");
      throw error;
    }
    target.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log(JSON.stringify({ apply: true, modelVersion: MODEL_VERSION, results, blockers, modelRuns: modelRuns.length, rawGuidanceRows: rawGuidance.length }, null, 2));
  } finally {
    source.close();
    target.close();
  }
}

main();
