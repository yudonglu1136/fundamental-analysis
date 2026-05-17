CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter TEXT,
  eventType TEXT NOT NULL,
  label TEXT,
  title TEXT,
  sourceType TEXT,
  sourceUrl TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceUrl TEXT NOT NULL,
  title TEXT,
  retrievedAt TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter TEXT,
  periodType TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceUrl TEXT,
  revenueUsd REAL,
  revenueGrowth REAL,
  grossMargin REAL,
  operatingMargin REAL,
  netIncomeUsd REAL,
  netMargin REAL,
  dilutedEpsPerAdr REAL,
  guidanceRevenueNextQuarterUsd REAL,
  guidanceGrossMarginNextQuarter REAL,
  guidanceOperatingMarginNextQuarter REAL,
  capexGuidanceUsd REAL,
  hpcMix REAL,
  advancedNodeMix REAL,
  smartphoneMix REAL,
  rawJson TEXT,
  UNIQUE(ticker, periodId)
);

CREATE TABLE IF NOT EXISTS technology_mix (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  node TEXT NOT NULL,
  revenueMix REAL,
  sourceType TEXT,
  notes TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS platform_mix (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  platform TEXT NOT NULL,
  revenueMix REAL,
  sourceType TEXT,
  notes TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  priceDate TEXT,
  currentPrice REAL,
  sharesOutstanding REAL,
  netCash REAL,
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
  assumptionsJson TEXT NOT NULL,
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
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  startDate TEXT,
  endDate TEXT,
  benchmarkTicker TEXT,
  resultJson TEXT,
  createdAt TEXT
);
