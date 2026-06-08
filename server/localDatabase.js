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
`);

function parsePayload(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
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
