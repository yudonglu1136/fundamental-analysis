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
  sourceDocumentId TEXT,
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
  totalRevenue REAL,
  collaborationRevenue REAL,
  licenseAndOtherRevenue REAL,
  costOfCollaborationRevenue REAL,
  rdExpense REAL,
  sgaExpense REAL,
  operatingLoss REAL,
  netLoss REAL,
  adjustedNetIncomeLoss REAL,
  cashAndInvestments REAL,
  collaborationAdvancedFunding REAL,
  ordinarySharesOutstanding REAL,
  adsOutstanding REAL,
  operatingCashFlow REAL,
  capex REAL,
  quarterlyBurn REAL,
  currentPrice REAL,
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
  adsOutstanding REAL,
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
  category TEXT,
  marketCap REAL,
  enterpriseValue REAL,
  priceToSales REAL,
  evToRevenue REAL,
  evToGrossProfit REAL,
  source TEXT,
  fetchedAt TEXT,
  confidenceLevel TEXT,
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
  sourceDocumentId TEXT,
  confidence TEXT,
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
  transcriptId TEXT NOT NULL,
  transcriptImported INTEGER NOT NULL DEFAULT 0,
  hasQa INTEGER NOT NULL DEFAULT 0,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  sourceName TEXT,
  sourceUrl TEXT,
  retrievalDate TEXT,
  confidence TEXT,
  gapReason TEXT,
  metadataJson TEXT
);

CREATE TABLE IF NOT EXISTS transcript_extractions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  transcriptId TEXT NOT NULL,
  eventId TEXT,
  extractionType TEXT NOT NULL,
  topic TEXT,
  speaker TEXT,
  supportingQuoteShort TEXT,
  confidence TEXT,
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
  fiscalPeriod TEXT,
  scenario TEXT NOT NULL,
  modelVersion TEXT NOT NULL,
  assumptionSetId TEXT,
  valuationPeriodId TEXT,
  marketSnapshotId TEXT,
  cashSnapshotId TEXT,
  collaborationEconomicsSnapshotId TEXT,
  pipelineAssumptionSetId TEXT,
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

CREATE TABLE IF NOT EXISTS product_revenue_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  productName TEXT NOT NULL,
  revenueType TEXT,
  revenue REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS carvykti_commercial_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  fiscalPeriod TEXT,
  globalNetTradeSales REAL,
  usSales REAL,
  ousSales REAL,
  treatmentSites INTEGER,
  usAtcCount INTEGER,
  communityHospitalPercentage REAL,
  earlierLineUtilization REAL,
  annualDoseCapacity INTEGER,
  manufacturingSuccessRate REAL,
  outOfSpecRate REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  preliminary INTEGER NOT NULL DEFAULT 0,
  modelReady INTEGER NOT NULL DEFAULT 1,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 1,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS collaboration_economics_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  partner TEXT,
  economicsType TEXT,
  legendRevenueShare REAL,
  legendProfitShare REAL,
  costShare REAL,
  milestoneEligible INTEGER NOT NULL DEFAULT 0,
  advancedFundingBalance REAL,
  recoupmentRate REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  rationale TEXT,
  confidence TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS cash_runway_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  cashAndInvestments REAL,
  quarterlyBurn REAL,
  runwayQuarters REAL,
  dilutionRisk TEXT,
  expectedDilutionPct REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 1,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS operating_expense_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  rdExpense REAL,
  sgaExpense REAL,
  operatingLoss REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS dilution_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  asOfDate TEXT NOT NULL,
  ordinarySharesOutstanding REAL,
  adsOutstanding REAL,
  expectedDilutionPct REAL,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 1,
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
  sourceType TEXT NOT NULL,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  probabilityOfSuccess REAL,
  peakSales REAL,
  launchYear INTEGER,
  rampYears INTEGER,
  margin REAL,
  economicsShare REAL,
  discountRate REAL,
  sourceDocumentId TEXT,
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
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS regulatory_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  assetName TEXT,
  productName TEXT,
  region TEXT,
  eventDate TEXT NOT NULL,
  eventType TEXT,
  description TEXT,
  sourceType TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS clinical_trial_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  assetName TEXT,
  trialName TEXT,
  nctId TEXT,
  indication TEXT,
  phase TEXT,
  eventDate TEXT NOT NULL,
  endpointSummary TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  modelReady INTEGER NOT NULL DEFAULT 0,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS manufacturing_capacity_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  eventId TEXT,
  eventDate TEXT NOT NULL,
  capacityMetric TEXT,
  capacityValue REAL,
  unit TEXT,
  sourceType TEXT,
  sourceDocumentId TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE TABLE IF NOT EXISTS competitive_landscape_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  asOfDate TEXT NOT NULL,
  market TEXT,
  competitorSet TEXT,
  competitiveIntensityScore REAL,
  erosionCurveJson TEXT,
  sourceType TEXT,
  valuationImpactAllowed INTEGER NOT NULL DEFAULT 0,
  rawJson TEXT
);

CREATE INDEX IF NOT EXISTS idx_legn_reporting_events_ticker_date ON reporting_events(ticker, eventDate);
CREATE INDEX IF NOT EXISTS idx_legn_financial_periods_event ON financial_periods(ticker, eventId, asOfDate);
CREATE INDEX IF NOT EXISTS idx_legn_market_snapshots_asof ON market_snapshots(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_legn_daily_price_bars_ticker_date ON daily_price_bars(ticker, priceDate);
CREATE INDEX IF NOT EXISTS idx_legn_valuation_runs_lookup ON valuation_runs(ticker, asOfDate, reportingEventId, scenario, modelVersion);
CREATE INDEX IF NOT EXISTS idx_legn_pipeline_assets_asof ON pipeline_assets(ticker, asOfDate);
CREATE INDEX IF NOT EXISTS idx_legn_carvykti_asof ON carvykti_commercial_snapshots(ticker, asOfDate);
