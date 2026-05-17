# MSFT Backend Backtest Placeholder

The MSFT backend pilot creates the `backtest_runs` table and exposes `/api/msft/backtests` endpoints so historical valuation snapshots can later be evaluated against subsequent share-price outcomes.

This pilot intentionally does not implement a full investment backtest yet. The current scope is:

- Persist reporting-event snapshots.
- Persist event-dated Bear/Base/Bull valuation runs.
- Keep model-ready official actuals separate from transcript commentary, research-only data, and market data.
- Preserve current MSFT frontend valuation formulas through the backend adapter.

Future backtest work should use persisted `valuation_runs` as the signal source and dated `market_snapshots` or verified price history as the realized outcome source. Proxy/backcast market rows should remain labeled as `research_only` or `market_data` with explicit quality notes.
