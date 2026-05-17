CREATE TABLE IF NOT EXISTS reporting_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  fiscalYear INTEGER,
  fiscalQuarter TEXT,
  eventType TEXT NOT NULL,
  label TEXT NOT NULL,
  sourceType TEXT,
  sourcePath TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceName TEXT NOT NULL,
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
  fiscalYear INTEGER,
  fiscalQuarter TEXT,
  periodType TEXT,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  sourceType TEXT,
  revenue REAL,
  revenueGrowth REAL,
  gaapDilutedEps REAL,
  adjustedDilutedEps REAL,
  adjustedEpsGrowth REAL,
  adjustedOperatingProfit REAL,
  adjustedNetIncome REAL,
  operatingCashFlow REAL,
  capex REAL,
  freeCashFlow REAL,
  normalizedFreeCashFlow REAL,
  fcfConversion REAL,
  workingCapitalSwing REAL,
  inventoryDays REAL,
  receivableDays REAL,
  payableDays REAL,
  shareRepurchases REAL,
  dividendsPaid REAL,
  dilutedShares REAL,
  netDebt REAL,
  adjustedTaxRate REAL,
  opioidLegalLiabilities REAL,
  currentPrice REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS segment_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  segment TEXT NOT NULL,
  taxonomy TEXT,
  revenueDefinition TEXT,
  revenue REAL,
  revenueGrowth REAL,
  operatingProfit REAL,
  adjustedOperatingProfit REAL,
  adjustedOperatingProfitGrowth REAL,
  margin REAL,
  marginBps REAL,
  moatScore REAL,
  riskLevel TEXT,
  multipleAssumption REAL,
  sourceType TEXT,
  splitSource TEXT,
  parentReportedSegment TEXT,
  glp1VolumeImpact TEXT,
  specialtyDrugMix TEXT,
  genericDeflationRisk TEXT,
  customerConcentration TEXT,
  notes TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  priceDate TEXT,
  currentPrice REAL,
  currency TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  sharesOutstanding REAL,
  previousClose REAL,
  fiftyTwoWeekHigh REAL,
  fiftyTwoWeekLow REAL,
  forwardPe REAL,
  fcfYield REAL,
  dividendYield REAL,
  buybackYield REAL,
  netDebtToEbitda REAL,
  beta REAL,
  source TEXT,
  fetchedAt TEXT,
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

CREATE TABLE IF NOT EXISTS peer_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  peerTicker TEXT NOT NULL,
  peerName TEXT,
  companyName TEXT,
  category TEXT,
  peerGroup TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  revenueGrowth REAL,
  operatingMargin REAL,
  adjustedEpsGrowth REAL,
  fcfConversion REAL,
  fcfYield REAL,
  trailingPe REAL,
  forwardPe REAL,
  forwardEvEbitda REAL,
  buybackYield REAL,
  roic REAL,
  leverage REAL,
  specialtyExposure REAL,
  moatScore REAL,
  dividendYield REAL,
  beta REAL,
  currency TEXT,
  source TEXT,
  fetchedAt TEXT,
  confidenceLevel TEXT,
  absoluteValueUse TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS guidance_items (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  fiscalPeriodTarget TEXT,
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
  rawJson TEXT
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
  metadataJson TEXT
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
  rawJson TEXT
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
  createdAt TEXT NOT NULL
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
  createdAt TEXT NOT NULL
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
  scope TEXT,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  relatedTable TEXT,
  relatedRecordId TEXT,
  createdAt TEXT NOT NULL
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
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mck_reporting_events_ticker_date ON reporting_events(ticker, eventDate);
CREATE INDEX IF NOT EXISTS idx_mck_financial_periods_event ON financial_periods(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_mck_segment_financials_event ON segment_financials(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_mck_market_snapshots_asof ON market_snapshots(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_mck_daily_price_bars_ticker_date ON daily_price_bars(ticker, priceDate);
CREATE INDEX IF NOT EXISTS idx_mck_peer_snapshots_asof ON peer_snapshots(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_mck_guidance_items_asof ON guidance_items(ticker, asOfDate, valuationImpactAllowed);
CREATE INDEX IF NOT EXISTS idx_mck_valuation_runs_lookup ON valuation_runs(ticker, asOfDate, reportingEventId, scenario, modelVersion);
