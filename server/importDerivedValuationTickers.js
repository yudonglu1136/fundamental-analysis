import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");

const DERIVED_TICKERS = [
  {
    ticker: "RKLX",
    name: "Defiance Daily Target 2X Long RKLB ETF",
    underlyingTicker: "RKLB",
    leverage: 2,
    description: "2x daily-reset ETF valuation overlay derived from Rocket Lab's company-level fair-value gap."
  }
];

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latestPricePoint(points = []) {
  return [...points]
    .filter((point) => point.date && finiteNumber(point.close) != null)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function pricePointAtOrBefore(points = [], date) {
  const target = Date.parse(date);
  if (!Number.isFinite(target)) return null;
  return [...points]
    .filter((point) => point.date && finiteNumber(point.close) != null && Date.parse(point.date) <= target)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function readPriceHistoryFromDb(db, ticker, limit = 1800) {
  const rows = db.prepare(`
    SELECT date, open, high, low, close, volume, source
    FROM price_points
    WHERE symbol = ?
    ORDER BY date DESC
    LIMIT ?
  `).all(ticker, limit);
  return rows
    .reverse()
    .map((row) => ({
      date: row.date,
      open: finiteNumber(row.open),
      high: finiteNumber(row.high),
      low: finiteNumber(row.low),
      close: finiteNumber(row.close),
      volume: finiteNumber(row.volume),
      source: row.source || "local price_points"
    }))
    .filter((row) => row.date && row.close != null);
}

function leveragedGapFromUnderlying(row, leverage) {
  const fairValue = finiteNumber(row?.fairValue);
  const priceAtDate = finiteNumber(row?.priceAtDate ?? row?.currentPrice);
  const baseGap = fairValue != null && priceAtDate > 0
    ? fairValue / priceAtDate - 1
    : finiteNumber(row?.upsideDownside);
  if (baseGap == null) return null;
  return clamp(baseGap * leverage, -0.95, 3.0);
}

function derivedTargetReturn(row, leverage, fallbackGap) {
  const baseExpected = finiteNumber(row?.expectedReturn3Y);
  if (baseExpected != null) return clamp(baseExpected * leverage, -0.9, 1.8);
  return clamp(fallbackGap / 3, -0.9, 1.8);
}

function buildDerivedHistory({ config, underlyingSnapshot, priceHistory }) {
  const rows = [];
  for (const sourceRow of underlyingSnapshot.history || []) {
    const pricePoint = pricePointAtOrBefore(priceHistory, sourceRow.asOfDate);
    const priceAtDate = finiteNumber(pricePoint?.close);
    if (!(priceAtDate > 0)) continue;
    const leveragedGap = leveragedGapFromUnderlying(sourceRow, config.leverage);
    if (leveragedGap == null) continue;
    const fairValue = priceAtDate * (1 + leveragedGap);
    const targetReturn = derivedTargetReturn(sourceRow, config.leverage, leveragedGap);
    const targetPrice3Y = priceAtDate * (1 + targetReturn) ** 3;
    rows.push({
      periodId: `derived-${config.ticker.toLowerCase()}-${sourceRow.periodId || sourceRow.asOfDate}`,
      runCreatedAt: new Date().toISOString(),
      label: sourceRow.label,
      asOfDate: sourceRow.asOfDate,
      fiscalYear: sourceRow.fiscalYear,
      fiscalQuarter: sourceRow.fiscalQuarter,
      eventType: "derived_leveraged_etf_model",
      sourceType: "derived_leveraged_etf_model",
      sourceUrl: sourceRow.sourceUrl || null,
      currentPrice: priceAtDate,
      fairValue,
      upsideDownside: leveragedGap,
      targetPrice3Y,
      expectedReturn3Y: targetReturn,
      method: `Derived ${config.leverage}x ETF overlay from ${config.underlyingTicker} fair-value gap`,
      methodOutputs: [
        {
          key: "underlying-fair-value-gap",
          label: `${config.underlyingTicker} fair-value gap`,
          value: finiteNumber(sourceRow.upsideDownside),
          format: "percent",
          description: "Underlying company-level upside/downside from the valuation model."
        },
        {
          key: "daily-reset-leverage",
          label: "Daily-reset leverage",
          value: config.leverage,
          format: "multiple",
          description: "ETF overlay applies target leverage to the underlying valuation gap and caps extremes for daily reset decay risk."
        },
        {
          key: "leveraged-gap-cap",
          label: "Leveraged gap cap",
          value: leveragedGap,
          format: "percent",
          description: "Leveraged upside/downside after capping at -95% / +300% because leveraged ETFs can decay path-dependently."
        }
      ],
      warnings: [
        `${config.ticker} is a daily-reset leveraged ETF; this is a derived overlay, not issuer financial-statement valuation.`,
        `Earnings-call Q&A is inherited from the underlying company ${config.underlyingTicker} when available.`
      ],
      priceDate: pricePoint?.date || sourceRow.asOfDate,
      priceAtDate,
      dataSnapshot: {
        sourceType: "derived_leveraged_etf_model",
        sourceQuality: "derived-from-underlying-company-valuation",
        sourceMaxAsOfDate: sourceRow.asOfDate,
        selectedFinancialPeriod: sourceRow.dataSnapshot?.selectedFinancialPeriod || null,
        underlyingValuation: {
          ticker: config.underlyingTicker,
          label: sourceRow.label,
          asOfDate: sourceRow.asOfDate,
          fairValue: finiteNumber(sourceRow.fairValue),
          priceAtDate: finiteNumber(sourceRow.priceAtDate ?? sourceRow.currentPrice),
          upsideDownside: finiteNumber(sourceRow.upsideDownside),
          method: sourceRow.method || null
        },
        valuationSemantics: {
          sourceType: "derived_leveraged_etf_model",
          priceExcludedFromFairValue: true,
          fairValueFormula: `${config.ticker} price at date x (1 + capped ${config.leverage}x ${config.underlyingTicker} fair-value gap); ETF market price is used only as the ETF share-count/price base, not as the underlying fair-value input.`,
          scoreInputs: {
            profile: "derived_leveraged_etf",
            underlyingTicker: config.underlyingTicker,
            leverage: config.leverage,
            underlyingFairValue: finiteNumber(sourceRow.fairValue),
            underlyingPriceAtDate: finiteNumber(sourceRow.priceAtDate ?? sourceRow.currentPrice),
            underlyingUpsideDownside: finiteNumber(sourceRow.upsideDownside),
            leveragedUpsideDownside: leveragedGap,
            etfPriceAtDate: priceAtDate
          }
        },
        youtubeEarnings: sourceRow.dataSnapshot?.youtubeEarnings || null
      }
    });
  }
  return rows.sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
}

function buildDerivedSnapshot({ config, existingSnapshot, underlyingSnapshot, priceHistory }) {
  const generatedAt = new Date().toISOString();
  const history = buildDerivedHistory({ config, underlyingSnapshot, priceHistory });
  const latestRow = history.at(-1);
  const latestPrice = latestPricePoint(priceHistory);
  const latestMarketPrice = finiteNumber(latestPrice?.close);
  const latestFairValue = finiteNumber(latestRow?.fairValue);
  const latestTarget = finiteNumber(latestRow?.targetPrice3Y);
  const latestGap = latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : finiteNumber(latestRow?.upsideDownside);
  return {
    ...(existingSnapshot || {}),
    generatedAt,
    ticker: config.ticker,
    key: config.ticker.toLowerCase(),
    name: config.name,
    sector: "Derived leveraged ETF",
    currency: "USD",
    description: config.description,
    modelType: "Derived leveraged ETF valuation overlay",
    latest: {
      ...(existingSnapshot?.latest || {}),
      latestPrice: latestMarketPrice,
      latestPriceDate: latestPrice?.date || null,
      latestPriceSource: latestPrice?.source || null,
      valuationAnchorPrice: finiteNumber(latestRow?.priceAtDate),
      valuationAnchorDate: latestRow?.asOfDate || null,
      baseFairValue: latestFairValue,
      fairValueSource: `${config.underlyingTicker} company valuation-derived ETF overlay`,
      fairValueInputPolicy: "underlying company financial model only; ETF price used for ETF overlay scaling",
      upsideToBase: latestGap,
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestMarketPrice && latestTarget ? (latestTarget / latestMarketPrice) ** (1 / 3) - 1 : finiteNumber(latestRow?.expectedReturn3Y)
    },
    scenarios: latestRow ? [{
      scenario: "Base",
      currentPrice: finiteNumber(latestRow.currentPrice),
      fairValue: latestFairValue,
      upsideDownside: finiteNumber(latestRow.upsideDownside),
      targetPrice3Y: latestTarget,
      expectedReturn3Y: finiteNumber(latestRow.expectedReturn3Y),
      recommendedMethod: latestRow.method,
      modelSummary: `${config.leverage}x daily-reset overlay on ${config.underlyingTicker}`
    }] : [],
    history,
    methodCards: [
      {
        key: "derived-underlying-company-model",
        label: `${config.underlyingTicker} underlying model`,
        value: history.length,
        format: "number",
        description: `Uses ${config.underlyingTicker}'s company-level valuation history and maps the gap to ${config.ticker}'s daily-reset ETF price series.`
      },
      {
        key: "leveraged-etf-decay-risk",
        label: "Daily reset risk",
        value: config.leverage,
        format: "multiple",
        description: "Leveraged ETFs compound daily and can diverge from long-horizon underlying returns."
      }
    ],
    assumptions: [
      {
        key: "underlying_ticker",
        label: "Underlying company",
        value: config.underlyingTicker,
        category: "Derived ETF"
      },
      {
        key: "target_leverage",
        label: "Target daily leverage",
        value: config.leverage,
        category: "Derived ETF"
      }
    ],
    warnings: [
      `${config.ticker} is not valued from issuer financial statements; it is derived from ${config.underlyingTicker}.`,
      "Path dependency and daily reset decay can make long-horizon realized returns differ materially from this point-in-time overlay."
    ],
    priceHistory,
    priceSource: latestPrice?.source || "local price_points",
    dataQuality: {
      ...(existingSnapshot?.dataQuality || {}),
      pricePoints: priceHistory.length,
      hasLivePriceSeries: priceHistory.length >= 120,
      priceDisplayMode: priceHistory.length >= 120 ? "daily-price-line" : "as-of-price-anchors",
      sourceNote: `${config.ticker} is derived from ${config.underlyingTicker}'s valuation history because leveraged ETFs do not publish company-style quarterly operating financials.`,
      fairValueSource: `${config.underlyingTicker} underlying valuation overlay`,
      valuationCoverageKind: history.length >= 8 ? "derived" : history.length ? "limited-derived" : "unsupported",
      hasQuarterlyValuationRuns: false,
      derivedFromTicker: config.underlyingTicker,
      derivedLeverage: config.leverage,
      transcriptQaPeriods: history.filter((row) => row.dataSnapshot?.youtubeEarnings?.qa?.length).length,
      modelInputAudit: {
        status: history.length ? "review" : "fail",
        passesNoPriceAnchorAudit: true,
        fairValueInputPolicy: "derived-underlying-company-valuation",
        priceUsage: "ETF price series scales underlying company fair-value gap to ETF share price",
        sourceGrade: "derived-etf-overlay",
        valuationRows: history.length,
        financialOrGuidanceEvidenceRows: underlyingSnapshot.history?.length || 0,
        methodPriceAnchorSignalCount: 0,
        methodPriceAnchorSignals: [],
        warnings: [
          "Derived ETF overlays are not issuer financial-statement valuations.",
          "Daily reset leverage and path dependency require manual review."
        ]
      }
    }
  };
}

function compactTicker(snapshot) {
  const { priceHistory, ...compact } = snapshot;
  return {
    ...compact,
    history: (snapshot.history || []).slice(-12),
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      fullHistoryRowsAvailable: snapshot.history?.length || 0
    }
  };
}

function updateDashboard(db, tickerSnapshots) {
  const dashboard = parseJson(db.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest")?.payload_json, {});
  const snapshots = [...tickerSnapshots.values()];
  const tickers = snapshots.map(compactTicker).sort((left, right) => {
    const leftUpside = Number(left.latest?.upsideToBase);
    const rightUpside = Number(right.latest?.upsideToBase);
    if (Number.isFinite(leftUpside) && Number.isFinite(rightUpside)) return rightUpside - leftUpside;
    return String(left.ticker || "").localeCompare(String(right.ticker || ""));
  });
  const generatedAt = new Date().toISOString();
  const summary = {
    ...(dashboard.summary || {}),
    tickerCount: snapshots.length,
    historyRows: snapshots.reduce((sum, ticker) => sum + (ticker.history?.length || 0), 0),
    pricePointCount: snapshots.reduce((sum, ticker) => sum + (ticker.priceHistory?.length || 0), 0),
    livePriceTickerCount: snapshots.filter((ticker) => ticker.priceHistory?.length).length,
    latestPriceDate: snapshots.map((ticker) => ticker.latest?.latestPriceDate).filter(Boolean).sort().at(-1) || null,
    unsupportedValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.valuationCoverageKind === "unsupported").length,
    positiveUpsideCount: tickers.filter((ticker) => Number(ticker.latest?.upsideToBase) > 0).length,
    negativeUpsideCount: tickers.filter((ticker) => Number(ticker.latest?.upsideToBase) < 0).length
  };
  const next = {
    ...dashboard,
    generatedAt,
    source: {
      ...(dashboard.source || {}),
      derivedEtfOverlay: "RKLX derived from RKLB company valuation after transcript-Q&A enrichment"
    },
    summary,
    tickers
  };
  db.prepare(`
    INSERT INTO valuation_snapshots (id, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run("latest", generatedAt, JSON.stringify(next));
}

const db = new DatabaseSync(CURRENT_DB_PATH);

try {
  const tickerSnapshots = new Map(
    db.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots").all()
      .map((row) => [String(row.ticker || "").toUpperCase(), parseJson(row.payload_json, {})])
  );
  const updated = [];
  const skipped = [];
  db.exec("BEGIN");
  try {
    for (const config of DERIVED_TICKERS) {
      const underlyingSnapshot = tickerSnapshots.get(config.underlyingTicker);
      if (!underlyingSnapshot?.history?.length) {
        skipped.push({ ticker: config.ticker, reason: `missing underlying ${config.underlyingTicker} valuation history` });
        continue;
      }
      const priceHistory = readPriceHistoryFromDb(db, config.ticker);
      if (!priceHistory.length) {
        skipped.push({ ticker: config.ticker, reason: "missing ETF price history" });
        continue;
      }
      const existingSnapshot = tickerSnapshots.get(config.ticker);
      const snapshot = buildDerivedSnapshot({ config, existingSnapshot, underlyingSnapshot, priceHistory });
      tickerSnapshots.set(config.ticker, snapshot);
      db.prepare(`
        INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          generated_at = excluded.generated_at,
          payload_json = excluded.payload_json
      `).run(config.ticker, snapshot.generatedAt, JSON.stringify(snapshot));
      updated.push({
        ticker: config.ticker,
        underlyingTicker: config.underlyingTicker,
        rows: snapshot.history.length,
        qaPeriods: snapshot.dataQuality?.transcriptQaPeriods || 0
      });
    }
    updateDashboard(db, tickerSnapshots);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify({ currentDbPath: CURRENT_DB_PATH, updated, skipped }, null, 2));
} finally {
  db.close();
}
