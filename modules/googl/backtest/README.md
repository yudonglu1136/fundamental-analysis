# GOOGL Backend Backtest Staging

The GOOGL backend schema includes `backtest_runs` so persisted historical valuation runs can later be tested against event-dated market data.

Current pilot scope:

- Seed reporting-event snapshots from local GOOGL module data and SEC Companyfacts.
- Persist Bear/Base/Bull valuation runs by reporting event.
- Keep event-dated market prices marked as `research_only proxy/backcast` unless official/local market data is imported.
- Leave executable backtest strategy design deferred behind the `/api/googl/backtests` stub.

Before promoting this beyond the pilot, import audited event-date prices and define a rebalance policy that uses only information available at each event date.
