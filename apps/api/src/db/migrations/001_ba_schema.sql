CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  eventType TEXT NOT NULL,
  fiscalPeriod TEXT NOT NULL,
  fiscalYear INTEGER,
  label TEXT NOT NULL,
  sourceDocumentId TEXT,
  isInterim INTEGER DEFAULT 0,
  isTradingUpdate INTEGER DEFAULT 0,
  description TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  url TEXT,
  publisher TEXT,
  reportingPeriod TEXT,
  publishedDate TEXT,
  retrievedAt TEXT,
  checksum TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  periodType TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sales REAL,
  revenue REAL,
  underlyingEbit REAL,
  underlyingEbitMargin REAL,
  operatingProfit REAL,
  underlyingEpsPence REAL,
  freeCashFlow REAL,
  netCashFlowFromOperations REAL,
  capex REAL,
  netDebtExLeases REAL,
  leaseLiabilitiesNet REAL,
  pensionSurplusCredit REAL,
  dividendPerSharePence REAL,
  dilutedShares REAL,
  basicShares REAL,
  runRateSnapshot INTEGER DEFAULT 0,
  ltmSnapshot INTEGER DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS segment_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  segment TEXT NOT NULL,
  sales REAL,
  revenue REAL,
  underlyingEbit REAL,
  margin REAL,
  orderIntake REAL,
  orderBacklog REAL,
  orderBook REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  priceDate TEXT NOT NULL,
  currentPriceGbx REAL NOT NULL,
  currentPriceGbp REAL NOT NULL,
  currency TEXT NOT NULL,
  marketCapGbpM REAL,
  enterpriseValueGbpM REAL,
  sharesOutstandingM REAL,
  dividendYield REAL,
  gbpUsd REAL,
  source TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS daily_price_bars (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  priceDate TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  adjustedClose REAL,
  volume REAL,
  dividendAmount REAL,
  splitCoefficient REAL,
  source TEXT,
  sourceType TEXT,
  fetchedAt TEXT,
  rawJson TEXT
);

CREATE INDEX IF NOT EXISTS idx_ba_daily_price_bars_ticker_date
  ON daily_price_bars(ticker, priceDate);

CREATE TABLE IF NOT EXISTS peer_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  peerTicker TEXT NOT NULL,
  peerName TEXT,
  currency TEXT,
  peMultiple REAL,
  evEbitMultiple REAL,
  evEbitdaMultiple REAL,
  fcfYield REAL,
  absoluteValueUse TEXT DEFAULT 'metadata_only',
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS guidance_items (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  metric TEXT NOT NULL,
  low REAL,
  high REAL,
  value REAL,
  unit TEXT,
  guidanceSourceId TEXT,
  valuationImpactAllowed INTEGER DEFAULT 0,
  promotedAt TEXT,
  notes TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS transcript_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  transcriptStatus TEXT NOT NULL,
  title TEXT,
  sourceDocumentId TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS transcript_extractions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  extractionType TEXT NOT NULL,
  topic TEXT NOT NULL,
  summary TEXT,
  modelReady INTEGER DEFAULT 0,
  valuationImpactAllowed INTEGER DEFAULT 0,
  sourceType TEXT DEFAULT 'transcript_commentary',
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS assumption_sets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  assumptionsJson TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT,
  valuationMethodsJson TEXT NOT NULL,
  assumptionSchemaJson TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS valuation_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  reportingEventId TEXT NOT NULL,
  fiscalPeriod TEXT,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  assumptionSetId TEXT,
  valuationPeriodId TEXT,
  marketSnapshotId TEXT,
  guidanceSourceId TEXT,
  currentPrice REAL,
  currentPriceGbx REAL,
  fairValue REAL,
  targetPrice3Y REAL,
  expectedShareholderCagr REAL,
  upsideDownside REAL,
  probabilityWeightedFairValue REAL,
  methodOutputsJson TEXT,
  sensitivityTablesJson TEXT,
  warningsJson TEXT,
  dataSnapshotJson TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_warnings (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  severity TEXT NOT NULL,
  tableName TEXT,
  field TEXT,
  message TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL,
  scenario TEXT,
  requestJson TEXT,
  resultJson TEXT
);

CREATE TABLE IF NOT EXISTS order_backlog_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  totalBacklog REAL,
  orderBook REAL,
  segment TEXT,
  amount REAL,
  coverageYears REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS order_intake_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  totalOrderIntake REAL,
  segment TEXT,
  amount REAL,
  bookToBill REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS program_exposures (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  programName TEXT NOT NULL,
  segment TEXT,
  geography TEXT,
  customer TEXT,
  maturity TEXT,
  strategicImportance REAL,
  marginQuality REAL,
  growthContribution REAL,
  riskScore REAL,
  valuationImpactAllowed INTEGER DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS contract_awards (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  announcementDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  programName TEXT,
  customer TEXT,
  geography TEXT,
  segment TEXT,
  amount REAL,
  currency TEXT,
  backlogImpact TEXT,
  valuationImpactAllowed INTEGER DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS defense_budget_indicators (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  geography TEXT NOT NULL,
  indicator TEXT NOT NULL,
  value REAL,
  unit TEXT,
  valuationImpactAllowed INTEGER DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS pension_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  surplusDeficit REAL,
  serviceCost REAL,
  discountRate REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS capital_allocation_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  eventType TEXT NOT NULL,
  amount REAL,
  dividendPerSharePence REAL,
  buybackAmount REAL,
  notes TEXT,
  rawJson TEXT
);
