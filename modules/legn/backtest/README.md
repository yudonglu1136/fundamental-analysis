# LEGN backend backtests

LEGN backtest persistence is wired through the unified stock backend route layer:

- `GET /api/stocks/legn/backtests`
- `POST /api/stocks/legn/backtests`

Execution remains a stub in this phase. Historical valuation runs are persisted event by event first so future backtests can compare event-visible fair value versus subsequent stock performance without future-data leakage.
