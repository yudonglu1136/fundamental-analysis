# Platform Operations Guide

## Purpose

This repository is a plugin-based buy-side fundamental analysis platform. It is not a collection of standalone stock pages. Operators should maintain the platform through the stock registry, shared contracts, and the backend workflow runners rather than by creating one-off paths.

## Platform Architecture

### App Shell And Routing

The app shell owns stock switching, navigation, and global state. Stock dashboards receive platform state through the `StockDashboardProps` contract:

- `scenario`
- `period`
- `dataSourceType`

Ticker dashboards should consume these inputs rather than creating incompatible parallel state systems.

### Stock Registry

`src/stocks/registry.ts` is the frontend source of truth for registered modules. A stock module should not be reachable through a standalone page outside this registry.

Use:

```bash
npm run stocks:contract:validate
```

to check registry/module wiring.

### Stock Module Contract

Shared types live in `src/stocks/types.ts`. Registered stock modules must preserve:

- `data`
- `calculateSummary`
- `calculateValuation`
- `Dashboard`
- `valuationConfig`

The platform cleanup phases added shared assembly/state/quality helpers for the pilot modules `V`, `NOW`, and `ANET`, but ticker-specific business logic still belongs inside `src/stocks/{ticker}`.

### Shared Frontend Utilities

Prefer shared utilities for common platform behavior:

- `src/stocks/moduleAssembly.ts`
- `src/stocks/metadata.ts`
- `src/components/shared/useValuationAssumptionState.ts`
- `src/components/shared/InteractiveValuationDashboard.tsx`
- `src/utils/validation.ts`
- `src/utils/valuation.ts`

Do not move business-specific investment analysis into these utilities. Shared code should handle platform mechanics, not ticker theses.

`src/stocks/metadata.ts` is intentionally lightweight. It supports Home and Sidebar navigation without importing every full dashboard module into the app shell. The authoritative executable stock module registry remains `src/stocks/registry.ts`.

## Backend Architecture

### Current Strategy: Option B

The selected near-term backend strategy is:

```text
Per-ticker SQLite databases + shared backend runner/framework
```

Local research databases live at:

```text
data/local/{ticker}/backend/{ticker}_research.sqlite
```

Ticker backend code generally lives under:

```text
modules/{ticker}
```

The API route layer is unified through:

```text
apps/api/src/routes/stockBackend.mjs
apps/api/src/stockBackend/registry.mjs
```

### Why Single DB Was Deferred

A single unified research database remains a possible future destination, but it is not the right near-term migration because current scripts, schema modules, services, seeders, validators, and local data paths assume ticker-specific SQLite files. A forced merge would create high migration risk and slow down one-command operations.

The current framework gets most of the operational benefit first:

- one command surface
- shared capability discovery
- consistent task vocabulary
- ticker-level failure summaries
- existing per-ticker workflows preserved

## Backend Workflow Tools

Low-level capability/task runner:

```text
scripts/backend_manifest.mjs
scripts/backend_runner.mjs
```

Operator-facing workflow orchestrator:

```text
scripts/data_workflow.mjs
```

Inspect capabilities:

```bash
npm run data:backend:list
```

Audit source workflow coverage:

```bash
npm run data:audit:sources
npm run data:audit:sources -- --json
```

The source audit is intentionally conservative: it reports freshness as `unknown` or `not tracked` when current metadata does not contain a verified source timestamp.

## Command Semantics

### Safe Default Update

`data:update` runs:

```text
import-prices -> backfill-valuations -> validate
```

It does not run:

- `seed`
- `fetch-official`
- `fetch-transcripts`
- dataset builders
- metric builders
- QA-pair builders

Those remain ticker-specific until each flow is standardized and proven safe.

### Core Commands

```bash
npm run data:update
npm run data:update:ticker -- --ticker msft
npm run data:validate
npm run data:validate:ticker -- --ticker lseg
npm run data:prices
npm run data:prices:ticker -- --ticker ma
npm run data:backfill
npm run data:backfill:ticker -- --ticker v
```

Dry-run:

```bash
npm run data:workflow -- --workflow update --tickers v,now,anet,ma --dry-run
```

Custom sequence:

```bash
npm run data:workflow -- --task-sequence import-prices,validate --ticker msft
```

## Maintenance Cadence

### Daily Or Pre-Work Session

Use a dry-run before broad updates:

```bash
npm run data:update -- --dry-run
```

Then run a targeted update for the tickers in active research:

```bash
npm run data:update:ticker -- --ticker ma
```

### Weekly

Run capability and validation checks:

```bash
npm run data:backend:list
npm run data:validate
```

If the all-ticker validation output is too noisy or slow, start with active coverage:

```bash
npm run data:validate:ticker -- --tickers v,now,anet,ma
```

### Pre-Review / Pre-IC

For a specific idea:

```bash
npm run data:workflow -- --workflow update --ticker <ticker>
npm run stocks:contract:validate
npm run build
```

Also inspect source gaps and warnings in the ticker dashboard before relying on valuation output.

## CI / Quality Gates

The minimal GitHub Actions workflow at `.github/workflows/quality.yml` runs:

- `npm run stocks:contract:validate`
- `npm run typecheck`
- `npm run build`
- `npm run data:workflow -- --workflow update --tickers v,now,anet,ma --dry-run`

The dry-run check validates workflow wiring only. It does not mutate databases or fetch external sources.

### Ad Hoc Ticker Refresh

Use the narrowest task that solves the problem:

- stale prices: `data:prices:ticker`
- stale valuation runs: `data:backfill:ticker`
- suspicious output: `data:validate:ticker`
- source fetch issue: ticker-specific fetch script, not broad `data:update`

## Source Freshness And Source Gaps

Standardized broad workflows:

- price import
- valuation backfill
- backend validation

Ticker-specific or manual workflows:

- official filing or release fetchers
- transcript fetchers
- transcript extraction / QA pair builders
- metric database builders
- official dataset builders
- manual/proxy rows inside seeded local datasets

Before trusting an output, check:

- backend validation warnings
- `sourceType` / `sourceQuality` fields in backend-backed panels
- whether rows are forecast assumptions or proxy rows
- latest market price date
- whether valuation runs are available for the reporting event being reviewed
- whether transcript/filing data is actually model-ready or only stored as source material

## Failure Investigation Playbook

### Price Import Failed

Run:

```bash
npm run data:prices:ticker -- --ticker <ticker>
```

Then check:

- `data/local/{ticker}/market`
- `modules/{ticker}/market/importDailyPrices.mjs`
- whether SPY benchmark bars are present
- whether the ticker uses Yahoo, Nasdaq, or another source convention

### Backfill Failed

Run:

```bash
npm run data:backfill:ticker -- --ticker <ticker>
npm run data:validate:ticker -- --ticker <ticker>
```

Then check:

- `reporting_events`
- `daily_price_bars`
- `assumption_sets`
- `model_versions`
- `modules/{ticker}/valuation/adapter.mjs`

Backfill failures often come from missing event-visible data, missing price bars, or an assumption/model-version mismatch.

### Validation Failed

Run the ticker-specific validation directly if you need full output:

```bash
npm run <ticker>:backend:validate
```

Then inspect the first `FAIL`, not just the summary. Many validation scripts are intentionally strict about future leakage, proxy rows, finite valuation outputs, and required frontend payload fields.

### Missing DB

If a ticker has no SQLite DB, broad workflows will not discover it as a backend ticker. If a DB exists but validation says tables are missing, run the ticker-specific seed workflow only after confirming that refreshing the local DB is intended:

```bash
npm run <ticker>:backend:seed
```

Do not run seed broadly as part of default `data:update`.

### Unsupported Capability

Use:

```bash
npm run data:backend:list
```

If a task is missing for a ticker, the workflow skips it by default. Use `--include-unsupported` only when you want missing capability to fail loudly.

### Stale Or Missing Source

If validation passes but the source is stale, run the ticker-specific fetch/build command where it exists. Examples include:

- `npm run isrg:fetch-official`
- `npm run lseg:fetch-transcripts`
- `npm run mck:build-metrics`

These are not broad default update tasks.

## Capability Matrix

Legend: `yes` means the capability exists in the shared manifest; `-` means no standardized script was found.

| Ticker | DB | Validate | Prices | Backfill | Official Fetch | Transcript Fetch | Known Manual / Ticker-Specific Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| AAPL | yes | yes | yes | yes | yes | - | SEC/local official data; no transcript fetch in manifest |
| AMZN | yes | yes | yes | yes | yes | - | SEC/local official data; no transcript fetch in manifest |
| ANET | yes | yes | yes | yes | yes | - | AI/cloud metrics use ticker-specific backend panels |
| AZN | yes | yes | yes | yes | yes | - | Uses public fetch alias; no run-valuation script |
| BA | yes | yes | yes | yes | yes | - | Official dataset builder exists |
| BMY | yes | yes | yes | yes | - | - | Biopharma module; official fetch not standardized |
| DGE | yes | yes | yes | yes | - | - | Uses model-validation alias; official fetch not standardized |
| GILD | yes | yes | yes | yes | - | - | Biopharma module; official fetch not standardized |
| GOOGL | yes | yes | yes | yes | - | - | Backend supported; official fetch not standardized under GOOGL |
| ISRG | yes | yes | yes | yes | yes | yes | Rich official/transcript/metric/QA workflows are ticker-specific |
| LEGN | yes | yes | yes | yes | - | - | Model-validation alias; official fetch not standardized |
| LSEG | yes | yes | yes | yes | yes | yes | Heavy transcript and official workflows; keep ticker-specific |
| MA | yes | yes | yes | yes | yes | - | Payments-network backend; official fetch exists |
| MCK | yes | yes | yes | yes | yes | yes | Metric and QA builders exist; ticker-specific source workflow |
| META | yes | yes | yes | yes | yes | yes | Official/transcript/metric workflows exist |
| MSFT | yes | yes | yes | yes | yes | - | Official dataset builder exists; transcript fetch not standardized |
| NOC | yes | yes | yes | yes | yes | yes | Defense official/transcript workflows exist |
| NOW | yes | yes | yes | yes | yes | - | Agent/subscription metrics use ticker-specific backend panels |
| NVDA | yes | yes | yes | yes | yes | - | SEC/local official data; no transcript fetch in manifest |
| PLTR | yes | yes | yes | yes | yes | yes | Metric and QA builders exist; no run-valuation script |
| RTX | yes | yes | yes | yes | yes | - | Official dataset builder exists |
| TRI | yes | yes | yes | yes | - | - | Official fetch not standardized |
| TSM | yes | yes | yes | yes | - | - | Official fetch/model validation not standardized |
| V | yes | yes | yes | yes | yes | - | Payments-network backend; official fetch exists |

## Future Migration Path

1. Keep Option B until workflow reliability is boring.
2. Standardize source fetch/build flows ticker by ticker.
3. Extract common seed/import/backfill internals only after runner coverage is stable.
4. Consider a unified database only after schemas and update flows converge.
