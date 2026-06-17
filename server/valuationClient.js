import { databaseInfo, readValuationSnapshot, readValuationTickerSnapshot } from "./localDatabase.js";
import { applyAznValuationOverlay } from "./aznValuationOverlay.js";
import { normalizeTicker, valuationLookupKeysForSnapshot, valuationTickerCandidates } from "./tickerAliases.js";
import fs from "node:fs";

const dashboardCache = {
  dbMtimeMs: null,
  payload: null
};
const tickerCache = new Map();

function databaseMtimeMs() {
  try {
    return fs.statSync(databaseInfo().path).mtimeMs;
  } catch {
    return 0;
  }
}

function sortTickers(tickers) {
  return [...(tickers || [])].sort((left, right) => {
    const leftUpside = Number(left.latest?.upsideToBase);
    const rightUpside = Number(right.latest?.upsideToBase);
    if (Number.isFinite(leftUpside) && Number.isFinite(rightUpside)) return rightUpside - leftUpside;
    return String(left.ticker || "").localeCompare(String(right.ticker || ""));
  });
}

function emptyPayload() {
  return {
    generatedAt: new Date().toISOString(),
    source: {
      label: "Local SQLite valuation database",
      localDatabase: databaseInfo().path,
      upstreamLabel: "Legacy fundamental-analysis stock modules"
    },
    summary: {
      tickerCount: 0,
      historyRows: 0,
      pricePointCount: 0,
      latestPriceDate: null,
      message: "No valuation snapshot is available yet."
    },
    tickers: []
  };
}

function compactDataQuality(dataQuality = {}) {
  const inputAudit = dataQuality.modelInputAudit || {};
  const unifiedAudit = dataQuality.unifiedValuationAudit || {};
  const consensus = unifiedAudit.externalConsensus || {};
  const consensusCheck = unifiedAudit.externalConsensusCheck || {};
  return {
    valuationCoverageKind: dataQuality.valuationCoverageKind,
    coverageKind: dataQuality.coverageKind,
    pricePoints: dataQuality.pricePoints,
    hasLivePriceSeries: dataQuality.hasLivePriceSeries,
    fairValueSource: dataQuality.fairValueSource,
    modelInputAudit: {
      status: inputAudit.status,
      valuationRows: inputAudit.valuationRows,
      sourceGrade: inputAudit.sourceGrade,
      passesNoPriceAnchorAudit: inputAudit.passesNoPriceAnchorAudit
    },
    unifiedValuationAudit: {
      status: unifiedAudit.status,
      externalConsensus: {
        currency: consensus.currency,
        currentPrice: consensus.currentPrice,
        impliedUpside: consensus.impliedUpside,
        targetPrice: consensus.targetPrice,
        source: consensus.source
      },
      externalConsensusCheck: {
        status: consensusCheck.status,
        message: consensusCheck.message
      }
    }
  };
}

function compactTickerForDashboard(ticker = {}) {
  return {
    generatedAt: ticker.generatedAt,
    ticker: ticker.ticker,
    key: ticker.key,
    name: ticker.name,
    companyName: ticker.companyName,
    sector: ticker.sector,
    currency: ticker.currency,
    description: ticker.description,
    modelType: ticker.modelType,
    latest: ticker.latest,
    scenarios: Array.isArray(ticker.scenarios) ? ticker.scenarios.slice(0, 3) : [],
    dataQuality: compactDataQuality(ticker.dataQuality || {}),
    order: ticker.order
  };
}

function sampleSeries(rows, maxPoints) {
  if (!Array.isArray(rows)) return [];
  const limit = Number(maxPoints);
  if (!Number.isFinite(limit) || limit <= 0 || rows.length <= limit) return rows;
  if (limit <= 2) return [rows[0], rows.at(-1)].filter(Boolean);
  const result = [];
  const step = (rows.length - 1) / (limit - 1);
  let previousIndex = -1;
  for (let point = 0; point < limit; point += 1) {
    const index = Math.min(rows.length - 1, Math.round(point * step));
    if (index !== previousIndex) {
      result.push(rows[index]);
      previousIndex = index;
    }
  }
  return result;
}

function compactTickerDetail(ticker, { pricePoints = 900 } = {}) {
  const maxPricePoints = Math.max(120, Math.min(5000, Number(pricePoints) || 900));
  if (!Array.isArray(ticker?.priceHistory) || ticker.priceHistory.length <= maxPricePoints) {
    return ticker;
  }
  return {
    ...ticker,
    priceHistory: sampleSeries(ticker.priceHistory, maxPricePoints),
    dataQuality: {
      ...(ticker.dataQuality || {}),
      pricePointsAvailable: ticker.priceHistory.length,
      pricePointsReturned: maxPricePoints,
      priceHistorySampling: "uniform-date-sampling"
    }
  };
}

export async function loadValuationDashboard() {
  const dbMtimeMs = databaseMtimeMs();
  if (dashboardCache.payload && dashboardCache.dbMtimeMs === dbMtimeMs) {
    return dashboardCache.payload;
  }

  const snapshot = readValuationSnapshot();
  if (!snapshot) {
    return {
      ...emptyPayload(),
      cache: { status: "missing", source: "sqlite" }
    };
  }

  const tickers = sortTickers(
    (snapshot.tickers || [])
      .map(applyAznValuationOverlay)
      .map(compactTickerForDashboard)
  );

  const payload = {
    ...snapshot,
    source: {
      ...(snapshot.source || {}),
      label: "Local SQLite valuation database",
      localDatabase: databaseInfo().path
    },
    tickers,
    cache: { status: "local-db", source: "sqlite" }
  };
  dashboardCache.dbMtimeMs = dbMtimeMs;
  dashboardCache.payload = payload;
  return payload;
}

export async function loadValuationTicker(ticker, options = {}) {
  const normalized = normalizeTicker(ticker);
  const pricePoints = Math.max(120, Math.min(5000, Number(options.pricePoints) || 900));
  const dbMtimeMs = databaseMtimeMs();
  const cacheKey = `${normalized}:${pricePoints}:${dbMtimeMs}`;
  if (tickerCache.has(cacheKey)) {
    return tickerCache.get(cacheKey);
  }
  for (const key of tickerCache.keys()) {
    if (!key.endsWith(`:${dbMtimeMs}`)) tickerCache.delete(key);
  }
  let tickerSnapshot = null;
  let resolvedTicker = normalized;
  for (const candidate of valuationTickerCandidates(normalized)) {
    tickerSnapshot = readValuationTickerSnapshot(candidate);
    if (tickerSnapshot) {
      resolvedTicker = candidate;
      break;
    }
  }
  if (tickerSnapshot) {
    const ticker = compactTickerDetail(applyAznValuationOverlay(tickerSnapshot), { pricePoints });
    const payload = {
      generatedAt: ticker.generatedAt || new Date().toISOString(),
      source: {
        label: "Local SQLite valuation database",
        localDatabase: databaseInfo().path,
        upstreamLabel: "Legacy fundamental-analysis stock modules"
      },
      ticker,
      cache: { status: "local-db", source: "sqlite" }
    };
    tickerCache.set(cacheKey, payload);
    if (resolvedTicker !== normalized) tickerCache.set(`${resolvedTicker}:${pricePoints}:${dbMtimeMs}`, payload);
    return payload;
  }

  const dashboard = await loadValuationDashboard();
  const candidates = valuationTickerCandidates(normalized);
  const fromDashboard = (dashboard.tickers || []).find((item) => {
    const itemKeys = valuationLookupKeysForSnapshot(item);
    return candidates.some((candidate) => itemKeys.includes(candidate));
  });
  if (!fromDashboard) {
    throw new Error(`Valuation ticker not found: ${ticker}`);
  }
  const payload = {
    generatedAt: dashboard.generatedAt,
    source: dashboard.source,
    ticker: fromDashboard,
    cache: dashboard.cache
  };
  tickerCache.set(cacheKey, payload);
  return payload;
}
