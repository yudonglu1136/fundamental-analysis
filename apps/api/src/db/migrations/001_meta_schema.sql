CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  fiscalQuarter TEXT,
  fiscalYear INTEGER,
  eventType TEXT NOT NULL,
  label TEXT,
  periodLabel TEXT,
  sourceType TEXT NOT NULL,
  sourcePath TEXT,
  sourceUrl TEXT,
  metadataJson TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceName TEXT NOT NULL,
  sourcePath TEXT,
  sourceUrl TEXT,
  filingType TEXT,
  publishedDate TEXT,
  retrievedAt TEXT,
  confidence TEXT,
  provenance TEXT,
  checksum TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  fiscalYear INTEGER,
  fiscalQuarter TEXT,
  periodType TEXT,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  revenue REAL,
  advertisingRevenue REAL,
  familyOfAppsRevenue REAL,
  realityLabsRevenue REAL,
  familyOfAppsOperatingIncome REAL,
  realityLabsOperatingLoss REAL,
  operatingIncome REAL,
  operatingMargin REAL,
  netIncome REAL,
  normalizedNetIncome REAL,
  dilutedEps REAL,
  normalizedDilutedEps REAL,
  capex REAL,
  depreciationAmortization REAL,
  operatingCashFlow REAL,
  freeCashFlow REAL,
  shareBasedCompensation REAL,
  dilutedShares REAL,
  buybacks REAL,
  dividendsAndEquivalents REAL,
  cashAndMarketableSecurities REAL,
  debt REAL,
  netCash REAL,
  dau REAL,
  mau REAL,
  familyDap REAL,
  familyMap REAL,
  adImpressionsGrowth REAL,
  averagePricePerAdGrowth REAL,
  headcount REAL,
  efficiencyCommentary TEXT,
  aiCommentary TEXT,
  regulatoryCommentary TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS segment_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  segment TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  revenue REAL,
  operatingIncome REAL,
  operatingMargin REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  priceDate TEXT,
  currentPrice REAL,
  sharesOutstanding REAL,
  marketCap REAL,
  enterpriseValue REAL,
  netCash REAL,
  dividendPerShareAnnualized REAL,
  source TEXT,
  sourceType TEXT NOT NULL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS peer_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  peerTicker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  currency TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  revenue REAL,
  ebit REAL,
  ebitda REAL,
  pe REAL,
  evEbit REAL,
  evEbitda REAL,
  absoluteValueUse TEXT,
  sourceType TEXT NOT NULL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS guidance_items (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  guidanceType TEXT,
  metric TEXT NOT NULL,
  low REAL,
  high REAL,
  value REAL,
  unit TEXT,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  humanReviewStatus TEXT,
  notes TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS transcript_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  fiscalQuarter TEXT,
  fiscalYear INTEGER,
  sourceType TEXT NOT NULL,
  sourcePath TEXT,
  sourceUrl TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS transcript_extractions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  extractionType TEXT,
  topic TEXT,
  text TEXT,
  score REAL,
  sourceType TEXT NOT NULL,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS assumption_sets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  assumptionsJson TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  valuationMethodsJson TEXT,
  assumptionSchemaJson TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS valuation_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  reportingEventId TEXT,
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
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_warnings (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT,
  severity TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  relatedTable TEXT,
  relatedId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  modelVersion TEXT,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  rebalanceFrequency TEXT,
  assumptionsJson TEXT,
  resultJson TEXT,
  createdAt TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_meta_reporting_events_ticker_date ON reporting_events(ticker, eventDate);
CREATE INDEX IF NOT EXISTS idx_meta_financial_periods_ticker_asof ON financial_periods(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_meta_segments_ticker_asof ON segment_financials(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_meta_market_ticker_asof ON market_snapshots(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_meta_assumptions_ticker_asof ON assumption_sets(ticker, scenario, modelVersion, asOfDate);
CREATE INDEX IF NOT EXISTS idx_meta_valuation_runs_event ON valuation_runs(ticker, reportingEventId, scenario, modelVersion);
CREATE INDEX IF NOT EXISTS idx_meta_price_bars_ticker_date ON daily_price_bars(ticker, priceDate);
