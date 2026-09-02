import { gurus } from "./gurus.js";
import { load13fHoldingHistory, loadGuruDashboard } from "./secClient.js";
import { loadPriceSeries } from "./marketData.js";
import {
  adjustedClosePriceMap,
  filingExecutionDecision,
  resolveTrailingCommonPriceEnd,
  simulateDriftedPortfolio
} from "./backtestEngine.js";
import { buildTrailingAwarePublicHoldingsProxy } from "./backtestProxy.js";
import { auditPublicHoldingsProxyPayload } from "./backtestProxyAudit.js";
import {
  auditManager13fStrictReadyPayload,
  normalizedManager13fExecutionCoverage
} from "./backtestStrictAudit.js";
import {
  activeTradingDatesForPriceWindow,
  collapseSupersededSameSessionSnapshots,
  holdingPriceLoadUniverse,
  manager13fActivePriceWindows
} from "./backtestSchedule.js";
import { holdingResolutionVersion } from "./cusipOverrides.js";
import {
  is13fCommonLongHolding,
  selectUnambiguous13fOriginals,
  summarize13fHoldingValues
} from "./thirteenF.js";
import {
  readGuruBacktest,
  readGuruBacktestProxy,
  readGuruBacktestVersion,
  writeBackgroundJobRun,
  writeGuruBacktest,
  writeGuruBacktestProxy
} from "./localDatabase.js";

const defaultYears = "all";
const allYearsCacheKey = 0;
const maxHoldingsPerFiling = Number(process.env.BACKTEST_MAX_HOLDINGS || 60);
export const manager13fBacktestMethodVersion = "manager13f-drifted-total-return-v8";
export const manager13fProxyMethodVersion = "manager13f-public-holdings-proxy-v1";
export const manager13fSecurityMasterVersion = holdingResolutionVersion();
export const disclosureBacktestMethodVersion = "stock-act-disclosure-fail-closed-v1";
export const sameExecutionSessionPolicy =
  "When distinct 13F report periods first become tradable on the same session, execute only the latest report period and audit-exclude stale snapshots; unresolved duplicates within that latest period remain fail closed.";
export const minExecutionCoverage = normalizedManager13fExecutionCoverage(
  process.env.BACKTEST_MIN_EXECUTION_COVERAGE
);
export function normalizeBacktestProxySetting(
  value,
  fallback,
  minimum,
  maximum,
  { round = false } = {}
) {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = Math.max(minimum, Math.min(maximum, normalized));
  return round ? Math.round(bounded) : bounded;
}

export const minProxyCoverage = normalizeBacktestProxySetting(
  process.env.BACKTEST_MIN_PROXY_COVERAGE,
  0.3,
  0.3,
  0.9
);
export const minProxyPositions = normalizeBacktestProxySetting(
  process.env.BACKTEST_MIN_PROXY_POSITIONS,
  2,
  2,
  60,
  { round: true }
);
const priceConcurrency = Math.max(1, Math.min(12, Number(process.env.BACKTEST_PRICE_CONCURRENCY || 6)));
const configuredMaxTrailingPriceLagDays = Number(
  process.env.BACKTEST_MAX_TRAILING_PRICE_LAG_DAYS || 7
);
export const maxTrailingPriceLagDays = Number.isFinite(configuredMaxTrailingPriceLagDays)
  ? Math.max(0, Math.min(14, configuredMaxTrailingPriceLagDays))
  : 7;
export const backtestMarketEndFreshnessBufferDays = 5;
export const backtestEndGraceDays = Math.max(
  1,
  maxTrailingPriceLagDays + backtestMarketEndFreshnessBufferDays,
  Number(
    process.env.BACKTEST_CACHE_END_GRACE_DAYS ||
    maxTrailingPriceLagDays + backtestMarketEndFreshnessBufferDays
  )
);
const responseMaxEquityPoints = Math.max(120, Number(process.env.BACKTEST_RESPONSE_MAX_POINTS || 520));
const dayMs = 1000 * 60 * 60 * 24;
const backtestCacheTtlMs = Math.max(
  1000 * 60 * 60,
  Number(process.env.BACKTEST_CACHE_TTL_HOURS || 20) * 1000 * 60 * 60
);
const backtestEndGraceMs = Math.max(
  dayMs,
  backtestEndGraceDays * dayMs
);
const backtestAutoRefreshIntervalMs = Math.max(
  1000 * 60 * 60,
  Number(process.env.BACKTEST_AUTO_REFRESH_INTERVAL_HOURS || 24) * 1000 * 60 * 60
);
const backtestAutoRefreshInitialDelayMs = Math.max(
  0,
  Number(process.env.BACKTEST_AUTO_REFRESH_INITIAL_DELAY_MS ?? 45000)
);
const aggregateBacktestCacheMaxEntries = Math.max(
  1,
  Math.min(64, Math.round(Number(process.env.BACKTEST_AGGREGATE_CACHE_MAX_ENTRIES) || 12))
);
const aggregateBacktestStaleTtlMs = Math.max(
  1000,
  Math.min(
    5 * 60 * 1000,
    Math.round(Number(process.env.BACKTEST_AGGREGATE_STALE_TTL_MS) || 30 * 1000)
  )
);

let backtestAutoRefreshTimer = null;
let backtestAutoRefreshKickoffTimer = null;
let backtestRefreshInFlight = null;
let scheduledBacktestRefreshInFlight = null;
let staleBacktestRefreshInFlight = null;
const staleBacktestRefreshKeys = new Set();
const aggregateBacktestCache = new Map();
const aggregateBacktestInFlight = new Map();
const guruBacktestComputationInFlight = new Map();
const guruBacktestFreshComputationInFlight = new Map();
let lastBacktestRefreshStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  reason: "",
  ok: 0,
  failed: 0,
  proxyAvailable: 0,
  errors: []
};

export function expectedGuruBacktestStatus(guru) {
  return guru?.type === "manager13f" && guru.disableSimulation
    ? "unsupported"
    : "ready";
}

export function assertGuruBacktestRefreshSucceeded(guru, payload, phase = "refresh") {
  const expectedStatus = expectedGuruBacktestStatus(guru);
  const actualStatus = payload?.status || "missing";
  if (actualStatus !== expectedStatus) {
    const reason = String(payload?.method?.reason || "").trim();
    const failure = payload?.dataQuality?.failure || payload?.dataQuality?.coverageFailures?.[0];
    const readyCacheRetention = payload?.dataQuality?.readyCacheRetention || null;
    const diagnostic = failure || payload?.dataQuality?.trailingPriceEnd || readyCacheRetention
      ? {
          readyCacheRetention,
          failure: failure || null,
          trailingPriceEnd: payload?.dataQuality?.trailingPriceEnd || null
        }
      : null;
    const diagnosticText = diagnostic
      ? `; diagnostic ${JSON.stringify(diagnostic).slice(0, 2400)}`
      : "";
    throw new Error(
      `${guru?.id || "unknown guru"} ${phase} backtest status is ${actualStatus}; expected ${expectedStatus}${reason ? ` (${reason})` : ""}${diagnosticText}`
    );
  }
  return payload;
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function today() {
  return isoDate(new Date());
}

function yearsAgoDate(end, years) {
  const date = new Date(end);
  date.setFullYear(date.getFullYear() - years);
  return isoDate(date);
}

function normalizeBacktestWindow(years = defaultYears) {
  const raw = String(years ?? defaultYears).trim().toLowerCase();
  if (!raw || ["all", "max", "full", "history"].includes(raw)) {
    return {
      all: true,
      years: null,
      methodYears: "all",
      cacheKey: allYearsCacheKey,
      limit: null
    };
  }

  const parsed = Number(raw);
  const normalizedYears = Number.isFinite(parsed)
    ? Math.max(1, Math.min(40, Math.round(parsed)))
    : 5;
  return {
    all: false,
    years: normalizedYears,
    methodYears: normalizedYears,
    cacheKey: normalizedYears,
    limit: normalizedYears * 4 + 4
  };
}

export function isExtendedBacktestWindow(years = defaultYears) {
  const window = normalizeBacktestWindow(years);
  return window.all || Number(window.years) >= 10;
}

export function publicBacktestRequestPolicy(years, forceRefresh = false) {
  const extendedHistory = isExtendedBacktestWindow(years);
  return {
    allowCold: !extendedHistory,
    refresh: Boolean(forceRefresh) && !extendedHistory
  };
}

export function staleBacktestBackgroundRefreshAllowed(years = defaultYears) {
  return !normalizeBacktestWindow(years).all;
}

export async function runGuruBacktestComputationOnce(key, build) {
  const existing = guruBacktestComputationInFlight.get(key);
  if (existing) return existing;
  const pending = Promise.resolve().then(build);
  guruBacktestComputationInFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (guruBacktestComputationInFlight.get(key) === pending) {
      guruBacktestComputationInFlight.delete(key);
    }
  }
}

export async function runGuruBacktestComputationAfterCurrent(
  key,
  generation,
  build
) {
  const normalizedGeneration = String(generation || "").trim();
  if (!normalizedGeneration) {
    throw new Error("A fresh backtest generation is required.");
  }
  const generationKey = `${key}:${normalizedGeneration}`;
  const alreadyQueued = guruBacktestFreshComputationInFlight.get(generationKey);
  if (alreadyQueued) return alreadyQueued;
  const current = guruBacktestComputationInFlight.get(key);
  const pending = (current ? current.catch(() => undefined) : Promise.resolve())
    .then(build);
  guruBacktestFreshComputationInFlight.set(generationKey, pending);
  guruBacktestComputationInFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (guruBacktestFreshComputationInFlight.get(generationKey) === pending) {
      guruBacktestFreshComputationInFlight.delete(generationKey);
    }
    if (guruBacktestComputationInFlight.get(key) === pending) {
      guruBacktestComputationInFlight.delete(key);
    }
  }
}

function normalizeBacktestDetail(detail) {
  return detail === "full" || detail === "attribution" ? "full" : "compact";
}

function readAggregateBacktestCache(key, version) {
  const cached = aggregateBacktestCache.get(key);
  if (
    !cached ||
    cached.version !== version ||
    Date.now() > cached.expiresAt
  ) {
    if (cached) aggregateBacktestCache.delete(key);
    return null;
  }
  aggregateBacktestCache.delete(key);
  aggregateBacktestCache.set(key, cached);
  return cached.payload;
}

function writeAggregateBacktestCache(key, version, payload) {
  aggregateBacktestCache.delete(key);
  aggregateBacktestCache.set(key, {
    version,
    payload,
    expiresAt: aggregateBacktestExpiresAt(payload)
  });
  while (aggregateBacktestCache.size > aggregateBacktestCacheMaxEntries) {
    aggregateBacktestCache.delete(aggregateBacktestCache.keys().next().value);
  }
}

export function clearGuruBacktestAggregateCache() {
  aggregateBacktestCache.clear();
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function dateMs(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function cachedBacktestIsFresh(cached, now = Date.now()) {
  if (!cached) return false;
  if (process.env.BACKTEST_CACHE_TTL_HOURS === "0") return true;

  const generatedAt = dateMs(cached.generatedAt);
  if (!generatedAt || now - generatedAt > backtestCacheTtlMs) return false;

  const windowEnd = dateMs(cached.window?.end || cached.endDate);
  if (!windowEnd || now - windowEnd > backtestEndGraceMs) return false;

  return true;
}

function aggregateBacktestPayloadIsFresh(payload) {
  if (!Array.isArray(payload?.backtests)) return false;
  return payload.backtests.every((backtest) => (
    backtest?.status === "unsupported" ||
    (
      !backtest?.cache?.stale &&
      !backtest?.historyWarming &&
      cachedBacktestIsFresh(backtest)
    )
  ));
}

function aggregateBacktestExpiresAt(payload) {
  const now = Date.now();
  if (!aggregateBacktestPayloadIsFresh(payload)) {
    return now + aggregateBacktestStaleTtlMs;
  }
  if (process.env.BACKTEST_CACHE_TTL_HOURS === "0") {
    return Number.POSITIVE_INFINITY;
  }
  const deadlines = payload.backtests
    .filter((backtest) => backtest?.status !== "unsupported")
    .flatMap((backtest) => [
      dateMs(backtest.generatedAt) + backtestCacheTtlMs,
      dateMs(backtest.window?.end || backtest.endDate) + backtestEndGraceMs
    ])
    .filter((deadline) => Number.isFinite(deadline) && deadline > 0);
  return deadlines.length ? Math.min(...deadlines) : now + backtestCacheTtlMs;
}

function cachedBacktestIsUsable(cached) {
  if (!cached || typeof cached !== "object") return false;
  if (Array.isArray(cached.equity)) return true;
  return Boolean(cached.status || cached.window || cached.summary);
}

function cacheYearsMatch(cached, expectedYears) {
  return expectedYears === undefined || expectedYears === null ||
    String(cached?.method?.years) === String(expectedYears);
}

function strictManagerCacheCompatible(cached, expectedYears) {
  return cached?.method?.version === manager13fBacktestMethodVersion &&
    cached?.method?.securityMasterVersion === manager13fSecurityMasterVersion &&
    cacheYearsMatch(cached, expectedYears);
}

function proxyManagerCacheCompatible(cached, expectedYears) {
  return cached?.status === "proxy_ready" &&
    cached?.method?.version === manager13fBacktestMethodVersion &&
    cached?.method?.securityMasterVersion === manager13fSecurityMasterVersion &&
    cached?.method?.variant === manager13fProxyMethodVersion &&
    cached?.proxy?.methodVersion === manager13fProxyMethodVersion &&
    cached?.proxy?.securityMasterVersion === manager13fSecurityMasterVersion &&
    cacheYearsMatch(cached, expectedYears) &&
    auditPublicHoldingsProxyPayload(cached, {
      minimumCoverage: minProxyCoverage,
      minimumPositions: minProxyPositions
    }).ok &&
    Array.isArray(cached?.equity) &&
    cached.equity.length >= 2;
}

/**
 * A valid strict curve always wins, including when a newer proxy row exists.
 * A compatible proxy may replace only a strict failure/miss in the public read
 * path; it never changes the strict refresh result or its persistence slot.
 */
export function selectManagerBacktestCache(strictCached, proxyCached, expectedYears) {
  const strictCompatible = strictManagerCacheCompatible(strictCached, expectedYears);
  const proxyCompatible = proxyManagerCacheCompatible(proxyCached, expectedYears);
  const strictReady = strictCompatible &&
    strictCached?.status === "ready" &&
    auditManager13fStrictReadyPayload(strictCached, {
      minimumCoverage: minExecutionCoverage
    }).ok &&
    Array.isArray(strictCached?.equity) &&
    strictCached.equity.length >= 2;
  if (strictReady) return { payload: strictCached, kind: "strict" };
  const proxyMatchesStrictFailure = proxyCompatible &&
    strictCompatible &&
    strictCached?.status === "insufficient_data" &&
    cachedBacktestIsUsable(strictCached) &&
    proxyCached?.proxy?.strictFailureGeneratedAt === strictCached?.generatedAt;
  if (proxyMatchesStrictFailure && cachedBacktestIsUsable(proxyCached)) {
    return { payload: proxyCached, kind: "proxy" };
  }
  if (
    strictCompatible &&
    strictCached?.status !== "ready" &&
    strictCached?.status !== "proxy_ready" &&
    cachedBacktestIsUsable(strictCached)
  ) {
    return { payload: strictCached, kind: "strict" };
  }
  return { payload: null, kind: "miss" };
}

export function persistBacktestRefreshResult(
  guruId,
  years,
  payload,
  methodVersion,
  { preserveReady = true } = {}
) {
  const securityMasterVersion = String(
    payload?.method?.securityMasterVersion || ""
  ).trim();
  const result = writeGuruBacktest(guruId, years, payload, {
    preserveReadyMethodVersion: preserveReady ? methodVersion : "",
    preserveReadySecurityMasterVersion: preserveReady
      ? securityMasterVersion
      : ""
  });
  if (!result?.retainedReady) return payload;

  const readyCacheRetention = {
    retained: true,
    reason: "transient_refresh_failed",
    generatedAt: result.retainedGeneratedAt,
    window: result.retainedWindow,
    methodVersion: result.retainedMethodVersion,
    ...(result.retainedSecurityMasterVersion
      ? { securityMasterVersion: result.retainedSecurityMasterVersion }
      : {})
  };
  return {
    ...payload,
    dataQuality: {
      ...(payload?.dataQuality || {}),
      readyCacheRetention
    },
    cache: {
      ...(payload?.cache || {}),
      status: "refresh-failed-ready-retained",
      source: "sqlite",
      retainedReady: true,
      retainedGeneratedAt: result.retainedGeneratedAt
    }
  };
}

function cachedBacktestWithHit(
  cached,
  { status = "sqlite-hit", stale = false, warming = null } = {}
) {
  return {
    ...cached,
    historyWarming: warming == null
      ? stale || Boolean(cached.historyWarming)
      : Boolean(warming),
    cache: {
      ...(cached.cache || {}),
      status,
      source: "sqlite",
      stale
    }
  };
}

function scheduleStaleBacktestRefresh(guruId, { years, detail }) {
  if (process.env.BACKTEST_STALE_BACKGROUND_REFRESH === "false") return false;
  if (backtestRefreshInFlight || staleBacktestRefreshInFlight) return false;
  const window = normalizeBacktestWindow(years);
  const key = `${guruId}:${window.cacheKey}:${detail || "compact"}`;
  if (staleBacktestRefreshKeys.has(key)) return false;

  staleBacktestRefreshKeys.add(key);
  staleBacktestRefreshInFlight = loadGuruBacktest(guruId, {
    refresh: true,
    years,
    detail
  }).then((payload) => {
    console.log("[backtest-refresh] refreshed stale cache", {
      guru: guruId,
      status: payload.status,
      start: payload.window?.start || "",
      end: payload.window?.end || ""
    });
  }).catch((error) => {
    console.warn("[backtest-refresh] stale cache refresh failed", {
      guru: guruId,
      reason: error.message
    });
  }).finally(() => {
    staleBacktestRefreshKeys.delete(key);
    staleBacktestRefreshInFlight = null;
  });
  return true;
}

function isTicker(value) {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || "").trim().toUpperCase());
}

function nextTradingDate(spyPoints, date) {
  return spyPoints.find((point) => point.date >= date)?.date || null;
}

function previousTradingDate(points, date) {
  return [...(points || [])]
    .filter((point) => point.date <= date)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1)?.date || null;
}

function priceMap(points) {
  return new Map((points || []).filter((point) => point.date).map((point) => [point.date, point.close]));
}

function dailyReturn(map, previousDate, date) {
  const previous = map.get(previousDate);
  const current = map.get(date);
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) return null;
  return current / previous - 1;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(equity) {
  let peak = equity[0]?.value || 1;
  let drawdown = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.value);
    if (peak > 0) drawdown = Math.min(drawdown, point.value / peak - 1);
  }
  return drawdown;
}

function metrics(equity, returns) {
  if (!equity.length) {
    return { totalReturn: 0, cagr: 0, volatility: 0, sharpe: 0, maxDrawdown: 0 };
  }
  const first = equity[0];
  const last = equity[equity.length - 1];
  const days = Math.max(1, (dateMs(last.date) - dateMs(first.date)) / 86400000);
  const totalReturn = last.value / first.value - 1;
  const volatility = stdev(returns) * Math.sqrt(252);
  const avg = mean(returns);
  return {
    totalReturn,
    cagr: (last.value / first.value) ** (365.25 / days) - 1,
    volatility,
    sharpe: volatility ? (avg / stdev(returns)) * Math.sqrt(252) : 0,
    maxDrawdown: maxDrawdown(equity)
  };
}

function lttbIndices(points, threshold, key) {
  if (threshold >= points.length || threshold < 3) {
    return points.map((_point, index) => index);
  }

  const sampled = [0];
  const bucketSize = (points.length - 2) / (threshold - 2);
  let anchor = 0;

  for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
    const avgStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const avgEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, points.length);
    const avgLength = Math.max(1, avgEnd - avgStart);
    let avgX = 0;
    let avgY = 0;
    for (let index = avgStart; index < avgEnd; index += 1) {
      avgX += index;
      avgY += finiteNumber(points[index]?.[key]);
    }
    avgX /= avgLength;
    avgY /= avgLength;

    const rangeStart = Math.floor(bucket * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, points.length - 1);
    const anchorX = anchor;
    const anchorY = finiteNumber(points[anchor]?.[key]);
    let bestIndex = rangeStart;
    let bestArea = -1;

    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const pointY = finiteNumber(points[index]?.[key]);
      const area = Math.abs((anchorX - avgX) * (pointY - anchorY) - (anchorX - index) * (avgY - anchorY));
      if (area > bestArea) {
        bestArea = area;
        bestIndex = index;
      }
    }

    sampled.push(bestIndex);
    anchor = bestIndex;
  }

  sampled.push(points.length - 1);
  return [...new Set(sampled)].sort((left, right) => left - right);
}

function sampleEquity(points, maxPoints = responseMaxEquityPoints) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const indices = lttbIndices(points, maxPoints, "value");
  return indices.map((index) => points[index]);
}

function compactContribution(row) {
  return {
    ticker: row.ticker,
    issuer: row.issuer,
    sector: row.sector,
    industry: row.industry,
    value: row.value,
    weight: row.weight,
    ...(Number.isFinite(row.reportedBookWeight)
      ? { reportedBookWeight: row.reportedBookWeight }
      : {}),
    ...(Number.isFinite(row.proxyWeight) ? { proxyWeight: row.proxyWeight } : {}),
    endingWeight: row.endingWeight,
    startPrice: row.startPrice,
    endPrice: row.endPrice,
    returnPct: row.returnPct,
    contributionPct: row.contributionPct
  };
}

function compactQuarterContribution(quarter, includeAttribution) {
  const contributions = Array.isArray(quarter.contributions) ? quarter.contributions : [];

  return {
    id: quarter.id,
    label: quarter.label,
    reportDate: quarter.reportDate,
    filingDate: quarter.filingDate,
    acceptanceDateTime: quarter.acceptanceDateTime,
    executionDate: quarter.executionDate,
    executionTimestampSource: quarter.executionTimestampSource,
    usedLegacyFilingDateFallback: quarter.usedLegacyFilingDateFallback,
    endDate: quarter.endDate,
    nextExecutionDate: quarter.nextExecutionDate,
    days: quarter.days,
    coveragePct: quarter.coveragePct,
    pricedPositions: quarter.pricedPositions,
    selectedPositions: quarter.selectedPositions,
    portfolioReturn: quarter.portfolioReturn,
    benchmarkReturn: quarter.benchmarkReturn,
    coveredWeight: quarter.coveredWeight,
    cashWeight: quarter.cashWeight,
    contributionReturn: quarter.contributionReturn,
    attributionReconciliation: quarter.attributionReconciliation,
    sectorContributionReturn: quarter.sectorContributionReturn,
    sectorAttributionReconciliation: quarter.sectorAttributionReconciliation,
    industryContributionReturn: quarter.industryContributionReturn,
    industryAttributionReconciliation: quarter.industryAttributionReconciliation,
    contributionCount: contributions.length,
    contributions: includeAttribution ? contributions.map(compactContribution) : [],
    sectorContributions: includeAttribution ? quarter.sectorContributions || [] : [],
    industryContributions: includeAttribution ? quarter.industryContributions || [] : []
  };
}

function compactRebalance(rebalance) {
  return {
    reportDate: rebalance.reportDate,
    filingDate: rebalance.filingDate,
    acceptanceDateTime: rebalance.acceptanceDateTime,
    executionDate: rebalance.executionDate,
    executionTimestampSource: rebalance.executionTimestampSource,
    usedLegacyFilingDateFallback: rebalance.usedLegacyFilingDateFallback,
    reported13fTableValue: rebalance.reported13fTableValue,
    commonLongValue: rebalance.commonLongValue,
    optionsNotional: rebalance.optionsNotional,
    otherReportedValue: rebalance.otherReportedValue,
    totalValue: rebalance.totalValue,
    selectedValue: rebalance.selectedValue,
    pricedValue: rebalance.pricedValue,
    coveragePct: rebalance.coveragePct,
    selectedBookCoverage: rebalance.selectedBookCoverage,
    excludedWeightPct: rebalance.excludedWeightPct,
    proxyNormalizationFactor: rebalance.proxyNormalizationFactor,
    cashWeight: rebalance.cashWeight,
    unpricedPositions: rebalance.unpricedPositions,
    positions: rebalance.positions,
    selectedPositions: rebalance.selectedPositions,
    pricedPositions: rebalance.pricedPositions,
    includedPositions: rebalance.includedPositions,
    topHoldings: (rebalance.topHoldings || []).slice(0, 8)
  };
}

export function compactBacktestPayload(
  payload,
  { maxPoints = responseMaxEquityPoints, includeAttribution = false } = {}
) {
  if (!payload || !Array.isArray(payload.equity)) return payload;
  const priorSampling = payload.equitySampling || {};
  const priorSourcePoints = Number(priorSampling.sourcePoints);
  const sourcePoints = priorSampling.sampled &&
      Number.isFinite(priorSourcePoints) &&
      priorSourcePoints >= payload.equity.length
    ? priorSourcePoints
    : payload.equity.length;
  const equity = sampleEquity(payload.equity, maxPoints);
  const sampled = Boolean(priorSampling.sampled) || equity.length < payload.equity.length;
  return {
    ...payload,
    equity,
    detail: {
      attribution: includeAttribution ? "full" : "compact"
    },
    rebalances: includeAttribution ? (payload.rebalances || []).map(compactRebalance) : [],
    quarterContributions: (payload.quarterContributions || []).map((quarter) =>
      compactQuarterContribution(quarter, includeAttribution)
    ),
    equitySampling: {
      sampled,
      method: sampled ? "lttb-value" : "none",
      sourcePoints,
      returnedPoints: equity.length,
      maxPoints
    }
  };
}

function snapshotCompleteness(snapshot) {
  const commonLong = (snapshot.holdings || [])
    .filter((holding) => is13fCommonLongHolding(holding) && holding.value > 0 && holding.shares > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxHoldingsPerFiling);
  const selectedValue = commonLong.reduce((sum, holding) => sum + holding.value, 0);
  const values = summarize13fHoldingValues(snapshot.holdings || []);
  return {
    positions: snapshot.holdings?.length || 0,
    commonLongPositions: values.commonLongPositionCount,
    selectedPositions: commonLong.length,
    mappedSelectedPositions: commonLong.filter((holding) => isTicker(holding.ticker)).length,
    selectedValue,
    totalValue: values.commonLongValue,
    reported13fTableValue: values.reported13fTableValue,
    commonLongValue: values.commonLongValue,
    optionsNotional: values.optionsNotional,
    otherReportedValue: values.otherReportedValue
  };
}

function compactExcludedFiling(snapshot, reason, code = "excluded_filing") {
  return {
    reportDate: snapshot.reportDate,
    filingDate: snapshot.filingDate,
    acceptanceDateTime: snapshot.acceptanceDateTime || snapshot.filing?.acceptanceDateTime || null,
    form: snapshot.filing?.form,
    accessionNumber: snapshot.filing?.accessionNumber,
    positions: snapshot.completeness?.positions || snapshot.holdings?.length || 0,
    selectedPositions: snapshot.completeness?.selectedPositions || 0,
    selectedValue: snapshot.completeness?.selectedValue || 0,
    totalValue: snapshot.completeness?.totalValue || snapshot.totalValue || 0,
    code,
    reason
  };
}

function normalizeBacktestHistory(history) {
  const selection = selectUnambiguous13fOriginals(history);
  const normalizedHistory = selection.history.map((snapshot) => ({
    ...snapshot,
    completeness: snapshotCompleteness(snapshot)
  }));
  const excludedFilings = selection.excluded.map(({ snapshot, code, reason }) =>
    compactExcludedFiling(
      { ...snapshot, completeness: snapshotCompleteness(snapshot) },
      reason,
      code
    )
  );
  return { history: normalizedHistory, excludedFilings };
}

function buildWeights(snapshot, priceMaps, executionDate) {
  const selected = (snapshot.holdings || [])
    .filter((holding) => is13fCommonLongHolding(holding) && holding.value > 0 && holding.shares > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxHoldingsPerFiling);
  const selectedValue = selected.reduce((sum, holding) => sum + holding.value, 0);
  const priced = selected.filter((holding) =>
    isTicker(holding.ticker) && Number.isFinite(priceMaps.get(holding.ticker)?.get(executionDate))
  );
  const pricedValue = priced.reduce((sum, holding) => sum + holding.value, 0);
  const weights = selectedValue
    ? priced.map((holding) => ({
      ticker: holding.ticker,
      issuer: holding.issuer,
      sector: holding.sector || null,
      industry: holding.industry || null,
      value: holding.value,
      weight: holding.value / selectedValue
    }))
    : [];
  const coveragePct = selectedValue ? pricedValue / selectedValue : 0;

  return {
    weights,
    selectedValue,
    pricedValue,
    coveragePct,
    cashWeight: Math.max(0, 1 - coveragePct),
    selectedPositions: selected.length,
    pricedPositions: weights.length,
    unpricedPositions: selected
      .filter((holding) => !isTicker(holding.ticker) || !Number.isFinite(priceMaps.get(holding.ticker)?.get(executionDate)))
      .map((holding) => ({
        ticker: holding.ticker || null,
        issuer: holding.issuer,
        cusip: holding.cusip,
        value: holding.value,
        weight: selectedValue ? holding.value / selectedValue : 0,
        reason: isTicker(holding.ticker) ? "missing_adjusted_execution_price" : "unmapped_ticker"
      })),
    topHoldings: weights
      .slice(0, 8)
      .map((holding) => ({
        ticker: holding.ticker,
        issuer: holding.issuer,
        value: holding.value,
        weight: holding.weight
      }))
  };
}

function compactStrictFailure(failure) {
  if (!failure || typeof failure !== "object") return null;
  return {
    code: failure.code || "strict_backtest_failed",
    date: failure.date || null,
    tickers: Array.isArray(failure.tickers) ? failure.tickers.slice(0, 8) : [],
    missingWeight: failure.missingWeight != null && Number.isFinite(Number(failure.missingWeight))
      ? Number(failure.missingWeight)
      : null
  };
}

export function buildPublicHoldingsProxyPayload({
  guru,
  window,
  start,
  end,
  history,
  backtestHistory,
  excludedFilings,
  reportingCiks,
  duplicateAccessions,
  blockedReportDates,
  executionExclusions,
  universe,
  rebalances,
  tradingDates,
  priceMaps,
  strictFailureCode,
  strictFailure = null,
  coverageFailures = []
}) {
  const proxyModel = buildTrailingAwarePublicHoldingsProxy({
    rebalances,
    tradingDates,
    priceMaps,
    benchmarkSymbol: "SPY",
    requestedEnd: end,
    maxLagDays: maxTrailingPriceLagDays,
    minimumCoverage: minProxyCoverage,
    minimumPositions: minProxyPositions
  });
  if (!proxyModel.ok) {
    return { payload: null, failure: proxyModel.failure, model: proxyModel };
  }

  const proxySimulation = simulateDriftedPortfolio({
    rebalances: proxyModel.rebalances,
    tradingDates,
    priceMaps,
    benchmarkSymbol: "SPY",
    endDate: proxyModel.effectiveEnd
  });
  if (!proxySimulation.ok) {
    return {
      payload: null,
      failure: proxySimulation.failure || {
        code: "proxy_attribution_reconciliation_failed",
        reconciliation: proxySimulation.reconciliation || null
      },
      model: proxyModel
    };
  }

  const equity = proxySimulation.equity;
  const portfolioReturns = proxySimulation.portfolioReturns;
  const benchmarkReturns = proxySimulation.benchmarkReturns;
  const portfolioMetrics = metrics(
    equity.map((point) => ({ date: point.date, value: point.value })),
    portfolioReturns
  );
  const benchmarkMetrics = metrics(
    equity.map((point) => ({ date: point.date, value: point.benchmark })),
    benchmarkReturns
  );
  const observedStrictCoverage = rebalances
    .map((rebalance) => Number(rebalance.coveragePct))
    .filter(Number.isFinite);
  const proxy = {
    kind: "public_holdings_proxy",
    methodVersion: manager13fProxyMethodVersion,
    securityMasterVersion: manager13fSecurityMasterVersion,
    disclosureCode: "incomplete_selected_book_public_holdings_proxy",
    minimumSelectedBookCoverage: proxyModel.minimumSelectedBookCoverage,
    averageSelectedBookCoverage: proxyModel.averageSelectedBookCoverage,
    maximumExcludedBookWeight: proxyModel.maximumExcludedBookWeight,
    minimumIncludedPositions: proxyModel.minimumIncludedPositions,
    topExcludedHoldings: proxyModel.topExcludedHoldings,
    minimumProxyCoverage: proxyModel.minimumProxyCoverage,
    minimumProxyPositions: proxyModel.minimumProxyPositions,
    // Transitional aliases for existing clients.
    minimumReportedCoverage: proxyModel.minimumSelectedBookCoverage,
    averageReportedCoverage: proxyModel.averageSelectedBookCoverage,
    excludedWeightMax: proxyModel.maximumExcludedBookWeight
  };
  const payload = {
    generatedAt: new Date().toISOString(),
    status: "proxy_ready",
    guru: {
      id: guru.id,
      name: guru.name,
      chineseName: guru.chineseName,
      entityName: guru.entityName,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: "Public holdings proxy",
      tone: portfolioMetrics.cagr >= benchmarkMetrics.cagr ? "positive" : "negative"
    },
    window: {
      start: equity[0]?.date || proxyModel.rebalances[0]?.executionDate || start,
      end: equity.at(-1)?.date || proxyModel.effectiveEnd,
      requestedEnd: end
    },
    proxy,
    method: {
      version: manager13fBacktestMethodVersion,
      securityMasterVersion: manager13fSecurityMasterVersion,
      variant: manager13fProxyMethodVersion,
      years: window.methodYears,
      benchmark: "SPY",
      execution: "Execute at the close of the first SPY trading session strictly after each filing becomes public.",
      sameExecutionSessionPolicy,
      weighting: "Normalize only a fully priceable public sleeve after preserving each holding's weight against the selected disclosed common-long book.",
      returnEngine: "Event-rebalanced public-sleeve units drift between filing executions; daily equity and attribution share the same state.",
      returnBasis: "Dividend- and split-adjusted close total return for included holdings and SPY.",
      maxHoldingsPerFiling,
      minimumExecutionCoverage: minExecutionCoverage,
      minimumProxyCoverage: proxyModel.minimumProxyCoverage,
      minimumProxyPositions: proxyModel.minimumProxyPositions,
      rawFilings: history.length,
      excludedFilings: excludedFilings.length,
      reportingCiks,
      duplicateAccessions: duplicateAccessions.length,
      blockedReportDates: blockedReportDates.length,
      executionExclusions: executionExclusions.length,
      reason: strictFailureCode === "missing_active_price"
        ? "The strict selected-book curve failed on an active adjusted-close gap; a separately labeled fully priceable public-sleeve proxy is available."
        : "The strict selected-book curve failed its execution-coverage gate; a separately labeled fully priceable public-sleeve proxy is available."
    },
    summary: {
      ...portfolioMetrics,
      benchmark: benchmarkMetrics,
      excessCagr: portfolioMetrics.cagr - benchmarkMetrics.cagr,
      excessTotalReturn: portfolioMetrics.totalReturn - benchmarkMetrics.totalReturn,
      rebalances: proxyModel.rebalances.length,
      averagePositions: proxyModel.rebalances.length
        ? proxyModel.rebalances.reduce((sum, item) => sum + item.includedPositions, 0) /
          proxyModel.rebalances.length
        : 0,
      averageCoverage: proxyModel.averageSelectedBookCoverage,
      filings: backtestHistory.length,
      rawFilings: history.length,
      excludedFilings: excludedFilings.length,
      legacyExecutionFallbacks: proxyModel.rebalances.filter((item) =>
        item.usedLegacyFilingDateFallback
      ).length,
      universe: universe.length
    },
    dataQuality: {
      returnBasis: "total_return_adjusted_close",
      strictBacktestStatus: "insufficient_data",
      strictFailureCode,
      strictFailure: compactStrictFailure(strictFailure),
      strictMinimumExecutionCoverage: minExecutionCoverage,
      strictFailingRebalances: coverageFailures.length,
      strictMinimumObservedExecutionCoverage: observedStrictCoverage.length
        ? Math.min(...observedStrictCoverage)
        : null,
      proxyPricePolicy: "include_only_complete_active_adjusted_close_series",
      proxyMinimumSelectedBookCoverage: proxyModel.minimumSelectedBookCoverage,
      proxyAverageSelectedBookCoverage: proxyModel.averageSelectedBookCoverage,
      trailingPriceEnd: proxyModel.trailingPriceEnd,
      attributionReconciliation: proxySimulation.reconciliation
    },
    equity,
    rebalances: proxyModel.rebalances.map(({ weights, ...rebalance }) => ({
      ...rebalance,
      unpricedPositions: (rebalance.unpricedPositions || []).slice(0, 8)
    })),
    quarterContributions: proxySimulation.quarterContributions,
    cache: {
      status: "refreshed",
      source: "SEC EDGAR + public-sleeve adjusted close + SQLite"
    }
  };
  return { payload, failure: null, model: proxyModel };
}

function linkProxyToStrictFailure(proxyAttempt, strictPayload) {
  if (!proxyAttempt?.payload) return null;
  return {
    ...proxyAttempt.payload,
    generatedAt: strictPayload.generatedAt,
    proxy: {
      ...proxyAttempt.payload.proxy,
      strictFailureGeneratedAt: strictPayload.generatedAt
    }
  };
}

function portfolioReturn(weights, priceMaps, previousDate, date) {
  let value = 0;
  let coveredWeight = 0;
  for (const holding of weights) {
    const map = priceMaps.get(holding.ticker);
    const ret = map ? dailyReturn(map, previousDate, date) : null;
    if (Number.isFinite(ret)) {
      value += holding.weight * ret;
      coveredWeight += holding.weight;
    }
  }
  return { returnPct: value, coveredWeight };
}

function returnBetween(map, startDate, endDate) {
  const startPrice = map?.get(startDate);
  const endPrice = map?.get(endDate);
  if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || startPrice <= 0) return null;
  return {
    startPrice,
    endPrice,
    returnPct: endPrice / startPrice - 1
  };
}

function quarterLabel(reportDate) {
  const parsed = new Date(reportDate);
  if (Number.isNaN(parsed.getTime())) return reportDate || "Quarter";
  return `${parsed.getUTCFullYear()} Q${Math.floor(parsed.getUTCMonth() / 3) + 1}`;
}

function buildQuarterContributions(rebalances, spyPoints, priceMaps, endDate) {
  const spyMap = priceMaps.get("SPY");
  return rebalances.map((rebalance, index) => {
    const nextExecutionDate = rebalances[index + 1]?.executionDate || endDate;
    const intervalEnd = previousTradingDate(spyPoints, nextExecutionDate) || rebalance.executionDate;
    const benchmark = returnBetween(spyMap, rebalance.executionDate, intervalEnd);
    let coveredWeight = 0;
    const contributions = (rebalance.weights || []).map((holding) => {
      const pricedReturn = returnBetween(priceMaps.get(holding.ticker), rebalance.executionDate, intervalEnd);
      if (!pricedReturn) return null;
      coveredWeight += holding.weight;
      return {
        ticker: holding.ticker,
        issuer: holding.issuer,
        value: holding.value,
        weight: holding.weight,
        startPrice: pricedReturn.startPrice,
        endPrice: pricedReturn.endPrice,
        returnPct: pricedReturn.returnPct,
        contributionPct: holding.weight * pricedReturn.returnPct
      };
    }).filter(Boolean);
    const portfolioReturnPct = contributions.reduce((sum, row) => sum + row.contributionPct, 0);
    const ranked = [...contributions].sort((left, right) => right.contributionPct - left.contributionPct);

    return {
      id: `${rebalance.reportDate || rebalance.filingDate}-${rebalance.executionDate}`,
      label: quarterLabel(rebalance.reportDate),
      reportDate: rebalance.reportDate,
      filingDate: rebalance.filingDate,
      executionDate: rebalance.executionDate,
      endDate: intervalEnd,
      nextExecutionDate: rebalances[index + 1]?.executionDate || null,
      days: Math.max(0, Math.round((dateMs(intervalEnd) - dateMs(rebalance.executionDate)) / 86400000)),
      coveragePct: rebalance.coveragePct,
      pricedPositions: rebalance.pricedPositions,
      selectedPositions: rebalance.selectedPositions,
      portfolioReturn: portfolioReturnPct,
      benchmarkReturn: benchmark?.returnPct ?? null,
      coveredWeight,
      contributions: ranked,
      topContributors: ranked.slice(0, 8),
      topDetractors: ranked.slice(-8).reverse()
    };
  });
}

function compactTransaction(row) {
  return {
    ticker: row.ticker,
    issuer: row.issuer,
    action: row.action,
    value: row.value,
    transactionDate: row.transactionDate || row.date || row.reportDate || "",
    filingDate: row.filingDate || "",
    amountRange: row.amountRange || ""
  };
}

function transactionPublicDate(row) {
  return row?.filingDate || row?.reportDate || row?.transactionDate || row?.date || "";
}

function transactionReportDate(row) {
  return row?.transactionDate || row?.date || row?.reportDate || row?.filingDate || "";
}

function transactionDirection(row) {
  const action = String(row?.action || row?.type || "").toLowerCase();
  if (["sell", "sold", "sale", "reduce", "reduced", "sold_out", "exit", "disposed"].some((key) => action.includes(key))) {
    return -1;
  }
  if (["buy", "purchase", "purchased", "new", "add", "added", "increase", "increased", "acquired"].some((key) => action.includes(key))) {
    return 1;
  }
  return 0;
}

function parseCurrencyValue(value) {
  const normalized = String(value || "").replace(/[$£€,]/g, " ");
  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((item) => Number.isFinite(item));
  if (!numbers.length) return 0;
  if (numbers.length === 1) return numbers[0];
  return (numbers[0] + numbers[1]) / 2;
}

function transactionValue(row) {
  const direct = finiteNumber(row?.value, NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const estimated = finiteNumber(row?.estimatedValue, NaN);
  if (Number.isFinite(estimated) && estimated > 0) return estimated;
  return parseCurrencyValue(row?.amountRange || row?.amount || row?.transactionAmount);
}

function normalizeDisclosureTransactions(rows) {
  return (rows || [])
    .map((row) => {
      const ticker = String(row?.ticker || "").trim().toUpperCase();
      const value = transactionValue(row);
      return {
        ...row,
        ticker,
        issuer: row?.issuer || row?.company || row?.companyName || ticker,
        action: row?.action || row?.type || "",
        value,
        direction: transactionDirection(row),
        publicDate: transactionPublicDate(row),
        transactionDate: transactionReportDate(row)
      };
    })
    .filter((row) =>
      isTicker(row.ticker) &&
      row.direction !== 0 &&
      row.value > 0 &&
      row.publicDate
    )
    .sort((left, right) =>
      dateMs(left.publicDate) - dateMs(right.publicDate) ||
      String(left.ticker).localeCompare(String(right.ticker))
    );
}

function buildDisclosureRebalances(transactions, priceMaps, spyPoints) {
  const groups = new Map();
  for (const transaction of transactions) {
    const executionDate = nextTradingDate(spyPoints, transaction.publicDate);
    if (!executionDate) continue;
    const current = groups.get(executionDate) || {
      executionDate,
      filingDate: transaction.publicDate,
      reportDate: transaction.transactionDate || transaction.publicDate,
      transactions: []
    };
    current.filingDate = current.filingDate && current.filingDate > transaction.publicDate
      ? current.filingDate
      : transaction.publicDate;
    current.reportDate = current.reportDate && current.reportDate > transaction.transactionDate
      ? current.reportDate
      : (transaction.transactionDate || transaction.publicDate);
    current.transactions.push(transaction);
    groups.set(executionDate, current);
  }

  const positionValues = new Map();
  const issuers = new Map();
  const rebalances = [];

  for (const group of [...groups.values()].sort((left, right) => String(left.executionDate).localeCompare(String(right.executionDate)))) {
    for (const transaction of group.transactions) {
      const current = positionValues.get(transaction.ticker) || 0;
      const nextValue = Math.max(0, current + transaction.direction * transaction.value);
      if (nextValue > 0) {
        positionValues.set(transaction.ticker, nextValue);
        issuers.set(transaction.ticker, transaction.issuer);
      } else {
        positionValues.delete(transaction.ticker);
      }
    }

    const selected = [...positionValues.entries()]
      .map(([ticker, value]) => ({
        ticker,
        issuer: issuers.get(ticker) || ticker,
        value,
        shares: 1
      }))
      .filter((holding) => holding.value > 0)
      .sort((left, right) => right.value - left.value)
      .slice(0, maxHoldingsPerFiling);

    const selectedValue = selected.reduce((sum, holding) => sum + holding.value, 0);
    const priced = selected.filter((holding) => Number.isFinite(priceMaps.get(holding.ticker)?.get(group.executionDate)));
    const pricedValue = priced.reduce((sum, holding) => sum + holding.value, 0);
    const weights = pricedValue
      ? priced.map((holding) => ({
        ticker: holding.ticker,
        issuer: holding.issuer,
        value: holding.value,
        weight: holding.value / pricedValue
      }))
      : [];

    if (!weights.length) continue;

    rebalances.push({
      reportDate: group.reportDate,
      filingDate: group.filingDate,
      executionDate: group.executionDate,
      totalValue: selectedValue,
      selectedValue,
      pricedValue,
      coveragePct: selectedValue ? pricedValue / selectedValue : 0,
      positions: positionValues.size,
      selectedPositions: selected.length,
      pricedPositions: weights.length,
      weights,
      topHoldings: weights.slice(0, 8),
      filing: {
        form: "STOCK Act",
        transactions: group.transactions.map(compactTransaction)
      }
    });
  }

  return rebalances;
}

async function loadDisclosureBacktest(
  guru,
  window,
  {
    refresh,
    includeAttribution,
    persist = true,
    allowCold = true,
    shareComputation = true,
    refreshGeneration = "",
    preserveReadyOnFailure = true
  }
) {
  if (guru.disableSimulation) return unsupportedBacktest(guru, window);
  const preserveReady = preserveReadyOnFailure && !refreshGeneration;

  const cached = readGuruBacktest(guru.id, window.cacheKey);
  const cacheMethodCompatible = cached?.method?.version === disclosureBacktestMethodVersion;
  if (!refresh && cacheMethodCompatible && cachedBacktestIsFresh(cached)) {
    return compactBacktestPayload(cachedBacktestWithHit(cached), { includeAttribution });
  }
  if (!refresh && cacheMethodCompatible && cachedBacktestIsUsable(cached)) {
    const warming = staleBacktestBackgroundRefreshAllowed(window.methodYears)
      && scheduleStaleBacktestRefresh(guru.id, {
        years: window.methodYears,
        detail: includeAttribution ? "full" : "compact"
      });
    return compactBacktestPayload(cachedBacktestWithHit(cached, {
      status: "sqlite-stale",
      stale: true,
      warming
    }), { includeAttribution });
  }
  if (!allowCold) return coldBacktestUnavailable(guru, window);

  if (shareComputation) {
    const inFlightKey = `${guru.id}:${window.cacheKey}:${persist ? "persist" : "ephemeral"}`;
    const build = () =>
      loadDisclosureBacktest(guru, window, {
        refresh,
        includeAttribution: true,
        persist,
        allowCold,
        shareComputation: false,
        refreshGeneration: "",
        // A mutation-following recomputation must invalidate a pre-mutation
        // curve if the repaired generation still fails its audit gates.
        preserveReadyOnFailure: preserveReady
      });
    const payload = refreshGeneration
      ? await runGuruBacktestComputationAfterCurrent(
          inFlightKey,
          refreshGeneration,
          build
        )
      : await runGuruBacktestComputationOnce(inFlightKey, build);
    return compactBacktestPayload(payload, { includeAttribution });
  }

  const dashboard = await loadGuruDashboard({ forceRefresh: false });
  const guruPayload = (dashboard.gurus || []).find((item) => item.id === guru.id) || {};
  const allTransactions = normalizeDisclosureTransactions(guruPayload.transactions || []);
  const end = today();
  const firstDisclosureDate = allTransactions[0]?.publicDate;
  const start = window.all
    ? firstDisclosureDate || yearsAgoDate(end, 5)
    : yearsAgoDate(end, window.years);
  const transactions = allTransactions.filter((row) => row.publicDate >= start && row.publicDate <= end);
  const spySeries = await loadPriceSeries("SPY", { start, end });
  const spyPoints = (spySeries.points || []).filter((point) => point.date >= start && point.date <= end);

  if (transactions.length < 2 || spyPoints.length < 30) {
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "STOCK Act 模拟待补数据",
        tone: "muted"
      },
      window: { start, end },
      method: {
        version: disclosureBacktestMethodVersion,
        years: window.methodYears,
        benchmark: "SPY",
        rawTransactions: allTransactions.length,
        reason: "Not enough usable disclosed transactions or SPY price points are available."
      },
      summary: {},
      equity: [],
      rebalances: [],
      quarterContributions: []
    };
    const persistedPayload = persist
      ? persistBacktestRefreshResult(
          guru.id,
          window.cacheKey,
          payload,
          disclosureBacktestMethodVersion,
          { preserveReady }
        )
      : payload;
    return persist
      ? compactBacktestPayload(persistedPayload, { includeAttribution })
      : payload;
  }

  const universe = [...new Set(transactions.map((row) => row.ticker))]
    .filter(isTicker)
    .slice(0, maxHoldingsPerFiling * 2);
  const priceMaps = new Map([["SPY", priceMap(spyPoints)]]);

  await mapWithConcurrency(
    holdingPriceLoadUniverse(universe, "SPY"),
    priceConcurrency,
    async (ticker) => {
      try {
        const series = await loadPriceSeries(ticker, { start, end });
        priceMaps.set(ticker, priceMap(series.points || []));
      } catch {
        priceMaps.set(ticker, new Map());
      }
    }
  );

  const rebalances = buildDisclosureRebalances(transactions, priceMaps, spyPoints);

  if (rebalances.length < 1) {
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "STOCK Act 模拟待补价格",
        tone: "muted"
      },
      window: { start, end },
      method: {
        version: disclosureBacktestMethodVersion,
        years: window.methodYears,
        benchmark: "SPY",
        rawTransactions: allTransactions.length,
        reason: "Disclosed transactions were found, but no tickers had usable price coverage at disclosure execution dates."
      },
      summary: {},
      equity: [],
      rebalances: [],
      quarterContributions: []
    };
    const persistedPayload = persist
      ? persistBacktestRefreshResult(
          guru.id,
          window.cacheKey,
          payload,
          disclosureBacktestMethodVersion,
          { preserveReady }
        )
      : payload;
    return persist
      ? compactBacktestPayload(persistedPayload, { includeAttribution })
      : payload;
  }

  const firstDate = rebalances[0]?.executionDate;
  const dates = spyPoints.map((point) => point.date).filter((date) => date >= firstDate);
  let activeWeights = rebalances[0]?.weights || [];
  let rebalanceIndex = 0;
  let portfolioValue = 1;
  let benchmarkValue = 1;
  const equity = dates.length ? [{ date: dates[0], value: portfolioValue, benchmark: benchmarkValue }] : [];
  const portfolioReturns = [];
  const benchmarkReturns = [];
  const coverage = [];

  for (let index = 1; index < dates.length; index += 1) {
    const previousDate = dates[index - 1];
    const date = dates[index];
    const portfolio = portfolioReturn(activeWeights, priceMaps, previousDate, date);
    const spyReturn = dailyReturn(priceMaps.get("SPY"), previousDate, date) ?? 0;
    portfolioValue *= 1 + portfolio.returnPct;
    benchmarkValue *= 1 + spyReturn;
    portfolioReturns.push(portfolio.returnPct);
    benchmarkReturns.push(spyReturn);
    coverage.push(portfolio.coveredWeight);
    equity.push({ date, value: portfolioValue, benchmark: benchmarkValue });

    while (rebalanceIndex + 1 < rebalances.length && rebalances[rebalanceIndex + 1].executionDate <= date) {
      rebalanceIndex += 1;
      activeWeights = rebalances[rebalanceIndex].weights;
    }
  }

  const portfolioEquity = equity.map((point) => ({ date: point.date, value: point.value }));
  const benchmarkEquity = equity.map((point) => ({ date: point.date, value: point.benchmark }));
  const portfolioMetrics = metrics(portfolioEquity, portfolioReturns);
  const benchmarkMetrics = metrics(benchmarkEquity, benchmarkReturns);
  const quarterContributions = buildQuarterContributions(rebalances, spyPoints, priceMaps, equity.at(-1)?.date || end);
  const payload = {
    generatedAt: new Date().toISOString(),
    status: "ready",
    guru: {
      id: guru.id,
      name: guru.name,
      chineseName: guru.chineseName,
      entityName: guru.entityName,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: "STOCK Act 披露日复制模拟",
      tone: portfolioMetrics.cagr >= benchmarkMetrics.cagr ? "positive" : "negative"
    },
    window: {
      start: equity[0]?.date || firstDate || start,
      end: equity.at(-1)?.date || end
    },
    method: {
      version: disclosureBacktestMethodVersion,
      years: window.methodYears,
      benchmark: "SPY",
      execution: "Use the first tradable SPY date on or after each public STOCK Act filing date; disclosed trades update the model portfolio after that close.",
      weighting: "Aggregate disclosed transaction midpoint values by ticker; buys add exposure, sells reduce estimated exposure, then priced positive exposures are normalized to 100%.",
      maxHoldingsPerFiling,
      rawTransactions: allTransactions.length,
      includedTransactions: transactions.length,
      assumptions: [
        "STOCK Act disclosures are transaction reports, not complete quarterly portfolios.",
        "Amount ranges are converted to midpoint values; sales cannot reveal the undisclosed starting position.",
        "Options and derivative disclosures are simplified into ticker-level notional exposure when a usable ticker and amount are present.",
        "The simulation trades only after public filing dates, so disclosure lag is reflected.",
        "Missing, non-ticker, or unpriced rows are excluded before weights are normalized.",
        "Transaction costs, taxes, slippage, private assets, cash, and household holdings outside disclosed trades are excluded."
      ]
    },
    summary: {
      ...portfolioMetrics,
      benchmark: benchmarkMetrics,
      excessCagr: portfolioMetrics.cagr - benchmarkMetrics.cagr,
      excessTotalReturn: portfolioMetrics.totalReturn - benchmarkMetrics.totalReturn,
      rebalances: rebalances.length,
      averagePositions: rebalances.length
        ? rebalances.reduce((sum, item) => sum + item.pricedPositions, 0) / rebalances.length
        : 0,
      averageCoverage: coverage.length ? mean(coverage) : 0,
      transactions: transactions.length,
      rawTransactions: allTransactions.length,
      universe: universe.length
    },
    equity,
    rebalances: rebalances.map(({ weights, ...rebalance }) => rebalance),
    quarterContributions,
    cache: {
      status: "refreshed",
      source: "STOCK Act + Yahoo + SQLite"
    }
  };

  if (persist) writeGuruBacktest(guru.id, window.cacheKey, payload);
  return persist ? compactBacktestPayload(payload, { includeAttribution }) : payload;
}

function unsupportedBacktest(guru, window) {
  const disabledByConfig = Boolean(guru.disableSimulation);
  return {
    generatedAt: new Date().toISOString(),
    status: "unsupported",
    guru: {
      id: guru.id,
      name: guru.name,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: disabledByConfig ? "13F copy 模拟关闭" : "非13F，不模拟抄作业",
      tone: "muted"
    },
    method: {
      years: window.methodYears,
      benchmark: "SPY",
      reason:
        guru.simulationNote ||
        "This guru does not publish a quarterly long-equity 13F portfolio suitable for proportional copy-trading."
    }
  };
}

function coldBacktestUnavailable(guru, window) {
  return {
    generatedAt: new Date().toISOString(),
    status: "not_ready",
    guru: {
      id: guru.id,
      name: guru.name,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: "Extended-history audit not ready",
      tone: "muted"
    },
    method: {
      version: guru.type === "manager13f"
        ? manager13fBacktestMethodVersion
        : guru.type === "congress"
          ? disclosureBacktestMethodVersion
          : undefined,
      securityMasterVersion: guru.type === "manager13f"
        ? manager13fSecurityMasterVersion
        : undefined,
      years: window.methodYears,
      benchmark: "SPY",
      reason: "The requested extended-history backtest is not pre-warmed under the current audit method. The request failed closed without starting a cold synchronous computation."
    },
    summary: {},
    equity: [],
    rebalances: [],
    quarterContributions: [],
    cache: {
      status: "miss",
      source: "sqlite",
      stale: false
    }
  };
}

export async function loadGuruBacktest(
  guruId,
  {
    refresh = false,
    years = defaultYears,
    detail = "compact",
    persist = true,
    allowCold = true,
    shareComputation = true,
    refreshGeneration = "",
    preserveReadyOnFailure = true
  } = {}
) {
  const window = normalizeBacktestWindow(years);
  const includeAttribution = detail === "full" || detail === "attribution";
  const guru = gurus.find((item) => item.id === guruId);
  if (!guru) throw new Error(`Guru not found: ${guruId}`);

  if (guru.type === "congress") {
    return loadDisclosureBacktest(guru, window, {
      refresh,
      includeAttribution,
      persist,
      allowCold,
      shareComputation,
      refreshGeneration,
      preserveReadyOnFailure
    });
  }

  if (guru.type !== "manager13f" || guru.disableSimulation) {
    return unsupportedBacktest(guru, window);
  }
  const preserveReady = preserveReadyOnFailure && !refreshGeneration;

  const strictCached = readGuruBacktest(guruId, window.cacheKey);
  const proxyCached = readGuruBacktestProxy(guruId, window.cacheKey);
  const cachedSelection = selectManagerBacktestCache(
    strictCached,
    proxyCached,
    window.methodYears
  );
  const cached = cachedSelection.payload;
  if (!refresh && cached && cachedBacktestIsFresh(cached)) {
    return compactBacktestPayload(cachedBacktestWithHit(cached), { includeAttribution });
  }
  if (!refresh && cached && cachedBacktestIsUsable(cached)) {
    const warming = staleBacktestBackgroundRefreshAllowed(window.methodYears)
      && scheduleStaleBacktestRefresh(guruId, { years, detail });
    return compactBacktestPayload(cachedBacktestWithHit(cached, {
      status: "sqlite-stale",
      stale: true,
      warming
    }), { includeAttribution });
  }
  if (!allowCold) return coldBacktestUnavailable(guru, window);

  if (shareComputation) {
    const inFlightKey = `${guruId}:${window.cacheKey}:${persist ? "persist" : "ephemeral"}`;
    const build = () =>
      loadGuruBacktest(guruId, {
        refresh,
        years,
        detail: "full",
        persist,
        allowCold,
        shareComputation: false,
        refreshGeneration: "",
        // A mutation-following recomputation must invalidate a pre-mutation
        // curve if the repaired generation still fails its audit gates.
        preserveReadyOnFailure: preserveReady
      });
    const payload = refreshGeneration
      ? await runGuruBacktestComputationAfterCurrent(
          inFlightKey,
          refreshGeneration,
          build
        )
      : await runGuruBacktestComputationOnce(inFlightKey, build);
    return compactBacktestPayload(payload, { includeAttribution });
  }

  const end = today();
  const history = await load13fHoldingHistory(guru, {
    years: window.years,
    limit: window.limit
  });
  const normalizedHistory = normalizeBacktestHistory(history);
  const backtestHistory = normalizedHistory.history;
  const excludedFilings = [...new Map([
    ...(history.excludedFilings || []),
    ...normalizedHistory.excludedFilings
  ].map((filing) => [
    `${filing.filerCik || "unknown"}:${filing.accessionNumber || "unknown"}:${filing.code || "excluded"}`,
    filing
  ])).values()];
  const reportingCiks = history.reportingCiks || [guru.cik, ...(guru.alternateCiks || [])];
  const duplicateAccessions = history.duplicateAccessions || [];
  const blockedReportDates = history.blockedReportDates || [];
  const firstFilingDate =
    backtestHistory[0]?.filingDate ||
    backtestHistory[0]?.reportDate ||
    history[0]?.filingDate ||
    history[0]?.reportDate;
  const start = window.all
    ? firstFilingDate || yearsAgoDate(end, 5)
    : yearsAgoDate(end, window.years);
  const spySeries = await loadPriceSeries("SPY", {
    start,
    end,
    requireAdjusted: true,
    requireFullRange: true
  });
  const spyPoints = (spySeries.points || []).filter((point) => point.date >= start && point.date <= end);
  const spyTotalReturnMap = adjustedClosePriceMap(spyPoints);
  const tradingDates = spyPoints.map((point) => point.date);

  if (
    backtestHistory.length < 2 ||
    spyPoints.length < 30 ||
    spyTotalReturnMap.size < 30 ||
    spySeries.returnBasis !== "total_return_adjusted_close"
  ) {
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "13F copy 模拟待补数据",
        tone: "muted"
      },
      window: { start, end },
      method: {
        version: manager13fBacktestMethodVersion,
        securityMasterVersion: manager13fSecurityMasterVersion,
        years: window.methodYears,
        benchmark: "SPY",
        maxHoldingsPerFiling,
        rawFilings: history.length,
        excludedFilings,
        reportingCiks,
        duplicateAccessions,
        blockedReportDates,
        reason: spySeries.returnBasis !== "total_return_adjusted_close"
          ? "SPY adjusted-close total-return history is unavailable; the backtest fails closed instead of substituting price return."
          : "Not enough historical 13F filings or SPY price points are available."
      },
      dataQuality: {
        returnBasis: spySeries.returnBasis || "unavailable",
        failurePolicy: "fail_closed",
        priceFailure: spySeries.failure || null
      },
      summary: {},
      equity: [],
      rebalances: [],
      quarterContributions: []
    };
    const persistedPayload = persist
      ? persistBacktestRefreshResult(
          guruId,
          window.cacheKey,
          payload,
          manager13fBacktestMethodVersion,
          { preserveReady }
        )
      : payload;
    return persist
      ? compactBacktestPayload(persistedPayload, { includeAttribution })
      : payload;
  }

  const selectedTickers = (snapshot) => (snapshot.holdings || [])
    .filter((holding) =>
      is13fCommonLongHolding(holding) &&
      holding.value > 0 &&
      holding.shares > 0
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, maxHoldingsPerFiling)
    .map((holding) => holding.ticker)
    .filter(isTicker);
  const executionExclusions = [];
  const executionCandidates = [];
  for (const snapshot of backtestHistory) {
    const decision = filingExecutionDecision(snapshot, tradingDates);
    if (!decision.executionDate) {
      executionExclusions.push({
        reportDate: snapshot.reportDate,
        filingDate: snapshot.filingDate,
        acceptanceDateTime:
          snapshot.acceptanceDateTime || snapshot.filing?.acceptanceDateTime || null,
        accessionNumber: snapshot.filing?.accessionNumber,
        code: "execution_session_unavailable",
        reason: decision.reason
      });
      continue;
    }
    executionCandidates.push({
      snapshot,
      decision,
      selectedTickers: selectedTickers(snapshot)
    });
  }
  const normalizedSchedule = collapseSupersededSameSessionSnapshots(executionCandidates);
  for (const exclusion of normalizedSchedule.exclusions) {
    const snapshot = exclusion.candidate.snapshot;
    executionExclusions.push({
      reportDate: snapshot.reportDate,
      filingDate: snapshot.filingDate,
      acceptanceDateTime:
        snapshot.acceptanceDateTime || snapshot.filing?.acceptanceDateTime || null,
      accessionNumber: snapshot.filing?.accessionNumber,
      executionDate: exclusion.executionDate,
      code: exclusion.code,
      supersededByReportDate: exclusion.supersededByReportDate,
      supersededByAccessionNumber: exclusion.supersededByAccessionNumber,
      reason: exclusion.reason
    });
  }
  const executionSchedule = normalizedSchedule.schedule;
  const universe = [...new Set(executionSchedule.flatMap((candidate) =>
    candidate.selectedTickers
  ))];
  const activePriceWindows = manager13fActivePriceWindows(executionSchedule, end);
  const priceMaps = new Map([["SPY", spyTotalReturnMap]]);
  const priceSeriesQuality = new Map([["SPY", {
    source: spySeries.source,
    returnBasis: spySeries.returnBasis,
    points: spyTotalReturnMap.size
  }]]);

  await mapWithConcurrency(
    holdingPriceLoadUniverse(universe, "SPY"),
    priceConcurrency,
    async (ticker) => {
      try {
        const activeWindow = activePriceWindows.get(ticker) || { start, end };
        const series = await loadPriceSeries(ticker, {
          start: activeWindow.start,
          end: activeWindow.end,
          requireAdjusted: true,
          expectedTradingDates: activeTradingDatesForPriceWindow(
            tradingDates,
            activeWindow
          )
        });
        const intervalAwarePoints = series.failure?.code === "expected_internal_session_gap"
          ? series.observedAdjustedPoints || []
          : series.points || [];
        const map = adjustedClosePriceMap(intervalAwarePoints);
        priceMaps.set(ticker, map);
        priceSeriesQuality.set(ticker, {
          source: series.source,
          ...(series.upstreamSource ? { upstreamSource: series.upstreamSource } : {}),
          returnBasis: series.returnBasis,
          points: map.size,
          ...(series.failure ? { failure: series.failure } : {})
        });
      } catch (error) {
        priceMaps.set(ticker, new Map());
        priceSeriesQuality.set(ticker, {
          source: "unavailable",
          returnBasis: "unavailable",
          points: 0,
          error: error.message
        });
      }
    }
  );

  const rebalances = [];
  for (const { snapshot, decision } of executionSchedule) {
    const values = summarize13fHoldingValues(snapshot.holdings || []);
    const weightModel = buildWeights(snapshot, priceMaps, decision.executionDate);
    rebalances.push({
      reportDate: snapshot.reportDate,
      filingDate: snapshot.filingDate,
      acceptanceDateTime: decision.acceptanceDateTime,
      publicTimestamp: decision.publicTimestamp,
      publicDate: decision.publicDate,
      executionDate: decision.executionDate,
      executionTimestampSource: decision.executionTimestampSource,
      usedLegacyFilingDateFallback: decision.usedLegacyFilingDateFallback,
      executionPolicy: decision.policy,
      reported13fTableValue: values.reported13fTableValue,
      commonLongValue: values.commonLongValue,
      optionsNotional: values.optionsNotional,
      otherReportedValue: values.otherReportedValue,
      totalValue: values.commonLongValue,
      totalValueBasis: "common_long_shares",
      selectedValue: weightModel.selectedValue,
      pricedValue: weightModel.pricedValue,
      coveragePct: weightModel.coveragePct,
      cashWeight: weightModel.cashWeight,
      positions: values.commonLongPositionCount,
      reportedRows: values.reportedRowCount,
      optionPositions: values.optionPositionCount,
      selectedPositions: weightModel.selectedPositions,
      pricedPositions: weightModel.pricedPositions,
      unpricedPositions: weightModel.unpricedPositions,
      weights: weightModel.weights,
      topHoldings: weightModel.topHoldings,
      filing: snapshot.filing
    });
  }

  const coverageFailures = rebalances.filter((rebalance) =>
    !rebalance.weights.length || rebalance.coveragePct < minExecutionCoverage
  );

  const coverageProxyAttempt = rebalances.length && coverageFailures.length
    ? buildPublicHoldingsProxyPayload({
        guru,
        window,
        start,
        end,
        history,
        backtestHistory,
        excludedFilings,
        reportingCiks,
        duplicateAccessions,
        blockedReportDates,
        executionExclusions,
        universe,
        rebalances,
        tradingDates,
        priceMaps,
        strictFailureCode: "execution_coverage_below_minimum",
        coverageFailures
      })
    : { payload: null, failure: null };

  if (rebalances.length < 1 || coverageFailures.length) {
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "13F copy 模拟待补价格",
        tone: "muted"
      },
      window: { start, end },
      method: {
        version: manager13fBacktestMethodVersion,
        securityMasterVersion: manager13fSecurityMasterVersion,
        years: window.methodYears,
        benchmark: "SPY",
        maxHoldingsPerFiling,
        rawFilings: history.length,
        excludedFilings,
        reportingCiks,
        duplicateAccessions,
        blockedReportDates,
        executionExclusions,
        sameExecutionSessionPolicy,
        minimumExecutionCoverage: minExecutionCoverage,
        reason: coverageFailures.length
          ? "At least one filing falls below the minimum adjusted-close execution coverage; the backtest fails closed instead of renormalizing the covered subset."
          : "Historical filings were found, but no holdings had usable adjusted-close ticker coverage."
      },
      dataQuality: {
        returnBasis: "total_return_adjusted_close",
        failurePolicy: "fail_closed",
        proxyFailure: coverageProxyAttempt.failure,
        coverageFailures: coverageFailures.map((rebalance) => ({
          reportDate: rebalance.reportDate,
          executionDate: rebalance.executionDate,
          coveragePct: rebalance.coveragePct,
          unpricedPositions: rebalance.unpricedPositions
        }))
      },
      summary: {},
      equity: [],
      rebalances: [],
      quarterContributions: []
    };
    const linkedProxyPayload = linkProxyToStrictFailure(coverageProxyAttempt, payload);
    const persistedPayload = persist
      ? persistBacktestRefreshResult(
          guruId,
          window.cacheKey,
          payload,
          manager13fBacktestMethodVersion,
          { preserveReady }
        )
      : payload;
    if (linkedProxyPayload) {
      if (persist) {
        writeGuruBacktestProxy(guruId, window.cacheKey, linkedProxyPayload);
      }
      return compactBacktestPayload(linkedProxyPayload, { includeAttribution });
    }
    return persist
      ? compactBacktestPayload(persistedPayload, { includeAttribution })
      : payload;
  }

  const firstDate = rebalances[0]?.executionDate;
  const trailingPriceEnd = resolveTrailingCommonPriceEnd({
    rebalances,
    tradingDates,
    priceMaps,
    benchmarkSymbol: "SPY",
    requestedEnd: end,
    maxLagDays: maxTrailingPriceLagDays
  });
  const effectiveEnd = trailingPriceEnd.effectiveEnd || end;
  const simulation = simulateDriftedPortfolio({
    rebalances,
    tradingDates,
    priceMaps,
    benchmarkSymbol: "SPY",
    endDate: effectiveEnd
  });
  if (!simulation.ok) {
    const activePriceProxyAttempt = simulation.failure?.code === "missing_active_price"
      ? buildPublicHoldingsProxyPayload({
          guru,
          window,
          start,
          end,
          history,
          backtestHistory,
          excludedFilings,
          reportingCiks,
          duplicateAccessions,
          blockedReportDates,
          executionExclusions,
          universe,
          rebalances,
          tradingDates,
          priceMaps,
          strictFailureCode: "missing_active_price",
          strictFailure: simulation.failure,
          coverageFailures
        })
      : { payload: null, failure: null };
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "13F copy 模拟覆盖失败",
        tone: "muted"
      },
      window: { start, end },
      method: {
        version: manager13fBacktestMethodVersion,
        securityMasterVersion: manager13fSecurityMasterVersion,
        years: window.methodYears,
        benchmark: "SPY",
        rawFilings: history.length,
        excludedFilings,
        reportingCiks,
        duplicateAccessions,
        blockedReportDates,
        executionExclusions,
        sameExecutionSessionPolicy,
        reason: simulation.failure?.code === "missing_active_price"
          ? "A held security lacks an adjusted-close observation while active; the backtest fails closed instead of booking a zero return or carrying a stale quote."
          : simulation.failure?.code === "duplicate_execution_date"
            ? "Multiple disclosure events resolve to the same execution date; the backtest fails closed instead of applying ambiguous same-close rebalance order."
          : "The drifted-position return engine did not pass its coverage or attribution reconciliation gate."
      },
      dataQuality: {
        returnBasis: "total_return_adjusted_close",
        failurePolicy: "fail_closed_without_zero_return_or_forward_fill",
        trailingPriceEnd,
        failure: simulation.failure || {
          code: "attribution_reconciliation_failed",
          reconciliation: simulation.reconciliation || null
        },
        proxyFailure: activePriceProxyAttempt.failure
      },
      summary: {},
      equity: [],
      rebalances: [],
      quarterContributions: []
    };
    const linkedProxyPayload = linkProxyToStrictFailure(activePriceProxyAttempt, payload);
    const persistedPayload = persist
      ? persistBacktestRefreshResult(
          guruId,
          window.cacheKey,
          payload,
          manager13fBacktestMethodVersion,
          { preserveReady }
        )
      : payload;
    if (linkedProxyPayload) {
      if (persist) {
        writeGuruBacktestProxy(guruId, window.cacheKey, linkedProxyPayload);
      }
      return compactBacktestPayload(linkedProxyPayload, { includeAttribution });
    }
    return persist
      ? compactBacktestPayload(persistedPayload, { includeAttribution })
      : payload;
  }

  const equity = simulation.equity;
  const portfolioReturns = simulation.portfolioReturns;
  const benchmarkReturns = simulation.benchmarkReturns;
  const coverage = simulation.coverage;

  const portfolioEquity = equity.map((point) => ({ date: point.date, value: point.value }));
  const benchmarkEquity = equity.map((point) => ({ date: point.date, value: point.benchmark }));
  const portfolioMetrics = metrics(portfolioEquity, portfolioReturns);
  const benchmarkMetrics = metrics(benchmarkEquity, benchmarkReturns);
  const quarterContributions = simulation.quarterContributions;
  const payload = {
    generatedAt: new Date().toISOString(),
    status: "ready",
    guru: {
      id: guru.id,
      name: guru.name,
      chineseName: guru.chineseName,
      entityName: guru.entityName,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: "13F 披露日复制模拟",
      tone: portfolioMetrics.cagr >= benchmarkMetrics.cagr ? "positive" : "negative"
    },
    window: {
      start: equity[0]?.date || firstDate || start,
      end: equity.at(-1)?.date || effectiveEnd
    },
    method: {
      version: manager13fBacktestMethodVersion,
      securityMasterVersion: manager13fSecurityMasterVersion,
      years: window.methodYears,
      benchmark: "SPY",
      execution: "Retain the SEC acceptance timestamp and execute at the close of the first SPY trading session strictly after its public calendar date. Legacy snapshots without acceptance time use the same conservative next-session rule after filingDate.",
      weighting: "Rank non-option SH rows by disclosed value after excluding titles that explicitly identify debt, preferreds, rights, or warrants. Priced common longs keep their selected-book weights; unmapped or unpriced weight remains cash and is never renormalized into covered names.",
      returnEngine: "Event-rebalanced holdings with position units drifting between filing executions; daily equity and security attribution share the same state.",
      returnBasis: "Dividend- and split-adjusted close total return for both holdings and SPY.",
      amendmentPolicy: "Retain the first public original per reporting CIK and report date, exclude ambiguous amendments, then merge every configured CIK for the quarter. The combined book is executable only after its last component is public.",
      sameExecutionSessionPolicy,
      reportingCiks,
      duplicateAccessions,
      blockedReportDates,
      corporateActionPolicy: "Adjusted-close returns incorporate price-series splits and dividends. Reported share changes remain unadjusted and are not verified trade classifications.",
      maxHoldingsPerFiling,
      minimumExecutionCoverage: minExecutionCoverage,
      rawFilings: history.length,
      excludedFilings,
      executionExclusions,
      assumptions: [
        "13F only contains long U.S.-reportable holdings and is delayed from quarter end.",
        "The simulation never uses the filing-date close: it trades at the following trading-session close and applies new units after that close.",
        "Put/call rows, non-SH rows, and SH rows whose titles explicitly identify debt, preferreds, rights, or warrants are excluded from common-long weights and reported separately as options notional or other reported value.",
        "Unmapped or missing execution-price rows remain explicit cash; the entire result fails closed below the minimum coverage threshold.",
        "A missing active adjusted close stops the backtest; it is never converted into a zero return or silently forward-filled.",
        `When the SPY series reaches its requested market end and at least two active holdings share the same trailing vendor cutoff, the effective end may move back by at most ${maxTrailingPriceLagDays} calendar days to that common observed date; a single stale holding or mixed cutoff dates remain fail closed, and requested/effective dates remain auditable.`,
        "SPY must cover the full requested window. A delisted or acquired security may end earlier only if every observed row is adjusted and the position was no longer active before observations stop.",
        "Original/amendment ambiguity is resolved per reporting CIK; an orphan amendment blocks the combined quarter, and every exclusion remains in the audit ledger.",
        "Quarter contributions are generated from the same drifted units as the headline equity curve and must reconcile within the engine tolerance.",
        "Reported share changes are raw 13F observations, not corporate-action-adjusted proof of purchases or sales.",
        "Yahoo adjusted-close history is mutable vendor data rather than an immutable institutional price archive; a missing delisting/suspension observation stops the result.",
        "Transaction costs, taxes, slippage, shorts, private holdings, and fund-level cash are excluded."
      ]
    },
    summary: {
      ...portfolioMetrics,
      benchmark: benchmarkMetrics,
      excessCagr: portfolioMetrics.cagr - benchmarkMetrics.cagr,
      excessTotalReturn: portfolioMetrics.totalReturn - benchmarkMetrics.totalReturn,
      rebalances: rebalances.length,
      averagePositions: rebalances.length
        ? rebalances.reduce((sum, item) => sum + item.pricedPositions, 0) / rebalances.length
        : 0,
      averageCoverage: coverage.length ? mean(coverage) : 0,
      filings: backtestHistory.length,
      rawFilings: history.length,
      excludedFilings: excludedFilings.length,
      legacyExecutionFallbacks: rebalances.filter((item) => item.usedLegacyFilingDateFallback).length,
      universe: universe.length
    },
    dataQuality: {
      returnBasis: "total_return_adjusted_close",
      priceSeries: Object.fromEntries(priceSeriesQuality),
      minimumExecutionCoverage: minExecutionCoverage,
      minimumObservedExecutionCoverage: Math.min(...rebalances.map((item) => item.coveragePct)),
      missingExecutionWeightHeldAsCash: true,
      activeMissingPricePolicy: "fail_closed_without_zero_return_or_forward_fill",
      priceRangePolicy: "benchmark_full_window_security_active_dates_bounded_common_trailing_end",
      trailingPriceEnd,
      acceptanceTimestampFilings: rebalances.filter((item) => !item.usedLegacyFilingDateFallback).length,
      legacyFilingDateFallbacks: rebalances.filter((item) => item.usedLegacyFilingDateFallback).length,
      amendmentPolicy: "original_only_fail_closed",
      reportingCiks,
      duplicateAccessions,
      blockedReportDates,
      excludedAmendments: excludedFilings.filter((item) => item.code?.includes("amendment")),
      reportedShareChangesCorporateActionAdjusted: false,
      attributionReconciliation: simulation.reconciliation
    },
    equity,
    rebalances: rebalances.map(({ weights, ...rebalance }) => rebalance),
    quarterContributions,
    cache: {
      status: "refreshed",
      source: "SEC EDGAR + Yahoo adjusted close + SQLite"
    }
  };

  if (persist) writeGuruBacktest(guruId, window.cacheKey, payload);
  return persist ? compactBacktestPayload(payload, { includeAttribution }) : payload;
}

export async function loadGuruBacktests({
  refresh = false,
  years = defaultYears,
  detail = "compact",
  allowCold = true
} = {}) {
  const window = normalizeBacktestWindow(years);
  const normalizedDetail = normalizeBacktestDetail(detail);
  const cacheKey = `${window.cacheKey}:${normalizedDetail}`;
  const versionBefore = readGuruBacktestVersion(window.cacheKey);

  if (!refresh) {
    const cached = readAggregateBacktestCache(cacheKey, versionBefore);
    if (cached) return cached;
  } else {
    clearGuruBacktestAggregateCache();
  }

  const loadAggregate = async () => {
    const results = [];
    for (const guru of gurus.filter((item) => item.type === "manager13f" || item.type === "congress")) {
      results.push(await loadGuruBacktest(guru.id, {
        refresh,
        years,
        detail: normalizedDetail,
        allowCold
      }));
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      years: window.methodYears,
      benchmark: "SPY",
      backtests: results
    };
    const versionAfter = readGuruBacktestVersion(window.cacheKey);
    if (!refresh && versionBefore === versionAfter) {
      writeAggregateBacktestCache(cacheKey, versionAfter, payload);
    }
    return payload;
  };

  if (refresh) {
    try {
      return await loadAggregate();
    } finally {
      clearGuruBacktestAggregateCache();
    }
  }

  const inFlightKey = `${cacheKey}:${versionBefore}`;
  const existing = aggregateBacktestInFlight.get(inFlightKey);
  if (existing) return existing;
  const pending = loadAggregate();
  aggregateBacktestInFlight.set(inFlightKey, pending);
  try {
    return await pending;
  } finally {
    if (aggregateBacktestInFlight.get(inFlightKey) === pending) {
      aggregateBacktestInFlight.delete(inFlightKey);
    }
  }
}

export function guruBacktestRefreshStatus() {
  return {
    ...lastBacktestRefreshStatus,
    running: Boolean(backtestRefreshInFlight || scheduledBacktestRefreshInFlight)
  };
}

export async function refreshGuruBacktestCache({
  years = 5,
  detail = "compact",
  reason = "manual",
  backtestLoader = loadGuruBacktest
} = {}) {
  if (backtestRefreshInFlight) {
    return {
      ...guruBacktestRefreshStatus(),
      alreadyRunning: true
    };
  }

  clearGuruBacktestAggregateCache();
  backtestRefreshInFlight = (async () => {
    const startedAt = new Date().toISOString();
    const status = {
      running: true,
      startedAt,
      finishedAt: null,
      reason,
      ok: 0,
      failed: 0,
      proxyAvailable: 0,
      errors: []
    };
    lastBacktestRefreshStatus = status;
    writeBackgroundJobRun("guru_backtest_refresh", {
      startedAt,
      status: "running",
      payload: {
        reason,
        years,
        detail
      }
    });

    for (const guru of gurus.filter((item) => item.type === "manager13f" || item.type === "congress")) {
      try {
        const payload = await backtestLoader(guru.id, {
          refresh: true,
          years,
          detail
        });
        if (payload?.status === "proxy_ready") status.proxyAvailable += 1;
        assertGuruBacktestRefreshSucceeded(guru, payload, "cache refresh");
        status.ok += 1;
        console.log("[backtest-refresh] refreshed", {
          guru: guru.id,
          status: payload.status,
          start: payload.window?.start || "",
          end: payload.window?.end || ""
        });
      } catch (error) {
        status.failed += 1;
        status.errors.push({
          guru: guru.id,
          message: error.message
        });
        console.warn("[backtest-refresh] failed", {
          guru: guru.id,
          reason: error.message
        });
      }
    }

    status.running = false;
    status.finishedAt = new Date().toISOString();
    lastBacktestRefreshStatus = status;
    writeBackgroundJobRun("guru_backtest_refresh", {
      startedAt,
      finishedAt: status.finishedAt,
      status: status.failed > 0 ? "failed" : "success",
      payload: status
    });
    return status;
  })();

  try {
    return await backtestRefreshInFlight;
  } finally {
    backtestRefreshInFlight = null;
    clearGuruBacktestAggregateCache();
  }
}

export const scheduledGuruBacktestWindows = Object.freeze([5, 10]);

export async function refreshScheduledGuruBacktestWindows({
  reason = "scheduled",
  detail = "compact",
  refresh = refreshGuruBacktestCache
} = {}) {
  if (scheduledBacktestRefreshInFlight) return scheduledBacktestRefreshInFlight;

  const startedAt = new Date().toISOString();
  lastBacktestRefreshStatus = {
    running: true,
    startedAt,
    finishedAt: null,
    reason,
    ok: 0,
    failed: 0,
    proxyAvailable: 0,
    errors: [],
    windows: scheduledGuruBacktestWindows.map((years) => ({
      years,
      status: "pending",
      ok: 0,
      failed: 0,
      proxyAvailable: 0
    }))
  };
  writeBackgroundJobRun("guru_backtest_refresh", {
    startedAt,
    status: "running",
    payload: lastBacktestRefreshStatus
  });

  const pending = (async () => {
    const results = [];
    for (const years of scheduledGuruBacktestWindows) {
      try {
        results.push(await refresh({
          years,
          detail,
          reason: `${reason}-${years}y`
        }));
      } catch (error) {
        results.push({
          running: false,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          reason: `${reason}-${years}y`,
          years,
          ok: 0,
          failed: 1,
          proxyAvailable: 0,
          errors: [{ guru: "scheduler", message: error.message }]
        });
      }
    }
    const finishedAt = new Date().toISOString();
    lastBacktestRefreshStatus = {
      running: false,
      startedAt,
      finishedAt,
      reason,
      ok: results.reduce((sum, result) => sum + Number(result?.ok || 0), 0),
      failed: results.reduce((sum, result) => sum + Number(result?.failed || 0), 0),
      proxyAvailable: results.reduce(
        (sum, result) => sum + Number(result?.proxyAvailable || 0),
        0
      ),
      errors: results.flatMap((result, index) =>
        (result?.errors || []).map((error) => ({
          ...error,
          years: scheduledGuruBacktestWindows[index]
        }))
      ),
      windows: results.map((result, index) => ({
        years: scheduledGuruBacktestWindows[index],
        status: Number(result?.failed || 0) > 0 ? "failed" : "success",
        ok: Number(result?.ok || 0),
        failed: Number(result?.failed || 0),
        proxyAvailable: Number(result?.proxyAvailable || 0)
      }))
    };
    writeBackgroundJobRun("guru_backtest_refresh", {
      startedAt,
      finishedAt,
      status: lastBacktestRefreshStatus.failed > 0 ? "failed" : "success",
      payload: lastBacktestRefreshStatus
    });
    return results;
  })();
  scheduledBacktestRefreshInFlight = pending;
  try {
    return await pending;
  } finally {
    if (scheduledBacktestRefreshInFlight === pending) {
      scheduledBacktestRefreshInFlight = null;
    }
  }
}

export function startGuruBacktestRefresher() {
  if (process.env.GURU_BACKTEST_AUTO_REFRESH === "false") return null;
  if (backtestAutoRefreshTimer) return backtestAutoRefreshTimer;

  const run = () => {
    refreshScheduledGuruBacktestWindows({ reason: "scheduled" }).catch((error) => {
      lastBacktestRefreshStatus = {
        ...lastBacktestRefreshStatus,
        running: false,
        finishedAt: new Date().toISOString(),
        failed: Math.max(1, lastBacktestRefreshStatus.failed || 0),
        errors: [
          ...(lastBacktestRefreshStatus.errors || []),
          { guru: "scheduler", message: error.message }
        ]
      };
      console.warn("[backtest-refresh] scheduled refresh failed", error.message);
    });
  };

  backtestAutoRefreshKickoffTimer = setTimeout(run, backtestAutoRefreshInitialDelayMs);
  backtestAutoRefreshTimer = setInterval(run, backtestAutoRefreshIntervalMs);
  if (backtestAutoRefreshKickoffTimer.unref) backtestAutoRefreshKickoffTimer.unref();
  if (backtestAutoRefreshTimer.unref) backtestAutoRefreshTimer.unref();
  return backtestAutoRefreshTimer;
}
