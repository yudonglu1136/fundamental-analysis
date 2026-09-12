-- Strategy research warehouse v1. Raw evidence and trusted consumption are
-- separate. Never overwrite an observation to resolve a provider conflict.
PRAGMA foreign_keys = ON;
CREATE TABLE warehouse_meta (
  id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL,
  cutoff TEXT NOT NULL, generated_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('building','complete')),
  security_version TEXT NOT NULL, action_version TEXT NOT NULL,
  manifest_hash TEXT, source_counts_json TEXT NOT NULL CHECK(json_valid(source_counts_json))
) STRICT;
CREATE TABLE source_documents (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, locator TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  content TEXT NOT NULL, stored_at TEXT,
  UNIQUE(kind,locator,sha256)
) STRICT;
CREATE TABLE managers (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, entity_name TEXT,
  simulation_enabled INTEGER NOT NULL CHECK(simulation_enabled IN (0,1)),
  identity_status TEXT NOT NULL CHECK(identity_status IN ('configured_unreviewed','blocked','reviewed')),
  identity_reason TEXT, evidence_url TEXT,
  source_id TEXT NOT NULL REFERENCES source_documents(id)
) STRICT;
CREATE TABLE document_holdings (
  document_id TEXT NOT NULL REFERENCES source_documents(id), ordinal INTEGER NOT NULL,
  cusip TEXT NOT NULL, issuer TEXT, security_title TEXT, amount_type TEXT,
  put_call TEXT, amount REAL, reported_value REAL, value_multiplier REAL,
  claim_type TEXT NOT NULL,
  PRIMARY KEY(document_id,ordinal)
) STRICT;
CREATE TABLE manager_entities (
  manager_id TEXT NOT NULL REFERENCES managers(id), cik TEXT NOT NULL,
  entity_role TEXT NOT NULL, review_status TEXT NOT NULL,
  PRIMARY KEY(manager_id,cik)
) STRICT;
CREATE TABLE filing_manifest (
  manager_id TEXT NOT NULL REFERENCES managers(id), accession TEXT NOT NULL,
  cik TEXT, form TEXT, report_date TEXT, public_date TEXT,
  document_url TEXT, document_hash TEXT,
  selected_count INTEGER, reported_count INTEGER,
  source_id TEXT NOT NULL REFERENCES source_documents(id),
  PRIMARY KEY(manager_id,accession)
) STRICT;
CREATE TABLE filings (
  id TEXT PRIMARY KEY, manager_id TEXT NOT NULL REFERENCES managers(id),
  accession TEXT NOT NULL, report_date TEXT NOT NULL, public_date TEXT NOT NULL,
  form TEXT NOT NULL, cik TEXT, source_url TEXT,
  book_scope TEXT NOT NULL CHECK(book_scope IN ('original_common_book','legacy_top10','missing_original')),
  classification_status TEXT NOT NULL CHECK(classification_status IN ('verified','unverified','blocked')),
  expected_position_count INTEGER, row_count INTEGER NOT NULL,
  selected_value_usd REAL, common_value_usd REAL,
  source_id TEXT NOT NULL REFERENCES source_documents(id),
  payload_hash TEXT NOT NULL,
  CHECK(report_date<=public_date), UNIQUE(manager_id,accession)
) STRICT;
CREATE INDEX filing_dates ON filings(manager_id,public_date,report_date);
CREATE TABLE filing_holdings (
  filing_id TEXT NOT NULL REFERENCES filings(id), ordinal INTEGER NOT NULL,
  cusip TEXT NOT NULL, reported_id TEXT, issuer TEXT, security_title TEXT,
  amount_type TEXT, put_call TEXT, reported_shares REAL, value_usd REAL,
  reported_ticker TEXT, claim_type TEXT NOT NULL CHECK(claim_type IN ('common','option','non_common','unknown')),
  classification_status TEXT NOT NULL, classification_reason TEXT,
  PRIMARY KEY(filing_id,ordinal)
) STRICT;
CREATE INDEX holding_claims ON filing_holdings(cusip,filing_id);
CREATE TABLE holding_resolutions (
  filing_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  ticker TEXT, price_symbol TEXT, status TEXT NOT NULL,
  resolution_source TEXT, resolution_version TEXT NOT NULL,
  PRIMARY KEY(filing_id,ordinal),
  FOREIGN KEY(filing_id,ordinal) REFERENCES filing_holdings(filing_id,ordinal)
) STRICT;
CREATE TABLE security_identifiers (
  cusip TEXT PRIMARY KEY, ticker TEXT, status TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES source_documents(id),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json))
) STRICT;
CREATE TABLE corporate_actions (
  id TEXT PRIMARY KEY, cusip TEXT, ticker TEXT, action_type TEXT NOT NULL,
  effective_date TEXT NOT NULL, cash_per_share REAL, currency TEXT,
  successor_ticker TEXT, conversion_ratio REAL,
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  source_id TEXT NOT NULL REFERENCES source_documents(id)
) STRICT;
CREATE TABLE price_series (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, provider TEXT,
  source_label TEXT NOT NULL, storage_kind TEXT NOT NULL,
  close_basis TEXT, return_basis TEXT, quote_currency TEXT,
  status TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES source_documents(id)
) STRICT;
CREATE INDEX price_series_symbol ON price_series(symbol,storage_kind);
CREATE TABLE price_observations (
  series_id TEXT NOT NULL REFERENCES price_series(id), date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL, adjusted_close REAL,
  volume REAL, observed_at TEXT, quality_status TEXT NOT NULL,
  PRIMARY KEY(series_id,date)
) STRICT;
CREATE TABLE etf_catalog (
  symbol TEXT PRIMARY KEY, inception TEXT NOT NULL, first_date TEXT NOT NULL,
  last_date TEXT NOT NULL, series_id TEXT NOT NULL REFERENCES price_series(id),
  source_url TEXT, points_hash TEXT NOT NULL, downloaded_at TEXT
) STRICT;
CREATE TABLE financial_records (
  id TEXT PRIMARY KEY, ticker TEXT NOT NULL, source_ticker TEXT NOT NULL,
  fiscal_period TEXT NOT NULL, fiscal_year INTEGER NOT NULL, fiscal_quarter TEXT NOT NULL,
  dimension TEXT NOT NULL, available_at TEXT NOT NULL, report_period TEXT,
  currency TEXT, quality_status TEXT NOT NULL,
  source_record_json TEXT NOT NULL CHECK(json_valid(source_record_json)),
  raw_payload_json TEXT NOT NULL CHECK(json_valid(raw_payload_json)),
  UNIQUE(ticker,fiscal_period,dimension)
) STRICT;
CREATE INDEX financial_dates ON financial_records(ticker,available_at);
CREATE TABLE financial_metrics (
  record_id TEXT NOT NULL REFERENCES financial_records(id), metric TEXT NOT NULL,
  value REAL, unit TEXT NOT NULL, lineage_json TEXT CHECK(lineage_json IS NULL OR json_valid(lineage_json)),
  PRIMARY KEY(record_id,metric)
) STRICT;
CREATE TABLE guidance_events (
  id TEXT PRIMARY KEY, source_database TEXT NOT NULL, source_event_id TEXT NOT NULL,
  ticker TEXT NOT NULL, fiscal_period TEXT, observed_at TEXT, metric TEXT,
  amount REAL, unit TEXT, currency TEXT, growth_yoy REAL, growth_qoq REAL,
  margin_pct REAL, quality_status TEXT, confidence REAL,
  speaker TEXT, source_url TEXT, evidence_excerpt TEXT,
  raw_payload_json TEXT NOT NULL CHECK(json_valid(raw_payload_json)),
  UNIQUE(source_database,source_event_id)
) STRICT;
CREATE INDEX guidance_dates ON guidance_events(ticker,observed_at,metric);
CREATE TABLE valuation_nodes (
  id TEXT PRIMARY KEY, ticker TEXT NOT NULL, fiscal_period TEXT NOT NULL,
  model_version TEXT NOT NULL, as_of_date TEXT NOT NULL,
  financial_available_at TEXT NOT NULL, guidance_available_at TEXT,
  currency TEXT, fair_value REAL, formula TEXT, quality_status TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  output_json TEXT NOT NULL CHECK(json_valid(output_json)),
  UNIQUE(ticker,fiscal_period,model_version)
) STRICT;
CREATE INDEX valuation_dates ON valuation_nodes(ticker,model_version,as_of_date);
CREATE TABLE valuation_metrics (
  node_id TEXT NOT NULL REFERENCES valuation_nodes(id), section TEXT NOT NULL,
  metric TEXT NOT NULL, value REAL, unit TEXT NOT NULL,
  PRIMARY KEY(node_id,section,metric)
) STRICT;
CREATE TABLE model_price_evidence (
  ticker TEXT NOT NULL, fiscal_period TEXT NOT NULL, model_version TEXT NOT NULL,
  price_symbol TEXT NOT NULL, price_date TEXT NOT NULL, close REAL,
  quote_currency TEXT, source_label TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  PRIMARY KEY(ticker,fiscal_period,model_version)
) STRICT;
CREATE TABLE coverage_issues (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, severity TEXT NOT NULL,
  manager_id TEXT, filing_id TEXT REFERENCES filings(id), ticker TEXT, date TEXT,
  reason TEXT NOT NULL, evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json))
) STRICT;
CREATE INDEX issue_lookup ON coverage_issues(category,manager_id,ticker,date);
-- These views are intentionally fail closed. Importing a legacy display extract
-- does not certify its missing security-class fields or its manager identity.
CREATE VIEW verified_common_holdings AS
 SELECT f.manager_id,f.accession,f.report_date,f.public_date,h.*,r.ticker,r.price_symbol
 FROM filings f JOIN filing_holdings h ON h.filing_id=f.id
 JOIN holding_resolutions r ON r.filing_id=h.filing_id AND r.ordinal=h.ordinal
 JOIN managers m ON m.id=f.manager_id
 WHERE m.identity_status!='blocked' AND f.classification_status='verified'
 AND h.claim_type='common' AND h.classification_status='verified';
CREATE VIEW coverage_summary AS
 SELECT category,severity,COUNT(*) AS issue_count FROM coverage_issues GROUP BY category,severity;
