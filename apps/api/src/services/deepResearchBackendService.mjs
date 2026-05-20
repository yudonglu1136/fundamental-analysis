import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { listDeepResearchBackendProfiles } from "../../../../modules/deepResearchBackend/config.mjs";
import { runDeepResearchBackendValuation } from "../../../../modules/deepResearchBackend/valuation/adapter.mjs";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => ({ ...acc, [field]: parseJson(acc[field], acc[field]) }), row));
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeValuationRun(row, { includeSnapshot = true } = {}) {
  if (!row) return null;
  return {
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    ...(includeSnapshot ? { dataSnapshotJson: parseJson(row.dataSnapshotJson, {}) } : {}),
  };
}

function dailyReturns(series) {
  const returns = [];
  for (let index = 1; index < series.length; index += 1) {
    const prev = finite(series[index - 1]?.value);
    const curr = finite(series[index]?.value);
    if (prev && curr) returns.push(curr / prev - 1);
  }
  return returns;
}

function maxDrawdown(series) {
  let peak = series[0]?.value ?? 1;
  let drawdown = 0;
  for (const point of series) {
    peak = Math.max(peak, point.value);
    if (peak > 0) drawdown = Math.min(drawdown, point.value / peak - 1);
  }
  return drawdown;
}

function metrics(series) {
  if (series.length < 2) return { totalReturn: null, cagr: null, maxDrawdown: null, sharpe: null, volatility: null };
  const start = series[0];
  const end = series[series.length - 1];
  const days = Math.max(1, (Date.parse(end.date) - Date.parse(start.date)) / 86400000);
  const totalReturn = end.value / start.value - 1;
  const cagr = (end.value / start.value) ** (365.25 / days) - 1;
  const returns = dailyReturns(series);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const variance = returns.length > 1 && mean != null ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1) : null;
  const volatility = variance != null ? Math.sqrt(variance) * Math.sqrt(252) : null;
  return { totalReturn, cagr, maxDrawdown: maxDrawdown(series), sharpe: volatility && mean != null ? (mean * 252) / volatility : null, volatility };
}

function priceBars(dbPath, ticker, startDate, endDate) {
  return query(
    `SELECT ticker, priceDate, close, adjustedClose, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    dbPath,
  ).map((row) => ({ ...row, adjustedClose: Number(row.adjustedClose) }));
}

function createUpdateJob(profile, request = {}) {
  return {
    id: `${profile.slug}-update-${Date.now()}`,
    ticker: profile.ticker,
    status: "accepted",
    requestedAt: new Date().toISOString(),
    request,
    message: "Deep research backend update job is a synchronous local-runner placeholder. Use scripts/deep_research_backend_* for actual refresh.",
  };
}

function createDeepResearchStockBackend(profile) {
  const dbPath = profile.dbPath;

  function getEvents() {
    return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [profile.ticker], dbPath);
  }

  function resolveEvent({ eventId, asOfDate } = {}) {
    if (eventId) {
      return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [profile.ticker, eventId], dbPath)[0] ?? null;
    }
    if (asOfDate) {
      return query("SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1", [profile.ticker, asOfDate], dbPath)[0] ?? null;
    }
    return getEvents()[0] ?? null;
  }

  function getSnapshot({ eventId, asOfDate } = {}) {
    const reportingEvent = resolveEvent({ eventId, asOfDate });
    const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate ?? "9999-12-31";
    const params = [profile.ticker, effectiveAsOfDate];
    return {
      reportingEvent,
      asOfDate: effectiveAsOfDate,
      profile: {
        slug: profile.slug,
        ticker: profile.ticker,
        displayName: profile.displayName,
        companyName: profile.companyName,
        archetype: profile.archetype,
        sourceNote: profile.sourceNote,
      },
      financialPeriods: parseRows(query(
        "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC, periodId ASC",
        params,
        dbPath,
      )),
      segmentFinancials: parseRows(query(
        "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
        params,
        dbPath,
      )),
      marketSnapshot: parseRows(query(
        "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
        params,
        dbPath,
      ))[0] ?? null,
      peerSnapshots: parseRows(query(
        "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
        params,
        dbPath,
      )),
      guidanceItems: parseRows(query(
        "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
        params,
        dbPath,
      )),
      transcriptEvents: parseRows(query(
        "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
        params,
        dbPath,
      ), ["metadataJson"]),
      transcriptExtractions: parseRows(query(
        "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 300",
        [profile.ticker, reportingEvent?.id ?? ""],
        dbPath,
      )),
      sourceDocuments: parseRows(query(
        `SELECT *
         FROM source_documents
         WHERE ticker = ?
           AND COALESCE(publishedDate, retrievedAt, '0000-01-01') <= ?
         ORDER BY COALESCE(publishedDate, retrievedAt) DESC, id
         LIMIT 300`,
        [profile.ticker, effectiveAsOfDate],
        dbPath,
      ), ["metadataJson"]),
      modelVersions: parseRows(query("SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC", [profile.ticker], dbPath), ["valuationMethodsJson", "assumptionSchemaJson"]),
      assumptionSets: parseRows(query(
        "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
        params,
        dbPath,
      ), ["assumptionsJson"]),
      validationWarnings: query("SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC", [profile.ticker], dbPath),
    };
  }

  function getAsOfDailyPrice(asOfDate) {
    return query(
      `SELECT priceDate, adjustedClose, close, source, sourceType
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
       ORDER BY priceDate DESC
       LIMIT 1`,
      [profile.ticker, asOfDate],
      dbPath,
    )[0] ?? null;
  }

  function applyDailyPriceToSnapshot(rawSnapshot) {
    const dailyPrice = getAsOfDailyPrice(rawSnapshot?.asOfDate);
    if (!dailyPrice) return { snapshot: rawSnapshot, dailyPrice: null };
    const latestFinancial = rawSnapshot.financialPeriods?.[rawSnapshot.financialPeriods.length - 1] ?? null;
    const shares = latestFinancial?.dilutedShares ?? rawSnapshot.marketSnapshot?.sharesOutstanding ?? null;
    const netDebt = latestFinancial?.netDebt ?? 0;
    return {
      dailyPrice,
      snapshot: {
        ...rawSnapshot,
        marketSnapshot: {
          ...(rawSnapshot.marketSnapshot ?? {}),
          ticker: profile.ticker,
          asOfDate: rawSnapshot.asOfDate,
          priceDate: dailyPrice.priceDate,
          currentPrice: Number(dailyPrice.adjustedClose),
          previousClose: Number(dailyPrice.close),
          sharesOutstanding: shares,
          marketCap: shares ? Number(dailyPrice.adjustedClose) * shares : null,
          enterpriseValue: shares ? Number(dailyPrice.adjustedClose) * shares + netDebt : null,
          source: dailyPrice.source,
          rawJson: JSON.stringify({ dailyPriceOverride: dailyPrice }),
        },
      },
    };
  }

  function getValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
    const clauses = ["ticker = ?"];
    const params = [profile.ticker];
    if (asOfDate) clauses.push("asOfDate = ?") && params.push(asOfDate);
    if (eventId) clauses.push("reportingEventId = ?") && params.push(eventId);
    if (scenario) clauses.push("scenario = ?") && params.push(scenario);
    if (modelVersion) clauses.push("modelVersion = ?") && params.push(modelVersion);
    return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, dbPath)
      .map((row) => normalizeValuationRun(row));
  }

  function getHistoricalValuations({ scenario = "Base", modelVersion = profile.modelVersion } = {}) {
    const events = getEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
    const runs = query(
      `SELECT id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
              currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
              probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson, createdAt
       FROM valuation_runs
       WHERE ticker = ? AND scenario = ? AND modelVersion = ?
       ORDER BY createdAt DESC`,
      [profile.ticker, scenario, modelVersion],
      dbPath,
    ).map((row) => normalizeValuationRun(row, { includeSnapshot: false }));
    const latestRunByEvent = new Map();
    for (const run of runs) {
      if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
    }
    return events.map((event) => ({ event, valuationRun: latestRunByEvent.get(event.id) ?? null }));
  }

  async function createValuationRun({
    eventId,
    asOfDate,
    scenario = "Base",
    modelVersion = profile.modelVersion,
    assumptions = {},
  } = {}) {
    const rawSnapshot = getSnapshot({ eventId, asOfDate });
    if (!rawSnapshot.reportingEvent) throw new Error(`No ${profile.ticker} reporting event matched the supplied eventId/asOfDate.`);
    const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
    const assumptionSet = query(
      "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
      [profile.ticker, scenario, modelVersion, snapshot.asOfDate],
      dbPath,
    )[0] ?? null;
    const valuationResult = await runDeepResearchBackendValuation({
      profile,
      snapshot,
      scenario,
      modelVersion,
      assumptions: { ...(parseJson(assumptionSet?.assumptionsJson, {}) ?? {}), ...assumptions },
    });
    const selected = valuationResult.fairValues?.[0] ?? {};
    const fairValue = valuationResult.recommendedFairValue ?? selected.fairValue ?? null;
    const currentPrice = dailyPrice ? Number(dailyPrice.adjustedClose) : valuationResult.currentPrice ?? null;
    const targetPrice3Y = valuationResult.targetPrice3Y ?? selected.targetPrice3Y ?? (fairValue != null ? fairValue * 1.1 : null);
    const expectedShareholderCagr = valuationResult.expectedShareholderCagr ?? (currentPrice && targetPrice3Y ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : null);
    const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : null;
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    execute(
      `INSERT INTO valuation_runs (
        id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
        currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
        probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson,
        dataSnapshotJson, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        profile.ticker,
        snapshot.asOfDate,
        snapshot.reportingEvent.id,
        scenario,
        modelVersion,
        assumptionSet?.id ?? null,
        currentPrice,
        fairValue,
        targetPrice3Y,
        expectedShareholderCagr,
        upsideDownside,
        valuationResult.probabilityWeightedFairValue ?? fairValue,
        JSON.stringify(valuationResult.methodCards ?? []),
        JSON.stringify(valuationResult.sensitivityTables ?? []),
        JSON.stringify([
          ...(valuationResult.validationWarnings ?? []),
          dailyPrice
            ? { id: `${profile.slug}-daily-price-anchor`, severity: "low", title: `${profile.ticker} daily price anchor`, detail: `As-of price uses ${dailyPrice.source} close from ${dailyPrice.priceDate}.` }
            : { id: `${profile.slug}-missing-daily-price-anchor`, severity: "medium", title: `${profile.ticker} missing daily price anchor`, detail: "No prior daily price bar was available for this reporting event." },
        ]),
        JSON.stringify({ ...snapshot, backendSnapshot: valuationResult.backendSnapshot ?? null, asOfPriceSource: dailyPrice ?? null, dataCutoff: snapshot.asOfDate }),
        createdAt,
      ],
      dbPath,
    );
    return { id, persisted: true, valuationRun: getValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0], valuationResult };
  }

  async function backfillValuationRuns({ scenarios = ["Base"], modelVersion = profile.modelVersion, replace = true } = {}) {
    if (replace) execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [profile.ticker, modelVersion], dbPath);
    const events = getEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
    const created = [];
    const failed = [];
    for (const event of events) {
      for (const scenario of scenarios) {
        try {
          const result = await createValuationRun({ eventId: event.id, scenario, modelVersion });
          created.push({ eventId: event.id, eventDate: event.eventDate, scenario, valuationRunId: result.id, fairValue: result.valuationRun?.fairValue ?? null, currentPrice: result.valuationRun?.currentPrice ?? null });
        } catch (error) {
          failed.push({ eventId: event.id, scenario, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return { ticker: profile.ticker, modelVersion, created, failed, status: failed.length ? "completed_with_errors" : "completed" };
  }

  function getBacktests() {
    return query("SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25", [profile.ticker], dbPath)
      .map((row) => ({ ...row, configJson: parseJson(row.assumptionsJson, {}), resultJson: parseJson(row.resultJson, {}) }));
  }

  function runBacktest({
    startDate = "2018-01-02",
    endDate = new Date().toISOString().slice(0, 10),
    modelVersion = profile.modelVersion,
    benchmarkTicker = "SPY",
  } = {}) {
    const stockBars = priceBars(dbPath, profile.ticker, startDate, endDate);
    const benchmarkBars = priceBars(dbPath, benchmarkTicker, startDate, endDate);
    const warnings = [];
    if (stockBars.length < 2) warnings.push(`${profile.ticker} daily price history is unavailable or too short for the selected window.`);
    if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
    if (stockBars.some((row) => String(row.sourceType).includes("proxy"))) warnings.push(`${profile.ticker} price history contains proxy fallback bars; import official market data before investment use.`);
    if (benchmarkBars.some((row) => String(row.sourceType).includes("proxy"))) warnings.push(`${benchmarkTicker} price history contains proxy fallback bars; import official market data before investment use.`);
    if (warnings.some((warning) => warning.includes("unavailable"))) {
      return { persisted: false, status: "insufficient_data", warnings, priceBars: { [profile.ticker]: stockBars.length, [benchmarkTicker]: benchmarkBars.length } };
    }

    const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
    let stockValue = 1;
    let benchmarkValue = 1;
    let previousStock = stockBars[0];
    let previousBenchmark = benchmarkByDate.get(stockBars[0].priceDate) ?? benchmarkBars[0];
    const curve = [];
    for (const stock of stockBars) {
      const benchmark = benchmarkByDate.get(stock.priceDate);
      if (!benchmark) continue;
      if (curve.length) {
        stockValue *= stock.adjustedClose / previousStock.adjustedClose;
        benchmarkValue *= benchmark.adjustedClose / previousBenchmark.adjustedClose;
      }
      curve.push({
        date: stock.priceDate,
        stock: stockValue,
        [`${profile.slug}BuyHold`]: stockValue,
        spy: benchmarkValue,
        benchmark: benchmarkValue,
        stockPrice: stock.adjustedClose,
        benchmarkPrice: benchmark.adjustedClose,
      });
      previousStock = stock;
      previousBenchmark = benchmark;
    }
    const result = {
      ticker: profile.ticker,
      benchmarkTicker,
      startDate,
      endDate,
      modelVersion,
      priceBars: { [profile.ticker]: stockBars.length, [benchmarkTicker]: benchmarkBars.length },
      metrics: {
        stock: metrics(curve.map((row) => ({ date: row.date, value: row.stock }))),
        [`${profile.slug}BuyHold`]: metrics(curve.map((row) => ({ date: row.date, value: row.stock }))),
        spy: metrics(curve.map((row) => ({ date: row.date, value: row.spy }))),
        benchmark: metrics(curve.map((row) => ({ date: row.date, value: row.benchmark }))),
      },
      curve,
      warnings,
    };
    const id = randomUUID();
    execute(
      `INSERT INTO backtest_runs (
        id, ticker, modelVersion, startDate, endDate, rebalanceFrequency, assumptionsJson, resultJson, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, profile.ticker, modelVersion, startDate, endDate, "daily", JSON.stringify({ benchmarkTicker }), JSON.stringify(result), new Date().toISOString()],
      dbPath,
    );
    return { id, persisted: true, status: "completed", ...result };
  }

  return {
    slug: profile.slug,
    ticker: profile.ticker,
    displayName: profile.displayName,
    modelVersion: profile.modelVersion,
    backtestMessage: `${profile.ticker} stock-vs-SPY backtest is backed by daily adjusted price bars when imported, with explicit proxy warnings otherwise.`,
    getEvents,
    getSnapshot,
    getValuationRuns,
    getHistoricalValuations,
    createValuationRun,
    backfillValuationRuns,
    createUpdateJob: (request) => createUpdateJob(profile, request),
    getUpdateJob: (jobId) => ({ id: jobId, ticker: profile.ticker, status: "not_persisted", message: "Deep research update jobs are not persisted yet." }),
    getBacktests,
    runBacktest,
  };
}

export const deepResearchStockBackendRegistry = Object.fromEntries(
  listDeepResearchBackendProfiles().map((profile) => [profile.slug, createDeepResearchStockBackend(profile)]),
);
