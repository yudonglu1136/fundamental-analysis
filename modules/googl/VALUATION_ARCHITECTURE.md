# GOOGL Historical Valuation Architecture

This backend is a point-in-time historical valuation pilot. It wraps the existing
GOOGL frontend valuation engine rather than copying or tuning formulas.

## Flow

1. `modules/googl/ingestion/importLocalData.mjs` reads local GOOGL data and SEC
   Companyfacts for Alphabet CIK `0001652044`.
2. It creates `reporting_events` for SEC quarterly reports, annual reports,
   transcript events, and market snapshots.
3. SEC annual financials are stored as official actual 10-K rows.
4. SEC quarterly financials are stored as official actual rows:
   - Q1/Q2/Q3 prefer discrete 10-Q quarter facts.
   - If a discrete fact is unavailable, YTD less prior YTD is used with filing
     date discipline.
   - Q4 uses 10-K full year less Q3 YTD where needed.
   - Weighted-average diluted shares are never calculated as FY less Q3 YTD.
5. `apps/api/src/services/googlSnapshotService.mjs` builds an event snapshot
   using only rows whose `asOfDate <= eventDate`.
6. `modules/googl/valuation/adapter.mjs` maps the snapshot to the existing
   `GooglDataset` shape and derives event-dated forecast assumptions.
7. The frontend engine in `src/stocks/googl/engines/valuationEngine.ts` runs:
   FCFF DCF, FCF Yield, EV/EBIT, P/E, and SOTP + TPU/Risk.
8. `apps/api/src/services/googlValuationService.mjs` persists the run into
   `valuation_runs` with method outputs, warnings, assumption audit, quality
   flags, and attribution.

## Data Layers

- `official_actual`: SEC Companyfacts statement facts and local official filings.
- `official_derived`: arithmetic transforms of official facts, such as Q4 =
  full year less Q3 YTD or TTM base construction from reported quarters.
- `model_bridge`: adapter-level bridges needed to run the existing valuation
  engine historically, such as product-line splits before full static module
  history exists.
- `research_proxy`: market prices or qualitative placeholders that are useful
  for display but not investable backtest signals.
- `manual_promoted`: reviewed transcript or guidance data that may affect
  valuation in a later workflow.
- `blocked`: transcript/guidance/narrative data that is visible in the database
  but not permitted to affect valuation.

## Point-In-Time Guardrails

- Snapshot queries are bounded by `asOfDate <= eventDate`.
- Companyfacts is filtered by period dates, form type, and filing date windows.
- Companyfacts is not an accession-level point-in-time filing store. Future work
  should ingest individual filing accessions and accepted timestamps.
- Historical market prices are currently research proxies. `signalBacktestAllowed`
  is false unless real event-date adjusted market data is imported.
- Transcript and guidance candidates default to `modelReady=false` and
  `valuationImpactAllowed=false`.
- The adapter records `futureStaticDataBlocked=true` and a full assumption audit
  for every backend run.

## Historical Price Policy

The current repository does not include a GOOGL adjusted-close history. Therefore
historical price rows are marked `priceQuality=research_proxy` except the current
static market snapshot, and all rows have `signalBacktestAllowed=false`. Fair
values can be used for model stability analysis, but upside/downside and expected
shareholder CAGR are not investable backtest signals until audited market data is
loaded.

## Historical Series Policy

`reporting_events` intentionally keeps granular audit events: SEC quarter rows,
annual rows, transcript rows, static frontend period rows, and market snapshots.
The dashboard/history endpoint should not draw all of those as quarterly
valuation points. `/api/googl/historical-valuations` defaults to
`series=quarterly`, which deduplicates to one canonical valuation point per
fiscal quarter, preferring SEC quarterly/10-K-derived quarter rows over static
frontend rows and excluding transcript, annual-report duplicate, and market
snapshot events. Use `series=all` only for audit/debug views.
