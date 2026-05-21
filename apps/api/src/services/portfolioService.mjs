import { existsSync, mkdirSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import XLSX from "xlsx";
import { execute, executescript, query } from "../db/client.mjs";

const PORTFOLIO_ROOT = path.resolve(process.env.PORTFOLIO_DATA_ROOT ?? "data/local/portfolio/accounts");
const DEFAULT_SEED_OWNER_EMAIL = "luyudong1136@gmail.com";
const SEED_OWNER_EMAIL = String(process.env.PORTFOLIO_SEED_OWNER_EMAIL ?? DEFAULT_SEED_OWNER_EMAIL).trim().toLowerCase();
const DEV_EMAIL = String(process.env.PORTFOLIO_DEV_EMAIL ?? SEED_OWNER_EMAIL).trim().toLowerCase();
const SEED_XLSX_PATH = path.resolve(
  process.env.PORTFOLIO_SEED_XLSX_PATH ?? "Portfolio report_💰 My Net Worth_21.05.2026.xlsx",
);

const schemaSql = `
CREATE TABLE IF NOT EXISTS account_profile (
  id TEXT PRIMARY KEY,
  accountKey TEXT NOT NULL,
  email TEXT,
  userId TEXT,
  seedOwnerEmail TEXT,
  seedSourcePath TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_history (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  portfolioValue REAL,
  beginValue REAL,
  endValue REAL,
  changeAmount REAL,
  totalProfit REAL,
  totalProfitPct REAL,
  netProfitFromSales REAL,
  profitFromPriceChange REAL,
  profitFromSales REAL,
  dividends REAL,
  taxes REAL,
  commissions REAL,
  other REAL,
  turnover REAL,
  totalPurchases REAL,
  totalSales REAL,
  totalTrades REAL,
  buyTrades REAL,
  sellTrades REAL,
  cashFunds REAL,
  deposited REAL,
  withdrawn REAL,
  availableFunds REAL,
  sp500MarketPerformance REAL,
  sp500MarketPerformancePct REAL,
  source TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  accountName TEXT NOT NULL DEFAULT 'Main',
  assetType TEXT NOT NULL CHECK(assetType IN ('stock', 'bond')),
  symbol TEXT NOT NULL,
  name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  market TEXT,
  latestPrice REAL,
  latestPriceAt TEXT,
  latestPriceSource TEXT,
  manualMarketValue REAL,
  logoUrl TEXT,
  logoSource TEXT,
  couponRate REAL,
  maturityDate TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS income_events (
  id TEXT PRIMARY KEY,
  holdingId TEXT,
  accountName TEXT NOT NULL DEFAULT 'Main',
  assetType TEXT NOT NULL CHECK(assetType IN ('stock', 'bond')),
  symbol TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  exDate TEXT,
  payDate TEXT,
  amountPerUnit REAL,
  quantity REAL,
  grossAmount REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'manual',
  sourceType TEXT NOT NULL DEFAULT 'manual',
  sourceUrl TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(accountName, symbol, eventDate, sourceType, status)
);

CREATE TABLE IF NOT EXISTS dividend_fetch_cache (
  symbol TEXT PRIMARY KEY,
  fetchedAt TEXT NOT NULL,
  status TEXT NOT NULL,
  sourceUrl TEXT,
  payloadJson TEXT,
  message TEXT
);
`;

const holdingColumnMigrations = [
  ["latestPrice", "REAL"],
  ["latestPriceAt", "TEXT"],
  ["latestPriceSource", "TEXT"],
  ["manualMarketValue", "REAL"],
  ["logoUrl", "TEXT"],
  ["logoSource", "TEXT"],
];

const defaultHoldingLogos = {
  GOOG: "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
  IBKR: "https://companiesmarketcap.com/img/company-logos/64/IBKR.png",
  ISRG: "https://companiesmarketcap.com/img/company-logos/64/ISRG.png",
  LEGN: "https://companiesmarketcap.com/img/company-logos/64/LEGN.png",
  LSEG: "https://companiesmarketcap.com/img/company-logos/64/LSEG.L.png",
  "LSEG.L": "https://companiesmarketcap.com/img/company-logos/64/LSEG.L.png",
  MCK: "https://companiesmarketcap.com/img/company-logos/64/MCK.png",
  MSFT: "https://companiesmarketcap.com/img/company-logos/64/MSFT.png",
  NOW: "https://companiesmarketcap.com/img/company-logos/64/NOW.png",
  PLTR: "https://companiesmarketcap.com/img/company-logos/64/PLTR.png",
  QQQ: "https://companiesmarketcap.com/img/company-logos/64/QQQ.png",
};

const rowMap = {
  "Portfolio value": "portfolioValue",
  "At the beginning of the period": "beginValue",
  "At the end of the period": "endValue",
  Change: "changeAmount",
  "Total profit": "totalProfit",
  "Total profit, %": "totalProfitPct",
  "Net profit from sales": "netProfitFromSales",
  "Profit from price change": "profitFromPriceChange",
  "Profit from sales": "profitFromSales",
  Dividends: "dividends",
  Taxes: "taxes",
  Commissions: "commissions",
  Other: "other",
  Turnover: "turnover",
  "Total purchases": "totalPurchases",
  "Total sales": "totalSales",
  "Total trades": "totalTrades",
  "Buy trades": "buyTrades",
  "Sell trades": "sellTrades",
  "Cash funds": "cashFunds",
  Deposited: "deposited",
  Withdrawn: "withdrawn",
  "Available funds": "availableFunds",
  "S&P 500 Market Performance": "sp500MarketPerformance",
  "S&P 500 Market Performance, %": "sp500MarketPerformancePct",
};

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : value == null ? fallback : String(value).trim();
}

function normalizeEmail(email) {
  return cleanString(email).toLowerCase();
}

function accountKeyForIdentity(identity) {
  return crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

function resolveAccount(request) {
  const localDev = Boolean(request.auth?.claims?.localDev);
  const email = normalizeEmail(localDev ? DEV_EMAIL : request.user?.email);
  const identity = email || `user:${request.user?.id ?? "unknown"}`;
  const accountKey = accountKeyForIdentity(identity);
  return {
    accountKey,
    dbPath: path.join(PORTFOLIO_ROOT, accountKey, "portfolio.sqlite"),
    email: email || null,
    userId: request.user?.id ?? null,
    localDev,
    seededFromWorkbook: email === SEED_OWNER_EMAIL,
  };
}

function parseMonthLabel(label) {
  const match = cleanString(label).match(/^([A-Za-z]{3})\s+(\d{2})$/);
  if (!match) return null;
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    match[1].toLowerCase(),
  );
  if (monthIndex < 0) return null;
  return `${2000 + Number(match[2])}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function numeric(value) {
  if (value === "-" || value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function defaultLogoUrl(symbol) {
  return defaultHoldingLogos[cleanString(symbol).toUpperCase()] ?? null;
}

function parseSeedWorkbook() {
  if (!existsSync(SEED_XLSX_PATH)) return [];
  const workbook = XLSX.readFile(SEED_XLSX_PATH, { cellDates: false });
  const sheet = workbook.Sheets.Data ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRowIndex = rows.findIndex((row) => row.slice(1).filter((cell) => parseMonthLabel(cell)).length >= 2);
  if (headerRowIndex < 0) return [];
  const labels = rows[headerRowIndex].slice(1).map((cell) => cleanString(cell));
  const history = labels
    .map((label) => ({
      id: `portfolio-history-${parseMonthLabel(label)}`,
      date: parseMonthLabel(label),
      label,
      source: path.basename(SEED_XLSX_PATH),
    }))
    .filter((row) => row.date);

  for (const row of rows.slice(headerRowIndex + 1)) {
    const field = rowMap[cleanString(row[0])];
    if (!field) continue;
    labels.forEach((_label, index) => {
      if (history[index]) history[index][field] = numeric(row[index + 1]);
    });
  }

  return history;
}

function ensureDb(account) {
  mkdirSync(path.dirname(account.dbPath), { recursive: true });
  executescript(schemaSql, account.dbPath);
  ensureHoldingColumns(account.dbPath);
  const createdAt = nowIso();
  execute(
    `INSERT INTO account_profile (id, accountKey, email, userId, seedOwnerEmail, seedSourcePath, createdAt, updatedAt)
     VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, userId = excluded.userId, updatedAt = excluded.updatedAt`,
    [account.accountKey, account.email, account.userId, SEED_OWNER_EMAIL, account.seededFromWorkbook ? SEED_XLSX_PATH : null, createdAt, createdAt],
    account.dbPath,
  );

  const existing = query("SELECT COUNT(*) AS count FROM portfolio_history", [], account.dbPath)[0]?.count ?? 0;
  if (existing === 0 && account.seededFromWorkbook) {
    const seedRows = parseSeedWorkbook();
    for (const row of seedRows) {
      upsertHistoryRow(account.dbPath, row);
    }
  }
}

function ensureHoldingColumns(dbPath) {
  const existingColumns = new Set(query("PRAGMA table_info(holdings)", [], dbPath).map((column) => column.name));
  for (const [columnName, definition] of holdingColumnMigrations) {
    if (!existingColumns.has(columnName)) {
      execute(`ALTER TABLE holdings ADD COLUMN ${columnName} ${definition}`, [], dbPath);
    }
  }
}

function upsertHistoryRow(dbPath, row) {
  const ts = nowIso();
  execute(
    `INSERT INTO portfolio_history (
      id, date, label, portfolioValue, beginValue, endValue, changeAmount, totalProfit, totalProfitPct,
      netProfitFromSales, profitFromPriceChange, profitFromSales, dividends, taxes, commissions, other,
      turnover, totalPurchases, totalSales, totalTrades, buyTrades, sellTrades, cashFunds, deposited,
      withdrawn, availableFunds, sp500MarketPerformance, sp500MarketPerformancePct, source, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      label = excluded.label,
      portfolioValue = excluded.portfolioValue,
      beginValue = excluded.beginValue,
      endValue = excluded.endValue,
      changeAmount = excluded.changeAmount,
      totalProfit = excluded.totalProfit,
      totalProfitPct = excluded.totalProfitPct,
      netProfitFromSales = excluded.netProfitFromSales,
      profitFromPriceChange = excluded.profitFromPriceChange,
      profitFromSales = excluded.profitFromSales,
      dividends = excluded.dividends,
      taxes = excluded.taxes,
      commissions = excluded.commissions,
      other = excluded.other,
      turnover = excluded.turnover,
      totalPurchases = excluded.totalPurchases,
      totalSales = excluded.totalSales,
      totalTrades = excluded.totalTrades,
      buyTrades = excluded.buyTrades,
      sellTrades = excluded.sellTrades,
      cashFunds = excluded.cashFunds,
      deposited = excluded.deposited,
      withdrawn = excluded.withdrawn,
      availableFunds = excluded.availableFunds,
      sp500MarketPerformance = excluded.sp500MarketPerformance,
      sp500MarketPerformancePct = excluded.sp500MarketPerformancePct,
      source = excluded.source,
      updatedAt = excluded.updatedAt`,
    [
      row.id,
      row.date,
      row.label,
      row.portfolioValue ?? null,
      row.beginValue ?? null,
      row.endValue ?? null,
      row.changeAmount ?? null,
      row.totalProfit ?? null,
      row.totalProfitPct ?? null,
      row.netProfitFromSales ?? null,
      row.profitFromPriceChange ?? null,
      row.profitFromSales ?? null,
      row.dividends ?? null,
      row.taxes ?? null,
      row.commissions ?? null,
      row.other ?? null,
      row.turnover ?? null,
      row.totalPurchases ?? null,
      row.totalSales ?? null,
      row.totalTrades ?? null,
      row.buyTrades ?? null,
      row.sellTrades ?? null,
      row.cashFunds ?? null,
      row.deposited ?? null,
      row.withdrawn ?? null,
      row.availableFunds ?? null,
      row.sp500MarketPerformance ?? null,
      row.sp500MarketPerformancePct ?? null,
      row.source ?? "manual",
      ts,
      ts,
    ],
    dbPath,
  );
}

function rows(account, sql, params = []) {
  ensureDb(account);
  return query(sql, params, account.dbPath);
}

function summaryFromRows(history, incomeEvents) {
  const latest = history[history.length - 1] ?? null;
  const first = history[0] ?? null;
  const totalDeposited = history.reduce((sum, row) => sum + Number(row.deposited ?? 0), 0);
  const totalWithdrawn = history.reduce((sum, row) => sum + Number(row.withdrawn ?? 0), 0);
  const totalProfit = history.reduce((sum, row) => sum + Number(row.totalProfit ?? 0), 0);
  const nextIncome = incomeEvents
    .filter((event) => event.eventDate >= new Date().toISOString().slice(0, 10))
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate))[0] ?? null;
  return {
    latestPortfolioValue: latest?.portfolioValue ?? null,
    firstPortfolioValue: first?.portfolioValue ?? null,
    totalDeposited,
    totalWithdrawn,
    totalProfit,
    cashFunds: latest?.cashFunds ?? null,
    latestMonth: latest?.label ?? null,
    nextIncome,
  };
}

export function getPortfolioSnapshot(request) {
  const account = resolveAccount(request);
  ensureDb(account);
  const history = rows(account, "SELECT * FROM portfolio_history ORDER BY date");
  const holdings = rows(account, "SELECT * FROM holdings ORDER BY assetType, symbol, accountName");
  const incomeEvents = rows(account, "SELECT * FROM income_events ORDER BY eventDate, symbol");
  const profile = rows(account, "SELECT * FROM account_profile WHERE id = 'default' LIMIT 1")[0] ?? null;
  return {
    account: {
      email: account.email,
      accountKey: account.accountKey,
      localDev: account.localDev,
      seededFromWorkbook: account.seededFromWorkbook,
      seedSource: profile?.seedSourcePath ? path.basename(profile.seedSourcePath) : null,
    },
    summary: summaryFromRows(history, incomeEvents),
    history,
    holdings,
    incomeEvents,
  };
}

export function saveHolding(request, payload) {
  const account = resolveAccount(request);
  ensureDb(account);
  const id = cleanString(payload?.id) || crypto.randomUUID();
  const ts = nowIso();
  const assetType = cleanString(payload?.assetType, "stock").toLowerCase() === "bond" ? "bond" : "stock";
  const symbol = cleanString(payload?.symbol).toUpperCase();
  if (!symbol) throw new Error("Holding symbol is required.");
  const explicitLogoUrl = cleanString(payload?.logoUrl);
  const logoUrl = explicitLogoUrl || defaultLogoUrl(symbol);
  execute(
    `INSERT INTO holdings (
      id, accountName, assetType, symbol, name, quantity, currency, market, latestPrice, latestPriceAt, latestPriceSource,
      manualMarketValue, logoUrl, logoSource, couponRate, maturityDate, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      accountName = excluded.accountName,
      assetType = excluded.assetType,
      symbol = excluded.symbol,
      name = excluded.name,
      quantity = excluded.quantity,
      currency = excluded.currency,
      market = excluded.market,
      latestPrice = COALESCE(excluded.latestPrice, latestPrice),
      latestPriceAt = COALESCE(excluded.latestPriceAt, latestPriceAt),
      latestPriceSource = COALESCE(excluded.latestPriceSource, latestPriceSource),
      manualMarketValue = excluded.manualMarketValue,
      logoUrl = excluded.logoUrl,
      logoSource = excluded.logoSource,
      couponRate = excluded.couponRate,
      maturityDate = excluded.maturityDate,
      notes = excluded.notes,
      updatedAt = excluded.updatedAt`,
    [
      id,
      cleanString(payload?.accountName, "Main") || "Main",
      assetType,
      symbol,
      cleanString(payload?.name) || null,
      Number(payload?.quantity ?? 0),
      cleanString(payload?.currency, "USD").toUpperCase() || "USD",
      cleanString(payload?.market) || null,
      payload?.latestPrice == null || payload?.latestPrice === "" ? null : Number(payload.latestPrice),
      cleanString(payload?.latestPriceAt) || null,
      cleanString(payload?.latestPriceSource) || null,
      payload?.manualMarketValue == null || payload?.manualMarketValue === "" ? null : Number(payload.manualMarketValue),
      logoUrl,
      logoUrl ? (explicitLogoUrl ? "manual" : "default_symbol_map") : null,
      payload?.couponRate == null || payload?.couponRate === "" ? null : Number(payload.couponRate),
      cleanString(payload?.maturityDate) || null,
      cleanString(payload?.notes) || null,
      ts,
      ts,
    ],
    account.dbPath,
  );
  return getPortfolioSnapshot(request);
}

async function fetchYahooPrice(symbol) {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`;
  const payload = await fetchJson(url);
  const result = payload?.chart?.result?.[0] ?? {};
  const meta = result.meta ?? {};
  const close = result.indicators?.quote?.[0]?.close ?? [];
  const latestClose = [...close].reverse().find((value) => Number.isFinite(Number(value)));
  const price = Number.isFinite(Number(meta.regularMarketPrice)) ? Number(meta.regularMarketPrice) : Number(latestClose);
  if (!Number.isFinite(price)) throw new Error("Yahoo chart response did not include a usable price.");
  return {
    symbol,
    price,
    currency: cleanString(meta.currency, "USD").toUpperCase() || "USD",
    sourceUrl: url,
  };
}

export async function refreshHoldingPrices(request) {
  const account = resolveAccount(request);
  ensureDb(account);
  const holdings = rows(account, "SELECT * FROM holdings WHERE assetType = 'stock' AND quantity > 0 ORDER BY symbol");
  const refreshed = [];
  const errors = [];
  for (const holding of holdings) {
    try {
      const price = await fetchYahooPrice(holding.symbol);
      execute(
        `UPDATE holdings
         SET latestPrice = ?, latestPriceAt = ?, latestPriceSource = ?, currency = ?, updatedAt = ?
         WHERE id = ?`,
        [price.price, nowIso(), price.sourceUrl, price.currency, nowIso(), holding.id],
        account.dbPath,
      );
      refreshed.push({ symbol: holding.symbol, price: price.price, currency: price.currency });
    } catch (error) {
      errors.push({ symbol: holding.symbol, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    ...getPortfolioSnapshot(request),
    priceRefresh: {
      refreshed,
      errors,
      source: "Yahoo Finance chart endpoint",
    },
  };
}

export function deleteHolding(request, id) {
  const account = resolveAccount(request);
  ensureDb(account);
  execute("DELETE FROM holdings WHERE id = ?", [id], account.dbPath);
  execute("DELETE FROM income_events WHERE holdingId = ?", [id], account.dbPath);
  return getPortfolioSnapshot(request);
}

export function saveIncomeEvent(request, payload) {
  const account = resolveAccount(request);
  ensureDb(account);
  const id = cleanString(payload?.id) || crypto.randomUUID();
  const ts = nowIso();
  const symbol = cleanString(payload?.symbol).toUpperCase();
  const eventDate = cleanString(payload?.eventDate || payload?.payDate);
  if (!symbol || !eventDate) throw new Error("Income event symbol and event date are required.");
  execute(
    `INSERT INTO income_events (
      id, holdingId, accountName, assetType, symbol, eventDate, exDate, payDate, amountPerUnit, quantity,
      grossAmount, currency, status, sourceType, sourceUrl, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      holdingId = excluded.holdingId,
      accountName = excluded.accountName,
      assetType = excluded.assetType,
      symbol = excluded.symbol,
      eventDate = excluded.eventDate,
      exDate = excluded.exDate,
      payDate = excluded.payDate,
      amountPerUnit = excluded.amountPerUnit,
      quantity = excluded.quantity,
      grossAmount = excluded.grossAmount,
      currency = excluded.currency,
      status = excluded.status,
      sourceType = excluded.sourceType,
      sourceUrl = excluded.sourceUrl,
      notes = excluded.notes,
      updatedAt = excluded.updatedAt`,
    [
      id,
      cleanString(payload?.holdingId) || null,
      cleanString(payload?.accountName, "Main") || "Main",
      cleanString(payload?.assetType, "bond") === "stock" ? "stock" : "bond",
      symbol,
      eventDate,
      cleanString(payload?.exDate) || null,
      cleanString(payload?.payDate) || eventDate,
      payload?.amountPerUnit == null || payload?.amountPerUnit === "" ? null : Number(payload.amountPerUnit),
      payload?.quantity == null || payload?.quantity === "" ? null : Number(payload.quantity),
      payload?.grossAmount == null || payload?.grossAmount === "" ? null : Number(payload.grossAmount),
      cleanString(payload?.currency, "USD").toUpperCase() || "USD",
      cleanString(payload?.status, "manual") || "manual",
      cleanString(payload?.sourceType, "manual") || "manual",
      cleanString(payload?.sourceUrl) || null,
      cleanString(payload?.notes) || null,
      ts,
      ts,
    ],
    account.dbPath,
  );
  return getPortfolioSnapshot(request);
}

export function deleteIncomeEvent(request, id) {
  const account = resolveAccount(request);
  ensureDb(account);
  execute("DELETE FROM income_events WHERE id = ?", [id], account.dbPath);
  return getPortfolioSnapshot(request);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "fundamental-analysis-portfolio-income-calendar",
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchYahooDividends(symbol) {
  const encoded = encodeURIComponent(symbol);
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=2y&interval=1d&events=div`;
  const calendarUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encoded}?modules=calendarEvents,summaryDetail`;
  const events = [];
  const payload = { chart: null, calendar: null };

  const chart = await fetchJson(chartUrl);
  payload.chart = chart;
  const dividends = chart?.chart?.result?.[0]?.events?.dividends ?? {};
  for (const dividend of Object.values(dividends)) {
    const date = new Date(Number(dividend.date) * 1000).toISOString().slice(0, 10);
    events.push({
      symbol,
      eventDate: date,
      exDate: date,
      payDate: null,
      amountPerUnit: Number.isFinite(Number(dividend.amount)) ? Number(dividend.amount) : null,
      status: date >= new Date().toISOString().slice(0, 10) ? "announced" : "paid",
      sourceType: "yahoo_chart_dividend",
      sourceUrl: chartUrl,
      notes: "Yahoo Finance chart dividend event. Date is treated as ex-date when no pay date is supplied.",
    });
  }

  try {
    const calendar = await fetchJson(calendarUrl);
    payload.calendar = calendar;
    const result = calendar?.quoteSummary?.result?.[0] ?? {};
    const calendarEvents = result.calendarEvents ?? {};
    const exDateUnix = calendarEvents.exDividendDate?.raw;
    const payDateUnix = calendarEvents.dividendDate?.raw;
    if (exDateUnix || payDateUnix) {
      const exDate = exDateUnix ? new Date(Number(exDateUnix) * 1000).toISOString().slice(0, 10) : null;
      const payDate = payDateUnix ? new Date(Number(payDateUnix) * 1000).toISOString().slice(0, 10) : null;
      const latestAmount = events
        .filter((event) => event.amountPerUnit != null)
        .sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0]?.amountPerUnit ?? null;
      events.push({
        symbol,
        eventDate: payDate ?? exDate,
        exDate,
        payDate,
        amountPerUnit: latestAmount,
        status: "announced",
        sourceType: "yahoo_quote_summary_calendar",
        sourceUrl: calendarUrl,
        notes: latestAmount == null
          ? "Yahoo calendar event did not provide dividend amount; amount is left blank."
          : "Yahoo calendar event date paired with latest observed per-share dividend amount. Confirm issuer announcement before relying on amount.",
      });
    }
  } catch (error) {
    payload.calendarError = error instanceof Error ? error.message : String(error);
  }

  return { events, payload, sourceUrl: chartUrl };
}

export async function refreshStockDividends(request) {
  const account = resolveAccount(request);
  ensureDb(account);
  const holdings = rows(account, "SELECT * FROM holdings WHERE assetType = 'stock' AND quantity > 0 ORDER BY symbol");
  const refreshed = [];
  const errors = [];
  for (const holding of holdings) {
    try {
      const { events, payload, sourceUrl } = await fetchYahooDividends(holding.symbol);
      execute(
        `INSERT INTO dividend_fetch_cache (symbol, fetchedAt, status, sourceUrl, payloadJson, message)
         VALUES (?, ?, 'ok', ?, ?, NULL)
         ON CONFLICT(symbol) DO UPDATE SET fetchedAt = excluded.fetchedAt, status = excluded.status, sourceUrl = excluded.sourceUrl, payloadJson = excluded.payloadJson, message = NULL`,
        [holding.symbol, nowIso(), sourceUrl, JSON.stringify(payload)],
        account.dbPath,
      );
      for (const event of events) {
        const quantity = Number(holding.quantity ?? 0);
        const grossAmount = event.amountPerUnit == null ? null : event.amountPerUnit * quantity;
        execute(
          `INSERT INTO income_events (
            id, holdingId, accountName, assetType, symbol, eventDate, exDate, payDate, amountPerUnit, quantity,
            grossAmount, currency, status, sourceType, sourceUrl, notes, createdAt, updatedAt
          ) VALUES (?, ?, ?, 'stock', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(accountName, symbol, eventDate, sourceType, status) DO UPDATE SET
            holdingId = excluded.holdingId,
            accountName = excluded.accountName,
            exDate = excluded.exDate,
            payDate = excluded.payDate,
            amountPerUnit = excluded.amountPerUnit,
            quantity = excluded.quantity,
            grossAmount = excluded.grossAmount,
            currency = excluded.currency,
            sourceUrl = excluded.sourceUrl,
            notes = excluded.notes,
            updatedAt = excluded.updatedAt`,
          [
            `stock-income-${holding.symbol}-${event.sourceType}-${event.eventDate}`,
            holding.id,
            holding.accountName,
            holding.symbol,
            event.eventDate,
            event.exDate,
            event.payDate,
            event.amountPerUnit,
            quantity,
            grossAmount,
            holding.currency ?? "USD",
            event.status,
            event.sourceType,
            event.sourceUrl,
            event.notes,
            nowIso(),
            nowIso(),
          ],
          account.dbPath,
        );
      }
      refreshed.push({ symbol: holding.symbol, events: events.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ symbol: holding.symbol, message });
      execute(
        `INSERT INTO dividend_fetch_cache (symbol, fetchedAt, status, sourceUrl, payloadJson, message)
         VALUES (?, ?, 'error', NULL, NULL, ?)
         ON CONFLICT(symbol) DO UPDATE SET fetchedAt = excluded.fetchedAt, status = excluded.status, message = excluded.message`,
        [holding.symbol, nowIso(), message],
        account.dbPath,
      );
    }
  }
  return {
    ...getPortfolioSnapshot(request),
    refresh: {
      refreshed,
      errors,
      source: "Yahoo Finance chart and quoteSummary endpoints",
    },
  };
}
