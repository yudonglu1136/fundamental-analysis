# Data Operator Runbook

This is the command-first runbook. For architecture and capability details, see `docs/platform_operations_guide.md`.

## Default Strategy

The platform currently keeps per-ticker SQLite databases and uses a shared workflow runner to orchestrate existing ticker scripts.

The safe default update workflow is:

```text
import-prices -> backfill-valuations -> validate
```

This intentionally excludes `seed`, `fetch-official`, `fetch-transcripts`, dataset builders, metric builders, and QA-pair builders. Those workflows remain ticker-specific until they are proven safe to run broadly.

## Commands

Inspect backend capabilities:

```bash
npm run data:backend:list
```

Audit source workflow coverage and freshness visibility:

```bash
npm run data:audit:sources
npm run data:freshness -- --tickers ma,aapl,msft
```

The source audit uses manifest metadata only. Freshness is reported as `unknown` or `not tracked` unless a future manifest field stores a verified timestamp.

Update all supported backend tickers:

```bash
npm run data:update
```

Update one ticker:

```bash
npm run data:update:ticker -- --ticker msft
```

Update selected tickers:

```bash
npm run data:workflow -- --workflow update --tickers v,now,anet,ma
```

Dry-run an update:

```bash
npm run data:workflow -- --workflow update --tickers v,now,anet,ma --dry-run
```

Validate all backend tickers:

```bash
npm run data:validate
```

Validate one ticker:

```bash
npm run data:validate:ticker -- --ticker lseg
```

Import prices only:

```bash
npm run data:prices
npm run data:prices:ticker -- --ticker ma
```

Backfill valuations only:

```bash
npm run data:backfill
npm run data:backfill:ticker -- --ticker v
```

Custom sequence:

```bash
npm run data:workflow -- --task-sequence import-prices,validate --ticker msft
```

Skip a task:

```bash
npm run data:workflow -- --workflow update --all --skip validate
```

## Failure Behavior

Workflows continue on error by default and print a ticker-level summary at the end. Use `--stop-on-error` when you want the first failure to stop the run.

Unsupported tasks are skipped by default. Use `--include-unsupported` to make unsupported task/ticker combinations fail instead.

## Maintenance Cadence

Daily or before active work:

```bash
npm run data:workflow -- --workflow update --tickers v,now,anet,ma --dry-run
npm run data:update:ticker -- --ticker ma
```

Weekly:

```bash
npm run data:backend:list
npm run data:validate
```

Pre-review / pre-IC:

```bash
npm run data:workflow -- --workflow update --ticker <ticker>
npm run stocks:contract:validate
npm run build
```

Use ticker-specific fetch/transcript/build commands only when source freshness requires them.

## Failure Playbook

Price import failure:

```bash
npm run data:prices:ticker -- --ticker <ticker>
```

Check `data/local/{ticker}/market` and `modules/{ticker}/market/importDailyPrices.mjs`.

Backfill failure:

```bash
npm run data:backfill:ticker -- --ticker <ticker>
npm run data:validate:ticker -- --ticker <ticker>
```

Check reporting events, daily price bars, model versions, assumption sets, and `modules/{ticker}/valuation/adapter.mjs`.

Validation failure:

```bash
npm run <ticker>:backend:validate
```

Read the first `FAIL` line. Validation scripts are intentionally strict about missing tables, future leakage, finite valuation outputs, and frontend payload fields.

Unsupported capability:

```bash
npm run data:backend:list
```

If the capability is not listed, use a ticker-specific workflow or add support explicitly. Do not assume the broad workflow can fetch or build sources for every ticker.

## Rerunnability

`data:update` is designed to be rerunnable because it only orchestrates the existing price import, valuation backfill, and validation scripts. It does not reset databases or refetch external sources by default.

## Source Gaps

Broadly standardized:

- `import-prices`
- `backfill-valuations`
- `validate`

Ticker-specific/manual:

- `seed`
- `fetch-official`
- `fetch-transcripts`
- `build-dataset`
- `build-metrics`
- `build-qa-pairs`

Before relying on valuation output, inspect source-quality labels, proxy-row warnings, forecast rows, latest price dates, and backend validation output.
