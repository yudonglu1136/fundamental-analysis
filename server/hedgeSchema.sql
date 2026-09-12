PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS hedge_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS hedge_sources (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL,
 sha256 TEXT, imported_at TEXT NOT NULL, row_count INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS hedge_contracts (
 ticker TEXT NOT NULL, as_of TEXT NOT NULL, provider TEXT NOT NULL,
 underlying TEXT NOT NULL, expiry TEXT NOT NULL, type TEXT NOT NULL,
 strike REAL NOT NULL, multiplier INTEGER, exercise_style TEXT,
 standard INTEGER NOT NULL, raw_json TEXT NOT NULL,
 PRIMARY KEY(ticker,as_of,provider)
) STRICT;
CREATE INDEX IF NOT EXISTS hedge_contract_lookup ON hedge_contracts(expiry,type,strike,as_of);
CREATE INDEX IF NOT EXISTS hedge_contract_asof ON hedge_contracts(provider,as_of,ticker);
CREATE TABLE IF NOT EXISTS hedge_bars (
 ticker TEXT NOT NULL, date TEXT NOT NULL, provider TEXT NOT NULL,
 adjustment TEXT NOT NULL, open REAL, high REAL, low REAL, close REAL,
 volume REAL, observed_at TEXT NOT NULL,
 PRIMARY KEY(ticker,date,provider,adjustment)
) STRICT;
CREATE INDEX IF NOT EXISTS hedge_bars_date ON hedge_bars(date,ticker);
CREATE TABLE IF NOT EXISTS hedge_observations (
 ticker TEXT NOT NULL, date TEXT NOT NULL, provider TEXT NOT NULL,
 expiry TEXT, type TEXT, strike REAL, underlying_close REAL,
 bid REAL, ask REAL, last REAL, volume REAL, open_interest REAL,
 iv REAL, delta REAL, gamma REAL, theta REAL, vega REAL,
 quality TEXT NOT NULL, raw_json TEXT NOT NULL,
 PRIMARY KEY(ticker,date,provider)
) STRICT;
CREATE TABLE IF NOT EXISTS hedge_requests (
 id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, parameters_json TEXT NOT NULL,
 status TEXT NOT NULL, http_status INTEGER, row_count INTEGER NOT NULL,
 fetched_at TEXT NOT NULL, raw_json TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS hedge_sync_runs (
 id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
 requested_end TEXT NOT NULL, status TEXT NOT NULL, report_json TEXT NOT NULL
) STRICT;
