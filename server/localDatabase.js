import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  shouldInstallBundledValuationDashboard,
  shouldInstallBundledValuationTicker
} from "./bundledValuationSnapshotPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledDataDir = path.join(__dirname, "data");
const bundledDbPath = path.join(bundledDataDir, "guru-analysis.sqlite");
const dbPath = process.env.SQLITE_DB_PATH || bundledDbPath;
const dataDir = path.dirname(dbPath);

fs.mkdirSync(dataDir, { recursive: true });

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

	  CREATE TABLE IF NOT EXISTS guru_exposure_snapshots (
	    guru_id TEXT PRIMARY KEY,
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
    adjusted_close REAL,
    volume REAL,
    source TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  -- The PRIMARY KEY already creates sqlite_autoindex_price_points_1 on
  -- (symbol, date). A second identical index wastes about 50 MB.

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

  CREATE TABLE IF NOT EXISTS valuation_podcast_insights (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    observed_at TEXT,
    channel TEXT,
    video_id TEXT,
    video_title TEXT,
    video_url TEXT,
    speaker TEXT,
    theme TEXT,
    stance TEXT,
    horizon TEXT,
    confidence REAL,
    relevance_score REAL,
    summary TEXT,
    summary_zh TEXT,
    evidence_excerpt TEXT,
    evidence_excerpt_zh TEXT,
    payload_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_valuation_podcast_insights_ticker_observed_at
    ON valuation_podcast_insights (ticker, observed_at DESC);

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

  CREATE TABLE IF NOT EXISTS cache_revisions (
    scope TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO cache_revisions (scope, revision) VALUES
    ('dashboard_snapshots', 0),
    ('guru_snapshots', 0),
    ('guru_assets', 0),
    ('guru_backtests', 0),
    ('valuation_snapshots', 0),
    ('valuation_ticker_snapshots', 0),
    ('valuation_podcast_insights', 0);

  CREATE TRIGGER IF NOT EXISTS dashboard_snapshots_revision_insert
  AFTER INSERT ON dashboard_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'dashboard_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS dashboard_snapshots_revision_update
  AFTER UPDATE ON dashboard_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'dashboard_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS dashboard_snapshots_revision_delete
  AFTER DELETE ON dashboard_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'dashboard_snapshots';
  END;

  CREATE TRIGGER IF NOT EXISTS guru_snapshots_revision_insert
  AFTER INSERT ON guru_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS guru_snapshots_revision_update
  AFTER UPDATE ON guru_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS guru_snapshots_revision_delete
  AFTER DELETE ON guru_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_snapshots';
  END;

  CREATE TRIGGER IF NOT EXISTS guru_assets_revision_insert
  AFTER INSERT ON guru_assets BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_assets';
  END;
  CREATE TRIGGER IF NOT EXISTS guru_assets_revision_update
  AFTER UPDATE ON guru_assets BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_assets';
  END;
  CREATE TRIGGER IF NOT EXISTS guru_assets_revision_delete
  AFTER DELETE ON guru_assets BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_assets';
  END;

  CREATE TRIGGER IF NOT EXISTS guru_backtests_revision_insert
  AFTER INSERT ON guru_backtests BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_backtests';
  END;
  CREATE TRIGGER IF NOT EXISTS guru_backtests_revision_update
  AFTER UPDATE ON guru_backtests BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_backtests';
  END;
  CREATE TRIGGER IF NOT EXISTS guru_backtests_revision_delete
  AFTER DELETE ON guru_backtests BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_backtests';
  END;

  CREATE TRIGGER IF NOT EXISTS valuation_snapshots_revision_insert
  AFTER INSERT ON valuation_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS valuation_snapshots_revision_update
  AFTER UPDATE ON valuation_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS valuation_snapshots_revision_delete
  AFTER DELETE ON valuation_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_snapshots';
  END;

  CREATE TRIGGER IF NOT EXISTS valuation_ticker_snapshots_revision_insert
  AFTER INSERT ON valuation_ticker_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_ticker_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS valuation_ticker_snapshots_revision_update
  AFTER UPDATE ON valuation_ticker_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_ticker_snapshots';
  END;
  CREATE TRIGGER IF NOT EXISTS valuation_ticker_snapshots_revision_delete
  AFTER DELETE ON valuation_ticker_snapshots BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_ticker_snapshots';
  END;

  CREATE TRIGGER IF NOT EXISTS valuation_podcast_insights_revision_insert
  AFTER INSERT ON valuation_podcast_insights BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_podcast_insights';
  END;
  CREATE TRIGGER IF NOT EXISTS valuation_podcast_insights_revision_update
  AFTER UPDATE ON valuation_podcast_insights BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_podcast_insights';
  END;
  CREATE TRIGGER IF NOT EXISTS valuation_podcast_insights_revision_delete
  AFTER DELETE ON valuation_podcast_insights BEGIN
    UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'valuation_podcast_insights';
  END;
`);

const pricePointColumns = new Set(
  db.prepare("PRAGMA table_info(price_points)").all().map((column) => column.name)
);
if (!pricePointColumns.has("adjusted_close")) {
  db.exec("ALTER TABLE price_points ADD COLUMN adjusted_close REAL");
}

const readCacheRevisionStatement = db.prepare(`
  SELECT revision
  FROM cache_revisions
  WHERE scope = ?
`);

function readCacheRevision(scope) {
  return Number(readCacheRevisionStatement.get(scope)?.revision) || 0;
}

const readGuruDashboardIdentityStatement = db.prepare(`
  SELECT generated_at
  FROM dashboard_snapshots
  WHERE id = 'latest'
`);

export function readGuruDashboardVersion() {
  const dashboard = readGuruDashboardIdentityStatement.get();
  return [
    readCacheRevision("dashboard_snapshots"),
    dashboard?.generated_at || "missing",
    readCacheRevision("guru_snapshots"),
    readCacheRevision("guru_assets")
  ].join(":");
}

function syncBundledValuationSnapshots() {
  if (process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS !== "true") return;
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
      WHERE excluded.generated_at > valuation_snapshots.generated_at
    `);
    const writeTicker = db.prepare(`
      INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(ticker) DO UPDATE SET
        generated_at = excluded.generated_at,
        payload_json = excluded.payload_json
      WHERE excluded.generated_at > valuation_ticker_snapshots.generated_at
    `);
    const currentDashboard = db.prepare(`
      SELECT generated_at, payload_json
      FROM valuation_snapshots
      WHERE id = ?
    `);
    const currentTicker = db.prepare(`
      SELECT generated_at
      FROM valuation_ticker_snapshots
      WHERE ticker = ?
    `);

    db.exec("BEGIN");
    try {
      let installedDashboardRows = 0;
      let installedTickerRows = 0;
      for (const row of dashboardRows) {
        if (!shouldInstallBundledValuationDashboard(row, currentDashboard.get(row.id))) continue;
        writeDashboard.run(row.id, row.generated_at, row.payload_json);
        installedDashboardRows += 1;
      }
      for (const row of tickerRows) {
        if (!shouldInstallBundledValuationTicker(row, currentTicker.get(row.ticker))) continue;
        writeTicker.run(row.ticker, row.generated_at, row.payload_json);
        installedTickerRows += 1;
      }
      db.exec("COMMIT");
      console.info(
        `[database] synced bundled valuation snapshots into ${dbPath}: ` +
        `${installedDashboardRows}/${dashboardRows.length} dashboard rows, ` +
        `${installedTickerRows}/${tickerRows.length} ticker rows installed`
      );
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.warn(`[database] bundled valuation snapshot sync skipped: ${error.message}`);
  } finally {
    bundledDb?.close();
  }
}

function syncBundledGuruBacktests() {
  if (process.env.SYNC_BUNDLED_GURU_BACKTESTS !== "true") return;
  if (dbPath === bundledDbPath || !fs.existsSync(bundledDbPath)) return;

  let bundledDb;
  try {
    bundledDb = new DatabaseSync(bundledDbPath, { readOnly: true });
    const bundledSummary = bundledDb.prepare(`
      SELECT
        COUNT(*) AS count,
        MAX(generated_at) AS generated_at,
        MAX(end_date) AS end_date
      FROM guru_backtests
    `).get();
    if (!bundledSummary?.count) return;

    const currentSummary = db.prepare(`
      SELECT
        COUNT(*) AS count,
        MAX(generated_at) AS generated_at,
        MAX(end_date) AS end_date
      FROM guru_backtests
    `).get();
    const shouldSync =
      Number(bundledSummary.count || 0) > Number(currentSummary?.count || 0) ||
      (bundledSummary.generated_at &&
        (!currentSummary?.generated_at || bundledSummary.generated_at > currentSummary.generated_at)) ||
      (bundledSummary.end_date &&
        (!currentSummary?.end_date || bundledSummary.end_date > currentSummary.end_date));
    if (!shouldSync) return;

    const rows = bundledDb.prepare(`
      SELECT guru_id, years, generated_at, start_date, end_date, payload_json
      FROM guru_backtests
    `).all();
    if (!rows.length) return;

    const writeBacktest = db.prepare(`
      INSERT INTO guru_backtests (guru_id, years, generated_at, start_date, end_date, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guru_id, years) DO UPDATE SET
        generated_at = excluded.generated_at,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        payload_json = excluded.payload_json
      WHERE
        guru_backtests.generated_at IS NULL OR
        excluded.generated_at > guru_backtests.generated_at OR
        excluded.end_date > guru_backtests.end_date
    `);

    db.exec("BEGIN");
    try {
      for (const row of rows) {
        writeBacktest.run(
          row.guru_id,
          row.years,
          row.generated_at,
          row.start_date,
          row.end_date,
          row.payload_json
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    console.info(`[database] synced bundled guru backtests into ${dbPath}: ${rows.length} rows`);
  } catch (error) {
    console.warn(`[database] bundled guru backtest sync skipped: ${error.message}`);
  } finally {
    bundledDb?.close();
  }
}

function syncBundledDividendCalendar() {
  if (process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR !== "true") return;
  if (dbPath === bundledDbPath || !fs.existsSync(bundledDbPath)) return;

  let bundledDb;
  try {
    bundledDb = new DatabaseSync(bundledDbPath, { readOnly: true });
    const bundledSummary = bundledDb.prepare(`
      SELECT
        COUNT(*) AS count,
        MIN(ex_date) AS min_date,
        MAX(ex_date) AS max_date,
        MAX(updated_at) AS updated_at
      FROM dividend_events
    `).get();
    if (!bundledSummary?.count) return;

    const currentSummary = db.prepare(`
      SELECT
        COUNT(*) AS count,
        MIN(ex_date) AS min_date,
        MAX(ex_date) AS max_date,
        MAX(updated_at) AS updated_at
      FROM dividend_events
    `).get();
    const bundledCount = Number(bundledSummary.count) || 0;
    const currentCount = Number(currentSummary?.count) || 0;
    const shouldSync =
      bundledCount > currentCount ||
      (bundledSummary.min_date && (!currentSummary?.min_date || bundledSummary.min_date < currentSummary.min_date)) ||
      (bundledSummary.updated_at && (!currentSummary?.updated_at || bundledSummary.updated_at > currentSummary.updated_at));
    if (!shouldSync) return;

    const eventRows = bundledDb.prepare(`
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
    `).all();
    const assetRows = bundledDb.prepare(`
      SELECT ticker, company_name, logo_url, logo_domain, logo_source, payload_json, updated_at
      FROM ticker_assets
      WHERE ticker IN (SELECT DISTINCT ticker FROM dividend_events)
    `).all();
    const jobRows = bundledDb.prepare(`
      SELECT job_id, started_at, finished_at, status, payload_json
      FROM background_job_runs
      WHERE job_id = 'portfolio_dividend_calendar'
    `).all();
    if (!eventRows.length) return;

    const tickers = [...new Set(eventRows.map((row) => row.ticker).filter(Boolean))];
    const placeholders = tickers.map(() => "?").join(", ");
    const writeEvent = db.prepare(`
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
    const writeAsset = db.prepare(`
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
    `);
    const writeJob = db.prepare(`
      INSERT INTO background_job_runs (job_id, started_at, finished_at, status, payload_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        status = excluded.status,
        payload_json = excluded.payload_json
    `);

    db.exec("BEGIN");
    try {
      if (tickers.length && bundledSummary.min_date && bundledSummary.max_date) {
        db.prepare(`
          DELETE FROM dividend_events
          WHERE ticker IN (${placeholders})
            AND ex_date >= ?
            AND ex_date <= ?
        `).run(...tickers, bundledSummary.min_date, bundledSummary.max_date);
      }
      for (const row of assetRows) {
        writeAsset.run(
          row.ticker,
          row.company_name,
          row.logo_url,
          row.logo_domain,
          row.logo_source,
          row.payload_json,
          row.updated_at
        );
      }
      for (const row of eventRows) {
        writeEvent.run(
          row.ticker,
          row.company_name,
          row.ex_date,
          row.pay_date,
          row.record_date,
          row.declaration_date,
          row.amount,
          row.currency,
          row.status,
          row.source,
          row.source_label,
          row.logo_url,
          row.payload_json,
          row.updated_at
        );
      }
      for (const row of jobRows) {
        writeJob.run(row.job_id, row.started_at, row.finished_at, row.status, row.payload_json);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    console.info(
      `[database] synced bundled dividend calendar into ${dbPath}: ` +
      `${eventRows.length} events, ${assetRows.length} assets`
    );
  } catch (error) {
    console.warn(`[database] bundled dividend calendar sync skipped: ${error.message}`);
  } finally {
    bundledDb?.close();
  }
}

function syncBundledPodcastInsights() {
  if (process.env.SYNC_BUNDLED_PODCAST_INSIGHTS !== "true") return;
  if (dbPath === bundledDbPath || !fs.existsSync(bundledDbPath)) return;

  let bundledDb;
  try {
    bundledDb = new DatabaseSync(bundledDbPath, { readOnly: true });
    const rows = bundledDb.prepare(`
      SELECT
        id,
        ticker,
        generated_at,
        observed_at,
        channel,
        video_id,
        video_title,
        video_url,
        speaker,
        theme,
        stance,
        horizon,
        confidence,
        relevance_score,
        summary,
        summary_zh,
        evidence_excerpt,
        evidence_excerpt_zh,
        payload_json
      FROM valuation_podcast_insights
    `).all();
    if (!rows.length) return;

    const jobRows = bundledDb.prepare(`
      SELECT job_id, started_at, finished_at, status, payload_json
      FROM background_job_runs
      WHERE job_id = 'valuation_podcast_insights'
    `).all();
    const writeInsight = db.prepare(`
      INSERT INTO valuation_podcast_insights (
        id,
        ticker,
        generated_at,
        observed_at,
        channel,
        video_id,
        video_title,
        video_url,
        speaker,
        theme,
        stance,
        horizon,
        confidence,
        relevance_score,
        summary,
        summary_zh,
        evidence_excerpt,
        evidence_excerpt_zh,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ticker = excluded.ticker,
        generated_at = excluded.generated_at,
        observed_at = excluded.observed_at,
        channel = excluded.channel,
        video_id = excluded.video_id,
        video_title = excluded.video_title,
        video_url = excluded.video_url,
        speaker = excluded.speaker,
        theme = excluded.theme,
        stance = excluded.stance,
        horizon = excluded.horizon,
        confidence = excluded.confidence,
        relevance_score = excluded.relevance_score,
        summary = excluded.summary,
        summary_zh = excluded.summary_zh,
        evidence_excerpt = excluded.evidence_excerpt,
        evidence_excerpt_zh = excluded.evidence_excerpt_zh,
        payload_json = excluded.payload_json
    `);
    const writeJob = db.prepare(`
      INSERT INTO background_job_runs (job_id, started_at, finished_at, status, payload_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        status = excluded.status,
        payload_json = excluded.payload_json
    `);

    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM valuation_podcast_insights").run();
      for (const row of rows) {
        writeInsight.run(
          row.id,
          row.ticker,
          row.generated_at,
          row.observed_at,
          row.channel,
          row.video_id,
          row.video_title,
          row.video_url,
          row.speaker,
          row.theme,
          row.stance,
          row.horizon,
          row.confidence,
          row.relevance_score,
          row.summary,
          row.summary_zh,
          row.evidence_excerpt,
          row.evidence_excerpt_zh,
          row.payload_json
        );
      }
      for (const row of jobRows) {
        writeJob.run(row.job_id, row.started_at, row.finished_at, row.status, row.payload_json);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    console.info(`[database] synced bundled podcast insights into ${dbPath}: ${rows.length} rows`);
  } catch (error) {
    console.warn(`[database] bundled podcast insight sync skipped: ${error.message}`);
  } finally {
    bundledDb?.close();
  }
}

syncBundledValuationSnapshots();
syncBundledGuruBacktests();
syncBundledDividendCalendar();
syncBundledPodcastInsights();

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

export function readGuruExposureSnapshot(guruId) {
  const row = db.prepare("SELECT payload_json FROM guru_exposure_snapshots WHERE guru_id = ?").get(guruId);
  return parsePayload(row?.payload_json);
}

export function writeGuruExposureSnapshot(guruId, payload) {
  db.prepare(`
    INSERT INTO guru_exposure_snapshots (guru_id, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(guru_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run(guruId, payload.generatedAt || new Date().toISOString(), JSON.stringify(payload));
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

export function readGuruBacktest(guruId, years = 5) {
  const row = db.prepare(`
    SELECT payload_json
    FROM guru_backtests
    WHERE guru_id = ? AND years = ?
  `).get(guruId, years);
  return parsePayload(row?.payload_json);
}

export function readGuruBacktestVersion(years = 5) {
  const revision = readCacheRevision("guru_backtests");
  const rows = db.prepare(`
    SELECT
      guru_id,
      generated_at,
      start_date,
      end_date
    FROM guru_backtests
    WHERE years = ?
    ORDER BY guru_id ASC
  `).all(years);
  if (!rows.length) return `${revision}:empty`;
  return `${revision}:` + rows.map((row) => [
    row.guru_id,
    row.generated_at,
    row.start_date || "",
    row.end_date || ""
  ].join(":")).join("|");
}

export function readValuationSnapshot() {
  const row = db.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest");
  return parsePayload(row?.payload_json);
}

export function readValuationSnapshotVersion() {
  const row = db.prepare(`
    SELECT generated_at
    FROM valuation_snapshots
    WHERE id = ?
  `).get("latest");
  if (!row) return null;
  return `${row.generated_at}:${readCacheRevision("valuation_snapshots")}`;
}

const readValuationDashboardVersionStatement = db.prepare(`
  SELECT
    (SELECT generated_at FROM valuation_snapshots WHERE id = 'latest') AS generated_at,
    (SELECT revision FROM cache_revisions WHERE scope = 'valuation_snapshots') AS snapshot_revision,
    (SELECT revision FROM cache_revisions WHERE scope = 'valuation_podcast_insights') AS podcast_revision
`);

export function readValuationDashboardVersion() {
  const row = readValuationDashboardVersionStatement.get();
  return [
    row?.generated_at || "missing",
    Number(row?.snapshot_revision) || 0,
    Number(row?.podcast_revision) || 0
  ].join(":");
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

export function readValuationTickerSnapshotVersion(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  if (!normalized) return null;
  const row = db.prepare(`
    SELECT generated_at
    FROM valuation_ticker_snapshots
    WHERE ticker = ?
  `).get(normalized);
  if (!row) return null;
  return `${row.generated_at}:${readCacheRevision("valuation_ticker_snapshots")}`;
}

export function readValuationPodcastInsightsVersion(tickers = []) {
  const normalizedTickers = [...new Set((tickers || [])
    .map((ticker) => String(ticker || "").trim().toUpperCase())
    .filter(Boolean))];
  const where = normalizedTickers.length
    ? `WHERE ticker IN (${normalizedTickers.map(() => "?").join(", ")})`
    : "";
  const row = db.prepare(`
    SELECT
      COUNT(*) AS row_count,
      MAX(generated_at) AS generated_at,
      MAX(observed_at) AS observed_at
    FROM valuation_podcast_insights
    ${where}
  `).get(...normalizedTickers);
  return [
    readCacheRevision("valuation_podcast_insights"),
    Number(row?.row_count) || 0,
    row?.generated_at || "",
    row?.observed_at || ""
  ].join(":");
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

function mapPodcastInsight(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    generatedAt: row.generated_at,
    observedAt: row.observed_at || "",
    channel: row.channel || "",
    videoId: row.video_id || "",
    videoTitle: row.video_title || "",
    videoUrl: row.video_url || "",
    speaker: row.speaker || "",
    theme: row.theme || "",
    stance: row.stance || "",
    horizon: row.horizon || "",
    confidence: row.confidence,
    relevanceScore: row.relevance_score,
    summary: row.summary || "",
    summaryZh: row.summary_zh || "",
    evidenceExcerpt: row.evidence_excerpt || "",
    evidenceExcerptZh: row.evidence_excerpt_zh || "",
    payload: parsePayload(row.payload_json) || {}
  };
}

export function writeValuationPodcastInsights(insights = []) {
  if (!insights.length) return 0;
  const statement = db.prepare(`
    INSERT INTO valuation_podcast_insights (
      id,
      ticker,
      generated_at,
      observed_at,
      channel,
      video_id,
      video_title,
      video_url,
      speaker,
      theme,
      stance,
      horizon,
      confidence,
      relevance_score,
      summary,
      summary_zh,
      evidence_excerpt,
      evidence_excerpt_zh,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ticker = excluded.ticker,
      generated_at = excluded.generated_at,
      observed_at = excluded.observed_at,
      channel = excluded.channel,
      video_id = excluded.video_id,
      video_title = excluded.video_title,
      video_url = excluded.video_url,
      speaker = excluded.speaker,
      theme = excluded.theme,
      stance = excluded.stance,
      horizon = excluded.horizon,
      confidence = excluded.confidence,
      relevance_score = excluded.relevance_score,
      summary = excluded.summary,
      summary_zh = excluded.summary_zh,
      evidence_excerpt = excluded.evidence_excerpt,
      evidence_excerpt_zh = excluded.evidence_excerpt_zh,
      payload_json = excluded.payload_json
  `);
  const generatedAt = new Date().toISOString();
  let count = 0;
  db.exec("BEGIN");
  try {
    for (const insight of insights) {
      const ticker = normalizeTickerKey(insight.ticker);
      const id = String(insight.id || "").trim();
      if (!id || !ticker) continue;
      statement.run(
        id,
        ticker,
        String(insight.generatedAt || generatedAt),
        String(insight.observedAt || ""),
        String(insight.channel || ""),
        String(insight.videoId || ""),
        String(insight.videoTitle || ""),
        String(insight.videoUrl || ""),
        String(insight.speaker || ""),
        String(insight.theme || ""),
        String(insight.stance || ""),
        String(insight.horizon || ""),
        Number.isFinite(Number(insight.confidence)) ? Number(insight.confidence) : null,
        Number.isFinite(Number(insight.relevanceScore)) ? Number(insight.relevanceScore) : null,
        String(insight.summary || ""),
        String(insight.summaryZh || ""),
        String(insight.evidenceExcerpt || ""),
        String(insight.evidenceExcerptZh || ""),
        JSON.stringify(insight.payload || {})
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

export function replaceValuationPodcastInsights(insights = []) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM valuation_podcast_insights").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return writeValuationPodcastInsights(insights);
}

export function readValuationPodcastInsights(ticker, limit = 12) {
  const normalized = normalizeTickerKey(ticker);
  if (!normalized) return [];
  const rowLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  return db.prepare(`
    SELECT
      id,
      ticker,
      generated_at,
      observed_at,
      channel,
      video_id,
      video_title,
      video_url,
      speaker,
      theme,
      stance,
      horizon,
      confidence,
      relevance_score,
      summary,
      summary_zh,
      evidence_excerpt,
      evidence_excerpt_zh,
      payload_json
    FROM valuation_podcast_insights
    WHERE ticker = ?
    ORDER BY observed_at DESC, relevance_score DESC, generated_at DESC
    LIMIT ?
  `).all(normalized, rowLimit).map(mapPodcastInsight);
}

export function readValuationPodcastInsightSummary(limit = 500) {
  const rowLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS insight_count,
      COUNT(DISTINCT ticker) AS ticker_count,
      COUNT(DISTINCT channel) AS source_count,
      MAX(observed_at) AS latest_observed_at
    FROM valuation_podcast_insights
  `).get();
  const rows = db.prepare(`
    SELECT
      id,
      ticker,
      generated_at,
      observed_at,
      channel,
      video_id,
      video_title,
      video_url,
      speaker,
      theme,
      stance,
      horizon,
      confidence,
      relevance_score,
      summary,
      summary_zh,
      evidence_excerpt,
      evidence_excerpt_zh,
      payload_json
    FROM valuation_podcast_insights
    ORDER BY observed_at DESC, relevance_score DESC, generated_at DESC
    LIMIT ?
  `).all(rowLimit).map(mapPodcastInsight);
  const tickers = new Set();
  for (const row of rows) {
    if (row.ticker) tickers.add(row.ticker);
  }
  return {
    insightCount: Number(summary?.insight_count) || 0,
    tickerCount: Number(summary?.ticker_count) || 0,
    sourceCount: Number(summary?.source_count) || 0,
    latestObservedAt: summary?.latest_observed_at || "",
    topTickers: [...tickers].slice(0, 20),
    latest: rows.slice(0, 8)
  };
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
    SELECT symbol, date, open, high, low, close, adjusted_close, volume, source
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
    adjustedClose: point.adjusted_close,
    volume: point.volume,
    source: point.source
  }));
}

export function writePriceSeriesToDb(symbol, points, source = "unknown") {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized || !points?.length) return;

  const statement = db.prepare(`
    INSERT INTO price_points (
      symbol, date, open, high, low, close, adjusted_close, volume, source, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      adjusted_close = COALESCE(excluded.adjusted_close, price_points.adjusted_close),
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
        Number.isFinite(point.adjustedClose) ? point.adjustedClose : null,
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

export function readBackgroundJobRuns() {
  return db.prepare(`
    SELECT job_id, started_at, finished_at, status, payload_json
    FROM background_job_runs
    ORDER BY COALESCE(finished_at, started_at, '') DESC, job_id ASC
  `).all().map((row) => ({
    jobId: row.job_id,
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    status: row.status || "",
    payload: parsePayload(row.payload_json) || {}
  }));
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

const tableSummarySpecs = [
  { table: "dashboard_snapshots", label: "Guru dashboard", latest: "generated_at" },
  { table: "guru_snapshots", label: "Guru snapshots", latest: "generated_at" },
  { table: "guru_exposure_snapshots", label: "Guru exposure snapshots", latest: "generated_at" },
  { table: "guru_assets", label: "Guru avatars", latest: "generated_at" },
  { table: "guru_backtests", label: "Guru backtests", latest: "generated_at", maxDate: "end_date" },
  { table: "valuation_snapshots", label: "Valuation dashboard", latest: "generated_at" },
  { table: "valuation_ticker_snapshots", label: "Valuation tickers", latest: "generated_at" },
  { table: "valuation_podcast_insights", label: "Podcast insights", latest: "generated_at", maxDate: "observed_at" },
  { table: "price_points", label: "Market prices", latest: "updated_at", maxDate: "date" },
  { table: "portfolio_nav_points", label: "Local NAV history", latest: "updated_at", maxDate: "date" },
  { table: "ticker_assets", label: "Ticker logos", latest: "updated_at" },
  { table: "dividend_events", label: "Dividend calendar", latest: "updated_at", minDate: "ex_date", maxDate: "ex_date" },
  { table: "background_job_runs", label: "Background jobs", latest: "finished_at" }
];

export function readDatabaseTableSummaries() {
  return tableSummarySpecs.map((spec) => {
    const selects = [
      "COUNT(*) AS row_count",
      spec.latest ? `MAX(${spec.latest}) AS latest_at` : "NULL AS latest_at",
      spec.minDate ? `MIN(${spec.minDate}) AS min_date` : "NULL AS min_date",
      spec.maxDate ? `MAX(${spec.maxDate}) AS max_date` : "NULL AS max_date"
    ];
    try {
      const row = db.prepare(`SELECT ${selects.join(", ")} FROM ${spec.table}`).get();
      return {
        table: spec.table,
        label: spec.label,
        rowCount: Number(row?.row_count) || 0,
        latestAt: row?.latest_at || "",
        minDate: row?.min_date || "",
        maxDate: row?.max_date || "",
        status: "ok"
      };
    } catch (error) {
      return {
        table: spec.table,
        label: spec.label,
        rowCount: 0,
        latestAt: "",
        minDate: "",
        maxDate: "",
        status: "error",
        message: error.message
      };
    }
  });
}
