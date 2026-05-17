# BA.L Backend Backtests

BA.L backtests are routed through the unified stock backend only:

- `GET /api/stocks/ba/backtests`
- `POST /api/stocks/ba/backtests`

The current implementation persists the `backtest_runs` table and exposes route stubs through `routeStockBackend`. Full execution can be added later using the same event-visible valuation snapshots created by `ba:backend:backfill-valuations`.

Backtests must not use future data. A simulation date can only use `valuation_runs.dataSnapshotJson.rowUsage` rows whose `asOfDate` is on or before the reporting event date.
