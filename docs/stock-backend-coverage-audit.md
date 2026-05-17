# Stock Backend Coverage Audit

Last updated from:

```text
npm run stocks:backend:audit
```

## Standard

Every frontend stock module in `src/stocks/*/config.ts` should have:

- an owned backend module in `modules/{slug}`
- a migration at `apps/api/src/db/migrations/001_{slug}_schema.sql`
- a local SQLite DB at `data/local/{slug}/backend/{slug}_research.sqlite`
- core tables: `reporting_events`, `valuation_runs`, `daily_price_bars`
- package scripts for seed, price import, valuation backfill, and validation
- Base valuation runs covering every reporting event
- stock and SPY daily price bars
- frontend historical valuation/backtest panels mapped to backend APIs

For quarterly reporters, the historical coverage target is at least 32 reporting-event anchors, roughly eight years. Semiannual or incomplete-history modules may temporarily warn instead of fail, but proxy rows must be labeled as `research_only` or `forecast_assumption` and should not be presented as official actuals.

## Current Snapshot

The latest audit found 20 frontend modules:

- `PASS`: 12
- `WARN`: 5
- `FAIL`: 3

Passing modules:

- `aapl`
- `amzn`
- `azn`
- `bmy`
- `gild`
- `googl`
- `isrg`
- `meta`
- `msft`
- `noc`
- `rtx`
- `tri`

Warning modules needing history-density or price-history cleanup:

- `ba`: 19 events over 7.2 years; needs either more official event history or clearly labeled research-only quarterly anchors.
- `dge`: 18 events over 7.8 years; needs quarterly-density handling or explicit semiannual coverage labeling.
- `legn`: 25 events over 4.7 years; needs earlier event coverage and longer stock/SPY daily price history.
- `lseg`: 29 events over 7.2 years; needs more event history and longer LSEG daily price coverage.
- `mck`: 15 events over 8.0 years; needs denser reporting-event anchors.

Failing modules needing backend foundation and frontend mapping:

- `autl`
- `lmt`
- `pltr`

## Migration Order

1. Build `pltr` backend first because it already has SEC companyfacts, submissions, market snapshot data, transcripts, and a rich frontend valuation engine to wrap.
2. Build `lmt` next because local official defense-prime data already exists and can follow the existing `noc` / `rtx` backend pattern.
3. Build `autl` after that, using a biotech-event/NAV backend pattern and clearly separating official actuals from clinical-stage research assumptions.
4. Densify warning modules by adding missing historical events, extending daily price imports, or labeling semiannual/research-only event anchors explicitly.

## Commands

Use the non-strict audit while migrating:

```text
npm run stocks:backend:audit
```

Use strict mode before considering the all-module backend migration complete:

```text
npm run stocks:backend:audit:strict
```
