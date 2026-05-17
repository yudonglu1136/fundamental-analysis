CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  fiscalYear INTEGER,
  fiscalQuarter INTEGER,
  eventType TEXT,
  label TEXT,
  title TEXT,
  sourceType TEXT,
  sourceUrl TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  sourceType TEXT,
  sourceUrl TEXT,
  title TEXT,
  retrievedAt TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  priceDate TEXT,
  currentPrice REAL,
  sharesOutstanding REAL,
  marketCap REAL,
  source TEXT,
  sourceType TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS daily_price_bars (
  ticker TEXT NOT NULL,
  priceDate TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  adjustedClose REAL,
  volume REAL,
  source TEXT,
  sourceType TEXT,
  rawJson TEXT,
  PRIMARY KEY (ticker, priceDate)
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT,
  description TEXT,
  valuationMethodsJson TEXT,
  assumptionSchemaJson TEXT,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS assumption_sets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  assumptionsJson TEXT,
  sourceType TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS valuation_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  reportingEventId TEXT,
  fiscalPeriod TEXT,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  assumptionSetId TEXT,
  currentPrice REAL,
  fairValue REAL,
  targetPrice3Y REAL,
  expectedShareholderCagr REAL,
  upsideDownside REAL,
  probabilityWeightedFairValue REAL,
  methodOutputsJson TEXT,
  sensitivityTablesJson TEXT,
  warningsJson TEXT,
  dataSnapshotJson TEXT,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS validation_warnings (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  severity TEXT,
  title TEXT,
  detail TEXT,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  startDate TEXT,
  endDate TEXT,
  benchmarkTicker TEXT,
  metricsJson TEXT,
  curveJson TEXT,
  warningsJson TEXT,
  createdAt TEXT
);
