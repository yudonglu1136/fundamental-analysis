import {
  deleteDividendEventsForTickers,
  readBackgroundJobRun,
  readDividendEvents,
  writeBackgroundJobRun,
  writeDividendEvents,
  writeTickerAsset
} from "./localDatabase.js";
import {
  canonicalTicker,
  logoMetadataForTicker,
  logoUrlForTicker,
  normalizeTicker
} from "./logoClient.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const dividendJobId = "portfolio_dividend_calendar";
const yahooTickerOverrides = new Map([
  ["LSEG", "LSEG.L"],
  ["AZNL", "AZN.L"],
  ["LSEGL", "LSEG.L"]
]);
const londonDividendTickers = new Set(["AZNL", "LSEG", "LSEGL"]);

let dividendCalendarRefresherStarted = false;
let refreshInFlight = null;

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/[$,%]/g, "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDate(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const parsed = new Date(`${isoDate(date)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return isoDate(parsed);
}

function dayDiff(left, right) {
  return Math.round((new Date(`${isoDate(right)}T00:00:00.000Z`) - new Date(`${isoDate(left)}T00:00:00.000Z`)) / DAY_MS);
}

function isWeekday(date) {
  const day = new Date(`${isoDate(date)}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseNasdaqDate(value) {
  const raw = String(value || "").trim();
  if (!raw || /^n\/?a$/i.test(raw)) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const month = match[1].padStart(2, "0");
    const day = match[2].padStart(2, "0");
    return `${match[3]}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : isoDate(parsed);
}

function normalizeTickerInputs(items = []) {
  const byTicker = new Map();
  for (const item of items) {
    const rawTicker = typeof item === "string"
      ? item
      : item?.ticker || item?.symbol || item?.underlyingSymbol;
    const ticker = canonicalTicker(rawTicker) || normalizeTicker(rawTicker);
    if (!ticker || ticker === "N/A" || ticker.startsWith("CASH")) continue;
    const assetClass = typeof item === "string"
      ? ""
      : String(item?.sector || item?.assetCategory || item?.category || item?.type || "").toLowerCase();
    if (/option|^opt$|future|futures|cash|forex|currency/.test(assetClass)) continue;
    const companyName = typeof item === "string"
      ? ticker
      : String(item?.companyName || item?.name || item?.description || ticker).trim();
    const quantity = typeof item === "string" ? 0 : safeHoldingQuantity(item);
    const price = typeof item === "string" ? 0 : finiteNumber(item?.price ?? item?.markPrice, 0);
    const value = typeof item === "string"
      ? 0
      : finiteNumber(item?.value?.amount ?? item?.marketValue?.amount ?? item?.marketValue ?? item?.value, 0);
    const existing = byTicker.get(ticker);
    byTicker.set(ticker, {
      ticker,
      companyName: companyName || existing?.companyName || ticker,
      quantity: Math.max(0, (existing?.quantity || 0) + Math.max(0, quantity)),
      price: price || existing?.price || 0,
      value: Math.max(0, (existing?.value || 0) + Math.max(0, value))
    });
  }
  return [...byTicker.values()].sort((left, right) => left.ticker.localeCompare(right.ticker));
}

function safeHoldingQuantity(item = {}) {
  const quantity = finiteNumber(item.quantity ?? item.shares ?? item.units ?? item.position, NaN);
  const price = finiteNumber(item.price ?? item.markPrice ?? item.closePrice ?? item.reportDatePrice, NaN);
  const value = finiteNumber(
    item.value?.amount ?? item.marketValue?.amount ?? item.marketValue ?? item.positionValue ?? item.value,
    NaN
  );
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(value) || value <= 0) {
    return Number.isFinite(quantity) ? quantity : 0;
  }
  const impliedQuantity = value / price;
  if (!Number.isFinite(quantity) || quantity <= 0) return impliedQuantity;
  const valueFromQuantity = quantity * price;
  const relativeValueError = Math.abs(valueFromQuantity - value) / Math.max(1, Math.abs(value));
  const quantityLooksLikeMarketValue =
    price > 1.01 && value > 100 && Math.abs(quantity - value) / Math.max(1, Math.abs(value)) < 0.03;
  const quantityIsImplausiblyHigh = price > 1.01 && quantity > impliedQuantity * 20;
  if (quantityLooksLikeMarketValue || quantityIsImplausiblyHigh || relativeValueError > 0.5) {
    return impliedQuantity;
  }
  return quantity;
}

function tickerHash(tickerInfos) {
  return tickerInfos.map((item) => item.ticker).sort().join(",");
}

function yahooTicker(ticker) {
  const normalized = normalizeTicker(ticker);
  return yahooTickerOverrides.get(normalized) || String(normalized || ticker || "").replace(/\./g, "-");
}

function isPenceCurrency(currency) {
  const raw = String(currency || "").trim();
  const compact = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  return (
    raw === "GBp" ||
    compact === "GBX" ||
    compact === "GBPENCE" ||
    compact === "PENCE" ||
    compact === "PENNY"
  );
}

function isLondonDividendTicker(ticker) {
  const normalized = normalizeTicker(ticker);
  return (
    londonDividendTickers.has(normalized) ||
    normalized.endsWith(".L") ||
    yahooTicker(normalized).toUpperCase().endsWith(".L")
  );
}

function normalizeDividendMoneyUnit({ ticker, amount, currency, source = "" }) {
  const numericAmount = finiteNumber(amount, NaN);
  const rawCurrency = String(currency || "USD").trim() || "USD";
  if (!Number.isFinite(numericAmount)) {
    return { amount: numericAmount, currency: rawCurrency, multiplier: 1, normalizedFrom: "" };
  }
  const sourceText = String(source || "").toLowerCase();
  const currencyLooksPence = isPenceCurrency(rawCurrency);
  const yahooLondonPence =
    isLondonDividendTicker(ticker) &&
    /^GBP$/i.test(rawCurrency) &&
    sourceText.includes("yahoo") &&
    Math.abs(numericAmount) >= 5;
  if (!currencyLooksPence && !yahooLondonPence) {
    return { amount: numericAmount, currency: rawCurrency, multiplier: 1, normalizedFrom: "" };
  }
  return {
    amount: Math.round((numericAmount / 100) * 1000000) / 1000000,
    currency: "GBP",
    multiplier: 0.01,
    normalizedFrom: rawCurrency
  };
}

async function fetchNasdaqDividendRows(date) {
  const url = new URL("https://api.nasdaq.com/api/calendar/dividends");
  url.searchParams.set("date", date);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/market-activity/dividends",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Nasdaq dividend calendar ${date} failed with ${response.status}`);
  const payload = await response.json();
  return payload?.data?.calendar?.rows || [];
}

function normalizeNasdaqDividend(row, tickerInfoByTicker) {
  const ticker = canonicalTicker(row?.symbol) || normalizeTicker(row?.symbol);
  const info = tickerInfoByTicker.get(ticker);
  if (!ticker || !info) return null;
  const exDate = parseNasdaqDate(
    row.dividend_Ex_Date || row.exOrEffDate || row.exDate || row.ex_dividend_date
  );
  if (!exDate) return null;
  const amount = finiteNumber(row.dividend_Rate || row.dividendRate || row.amount, NaN);
  if (!Number.isFinite(amount)) return null;
  const companyName = String(row.companyName || info.companyName || ticker).trim();
  return {
    ticker,
    companyName,
    name: companyName,
    exDate,
    payDate: parseNasdaqDate(row.payment_Date || row.paymentDate || row.payDate),
    recordDate: parseNasdaqDate(row.record_Date || row.recordDate),
    declarationDate: parseNasdaqDate(row.announcement_Date || row.declarationDate),
    amount,
    amountKind: "per_share",
    perShare: true,
    quantity: info.quantity || undefined,
    holdingValue: info.value || undefined,
    holdingPrice: info.price || undefined,
    estimatedPayout: info.quantity ? amount * info.quantity : undefined,
    currency: "USD",
    status: "declared",
    type: "Declared dividend",
    source: "nasdaq_calendar",
    sourceLabel: "Nasdaq dividend calendar",
    logoUrl: logoUrlForTicker(ticker),
    payload: row
  };
}

async function loadNasdaqDeclaredEvents(tickerInfos, { startDate, endDate, requestDelayMs, timeBudgetMs }) {
  if (process.env.DIVIDEND_NASDAQ_ENABLED === "false") {
    return { events: [], scannedDays: 0, errors: 0, ok: false, skipped: true };
  }

  const tickerInfoByTicker = new Map(tickerInfos.map((item) => [item.ticker, item]));
  const events = [];
  let scannedDays = 0;
  let errors = 0;
  let timedOut = false;
  const deadline = Date.now() + Math.max(5000, Number(timeBudgetMs) || 45_000);
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if (!isWeekday(date)) continue;
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    scannedDays += 1;
    try {
      const rows = await fetchNasdaqDividendRows(date);
      for (const row of rows) {
        const event = normalizeNasdaqDividend(row, tickerInfoByTicker);
        if (event) events.push(event);
      }
    } catch (error) {
      errors += 1;
      if (errors <= 3) console.warn(`Nasdaq dividend scan warning: ${error.message}`);
    }
    if (requestDelayMs > 0) await sleep(requestDelayMs);
  }

  return {
    events,
    scannedDays,
    errors,
    timedOut,
    ok: scannedDays > 0 && errors < Math.max(3, scannedDays)
  };
}

async function fetchYahooDividendHistory(ticker) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker(ticker))}`);
  url.searchParams.set("range", "5y");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ThesisForge-DividendCalendar/1.0"
    },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Yahoo dividend history ${ticker} failed with ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const chartError = payload?.chart?.error;
  if (chartError) throw new Error(chartError.description || `Yahoo dividend history ${ticker} failed`);
  const currency = result?.meta?.currency || "USD";
  const rows = Object.values(result?.events?.dividends || {});
  return rows
    .map((row) => {
      const normalized = normalizeDividendMoneyUnit({
        ticker,
        amount: finiteNumber(row.amount, NaN),
        currency,
        source: "yahoo_dividend_history"
      });
      return {
        date: isoDate(new Date(Number(row.date) * 1000)),
        amount: normalized.amount,
        currency: normalized.currency,
        normalizedFrom: normalized.normalizedFrom
      };
    })
    .filter((row) => row.date && Number.isFinite(row.amount) && row.amount > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function estimateFutureDividends(tickerInfo, history, { startDate, endDate }) {
  if (!history.length) return [];
  const gaps = [];
  for (let index = 1; index < history.length; index += 1) {
    const gap = dayDiff(history[index - 1].date, history[index].date);
    if (gap >= 20 && gap <= 430) gaps.push(gap);
  }
  const intervalDays = Math.max(30, Math.min(365, Math.round(median(gaps) || 365)));
  const recentAmounts = history.slice(-Math.min(6, history.length)).map((row) => row.amount);
  const amount = Math.round((median(recentAmounts) || history.at(-1).amount) * 10000) / 10000;
  const currency = history.at(-1).currency || "USD";
  const normalizedFrom = history.findLast?.((row) => row.normalizedFrom)?.normalizedFrom ||
    [...history].reverse().find((row) => row.normalizedFrom)?.normalizedFrom ||
    "";
  let exDate = addDays(history.at(-1).date, intervalDays);
  while (exDate < startDate) exDate = addDays(exDate, intervalDays);

  const events = [];
  while (exDate <= endDate && events.length < 18) {
    events.push({
      ticker: tickerInfo.ticker,
      companyName: tickerInfo.companyName,
      name: tickerInfo.companyName,
      exDate,
      payDate: "",
      recordDate: "",
      declarationDate: "",
      amount,
      amountKind: "per_share",
      perShare: true,
      quantity: tickerInfo.quantity || undefined,
      holdingValue: tickerInfo.value || undefined,
      holdingPrice: tickerInfo.price || undefined,
      estimatedPayout: tickerInfo.quantity ? amount * tickerInfo.quantity : undefined,
      currency,
      status: "estimated",
      type: "Estimated dividend",
      source: "yahoo_history_estimate",
      sourceLabel: "Yahoo dividend history estimate",
      logoUrl: logoUrlForTicker(tickerInfo.ticker),
      payload: {
        intervalDays,
        lastDividendDate: history.at(-1).date,
        historyPointCount: history.length,
        amountKind: "per_share",
        dividendUnitNormalization: normalizedFrom ? `${normalizedFrom}_to_GBP` : ""
      }
    });
    exDate = addDays(exDate, intervalDays);
  }
  return events;
}

async function loadEstimatedEvents(tickerInfos, { startDate, endDate, requestDelayMs }) {
  if (process.env.DIVIDEND_YAHOO_ESTIMATE_ENABLED === "false") {
    return { events: [], attempted: 0, errors: 0, ok: false, skipped: true };
  }

  const events = [];
  let attempted = 0;
  let errors = 0;
  for (const tickerInfo of tickerInfos) {
    attempted += 1;
    try {
      const history = await fetchYahooDividendHistory(tickerInfo.ticker);
      events.push(...estimateFutureDividends(tickerInfo, history, { startDate, endDate }));
    } catch (error) {
      errors += 1;
      if (errors <= 5) console.warn(`Yahoo dividend estimate warning: ${error.message}`);
    }
    if (requestDelayMs > 0) await sleep(requestDelayMs);
  }
  return {
    events,
    attempted,
    errors,
    ok: attempted > 0 && errors < attempted
  };
}

function mergeDividendEvents(declaredEvents, estimatedEvents) {
  const declaredDatesByTicker = new Map();
  for (const event of declaredEvents) {
    const dates = declaredDatesByTicker.get(event.ticker) || [];
    dates.push(event.exDate);
    declaredDatesByTicker.set(event.ticker, dates);
  }

  const byKey = new Map();
  for (const event of declaredEvents) {
    byKey.set(`${event.ticker}|${event.exDate}|${event.source}`, event);
  }
  for (const event of estimatedEvents) {
    const declaredDates = declaredDatesByTicker.get(event.ticker) || [];
    const overlapsDeclared = declaredDates.some((date) => Math.abs(dayDiff(date, event.exDate)) <= 21);
    if (overlapsDeclared) continue;
    byKey.set(`${event.ticker}|${event.exDate}|${event.source}`, event);
  }
  return [...byKey.values()].sort((left, right) => {
    const dateOrder = left.exDate.localeCompare(right.exDate);
    if (dateOrder) return dateOrder;
    return left.ticker.localeCompare(right.ticker);
  });
}

export function readDividendCalendarForTickers(tickerInputs = [], {
  startDate = isoDate(),
  days = 370
} = {}) {
  const tickerInfos = normalizeTickerInputs(tickerInputs);
  const endDate = addDays(startDate, Math.max(30, Math.min(740, Number(days) || 370)));
  const tickerInfoByTicker = new Map(tickerInfos.map((item) => [item.ticker, item]));
  const events = readDividendEvents(tickerInfos.map((item) => item.ticker), startDate, endDate)
    .map((event) => enrichStoredDividendEvent(event, tickerInfoByTicker));
  return {
    events,
    status: {
      source: events.length ? "sqlite_dividend_calendar" : "sqlite_dividend_calendar_empty",
      pointCount: events.length,
      startDate,
      endDate,
      message: events.length
        ? `Stored dividend calendar: ${events.length} future event(s), declared events first and history-based estimates marked separately.`
        : "No stored future dividend events yet. The backend refresh job will populate declared events and history-based estimates."
    }
  };
}

function enrichStoredDividendEvent(event, tickerInfoByTicker) {
  const info = tickerInfoByTicker.get(event.ticker) || {};
  const source = String(event.source || "").toLowerCase();
  const payload = event.payload || {};
  const normalized = normalizeDividendMoneyUnit({
    ticker: event.ticker,
    amount: finiteNumber(event.amount, 0),
    currency: event.currency,
    source: `${event.source || ""} ${event.sourceLabel || ""}`
  });
  const amount = normalized.amount;
  const amountKind = event.amountKind || payload.amountKind || (
    source.includes("yahoo") || source.includes("nasdaq") ? "per_share" : ""
  );
  const perShare =
    event.perShare === true ||
    payload.perShare === true ||
    amountKind === "per_share";
  const quantity = Math.max(0, finiteNumber(info.quantity ?? event.quantity ?? payload.quantity, 0));
  return {
    ...event,
    companyName: event.companyName || info.companyName || event.ticker,
    name: event.name || event.companyName || info.companyName || event.ticker,
    amount,
    currency: normalized.currency,
    amountKind,
    perShare,
    quantity,
    holdingValue: info.value || event.holdingValue || payload.holdingValue || undefined,
    holdingPrice: info.price || event.holdingPrice || payload.holdingPrice || undefined,
    estimatedPayout: perShare && quantity > 0 ? amount * quantity : undefined,
    logoUrl: event.logoUrl || logoUrlForTicker(event.ticker),
    payload: normalized.normalizedFrom
      ? {
          ...payload,
          dividendUnitNormalization: `${normalized.normalizedFrom}_to_GBP`
        }
      : payload
  };
}

export async function refreshDividendCalendarForTickers(tickerInputs = [], options = {}) {
  if (refreshInFlight && !options.force) return refreshInFlight;

  refreshInFlight = (async () => {
    const maxTickers = Math.max(1, Math.min(250, finiteNumber(process.env.DIVIDEND_REFRESH_MAX_TICKERS, 120)));
    const tickerInfos = normalizeTickerInputs(tickerInputs).slice(0, maxTickers);
    const startDate = options.startDate || isoDate();
    const days = Math.max(30, Math.min(740, finiteNumber(options.days ?? process.env.DIVIDEND_REFRESH_DAYS, 370)));
    const endDate = options.endDate || addDays(startDate, days);
    const nasdaqScanDays = Math.max(
      0,
      Math.min(days, finiteNumber(process.env.DIVIDEND_NASDAQ_SCAN_DAYS, 90))
    );
    const nasdaqEndDate = addDays(startDate, nasdaqScanDays);
    const requestDelayMs = Math.max(0, finiteNumber(process.env.DIVIDEND_NASDAQ_REQUEST_DELAY_MS, 125));
    const nasdaqTimeBudgetMs = Math.max(5000, finiteNumber(process.env.DIVIDEND_NASDAQ_TIME_BUDGET_MS, 45_000));
    const yahooDelayMs = Math.max(0, finiteNumber(process.env.DIVIDEND_YAHOO_REQUEST_DELAY_MS, 50));
    const hash = tickerHash(tickerInfos);

    if (!tickerInfos.length) {
      return {
        skipped: true,
        reason: "no_tickers",
        tickers: [],
        events: [],
        declaredCount: 0,
        estimatedCount: 0
      };
    }

    const freshTtlMs = Math.max(
      60_000,
      finiteNumber(process.env.DIVIDEND_CALENDAR_FRESH_TTL_MS, 6 * DAY_MS)
    );
    const previousRun = readBackgroundJobRun(options.jobId || dividendJobId);
    const previousFinishedAt = previousRun?.finishedAt ? new Date(previousRun.finishedAt).getTime() : 0;
    if (
      !options.force &&
      previousRun?.status === "success" &&
      previousRun.payload?.tickerHash === hash &&
      previousFinishedAt &&
      Date.now() - previousFinishedAt < freshTtlMs
    ) {
      const stored = readDividendCalendarForTickers(tickerInfos, { startDate, days });
      return {
        skipped: true,
        reason: "fresh_cache",
        tickers: tickerInfos.map((item) => item.ticker),
        events: stored.events,
        declaredCount: stored.events.filter((event) => event.status === "declared").length,
        estimatedCount: stored.events.filter((event) => event.status === "estimated").length,
        startDate,
        endDate
      };
    }

    const startedAt = new Date().toISOString();
    writeBackgroundJobRun(options.jobId || dividendJobId, {
      startedAt,
      finishedAt: "",
      status: "running",
      payload: {
        tickerHash: hash,
        tickers: tickerInfos.map((item) => item.ticker),
        startDate,
        endDate
      }
    });

    try {
      for (const tickerInfo of tickerInfos) {
        writeTickerAsset(tickerInfo.ticker, {
          ...logoMetadataForTicker(tickerInfo.ticker, tickerInfo.companyName),
          payload: { source: "dividend_calendar_refresh" }
        });
      }

      const [declaredResult, estimatedResult] = await Promise.all([
        nasdaqScanDays > 0
          ? loadNasdaqDeclaredEvents(tickerInfos, {
              startDate,
              endDate: nasdaqEndDate,
              requestDelayMs,
              timeBudgetMs: nasdaqTimeBudgetMs
            })
          : Promise.resolve({ events: [], scannedDays: 0, errors: 0, ok: false, skipped: true }),
        loadEstimatedEvents(tickerInfos, { startDate, endDate, requestDelayMs: yahooDelayMs })
      ]);
      if (!declaredResult.ok && !estimatedResult.ok) {
        throw new Error("Dividend calendar providers failed; keeping existing stored calendar.");
      }

      const events = mergeDividendEvents(declaredResult.events, estimatedResult.events);
      deleteDividendEventsForTickers(tickerInfos.map((item) => item.ticker), startDate, endDate);
      const written = writeDividendEvents(events);
      const finishedAt = new Date().toISOString();
      const summary = {
        tickers: tickerInfos.map((item) => item.ticker),
        tickerHash: hash,
        startDate,
        endDate,
        eventCount: written,
        declaredCount: events.filter((event) => event.status === "declared").length,
        estimatedCount: events.filter((event) => event.status === "estimated").length,
        nasdaq: {
          scannedDays: declaredResult.scannedDays,
          endDate: nasdaqEndDate,
          errors: declaredResult.errors,
          timedOut: Boolean(declaredResult.timedOut),
          skipped: Boolean(declaredResult.skipped)
        },
        yahoo: {
          attempted: estimatedResult.attempted,
          errors: estimatedResult.errors,
          skipped: Boolean(estimatedResult.skipped)
        }
      };
      writeBackgroundJobRun(options.jobId || dividendJobId, {
        startedAt,
        finishedAt,
        status: "success",
        payload: summary
      });
      return {
        ...summary,
        events,
        refreshedAt: finishedAt
      };
    } catch (error) {
      writeBackgroundJobRun(options.jobId || dividendJobId, {
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        payload: {
          tickerHash: hash,
          tickers: tickerInfos.map((item) => item.ticker),
          startDate,
          endDate,
          error: error.message
        }
      });
      throw error;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export function startDividendCalendarRefresher(getTickerInputs, {
  initialDelayMs = finiteNumber(process.env.DIVIDEND_CALENDAR_INITIAL_DELAY_MS, 90_000),
  intervalMs = finiteNumber(process.env.DIVIDEND_CALENDAR_REFRESH_INTERVAL_MS, 7 * DAY_MS)
} = {}) {
  if (dividendCalendarRefresherStarted) return;
  dividendCalendarRefresherStarted = true;

  const refresh = async () => {
    try {
      const tickerInputs = await getTickerInputs();
      console.log(`Dividend calendar refresh starting: ${tickerInputs?.length || 0} holding row(s).`);
      const result = await refreshDividendCalendarForTickers(tickerInputs);
      console.log(
        `Dividend calendar refresh complete: ${result.eventCount ?? result.events?.length ?? 0} event(s), ${result.declaredCount || 0} declared, ${result.estimatedCount || 0} estimated.`
      );
    } catch (error) {
      console.warn(`Dividend calendar refresh failed: ${error.message}`);
    }
  };

  const initialTimer = setTimeout(refresh, Math.max(1000, initialDelayMs));
  initialTimer.unref?.();
  const intervalTimer = setInterval(refresh, Math.max(60_000, intervalMs));
  intervalTimer.unref?.();
  console.log(
    `Dividend calendar refresher scheduled: initial ${Math.max(1000, initialDelayMs)}ms, interval ${Math.max(60_000, intervalMs)}ms.`
  );
}
