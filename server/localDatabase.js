import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledDataDir = path.join(__dirname, "data");
const bundledDbPath = path.join(bundledDataDir, "guru-analysis.sqlite");
const dbPath = process.env.SQLITE_DB_PATH || bundledDbPath;
const dataDir = path.dirname(dbPath);

fs.mkdirSync(dataDir, { recursive: true });
if (dbPath !== bundledDbPath && !fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
  fs.copyFileSync(bundledDbPath, dbPath);
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS dashboard_snapshots (
    id TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

	  CREATE TABLE IF NOT EXISTS guru_snapshots (
	    guru_id TEXT PRIMARY KEY,
	    cik TEXT,
	    type TEXT,
	    generated_at TEXT NOT NULL,
	    payload_json TEXT NOT NULL
	  );

	  CREATE TABLE IF NOT EXISTS guru_assets (
	    guru_id TEXT NOT NULL,
	    asset_type TEXT NOT NULL,
	    url TEXT NOT NULL,
	    local_path TEXT,
	    style TEXT,
	    prompt TEXT,
	    generated_at TEXT NOT NULL,
	    PRIMARY KEY (guru_id, asset_type)
	  );

  CREATE TABLE IF NOT EXISTS price_points (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  CREATE INDEX IF NOT EXISTS idx_price_points_symbol_date
    ON price_points (symbol, date);

  CREATE TABLE IF NOT EXISTS dbmf_snapshots (
    id TEXT PRIMARY KEY,
    latest_date TEXT,
    generated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS guru_backtests (
    guru_id TEXT NOT NULL,
    years INTEGER NOT NULL,
    generated_at TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (guru_id, years)
  );

  CREATE TABLE IF NOT EXISTS valuation_snapshots (
    id TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS valuation_ticker_snapshots (
    ticker TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_nav_points (
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    nav REAL NOT NULL,
    cash REAL,
    source TEXT,
    source_date TEXT,
    payload_json TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (account_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_portfolio_nav_points_account_date
    ON portfolio_nav_points (account_id, date);

  CREATE TABLE IF NOT EXISTS ticker_assets (
    ticker TEXT PRIMARY KEY,
    company_name TEXT,
    logo_url TEXT,
    logo_domain TEXT,
    logo_source TEXT,
    payload_json TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dividend_events (
    ticker TEXT NOT NULL,
    company_name TEXT,
    ex_date TEXT NOT NULL,
    pay_date TEXT,
    record_date TEXT,
    declaration_date TEXT,
    amount REAL,
    currency TEXT,
    status TEXT,
    source TEXT NOT NULL,
    source_label TEXT,
    logo_url TEXT,
    payload_json TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (ticker, ex_date, source)
  );

  CREATE INDEX IF NOT EXISTS idx_dividend_events_ticker_ex_date
    ON dividend_events (ticker, ex_date);

  CREATE TABLE IF NOT EXISTS background_job_runs (
    job_id TEXT PRIMARY KEY,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    payload_json TEXT
  );
`);

function syncBundledValuationSnapshots() {
  if (process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS === "false") return;
  if (dbPath === bundledDbPath || !fs.existsSync(bundledDbPath)) return;

  let bundledDb;
  try {
    bundledDb = new DatabaseSync(bundledDbPath, { readOnly: true });
    const dashboardRows = bundledDb.prepare(`
      SELECT id, generated_at, payload_json
      FROM valuation_snapshots
    `).all();
    const tickerRows = bundledDb.prepare(`
      SELECT ticker, generated_at, payload_json
      FROM valuation_ticker_snapshots
    `).all();
    if (!dashboardRows.length && !tickerRows.length) return;

    const writeDashboard = db.prepare(`
      INSERT INTO valuation_snapshots (id, generated_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        generated_at = excluded.generated_at,
        payload_json = excluded.payload_json
    `);
    const writeTicker = db.prepare(`
      INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(ticker) DO UPDATE SET
        generated_at = excluded.generated_at,
        payload_json = excluded.payload_json
    `);

    db.exec("BEGIN");
    try {
      for (const row of dashboardRows) {
        writeDashboard.run(row.id, row.generated_at, row.payload_json);
      }
      for (const row of tickerRows) {
        writeTicker.run(row.ticker, row.generated_at, row.payload_json);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    console.info(
      `[database] synced bundled valuation snapshots into ${dbPath}: ` +
      `${dashboardRows.length} dashboard rows, ${tickerRows.length} ticker rows`
    );
  } catch (error) {
    console.warn(`[database] bundled valuation snapshot sync skipped: ${error.message}`);
  } finally {
    bundledDb?.close();
  }
}

syncBundledValuationSnapshots();

function parsePayload(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function normalizeTickerKey(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

export function databaseInfo() {
  return { path: dbPath };
}

export function readDashboardSnapshot() {
  const row = db.prepare("SELECT payload_json FROM dashboard_snapshots WHERE id = ?").get("latest");
  return parsePayload(row?.payload_json);
}

export function writeDashboardSnapshot(payload) {
  db.prepare(`
    INSERT INTO dashboard_snapshots (id, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run("latest", payload.generatedAt || new Date().toISOString(), JSON.stringify(payload));
}

export function readGuruSnapshot(guruId) {
  const row = db.prepare("SELECT payload_json FROM guru_snapshots WHERE guru_id = ?").get(guruId);
  return parsePayload(row?.payload_json);
}

export function writeGuruSnapshot(guruId, payload) {
  db.prepare(`
    INSERT INTO guru_snapshots (guru_id, cik, type, generated_at, payload_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guru_id) DO UPDATE SET
      cik = excluded.cik,
      type = excluded.type,
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run(
    guruId,
    payload.cik || "",
    payload.type || "",
    payload.generatedAt || new Date().toISOString(),
    JSON.stringify(payload)
  );
}

export function readGuruAssets() {
  return db.prepare(`
    SELECT guru_id, asset_type, url, local_path, style, prompt, generated_at
    FROM guru_assets
  `).all().map((row) => ({
    guruId: row.guru_id,
    assetType: row.asset_type,
    url: row.url,
    localPath: row.local_path || "",
    style: row.style || "",
    prompt: row.prompt || "",
    generatedAt: row.generated_at
  }));
}

export function readGuruAsset(guruId, assetType = "avatar") {
  const row = db.prepare(`
    SELECT guru_id, asset_type, url, local_path, style, prompt, generated_at
    FROM guru_assets
    WHERE guru_id = ? AND asset_type = ?
  `).get(guruId, assetType);
  if (!row) return null;
  return {
    guruId: row.guru_id,
    assetType: row.asset_type,
    url: row.url,
    localPath: row.local_path || "",
    style: row.style || "",
    prompt: row.prompt || "",
    generatedAt: row.generated_at
  };
}

export function writeGuruAsset(guruId, asset) {
  const normalizedGuruId = String(guruId || asset?.guruId || "").trim();
  const assetType = String(asset?.assetType || "avatar").trim() || "avatar";
  const url = String(asset?.url || "").trim();
  if (!normalizedGuruId || !url) return;
  db.prepare(`
    INSERT INTO guru_assets (
      guru_id,
      asset_type,
      url,
      local_path,
      style,
      prompt,
      generated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guru_id, asset_type) DO UPDATE SET
      url = excluded.url,
      local_path = excluded.local_path,
      style = excluded.style,
      prompt = excluded.prompt,
      generated_at = excluded.generated_at
  `).run(
    normalizedGuruId,
    assetType,
    url,
    asset.localPath || "",
    asset.style || "",
    asset.prompt || "",
    asset.generatedAt || new Date().toISOString()
  );
}

export function readDbmfSnapshot() {
  const row = db.prepare("SELECT payload_json FROM dbmf_snapshots WHERE id = ?").get("latest");
  return parsePayload(row?.payload_json);
}

export function writeDbmfSnapshot(payload) {
  db.prepare(`
    INSERT INTO dbmf_snapshots (id, latest_date, generated_at, payload_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      latest_date = excluded.latest_date,
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run(
    "latest",
    payload.summary?.latest_date || payload.latestDate || "",
    payload.generatedAt || new Date().toISOString(),
    JSON.stringify(payload)
  );
}

export function readGuruBacktest(guruId, years = 5) {
  const row = db.prepare(`
    SELECT payload_json
    FROM guru_backtests
    WHERE guru_id = ? AND years = ?
  `).get(guruId, years);
  return parsePayload(row?.payload_json);
}

export function readValuationSnapshot() {
  const row = db.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest");
  return parsePayload(row?.payload_json);
}

export function writeValuationSnapshot(payload) {
  db.prepare(`
    INSERT INTO valuation_snapshots (id, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run("latest", payload.generatedAt || new Date().toISOString(), JSON.stringify(payload));
}

export function readValuationTickerSnapshot(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  if (!normalized) return null;
  const row = db.prepare("SELECT payload_json FROM valuation_ticker_snapshots WHERE ticker = ?").get(normalized);
  return parsePayload(row?.payload_json);
}

export function writeValuationTickerSnapshot(ticker, payload) {
  const normalized = String(ticker || payload?.ticker || "").trim().toUpperCase();
  if (!normalized) return;
  db.prepare(`
    INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(ticker) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run(normalized, payload.generatedAt || new Date().toISOString(), JSON.stringify(payload));
}

export function writeGuruBacktest(guruId, years, payload) {
  db.prepare(`
    INSERT INTO guru_backtests (guru_id, years, generated_at, start_date, end_date, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guru_id, years) DO UPDATE SET
      generated_at = excluded.generated_at,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      payload_json = excluded.payload_json
  `).run(
    guruId,
    years,
    payload.generatedAt || new Date().toISOString(),
    payload.window?.start || payload.startDate || "",
    payload.window?.end || payload.endDate || "",
    JSON.stringify(payload)
  );
}

export function readPriceSeriesFromDb(symbol, start, end) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return [];

  return db.prepare(`
    SELECT symbol, date, open, high, low, close, volume, source
    FROM price_points
    WHERE symbol = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(normalized, start, end).map((point) => ({
    symbol: point.symbol,
    date: point.date,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
    source: point.source
  }));
}

export function writePriceSeriesToDb(symbol, points, source = "unknown") {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized || !points?.length) return;

  const statement = db.prepare(`
    INSERT INTO price_points (symbol, date, open, high, low, close, volume, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);
  const updatedAt = new Date().toISOString();

  db.exec("BEGIN");
  try {
    for (const point of points) {
      if (!point.date || !Number.isFinite(point.close)) continue;
      statement.run(
        normalized,
        point.date,
        Number.isFinite(point.open) ? point.open : null,
        Number.isFinite(point.high) ? point.high : null,
        Number.isFinite(point.low) ? point.low : null,
        point.close,
        Number.isFinite(point.volume) ? point.volume : null,
        source,
        updatedAt
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function writePortfolioNavPoint(point) {
  const accountId = String(point?.accountId || "portfolio").trim() || "portfolio";
  const date = String(point?.date || "").trim();
  const nav = Number(point?.nav);
  if (!date || !Number.isFinite(nav) || nav <= 0) return;

  db.prepare(`
    INSERT INTO portfolio_nav_points (
      account_id,
      date,
      nav,
      cash,
      source,
      source_date,
      payload_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, date) DO UPDATE SET
      nav = excluded.nav,
      cash = excluded.cash,
      source = excluded.source,
      source_date = excluded.source_date,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(
    accountId,
    date,
    nav,
    Number.isFinite(Number(point.cash)) ? Number(point.cash) : null,
    String(point.source || ""),
    String(point.sourceDate || ""),
    JSON.stringify(point.payload || {}),
    new Date().toISOString()
  );
}

export function readPortfolioNavPoints(accountId = "portfolio", limit = 5000) {
  const normalizedAccountId = String(accountId || "portfolio").trim() || "portfolio";
  const rowLimit = Math.max(1, Math.min(10000, Number(limit) || 5000));
  return db.prepare(`
    SELECT account_id, date, nav, cash, source, source_date, updated_at, payload_json
    FROM (
      SELECT account_id, date, nav, cash, source, source_date, updated_at, payload_json
      FROM portfolio_nav_points
      WHERE account_id = ?
      ORDER BY date DESC
      LIMIT ?
    )
    ORDER BY date ASC
  `).all(normalizedAccountId, rowLimit).map((row) => ({
    accountId: row.account_id,
    date: row.date,
    value: row.nav,
    nav: row.nav,
    cash: row.cash,
    source: row.source || "",
    sourceDate: row.source_date || "",
    updatedAt: row.updated_at,
    payload: parsePayload(row.payload_json) || {}
  }));
}

export function writeTickerAsset(ticker, asset = {}) {
  const normalized = normalizeTickerKey(ticker || asset.ticker);
  if (!normalized) return;
  db.prepare(`
    INSERT INTO ticker_assets (
      ticker,
      company_name,
      logo_url,
      logo_domain,
      logo_source,
      payload_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker) DO UPDATE SET
      company_name = excluded.company_name,
      logo_url = excluded.logo_url,
      logo_domain = excluded.logo_domain,
      logo_source = excluded.logo_source,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(
    normalized,
    String(asset.companyName || asset.name || "").trim(),
    String(asset.logoUrl || "").trim(),
    String(asset.logoDomain || "").trim(),
    String(asset.logoSource || "").trim(),
    JSON.stringify(asset.payload || {}),
    asset.updatedAt || new Date().toISOString()
  );
}

export function readTickerAssets(tickers = []) {
  const normalizedTickers = [...new Set(tickers.map(normalizeTickerKey).filter(Boolean))];
  if (!normalizedTickers.length) return [];
  const placeholders = normalizedTickers.map(() => "?").join(", ");
  return db.prepare(`
    SELECT ticker, company_name, logo_url, logo_domain, logo_source, payload_json, updated_at
    FROM ticker_assets
    WHERE ticker IN (${placeholders})
    ORDER BY ticker ASC
  `).all(...normalizedTickers).map((row) => ({
    ticker: row.ticker,
    companyName: row.company_name || "",
    logoUrl: row.logo_url || "",
    logoDomain: row.logo_domain || "",
    logoSource: row.logo_source || "",
    updatedAt: row.updated_at,
    payload: parsePayload(row.payload_json) || {}
  }));
}

export function deleteDividendEventsForTickers(tickers = [], startDate, endDate) {
  const normalizedTickers = [...new Set(tickers.map(normalizeTickerKey).filter(Boolean))];
  if (!normalizedTickers.length || !startDate || !endDate) return 0;
  const placeholders = normalizedTickers.map(() => "?").join(", ");
  const result = db.prepare(`
    DELETE FROM dividend_events
    WHERE ticker IN (${placeholders})
      AND ex_date >= ?
      AND ex_date <= ?
  `).run(...normalizedTickers, startDate, endDate);
  return result.changes || 0;
}

export function writeDividendEvents(events = []) {
  if (!events.length) return 0;
  const statement = db.prepare(`
    INSERT INTO dividend_events (
      ticker,
      company_name,
      ex_date,
      pay_date,
      record_date,
      declaration_date,
      amount,
      currency,
      status,
      source,
      source_label,
      logo_url,
      payload_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker, ex_date, source) DO UPDATE SET
      company_name = excluded.company_name,
      pay_date = excluded.pay_date,
      record_date = excluded.record_date,
      declaration_date = excluded.declaration_date,
      amount = excluded.amount,
      currency = excluded.currency,
      status = excluded.status,
      source_label = excluded.source_label,
      logo_url = excluded.logo_url,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `);
  const updatedAt = new Date().toISOString();
  let count = 0;
  db.exec("BEGIN");
  try {
    for (const event of events) {
      const ticker = normalizeTickerKey(event.ticker);
      const exDate = String(event.exDate || event.date || "").trim();
      const source = String(event.source || "unknown").trim();
      if (!ticker || !exDate || !source) continue;
      statement.run(
        ticker,
        String(event.companyName || event.name || "").trim(),
        exDate,
        String(event.payDate || "").trim(),
        String(event.recordDate || "").trim(),
        String(event.declarationDate || "").trim(),
        Number.isFinite(Number(event.amount)) ? Number(event.amount) : null,
        String(event.currency || "USD").trim() || "USD",
        String(event.status || "estimated").trim(),
        source,
        String(event.sourceLabel || "").trim(),
        String(event.logoUrl || "").trim(),
        JSON.stringify(event.payload || {}),
        event.updatedAt || updatedAt
      );
      count += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return count;
}

export function readDividendEvents(tickers = [], startDate, endDate) {
  const normalizedTickers = [...new Set(tickers.map(normalizeTickerKey).filter(Boolean))];
  if (!normalizedTickers.length || !startDate || !endDate) return [];
  const placeholders = normalizedTickers.map(() => "?").join(", ");
  return db.prepare(`
    SELECT
      ticker,
      company_name,
      ex_date,
      pay_date,
      record_date,
      declaration_date,
      amount,
      currency,
      status,
      source,
      source_label,
      logo_url,
      payload_json,
      updated_at
    FROM dividend_events
    WHERE ticker IN (${placeholders})
      AND ex_date >= ?
      AND ex_date <= ?
    ORDER BY ex_date ASC, pay_date ASC, ticker ASC
  `).all(...normalizedTickers, startDate, endDate).map((row) => ({
    ticker: row.ticker,
    companyName: row.company_name || row.ticker,
    name: row.company_name || row.ticker,
    exDate: row.ex_date,
    payDate: row.pay_date || "",
    recordDate: row.record_date || "",
    declarationDate: row.declaration_date || "",
    date: row.ex_date,
    amount: row.amount,
    currency: row.currency || "USD",
    status: row.status || "",
    type: row.status === "paid"
      ? "Paid dividend"
      : row.status === "declared"
        ? "Declared dividend"
        : "Estimated dividend",
    source: row.source || "",
    sourceLabel: row.source_label || "",
    logoUrl: row.logo_url || "",
    updatedAt: row.updated_at,
    payload: parsePayload(row.payload_json) || {}
  }));
}

export function readBackgroundJobRun(jobId) {
  const normalized = String(jobId || "").trim();
  if (!normalized) return null;
  const row = db.prepare(`
    SELECT job_id, started_at, finished_at, status, payload_json
    FROM background_job_runs
    WHERE job_id = ?
  `).get(normalized);
  if (!row) return null;
  return {
    jobId: row.job_id,
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    status: row.status || "",
    payload: parsePayload(row.payload_json) || {}
  };
}

export function writeBackgroundJobRun(jobId, run = {}) {
  const normalized = String(jobId || "").trim();
  if (!normalized) return;
  db.prepare(`
    INSERT INTO background_job_runs (job_id, started_at, finished_at, status, payload_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      status = excluded.status,
      payload_json = excluded.payload_json
  `).run(
    normalized,
    String(run.startedAt || "").trim(),
    String(run.finishedAt || "").trim(),
    String(run.status || "").trim(),
    JSON.stringify(run.payload || {})
  );
}
