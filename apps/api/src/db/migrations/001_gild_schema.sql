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
  sourceUrl TEXT,
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
  productSales REAL,
  revenueGrowth REAL,
  grossProfit REAL,
  grossMargin REAL,
  operatingIncome REAL,
  operatingMargin REAL,
  researchAndDevelopment REAL,
  rdAsPctSales REAL,
  sgAndA REAL,
  sgaAsPctSales REAL,
  taxRate REAL,
  gaapDilutedEps REAL,
  adjustedDilutedEps REAL,
  netIncome REAL,
  operatingCashFlow REAL,
  capex REAL,
  freeCashFlow REAL,
  normalizedFreeCashFlow REAL,
  fcfConversion REAL,
  dilutedShares REAL,
  shareRepurchases REAL,
  dividendsPaid REAL,
  dividendPerShare REAL,
  cashAndInvestments REAL,
  debt REAL,
  netDebt REAL,
  currentPrice REAL,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS product_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  productName TEXT NOT NULL,
  franchise TEXT,
  revenue REAL,
  revenueGrowth REAL,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS franchise_financials (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  periodId TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  franchise TEXT NOT NULL,
  revenue REAL,
  revenueGrowth REAL,
  operatingMarginProxy REAL,
  normalizedRevenue REAL,
  valuationTreatment TEXT,
  durabilityScore REAL,
  riskScore REAL,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
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
  forwardEvEbitda REAL,
  fcfYield REAL,
  dividendYield REAL,
  buybackYield REAL,
  shareholderYield REAL,
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

CREATE INDEX IF NOT EXISTS idx_gild_daily_price_bars_ticker_date
  ON daily_price_bars (ticker, priceDate);

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
  fcfConversion REAL,
  fcfYield REAL,
  trailingPe REAL,
  forwardPe REAL,
  forwardEvEbitda REAL,
  dividendYield REAL,
  buybackYield REAL,
  roic REAL,
  leverage REAL,
  hivExposure REAL,
  oncologyExposure REAL,
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
  sourceUrl TEXT,
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
  transcriptImported INTEGER NOT NULL DEFAULT 0,
  missingReason TEXT,
  sourceUrlChecked TEXT,
  retrievalDate TEXT,
  confidence TEXT,
  sourcePath TEXT,
  provenance TEXT,
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
  reportingEventId TEXT,
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
  fiscalPeriod TEXT,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  assumptionSetId TEXT,
  valuationPeriodId TEXT,
  marketSnapshotId TEXT,
  guidanceSourceId TEXT,
  pipelineAssumptionSetId TEXT,
  patentAssumptionSetId TEXT,
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

CREATE TABLE IF NOT EXISTS product_lifecycle_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  productName TEXT NOT NULL,
  franchise TEXT,
  eventDate TEXT NOT NULL,
  eventType TEXT,
  description TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS patent_exclusivity_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  productName TEXT NOT NULL,
  region TEXT,
  asOfDate TEXT NOT NULL,
  eventId TEXT,
  estimatedLoeYear INTEGER,
  exposedRevenue REAL,
  erosionCurveJson TEXT,
  mitigationStrategy TEXT,
  lifecycleReplacement TEXT,
  confidence TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_assets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  assetName TEXT NOT NULL,
  indication TEXT,
  modality TEXT,
  phase TEXT,
  trialName TEXT,
  asOfDate TEXT NOT NULL,
  milestoneDateKnownAsOfEvent TEXT,
  probabilityOfSuccess REAL,
  peakSalesOrEconomicsEstimate REAL,
  launchYear INTEGER,
  rampCurveJson TEXT,
  margin REAL,
  discountRate REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_milestones (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  assetId TEXT,
  assetName TEXT,
  milestoneDate TEXT NOT NULL,
  eventId TEXT,
  milestoneType TEXT,
  description TEXT,
  sourceType TEXT NOT NULL,
  sourceDocumentId TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_rnpv_components (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  assetId TEXT,
  valuationRunId TEXT,
  asOfDate TEXT NOT NULL,
  probabilityOfSuccess REAL,
  peakSalesOrEconomicsEstimate REAL,
  launchYear INTEGER,
  margin REAL,
  discountRate REAL,
  rnpv REAL,
  sourceType TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS capital_allocation_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  eventType TEXT,
  amount REAL,
  description TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS dividend_buyback_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  dividendPerShare REAL,
  dividendsPaid REAL,
  shareRepurchases REAL,
  payoutRatioFcf REAL,
  payoutRatioEps REAL,
  buybackYield REAL,
  dividendYield REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS cash_debt_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  cashAndInvestments REAL,
  debt REAL,
  netDebt REAL,
  netDebtToEbitda REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS acquisition_bd_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventDate TEXT NOT NULL,
  targetName TEXT,
  dealType TEXT,
  amount REAL,
  franchise TEXT,
  strategicRationale TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS veklury_normalization_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  reportedVekluryRevenue REAL,
  normalizedVekluryRevenue REAL,
  normalizedBaseRevenue REAL,
  marginTreatment TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  rawJson TEXT
);

CREATE INDEX IF NOT EXISTS idx_gild_reporting_events_ticker_date ON reporting_events(ticker, eventDate);
CREATE INDEX IF NOT EXISTS idx_gild_financial_periods_event ON financial_periods(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_gild_product_financials_event ON product_financials(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_gild_franchise_financials_event ON franchise_financials(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_gild_market_snapshots_asof ON market_snapshots(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_gild_guidance_items_asof ON guidance_items(ticker, asOfDate, valuationImpactAllowed);
CREATE INDEX IF NOT EXISTS idx_gild_pipeline_assets_asof ON pipeline_assets(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_gild_patent_asof ON patent_exclusivity_events(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_gild_valuation_runs_lookup ON valuation_runs(ticker, asOfDate, reportingEventId, scenario, modelVersion);
