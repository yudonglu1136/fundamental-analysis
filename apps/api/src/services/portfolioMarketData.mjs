import { mkdirSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execute, executescript, query } from "../db/client.mjs";

const MARKET_DATA_DB_PATH = path.resolve(
  process.env.PORTFOLIO_MARKET_DATA_DB_PATH ?? "data/local/portfolio/market_data.sqlite",
);
const PRICE_CACHE_TTL_MS = Number(process.env.PORTFOLIO_PRICE_CACHE_TTL_MS ?? 15 * 60 * 1000);
const DIVIDEND_CACHE_TTL_MS = Number(process.env.PORTFOLIO_DIVIDEND_CACHE_TTL_MS ?? 12 * 60 * 60 * 1000);
const FX_CACHE_TTL_MS = Number(process.env.PORTFOLIO_FX_CACHE_TTL_MS ?? 60 * 60 * 1000);
const seededDbPaths = new Set();

const marketDataSchemaSql = `
CREATE TABLE IF NOT EXISTS market_securities (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  assetType TEXT NOT NULL DEFAULT 'stock',
  exchange TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  logoUrl TEXT,
  logoSource TEXT,
  source TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_price_cache (
  symbol TEXT PRIMARY KEY,
  price REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  sourceUrl TEXT,
  fetchedAt TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_dividend_fetch_cache (
  symbol TEXT PRIMARY KEY,
  fetchedAt TEXT NOT NULL,
  status TEXT NOT NULL,
  sourceUrl TEXT,
  payloadJson TEXT,
  message TEXT
);

CREATE TABLE IF NOT EXISTS market_dividend_events (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  exDate TEXT,
  payDate TEXT,
  amountPerUnit REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceUrl TEXT,
  notes TEXT,
  fetchedAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(symbol, eventDate, sourceType, status)
);

CREATE TABLE IF NOT EXISTS market_fx_rate_cache (
  pair TEXT PRIMARY KEY,
  fromCurrency TEXT NOT NULL,
  toCurrency TEXT NOT NULL,
  rate REAL,
  sourceUrl TEXT,
  fetchedAt TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS market_securities_name_idx ON market_securities(name);
CREATE INDEX IF NOT EXISTS market_dividend_events_symbol_date_idx ON market_dividend_events(symbol, eventDate);
`;

const logoSymbolAliases = {
  "BRK.B": "BRK-B",
  "DGE.L": "DEO",
  GOOGL: "GOOG",
  LSEG: "LSEG.L",
};

const yahooSymbolAliases = {
  "BRK.B": "BRK-B",
  LSEG: "LSEG.L",
};

const penceCurrencyCodes = new Set(["GBX", "GBPENCE"]);
const lseSymbolAliases = new Set(["LSEG"]);

const curatedLogoUrls = {
  GOOG: "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
  GOOGL: "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
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

const marketUniverseSeed = `
AAPL|Apple Inc.|NASDAQ|USD|stock
MSFT|Microsoft Corporation|NASDAQ|USD|stock
NVDA|NVIDIA Corporation|NASDAQ|USD|stock
AMZN|Amazon.com, Inc.|NASDAQ|USD|stock
GOOG|Alphabet Inc.|NASDAQ|USD|stock
GOOGL|Alphabet Inc.|NASDAQ|USD|stock
META|Meta Platforms, Inc.|NASDAQ|USD|stock
AVGO|Broadcom Inc.|NASDAQ|USD|stock
TSLA|Tesla, Inc.|NASDAQ|USD|stock
BRK-B|Berkshire Hathaway Inc.|NYSE|USD|stock
JPM|JPMorgan Chase & Co.|NYSE|USD|stock
V|Visa Inc.|NYSE|USD|stock
MA|Mastercard Incorporated|NYSE|USD|stock
UNH|UnitedHealth Group Incorporated|NYSE|USD|stock
LLY|Eli Lilly and Company|NYSE|USD|stock
XOM|Exxon Mobil Corporation|NYSE|USD|stock
COST|Costco Wholesale Corporation|NASDAQ|USD|stock
WMT|Walmart Inc.|NYSE|USD|stock
HD|The Home Depot, Inc.|NYSE|USD|stock
PG|The Procter & Gamble Company|NYSE|USD|stock
JNJ|Johnson & Johnson|NYSE|USD|stock
ABBV|AbbVie Inc.|NYSE|USD|stock
KO|The Coca-Cola Company|NYSE|USD|stock
PEP|PepsiCo, Inc.|NASDAQ|USD|stock
MCD|McDonald's Corporation|NYSE|USD|stock
MRK|Merck & Co., Inc.|NYSE|USD|stock
TMO|Thermo Fisher Scientific Inc.|NYSE|USD|stock
ABT|Abbott Laboratories|NYSE|USD|stock
DHR|Danaher Corporation|NYSE|USD|stock
ADBE|Adobe Inc.|NASDAQ|USD|stock
CRM|Salesforce, Inc.|NYSE|USD|stock
ORCL|Oracle Corporation|NYSE|USD|stock
AMD|Advanced Micro Devices, Inc.|NASDAQ|USD|stock
INTC|Intel Corporation|NASDAQ|USD|stock
CSCO|Cisco Systems, Inc.|NASDAQ|USD|stock
QCOM|QUALCOMM Incorporated|NASDAQ|USD|stock
TXN|Texas Instruments Incorporated|NASDAQ|USD|stock
IBM|International Business Machines Corporation|NYSE|USD|stock
NFLX|Netflix, Inc.|NASDAQ|USD|stock
DIS|The Walt Disney Company|NYSE|USD|stock
NKE|NIKE, Inc.|NYSE|USD|stock
SBUX|Starbucks Corporation|NASDAQ|USD|stock
LOW|Lowe's Companies, Inc.|NYSE|USD|stock
CAT|Caterpillar Inc.|NYSE|USD|stock
GE|GE Aerospace|NYSE|USD|stock
HON|Honeywell International Inc.|NASDAQ|USD|stock
UPS|United Parcel Service, Inc.|NYSE|USD|stock
RTX|RTX Corporation|NYSE|USD|stock
LMT|Lockheed Martin Corporation|NYSE|USD|stock
NOC|Northrop Grumman Corporation|NYSE|USD|stock
BA|The Boeing Company|NYSE|USD|stock
DE|Deere & Company|NYSE|USD|stock
GS|The Goldman Sachs Group, Inc.|NYSE|USD|stock
MS|Morgan Stanley|NYSE|USD|stock
BAC|Bank of America Corporation|NYSE|USD|stock
C|Citigroup Inc.|NYSE|USD|stock
WFC|Wells Fargo & Company|NYSE|USD|stock
SCHW|The Charles Schwab Corporation|NYSE|USD|stock
BLK|BlackRock, Inc.|NYSE|USD|stock
SPGI|S&P Global Inc.|NYSE|USD|stock
MCO|Moody's Corporation|NYSE|USD|stock
CB|Chubb Limited|NYSE|USD|stock
TRV|The Travelers Companies, Inc.|NYSE|USD|stock
PGR|The Progressive Corporation|NYSE|USD|stock
AXP|American Express Company|NYSE|USD|stock
PYPL|PayPal Holdings, Inc.|NASDAQ|USD|stock
SO|The Southern Company|NYSE|USD|stock
DUK|Duke Energy Corporation|NYSE|USD|stock
NEE|NextEra Energy, Inc.|NYSE|USD|stock
AEP|American Electric Power Company, Inc.|NASDAQ|USD|stock
EXC|Exelon Corporation|NASDAQ|USD|stock
CEG|Constellation Energy Corporation|NASDAQ|USD|stock
AMT|American Tower Corporation|NYSE|USD|stock
PLD|Prologis, Inc.|NYSE|USD|stock
O|Realty Income Corporation|NYSE|USD|stock
VICI|VICI Properties Inc.|NYSE|USD|stock
EQIX|Equinix, Inc.|NASDAQ|USD|stock
LIN|Linde plc|NASDAQ|USD|stock
APD|Air Products and Chemicals, Inc.|NYSE|USD|stock
SHW|The Sherwin-Williams Company|NYSE|USD|stock
FCX|Freeport-McMoRan Inc.|NYSE|USD|stock
NEM|Newmont Corporation|NYSE|USD|stock
CVX|Chevron Corporation|NYSE|USD|stock
COP|ConocoPhillips|NYSE|USD|stock
SLB|Schlumberger Limited|NYSE|USD|stock
EOG|EOG Resources, Inc.|NYSE|USD|stock
OXY|Occidental Petroleum Corporation|NYSE|USD|stock
T|AT&T Inc.|NYSE|USD|stock
VZ|Verizon Communications Inc.|NYSE|USD|stock
TMUS|T-Mobile US, Inc.|NASDAQ|USD|stock
CMCSA|Comcast Corporation|NASDAQ|USD|stock
NOW|ServiceNow, Inc.|NYSE|USD|stock
PLTR|Palantir Technologies Inc.|NASDAQ|USD|stock
ANET|Arista Networks, Inc.|NYSE|USD|stock
PANW|Palo Alto Networks, Inc.|NASDAQ|USD|stock
CRWD|CrowdStrike Holdings, Inc.|NASDAQ|USD|stock
SNOW|Snowflake Inc.|NYSE|USD|stock
SHOP|Shopify Inc.|NASDAQ|USD|stock
UBER|Uber Technologies, Inc.|NYSE|USD|stock
BKNG|Booking Holdings Inc.|NASDAQ|USD|stock
ABNB|Airbnb, Inc.|NASDAQ|USD|stock
ISRG|Intuitive Surgical, Inc.|NASDAQ|USD|stock
SYK|Stryker Corporation|NYSE|USD|stock
MDT|Medtronic plc|NYSE|USD|stock
GILD|Gilead Sciences, Inc.|NASDAQ|USD|stock
BMY|Bristol-Myers Squibb Company|NYSE|USD|stock
PFE|Pfizer Inc.|NYSE|USD|stock
AMGN|Amgen Inc.|NASDAQ|USD|stock
REGN|Regeneron Pharmaceuticals, Inc.|NASDAQ|USD|stock
AZN|AstraZeneca PLC|NASDAQ|USD|stock
NVO|Novo Nordisk A/S|NYSE|USD|stock
ASML|ASML Holding N.V.|NASDAQ|USD|stock
TSM|Taiwan Semiconductor Manufacturing Company Limited|NYSE|USD|stock
MU|Micron Technology, Inc.|NASDAQ|USD|stock
AVAV|AeroVironment, Inc.|NASDAQ|USD|stock
QCOM|QUALCOMM Incorporated|NASDAQ|USD|stock
MCK|McKesson Corporation|NYSE|USD|stock
IBKR|Interactive Brokers Group, Inc.|NASDAQ|USD|stock
LEGN|Legend Biotech Corporation|NASDAQ|USD|stock
DBMF|iMGP DBi Managed Futures Strategy ETF|NYSEARCA|USD|stock
QQQ|Invesco QQQ Trust|NASDAQ|USD|stock
SPY|SPDR S&P 500 ETF Trust|NYSEARCA|USD|stock
VOO|Vanguard S&P 500 ETF|NYSEARCA|USD|stock
VTI|Vanguard Total Stock Market ETF|NYSEARCA|USD|stock
SCHD|Schwab U.S. Dividend Equity ETF|NYSEARCA|USD|stock
DGRO|iShares Core Dividend Growth ETF|NYSEARCA|USD|stock
VIG|Vanguard Dividend Appreciation ETF|NYSEARCA|USD|stock
JEPI|JPMorgan Equity Premium Income ETF|NYSEARCA|USD|stock
JEPQ|JPMorgan Nasdaq Equity Premium Income ETF|NASDAQ|USD|stock
TLT|iShares 20+ Year Treasury Bond ETF|NASDAQ|USD|stock
IEF|iShares 7-10 Year Treasury Bond ETF|NASDAQ|USD|stock
SHY|iShares 1-3 Year Treasury Bond ETF|NASDAQ|USD|stock
HYG|iShares iBoxx $ High Yield Corporate Bond ETF|NYSEARCA|USD|stock
LQD|iShares iBoxx $ Investment Grade Corporate Bond ETF|NYSEARCA|USD|stock
BND|Vanguard Total Bond Market ETF|NASDAQ|USD|stock
LSEG|London Stock Exchange Group PLC|LSE|GBP|stock
LSEG.L|London Stock Exchange Group PLC|LSE|GBP|stock
BA.L|BAE Systems plc|LSE|GBP|stock
DGE.L|Diageo plc|LSE|GBP|stock
TRI|Thomson Reuters Corporation|NYSE|USD|stock
`.trim();

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : value == null ? fallback : String(value).trim();
}

export function normalizeSecuritySymbol(symbol) {
  return cleanString(symbol).toUpperCase();
}

function yahooSymbolFor(symbol) {
  const normalized = normalizeSecuritySymbol(symbol);
  return yahooSymbolAliases[normalized] ?? normalized;
}

function canonicalCurrency(currency) {
  const raw = cleanString(currency);
  if (!raw) return "USD";
  if (raw === "GBp" || penceCurrencyCodes.has(raw.toUpperCase())) return "GBP";
  return raw.toUpperCase();
}

export function normalizeCurrencyCode(currency) {
  return canonicalCurrency(currency);
}

function isLseSymbol(symbol) {
  const normalized = normalizeSecuritySymbol(symbol);
  return normalized.endsWith(".L") || lseSymbolAliases.has(normalized);
}

function isPenceQuote(symbol, price, currency, metadata = {}) {
  const rawCurrency = cleanString(currency);
  const currencyUpper = rawCurrency.toUpperCase();
  if (rawCurrency === "GBp" || penceCurrencyCodes.has(currencyUpper)) return true;
  const exchange = cleanString(metadata.exchangeName || metadata.fullExchangeName || metadata.exchange).toUpperCase();
  return currencyUpper === "GBP" && Number(price) > 1000 && (isLseSymbol(symbol) || exchange === "LSE");
}

export function normalizeYahooPriceQuote(symbol, price, currency, metadata = {}) {
  const rawPrice = Number(price);
  if (!Number.isFinite(rawPrice)) return { price: rawPrice, currency: canonicalCurrency(currency), unitScale: 1 };
  if (isPenceQuote(symbol, rawPrice, currency, metadata)) {
    return {
      price: rawPrice / 100,
      currency: "GBP",
      rawCurrency: cleanString(currency),
      rawPrice,
      unitScale: 0.01,
      unitNote: "Yahoo LSE quote normalized from pence/GBX to GBP.",
    };
  }
  return {
    price: rawPrice,
    currency: canonicalCurrency(currency),
    rawCurrency: cleanString(currency),
    rawPrice,
    unitScale: 1,
  };
}

function normalizeMarketSecurityRow(row) {
  if (!row) return row;
  const exchange = cleanString(row.exchange).toUpperCase();
  const output = {
    ...row,
    currency: exchange === "LSE" || isLseSymbol(row.symbol) ? "GBP" : canonicalCurrency(row.currency),
  };
  if (row.cachedPrice == null) return output;
  const normalized = normalizeYahooPriceQuote(row.symbol, row.cachedPrice, row.cachedPriceCurrency ?? output.currency, output);
  return {
    ...output,
    cachedPrice: normalized.price,
    cachedPriceCurrency: normalized.currency,
  };
}

export function defaultMarketLogoUrl(symbol, assetType = "stock") {
  if (assetType !== "stock") return null;
  const normalized = normalizeSecuritySymbol(symbol);
  if (!normalized) return null;
  const logoSymbol = logoSymbolAliases[normalized] ?? normalized;
  return curatedLogoUrls[normalized] ?? `https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(logoSymbol)}.png`;
}

function marketUniverseRows() {
  return marketUniverseSeed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [symbol, name, exchange, currency, assetType] = line.split("|");
      return {
        symbol: normalizeSecuritySymbol(symbol),
        name: cleanString(name),
        exchange: cleanString(exchange),
        currency: canonicalCurrency(currency),
        assetType: cleanString(assetType, "stock"),
        logoUrl: defaultMarketLogoUrl(symbol, assetType),
        logoSource: "companiesmarketcap",
        source: "curated_seed_universe",
      };
    });
}

export function ensureMarketDataDb() {
  mkdirSync(path.dirname(MARKET_DATA_DB_PATH), { recursive: true });
  executescript(marketDataSchemaSql, MARKET_DATA_DB_PATH);
  if (seededDbPaths.has(MARKET_DATA_DB_PATH)) return;

  const rows = marketUniverseRows();
  const ts = nowIso();
  const chunkSize = 80;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const params = chunk.flatMap((row) => [
      row.symbol,
      row.name,
      row.assetType,
      row.exchange,
      row.currency,
      row.logoUrl,
      row.logoSource,
      row.source,
      ts,
      ts,
    ]);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    execute(
      `INSERT INTO market_securities (
        symbol, name, assetType, exchange, currency, logoUrl, logoSource, source, createdAt, updatedAt
      ) VALUES ${placeholders}
      ON CONFLICT(symbol) DO UPDATE SET
        name = COALESCE(market_securities.name, excluded.name),
        assetType = COALESCE(market_securities.assetType, excluded.assetType),
        exchange = COALESCE(market_securities.exchange, excluded.exchange),
        currency = excluded.currency,
        logoUrl = COALESCE(market_securities.logoUrl, excluded.logoUrl),
        logoSource = COALESCE(market_securities.logoSource, excluded.logoSource),
        source = COALESCE(market_securities.source, excluded.source),
        updatedAt = excluded.updatedAt`,
      params,
      MARKET_DATA_DB_PATH,
    );
  }
  seededDbPaths.add(MARKET_DATA_DB_PATH);
}

export function upsertMarketSecurity(security) {
  const symbol = normalizeSecuritySymbol(security?.symbol);
  if (!symbol) return null;
  ensureMarketDataDb();
  const ts = nowIso();
  const assetType = cleanString(security?.assetType, "stock") || "stock";
  const logoUrl = cleanString(security?.logoUrl) || defaultMarketLogoUrl(symbol, assetType);
  execute(
    `INSERT INTO market_securities (
      symbol, name, assetType, exchange, currency, logoUrl, logoSource, source, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = COALESCE(excluded.name, market_securities.name),
      assetType = COALESCE(excluded.assetType, market_securities.assetType),
      exchange = COALESCE(excluded.exchange, market_securities.exchange),
      currency = COALESCE(excluded.currency, market_securities.currency),
      logoUrl = COALESCE(excluded.logoUrl, market_securities.logoUrl),
      logoSource = COALESCE(excluded.logoSource, market_securities.logoSource),
      source = COALESCE(excluded.source, market_securities.source),
      updatedAt = excluded.updatedAt`,
    [
      symbol,
      cleanString(security?.name) || null,
      assetType,
      cleanString(security?.exchange || security?.market) || null,
      canonicalCurrency(security?.currency),
      logoUrl,
      logoUrl ? cleanString(security?.logoSource, "companiesmarketcap") || "companiesmarketcap" : null,
      cleanString(security?.source, "user_or_fetch_observed") || "user_or_fetch_observed",
      ts,
      ts,
    ],
    MARKET_DATA_DB_PATH,
  );
  return getMarketSecurity(symbol);
}

export function getMarketSecurity(symbol) {
  const normalized = normalizeSecuritySymbol(symbol);
  if (!normalized) return null;
  ensureMarketDataDb();
  const row = query(
    `SELECT
      securities.*,
      prices.price AS cachedPrice,
      prices.currency AS cachedPriceCurrency,
      prices.fetchedAt AS cachedPriceAt,
      prices.status AS cachedPriceStatus
     FROM market_securities securities
     LEFT JOIN market_price_cache prices ON prices.symbol = securities.symbol
     WHERE securities.symbol = ?
     LIMIT 1`,
    [normalized],
    MARKET_DATA_DB_PATH,
  )[0] ?? null;
  return normalizeMarketSecurityRow(row);
}

export function searchMarketSecurities(searchText, options = {}) {
  ensureMarketDataDb();
  const q = cleanString(searchText).toUpperCase();
  const limit = Math.max(1, Math.min(Number(options.limit ?? 20), 50));
  if (!q) return [];
  const like = `%${q}%`;
  return query(
    `SELECT
      securities.*,
      prices.price AS cachedPrice,
      prices.currency AS cachedPriceCurrency,
      prices.fetchedAt AS cachedPriceAt,
      prices.status AS cachedPriceStatus
     FROM market_securities securities
     LEFT JOIN market_price_cache prices ON prices.symbol = securities.symbol
     WHERE securities.symbol LIKE ? OR UPPER(securities.name) LIKE ?
     ORDER BY
      CASE
        WHEN securities.symbol = ? THEN 0
        WHEN securities.symbol LIKE ? THEN 1
        ELSE 2
      END,
      securities.symbol
     LIMIT ?`,
    [like, like, q, `${q}%`, limit],
    MARKET_DATA_DB_PATH,
  ).map(normalizeMarketSecurityRow);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "fundamental-analysis-portfolio-market-data",
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function isFresh(fetchedAt, maxAgeMs) {
  const timestamp = new Date(fetchedAt ?? 0).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
}

function cachePriceResult(symbol, result) {
  ensureMarketDataDb();
  const ts = nowIso();
  execute(
    `INSERT INTO market_price_cache (symbol, price, currency, sourceUrl, fetchedAt, status, message, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       price = excluded.price,
       currency = excluded.currency,
       sourceUrl = excluded.sourceUrl,
       fetchedAt = excluded.fetchedAt,
       status = excluded.status,
       message = excluded.message,
       updatedAt = excluded.updatedAt`,
    [
      normalizeSecuritySymbol(symbol),
      result.price ?? null,
      canonicalCurrency(result.currency),
      result.sourceUrl ?? null,
      ts,
      result.status ?? "ok",
      result.message ?? null,
      ts,
    ],
    MARKET_DATA_DB_PATH,
  );
}

function cachedPrice(symbol, maxAgeMs = PRICE_CACHE_TTL_MS) {
  ensureMarketDataDb();
  const normalized = normalizeSecuritySymbol(symbol);
  const row = query("SELECT * FROM market_price_cache WHERE symbol = ? LIMIT 1", [normalized], MARKET_DATA_DB_PATH)[0] ?? null;
  if (!row || row.status !== "ok" || row.price == null || !isFresh(row.fetchedAt, maxAgeMs)) return null;
  const normalizedQuote = normalizeYahooPriceQuote(normalized, row.price, row.currency, row);
  return {
    symbol: normalized,
    price: normalizedQuote.price,
    currency: normalizedQuote.currency,
    sourceUrl: row.sourceUrl,
    cached: true,
    fetchedAt: row.fetchedAt,
    rawPrice: normalizedQuote.rawPrice,
    rawCurrency: normalizedQuote.rawCurrency,
    unitScale: normalizedQuote.unitScale,
    unitNote: normalizedQuote.unitNote,
  };
}

function fxPairKey(fromCurrency, toCurrency) {
  return `${canonicalCurrency(fromCurrency)}${canonicalCurrency(toCurrency)}`;
}

function cacheFxRateResult(fromCurrency, toCurrency, result) {
  ensureMarketDataDb();
  const from = canonicalCurrency(fromCurrency);
  const to = canonicalCurrency(toCurrency);
  const ts = nowIso();
  execute(
    `INSERT INTO market_fx_rate_cache (pair, fromCurrency, toCurrency, rate, sourceUrl, fetchedAt, status, message, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pair) DO UPDATE SET
       fromCurrency = excluded.fromCurrency,
       toCurrency = excluded.toCurrency,
       rate = COALESCE(excluded.rate, market_fx_rate_cache.rate),
       sourceUrl = COALESCE(excluded.sourceUrl, market_fx_rate_cache.sourceUrl),
       fetchedAt = excluded.fetchedAt,
       status = excluded.status,
       message = excluded.message,
       updatedAt = excluded.updatedAt`,
    [
      fxPairKey(from, to),
      from,
      to,
      result.rate ?? null,
      result.sourceUrl ?? null,
      ts,
      result.status ?? "ok",
      result.message ?? null,
      ts,
    ],
    MARKET_DATA_DB_PATH,
  );
}

function fxRateRow(fromCurrency, toCurrency) {
  ensureMarketDataDb();
  return query(
    "SELECT * FROM market_fx_rate_cache WHERE pair = ? LIMIT 1",
    [fxPairKey(fromCurrency, toCurrency)],
    MARKET_DATA_DB_PATH,
  )[0] ?? null;
}

export function getCachedFxRate(fromCurrency, toCurrency = "USD", options = {}) {
  const from = canonicalCurrency(fromCurrency);
  const to = canonicalCurrency(toCurrency);
  if (from === to) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: 1,
      sourceUrl: null,
      fetchedAt: null,
      cached: true,
      stale: false,
    };
  }
  const row = fxRateRow(from, to);
  if (!row || row.rate == null) return null;
  const stale = !isFresh(row.fetchedAt, options.maxAgeMs ?? FX_CACHE_TTL_MS);
  if (stale && !options.allowStale) return null;
  return {
    fromCurrency: from,
    toCurrency: to,
    rate: Number(row.rate),
    sourceUrl: row.sourceUrl,
    fetchedAt: row.fetchedAt,
    cached: true,
    stale,
    status: row.status,
    message: row.message,
  };
}

async function fetchYahooFxQuote(fromCurrency, toCurrency) {
  const from = canonicalCurrency(fromCurrency);
  const to = canonicalCurrency(toCurrency);
  const candidates = [
    { yahooSymbol: `${from}${to}=X`, inverted: false },
    { yahooSymbol: `${to}${from}=X`, inverted: true },
  ];
  let lastError = null;
  for (const candidate of candidates) {
    const encoded = encodeURIComponent(candidate.yahooSymbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`;
    try {
      const payload = await fetchJson(url);
      const result = payload?.chart?.result?.[0] ?? {};
      const meta = result.meta ?? {};
      const close = result.indicators?.quote?.[0]?.close ?? [];
      const latestClose = [...close].reverse().find((value) => Number.isFinite(Number(value)));
      const rawRate = Number.isFinite(Number(meta.regularMarketPrice)) ? Number(meta.regularMarketPrice) : Number(latestClose);
      if (!Number.isFinite(rawRate) || rawRate <= 0) throw new Error("Yahoo FX response did not include a usable rate.");
      return {
        rate: candidate.inverted ? 1 / rawRate : rawRate,
        sourceUrl: url,
        rawRate,
        yahooSymbol: candidate.yahooSymbol,
        inverted: candidate.inverted,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`No Yahoo FX quote for ${from}/${to}.`);
}

export async function fetchFxRateWithCache(fromCurrency, toCurrency = "USD", options = {}) {
  const from = canonicalCurrency(fromCurrency);
  const to = canonicalCurrency(toCurrency);
  if (from === to) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: 1,
      sourceUrl: null,
      cached: true,
      stale: false,
    };
  }
  if (!options.force) {
    const cached = getCachedFxRate(from, to, { maxAgeMs: options.maxAgeMs ?? FX_CACHE_TTL_MS });
    if (cached) return cached;
  }
  try {
    const quote = await fetchYahooFxQuote(from, to);
    const output = {
      fromCurrency: from,
      toCurrency: to,
      rate: quote.rate,
      sourceUrl: quote.sourceUrl,
      cached: false,
      stale: false,
      yahooSymbol: quote.yahooSymbol,
      inverted: quote.inverted,
    };
    cacheFxRateResult(from, to, { ...output, status: "ok" });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stale = getCachedFxRate(from, to, { allowStale: true, maxAgeMs: 0 });
    cacheFxRateResult(from, to, { rate: null, status: "error", message });
    if (stale?.rate != null) {
      return {
        ...stale,
        stale: true,
        message,
      };
    }
    throw error;
  }
}

export async function fetchYahooPriceWithCache(symbol, options = {}) {
  const normalized = normalizeSecuritySymbol(symbol);
  if (!normalized) throw new Error("Security symbol is required.");
  ensureMarketDataDb();
  if (!options.force) {
    const cached = cachedPrice(normalized, options.maxAgeMs ?? PRICE_CACHE_TTL_MS);
    if (cached) return cached;
  }

  const yahooSymbol = yahooSymbolFor(normalized);
  const encoded = encodeURIComponent(yahooSymbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`;
  try {
    const payload = await fetchJson(url);
    const result = payload?.chart?.result?.[0] ?? {};
    const meta = result.meta ?? {};
    const close = result.indicators?.quote?.[0]?.close ?? [];
    const latestClose = [...close].reverse().find((value) => Number.isFinite(Number(value)));
    const rawPrice = Number.isFinite(Number(meta.regularMarketPrice)) ? Number(meta.regularMarketPrice) : Number(latestClose);
    if (!Number.isFinite(rawPrice)) throw new Error("Yahoo chart response did not include a usable price.");
    const normalizedQuote = normalizeYahooPriceQuote(normalized, rawPrice, meta.currency, meta);
    const output = {
      symbol: normalized,
      price: normalizedQuote.price,
      currency: normalizedQuote.currency,
      sourceUrl: url,
      cached: false,
      rawPrice: normalizedQuote.rawPrice,
      rawCurrency: normalizedQuote.rawCurrency,
      unitScale: normalizedQuote.unitScale,
      unitNote: normalizedQuote.unitNote,
    };
    upsertMarketSecurity({
      symbol: normalized,
      currency: output.currency,
      exchange: meta.exchangeName ?? meta.fullExchangeName,
      source: "yahoo_chart_observed",
    });
    cachePriceResult(normalized, { ...output, status: "ok" });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachePriceResult(normalized, { price: null, currency: "USD", sourceUrl: url, status: "error", message });
    const stale = query("SELECT * FROM market_price_cache WHERE symbol = ? AND price IS NOT NULL LIMIT 1", [normalized], MARKET_DATA_DB_PATH)[0] ?? null;
    if (stale?.price != null) {
      const normalizedQuote = normalizeYahooPriceQuote(normalized, stale.price, stale.currency, stale);
      return {
        symbol: normalized,
        price: normalizedQuote.price,
        currency: normalizedQuote.currency,
        sourceUrl: stale.sourceUrl,
        cached: true,
        stale: true,
        fetchedAt: stale.fetchedAt,
        rawPrice: normalizedQuote.rawPrice,
        rawCurrency: normalizedQuote.rawCurrency,
        unitScale: normalizedQuote.unitScale,
        unitNote: normalizedQuote.unitNote,
      };
    }
    throw error;
  }
}

function addOneYear(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
  return parsed.toISOString().slice(0, 10);
}

function estimateForwardDividends(symbol, events, sourceUrl) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
  const horizonDate = horizon.toISOString().slice(0, 10);
  const exactMonths = new Set(events.filter((event) => event.eventDate >= today).map((event) => event.eventDate.slice(0, 7)));
  const estimates = [];
  for (const event of events) {
    if (event.eventDate >= today || event.amountPerUnit == null) continue;
    let projectedDate = addOneYear(event.eventDate);
    while (projectedDate && projectedDate <= today) projectedDate = addOneYear(projectedDate);
    if (!projectedDate || projectedDate > horizonDate) continue;
    const projectedMonth = projectedDate.slice(0, 7);
    if (exactMonths.has(projectedMonth)) continue;
    exactMonths.add(projectedMonth);
    estimates.push({
      symbol,
      eventDate: projectedDate,
      exDate: projectedDate,
      payDate: projectedDate,
      amountPerUnit: event.amountPerUnit,
      status: "estimated",
      sourceType: "yahoo_trailing_dividend_estimate",
      sourceUrl,
      notes: `Estimated from prior-year Yahoo dividend pattern on ${event.eventDate}; confirm issuer announcement before relying on amount.`,
    });
  }
  return estimates;
}

async function fetchYahooDividends(symbol) {
  const normalized = normalizeSecuritySymbol(symbol);
  const yahooSymbol = yahooSymbolFor(normalized);
  const encoded = encodeURIComponent(yahooSymbol);
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=2y&interval=1d&events=div`;
  const calendarUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encoded}?modules=calendarEvents,summaryDetail`;
  const events = [];
  const payload = { chart: null, calendar: null };
  const currency = getMarketSecurity(normalized)?.currency ?? "USD";

  const chart = await fetchJson(chartUrl);
  payload.chart = chart;
  const dividends = chart?.chart?.result?.[0]?.events?.dividends ?? {};
  for (const dividend of Object.values(dividends)) {
    const date = new Date(Number(dividend.date) * 1000).toISOString().slice(0, 10);
    events.push({
      symbol: normalized,
      eventDate: date,
      exDate: date,
      payDate: null,
      amountPerUnit: Number.isFinite(Number(dividend.amount)) ? Number(dividend.amount) : null,
      currency,
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
        symbol: normalized,
        eventDate: payDate ?? exDate,
        exDate,
        payDate,
        amountPerUnit: latestAmount,
        currency,
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

  return {
    events: [...events, ...estimateForwardDividends(normalized, events, chartUrl)],
    payload,
    sourceUrl: chartUrl,
  };
}

function marketDividendRows(symbol) {
  ensureMarketDataDb();
  return query(
    `SELECT * FROM market_dividend_events
     WHERE symbol = ?
     ORDER BY eventDate, sourceType`,
    [normalizeSecuritySymbol(symbol)],
    MARKET_DATA_DB_PATH,
  );
}

function cacheDividendResult(symbol, result) {
  ensureMarketDataDb();
  const normalized = normalizeSecuritySymbol(symbol);
  const ts = nowIso();
  execute(
    `INSERT INTO market_dividend_fetch_cache (symbol, fetchedAt, status, sourceUrl, payloadJson, message)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       fetchedAt = excluded.fetchedAt,
       status = excluded.status,
       sourceUrl = excluded.sourceUrl,
       payloadJson = excluded.payloadJson,
       message = excluded.message`,
    [
      normalized,
      ts,
      result.status,
      result.sourceUrl ?? null,
      result.payload == null ? null : JSON.stringify(result.payload),
      result.message ?? null,
    ],
    MARKET_DATA_DB_PATH,
  );
}

function upsertMarketDividendEvents(symbol, events) {
  ensureMarketDataDb();
  const normalized = normalizeSecuritySymbol(symbol);
  const ts = nowIso();
  for (const event of events) {
    if (!event.eventDate) continue;
    const id = crypto
      .createHash("sha1")
      .update(`${normalized}:${event.eventDate}:${event.sourceType}:${event.status}`)
      .digest("hex")
      .slice(0, 24);
    execute(
      `INSERT INTO market_dividend_events (
        id, symbol, eventDate, exDate, payDate, amountPerUnit, currency, status, sourceType, sourceUrl, notes, fetchedAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, eventDate, sourceType, status) DO UPDATE SET
        exDate = excluded.exDate,
        payDate = excluded.payDate,
        amountPerUnit = excluded.amountPerUnit,
        currency = excluded.currency,
        sourceUrl = excluded.sourceUrl,
        notes = excluded.notes,
        fetchedAt = excluded.fetchedAt,
        updatedAt = excluded.updatedAt`,
      [
        `market-dividend-${id}`,
        normalized,
        event.eventDate,
        event.exDate ?? null,
        event.payDate ?? null,
        event.amountPerUnit ?? null,
        cleanString(event.currency, "USD").toUpperCase() || "USD",
        cleanString(event.status, "announced") || "announced",
        cleanString(event.sourceType, "market_dividend") || "market_dividend",
        event.sourceUrl ?? null,
        event.notes ?? null,
        ts,
        ts,
      ],
      MARKET_DATA_DB_PATH,
    );
  }
}

export async function fetchYahooDividendsWithCache(symbol, options = {}) {
  const normalized = normalizeSecuritySymbol(symbol);
  if (!normalized) throw new Error("Security symbol is required.");
  ensureMarketDataDb();
  const cache = query("SELECT * FROM market_dividend_fetch_cache WHERE symbol = ? LIMIT 1", [normalized], MARKET_DATA_DB_PATH)[0] ?? null;
  if (!options.force && cache?.status === "ok" && isFresh(cache.fetchedAt, options.maxAgeMs ?? DIVIDEND_CACHE_TTL_MS)) {
    return {
      events: marketDividendRows(normalized),
      payload: cache.payloadJson ? JSON.parse(cache.payloadJson) : null,
      sourceUrl: cache.sourceUrl,
      cached: true,
    };
  }

  try {
    const result = await fetchYahooDividends(normalized);
    upsertMarketDividendEvents(normalized, result.events);
    cacheDividendResult(normalized, { ...result, status: "ok" });
    return { ...result, cached: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cacheDividendResult(normalized, { status: "error", message, sourceUrl: null, payload: null });
    const stale = marketDividendRows(normalized);
    if (stale.length) return { events: stale, payload: null, sourceUrl: null, cached: true, stale: true };
    throw error;
  }
}

export async function refreshMarketDataUniverse(options = {}) {
  ensureMarketDataDb();
  const symbols = cleanString(options.symbols)
    ? cleanString(options.symbols)
        .split(",")
        .map(normalizeSecuritySymbol)
        .filter(Boolean)
    : marketUniverseRows().map((row) => row.symbol);
  const limit = options.limit == null ? symbols.length : Math.max(1, Math.min(Number(options.limit), symbols.length));
  const selectedSymbols = symbols.slice(0, limit);
  const prices = [];
  const dividends = [];
  const errors = [];

  for (const symbol of selectedSymbols) {
    if (options.prices) {
      try {
        prices.push(await fetchYahooPriceWithCache(symbol, { force: Boolean(options.force) }));
      } catch (error) {
        errors.push({ symbol, type: "price", message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (options.dividends) {
      try {
        const result = await fetchYahooDividendsWithCache(symbol, { force: Boolean(options.force) });
        dividends.push({ symbol, events: result.events.length, cached: Boolean(result.cached) });
      } catch (error) {
        errors.push({ symbol, type: "dividend", message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return {
    symbols: selectedSymbols,
    prices,
    dividends,
    errors,
    dbPath: MARKET_DATA_DB_PATH,
  };
}
