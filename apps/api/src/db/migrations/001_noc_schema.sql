PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter INTEGER,
  eventType TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  sourcePath TEXT,
  sourceUrl TEXT,
  title TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  documentType TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  reportingPeriod TEXT,
  publishedDate TEXT,
  sourceUrl TEXT,
  sourcePath TEXT,
  localPath TEXT,
  extractionStatus TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  metadataJson TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  periodId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter INTEGER,
  periodType TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sales REAL,
  organicSales REAL,
  productSales REAL,
  serviceSales REAL,
  operatingIncome REAL,
  operatingMargin REAL,
  segmentOperatingIncome REAL,
  segmentOperatingMargin REAL,
  netEarnings REAL,
  dilutedEps REAL,
  dilutedShares REAL,
  operatingCashFlow REAL,
  freeCashFlow REAL,
  capex REAL,
  netAwards REAL,
  fundedBacklog REAL,
  unfundedBacklog REAL,
  totalBacklog REAL,
  cash REAL,
  longTermDebt REAL,
  currentDebt REAL,
  pensionAssets REAL,
  pensionLiabilities REAL,
  pensionAndOpbAssets REAL,
  pensionAndOpbLiabilities REAL,
  dividendsPaid REAL,
  dividendPerShare REAL,
  buybacks REAL,
  fixedPriceSales REAL,
  costTypeSales REAL,
  notes TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS segment_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT NOT NULL,
  periodId TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  fiscalQuarter INTEGER,
  segment TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sales REAL,
  salesPriorYear REAL,
  operatingIncome REAL,
  operatingIncomePriorYear REAL,
  operatingMargin REAL,
  fundedBacklog REAL,
  unfundedBacklog REAL,
  totalBacklog REAL,
  totalBacklogPriorYear REAL,
  costTypeSales REAL,
  fixedPriceSales REAL,
  capex REAL,
  depreciationAmortization REAL,
  strategicImportance TEXT,
  keyProgramsJson TEXT,
  risksJson TEXT,
  notes TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  priceDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  source TEXT,
  currentPrice REAL,
  sharesOutstandingM REAL,
  marketCapUsdM REAL,
  enterpriseValueUsdM REAL,
  dividendYield REAL,
  fcfYield REAL,
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
  currency TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  pe REAL,
  evEbit REAL,
  evEbitda REAL,
  fcfYield REAL,
  absoluteValueUse TEXT,
  sourceType TEXT NOT NULL,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS guidance_items (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  fiscalYear INTEGER,
  metric TEXT NOT NULL,
  value REAL,
  low REAL,
  high REAL,
  units TEXT,
  guidanceType TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  guidanceSourceId TEXT,
  humanReviewStatus TEXT NOT NULL DEFAULT 'needs_review',
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS transcript_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  callDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  sourceType TEXT NOT NULL,
  sourceUrl TEXT,
  transcriptAvailability TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS transcript_extractions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  transcriptEventId TEXT NOT NULL,
  extractionType TEXT NOT NULL,
  topic TEXT,
  value TEXT,
  score REAL,
  sourceType TEXT NOT NULL,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT,
  FOREIGN KEY (transcriptEventId) REFERENCES transcript_events(id)
);

CREATE TABLE IF NOT EXISTS assumption_sets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  assumptionsJson TEXT NOT NULL,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  valuationMethodsJson TEXT,
  sourceIsolationPolicyJson TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  eventId TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  sourceType TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eventId) REFERENCES reporting_events(id)
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  benchmarkTicker TEXT NOT NULL,
  scenario TEXT,
  modelVersion TEXT,
  status TEXT NOT NULL,
  metricsJson TEXT,
  curveJson TEXT,
  warningsJson TEXT,
  requestJson TEXT,
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
  source TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  fetchedAt TEXT NOT NULL,
  rawJson TEXT,
  UNIQUE(ticker, priceDate)
);

CREATE INDEX IF NOT EXISTS idx_noc_reporting_events_date ON reporting_events(ticker, eventDate);
CREATE INDEX IF NOT EXISTS idx_noc_financial_periods_event ON financial_periods(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_noc_segment_financials_event ON segment_financials(ticker, eventId, segment);
CREATE INDEX IF NOT EXISTS idx_noc_market_snapshots_event ON market_snapshots(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_noc_valuation_runs_event ON valuation_runs(ticker, reportingEventId, scenario, modelVersion, createdAt);
CREATE INDEX IF NOT EXISTS idx_noc_daily_price_bars ON daily_price_bars(ticker, priceDate);
