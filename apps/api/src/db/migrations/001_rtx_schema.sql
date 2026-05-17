PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter INTEGER NOT NULL,
  eventType TEXT NOT NULL,
  label TEXT NOT NULL,
  title TEXT,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  sourcePath TEXT,
  sourceUrl TEXT,
  metadataJson TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceName TEXT NOT NULL,
  documentType TEXT,
  sourcePath TEXT,
  sourceUrl TEXT,
  retrievedAt TEXT,
  publishedDate TEXT,
  provenance TEXT,
  confidence TEXT,
  checksum TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter INTEGER NOT NULL,
  periodType TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  totalRevenue REAL,
  adjustedSales REAL,
  organicSales REAL,
  operatingProfit REAL,
  adjustedOperatingProfit REAL,
  operatingMargin REAL,
  adjustedEps REAL,
  gaapEps REAL,
  dilutedShares REAL,
  netIncome REAL,
  operatingCashFlow REAL,
  capex REAL,
  freeCashFlow REAL,
  workingCapital REAL,
  backlog REAL,
  backlogCommercial REAL,
  backlogDefense REAL,
  commercialAftermarketGrowth REAL,
  defenseBookings REAL,
  defenseBookToBill REAL,
  gtfInspectionCharges REAL,
  gtfCashImpact REAL,
  pensionExpense REAL,
  nonServicePension REAL,
  cash REAL,
  debt REAL,
  netDebt REAL,
  buybacks REAL,
  dividendsPaid REAL,
  dividendPerShare REAL,
  notes TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS segment_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter INTEGER NOT NULL,
  segment TEXT NOT NULL,
  taxonomy TEXT NOT NULL,
  legacySegmentMapping TEXT,
  sourceType TEXT NOT NULL,
  revenue REAL,
  adjustedSales REAL,
  organicSales REAL,
  operatingProfit REAL,
  operatingMargin REAL,
  backlog REAL,
  commercialAftermarketGrowth REAL,
  defenseBookings REAL,
  bookToBill REAL,
  gtfInspectionCharges REAL,
  gtfCashImpact REAL,
  notes TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  priceDate TEXT,
  currentPrice REAL,
  currency TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  sharesOutstanding REAL,
  previousClose REAL,
  dividendYield REAL,
  beta REAL,
  source TEXT,
  sourceType TEXT,
  fetchedAt TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS peer_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  peerTicker TEXT NOT NULL,
  peerName TEXT,
  peerGroup TEXT,
  currency TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  trailingPe REAL,
  forwardPe REAL,
  forwardEvEbit REAL,
  forwardEvEbitda REAL,
  dividendYield REAL,
  source TEXT,
  sourceType TEXT NOT NULL,
  confidenceLevel TEXT,
  absoluteValueUse TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS guidance_items (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  fiscalPeriodTarget TEXT,
  fiscalYear INTEGER,
  metric TEXT NOT NULL,
  guidanceType TEXT,
  lowValue REAL,
  highValue REAL,
  midpointValue REAL,
  unit TEXT,
  quote TEXT,
  speaker TEXT,
  sourcePath TEXT,
  confidence TEXT,
  humanReviewStatus TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS transcript_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  eventType TEXT,
  transcriptId TEXT NOT NULL,
  hasQa INTEGER NOT NULL DEFAULT 0,
  sourcePath TEXT,
  provenance TEXT,
  confidence TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  metadataJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS transcript_extractions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  transcriptId TEXT NOT NULL,
  eventId TEXT,
  extractionType TEXT NOT NULL,
  topic TEXT,
  segment TEXT,
  speaker TEXT,
  section TEXT,
  supportingQuoteShort TEXT,
  confidence TEXT,
  needsHumanReview INTEGER NOT NULL DEFAULT 1,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS assumption_sets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  assumptionsJson TEXT NOT NULL,
  sourceType TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  codeCommitSha TEXT,
  valuationMethodsJson TEXT,
  assumptionSchemaJson TEXT,
  sourceIsolationPolicyJson TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reportingEventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS validation_warnings (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  scope TEXT,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  relatedTable TEXT,
  relatedRecordId TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  startDate TEXT,
  endDate TEXT,
  rebalanceFrequency TEXT,
  assumptionsJson TEXT,
  resultJson TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

CREATE INDEX IF NOT EXISTS idx_rtx_reporting_events_ticker_date ON reporting_events(ticker, eventDate);
CREATE INDEX IF NOT EXISTS idx_rtx_financial_periods_event ON financial_periods(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_rtx_segment_financials_event ON segment_financials(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_rtx_market_snapshots_asof ON market_snapshots(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_rtx_daily_price_bars_ticker_date ON daily_price_bars(ticker, priceDate);
CREATE INDEX IF NOT EXISTS idx_rtx_valuation_runs_lookup ON valuation_runs(ticker, asOfDate, reportingEventId, scenario, modelVersion);
