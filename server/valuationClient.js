import { databaseInfo, readValuationSnapshot, readValuationTickerSnapshot } from "./localDatabase.js";

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

export async function loadValuationDashboard() {
  const snapshot = readValuationSnapshot();
  if (!snapshot) {
    return {
      ...emptyPayload(),
      cache: { status: "missing", source: "sqlite" }
    };
  }

  return {
    ...snapshot,
    source: {
      ...(snapshot.source || {}),
      label: "Local SQLite valuation database",
      localDatabase: databaseInfo().path
    },
    tickers: sortTickers(snapshot.tickers),
    cache: { status: "local-db", source: "sqlite" }
  };
}

export async function loadValuationTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  const tickerSnapshot = readValuationTickerSnapshot(normalized);
  if (tickerSnapshot) {
    return {
      generatedAt: tickerSnapshot.generatedAt || new Date().toISOString(),
      source: {
        label: "Local SQLite valuation database",
        localDatabase: databaseInfo().path,
        upstreamLabel: "Legacy fundamental-analysis stock modules"
      },
      ticker: tickerSnapshot,
      cache: { status: "local-db", source: "sqlite" }
    };
  }

  const dashboard = await loadValuationDashboard();
  const fromDashboard = (dashboard.tickers || []).find((item) => item.ticker === normalized || item.key === normalized);
  if (!fromDashboard) {
    throw new Error(`Valuation ticker not found: ${ticker}`);
  }
  return {
    generatedAt: dashboard.generatedAt,
    source: dashboard.source,
    ticker: fromDashboard,
    cache: dashboard.cache
  };
}
