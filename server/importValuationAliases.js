import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");

const ALIAS_TICKERS = [
  {
    ticker: "GOOG",
    sourceTicker: "GOOGL",
    name: "Alphabet Inc. Class C",
    description: "Alphabet Class C share-class valuation alias derived from GOOGL company-level financial model and GOOG price history.",
    note: "GOOG and GOOGL share the same Alphabet operating-company fundamentals; this alias preserves GOOGL financial/Q&A history while recalculating market-price comparisons on GOOG's price series."
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

function readPriceHistoryFromDb(db, ticker, limit = 2200) {
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

function recalculateRowForAlias(row, priceHistory, config) {
  const pricePoint = pricePointAtOrBefore(priceHistory, row.asOfDate);
  const priceAtDate = finiteNumber(pricePoint?.close);
  const fairValue = finiteNumber(row.fairValue);
  const targetPrice3Y = finiteNumber(row.targetPrice3Y);
  const next = {
    ...row,
    periodId: `alias-${config.ticker.toLowerCase()}-${row.periodId || row.asOfDate}`,
    sourceType: row.sourceType || "share_class_alias_model",
    eventType: row.eventType || "share_class_alias_model",
    currentPrice: priceAtDate ?? finiteNumber(row.currentPrice),
    priceAtDate: priceAtDate ?? finiteNumber(row.priceAtDate),
    priceDate: pricePoint?.date || row.priceDate || row.asOfDate,
    dataSnapshot: {
      ...(row.dataSnapshot || {}),
      aliasOfTicker: config.sourceTicker,
      sourceType: row.dataSnapshot?.sourceType || "share_class_alias_model",
      valuationSemantics: {
        ...(row.dataSnapshot?.valuationSemantics || {}),
        aliasOfTicker: config.sourceTicker,
        priceExcludedFromFairValue: true,
        fairValueFormula: `${config.ticker} uses ${config.sourceTicker}'s company-level fair value and Q&A, with ${config.ticker} market price used only for upside/downside comparison.`
      }
    },
    warnings: [
      ...(row.warnings || []),
      `${config.ticker} is a share-class alias derived from ${config.sourceTicker}; fundamentals and transcript Q&A are inherited.`
    ]
  };
  if (priceAtDate > 0 && fairValue != null) next.upsideDownside = fairValue / priceAtDate - 1;
  if (priceAtDate > 0 && targetPrice3Y != null) next.expectedReturn3Y = (targetPrice3Y / priceAtDate) ** (1 / 3) - 1;
  return next;
}

function recalculateScenarioForAlias(scenario, latestPrice) {
  const currentPrice = finiteNumber(latestPrice?.close);
  const fairValue = finiteNumber(scenario?.fairValue);
  const targetPrice3Y = finiteNumber(scenario?.targetPrice3Y);
  return {
    ...scenario,
    currentPrice,
    upsideDownside: currentPrice > 0 && fairValue != null ? fairValue / currentPrice - 1 : finiteNumber(scenario?.upsideDownside),
    expectedReturn3Y: currentPrice > 0 && targetPrice3Y != null ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : finiteNumber(scenario?.expectedReturn3Y)
  };
}

function buildAliasSnapshot({ config, sourceSnapshot, existingSnapshot, priceHistory }) {
  const generatedAt = new Date().toISOString();
  const history = (sourceSnapshot.history || [])
    .map((row) => recalculateRowForAlias(row, priceHistory, config))
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  const latestHistoryRow = history.at(-1);
  const latestPrice = latestPricePoint(priceHistory);
  const latestMarketPrice = finiteNumber(latestPrice?.close);
  const latestFairValue = finiteNumber(latestHistoryRow?.fairValue) ?? finiteNumber(sourceSnapshot.latest?.baseFairValue);
  const latestTarget = finiteNumber(latestHistoryRow?.targetPrice3Y) ?? finiteNumber(sourceSnapshot.latest?.targetPrice3Y);
  const latestGap = latestMarketPrice > 0 && latestFairValue != null
    ? latestFairValue / latestMarketPrice - 1
    : finiteNumber(latestHistoryRow?.upsideDownside);

  return {
    ...(existingSnapshot || {}),
    ...sourceSnapshot,
    generatedAt,
    ticker: config.ticker,
    key: config.ticker.toLowerCase(),
    name: config.name || sourceSnapshot.name,
    description: config.description || sourceSnapshot.description,
    latest: {
      ...(sourceSnapshot.latest || {}),
      latestPrice: latestMarketPrice,
      latestPriceDate: latestPrice?.date || null,
      latestPriceSource: latestPrice?.source || null,
      valuationAnchorPrice: finiteNumber(latestHistoryRow?.priceAtDate),
      valuationAnchorDate: latestHistoryRow?.asOfDate || sourceSnapshot.latest?.valuationAnchorDate || null,
      baseFairValue: latestFairValue,
      upsideToBase: latestGap,
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestMarketPrice > 0 && latestTarget != null
        ? (latestTarget / latestMarketPrice) ** (1 / 3) - 1
        : finiteNumber(latestHistoryRow?.expectedReturn3Y),
      fairValueSource: `${config.sourceTicker} company-level valuation alias`,
      fairValueInputPolicy: "Same Alphabet fundamentals as source share class; alias market price used only for comparison"
    },
    scenarios: (sourceSnapshot.scenarios || []).map((scenario) => recalculateScenarioForAlias(scenario, latestPrice)),
    history,
    priceHistory,
    priceSource: latestPrice?.source || "local price_points",
    assumptions: [
      ...(sourceSnapshot.assumptions || []),
      {
        key: "share_class_alias_source",
        label: "Share-class source",
        value: config.sourceTicker,
        category: "Alias"
      }
    ],
    warnings: [
      config.note,
      ...(sourceSnapshot.warnings || [])
    ].filter(Boolean),
    dataQuality: {
      ...(sourceSnapshot.dataQuality || {}),
      ...(existingSnapshot?.dataQuality || {}),
      pricePoints: priceHistory.length,
      hasLivePriceSeries: priceHistory.length >= 120,
      sourceNote: config.note,
      valuationCoverageKind: "share-class-alias",
      aliasOfTicker: config.sourceTicker,
      transcriptQaPeriods: history.filter((row) => row.dataSnapshot?.youtubeEarnings?.qa?.length).length,
      modelInputAudit: {
        ...(sourceSnapshot.dataQuality?.modelInputAudit || {}),
        status: "review",
        passesNoPriceAnchorAudit: true,
        fairValueInputPolicy: "source share-class company valuation; alias price comparison only",
        priceUsage: `${config.ticker} price history is used for upside/downside and charting, not for fair-value input.`,
        sourceGrade: "share-class-alias",
        valuationRows: history.length,
        warnings: [
          `${config.ticker} is an alias of ${config.sourceTicker}; validate share-class spread if it becomes material.`
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
    positiveUpsideCount: tickers.filter((ticker) => Number(ticker.latest?.upsideToBase) > 0).length,
    negativeUpsideCount: tickers.filter((ticker) => Number(ticker.latest?.upsideToBase) < 0).length
  };
  const next = {
    ...dashboard,
    generatedAt,
    source: {
      ...(dashboard.source || {}),
      shareClassAliases: "GOOG is generated from GOOGL company-level valuation with GOOG price history"
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
    for (const config of ALIAS_TICKERS) {
      const sourceSnapshot = tickerSnapshots.get(config.sourceTicker);
      if (!sourceSnapshot?.history?.length) {
        skipped.push({ ticker: config.ticker, reason: `missing source ${config.sourceTicker} valuation history` });
        continue;
      }
      const priceHistory = readPriceHistoryFromDb(db, config.ticker);
      if (!priceHistory.length) {
        skipped.push({ ticker: config.ticker, reason: "missing alias price history" });
        continue;
      }
      const existingSnapshot = tickerSnapshots.get(config.ticker);
      const snapshot = buildAliasSnapshot({ config, sourceSnapshot, existingSnapshot, priceHistory });
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
        sourceTicker: config.sourceTicker,
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
