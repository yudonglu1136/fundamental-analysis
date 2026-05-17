# META Backend Backtest

This backend mirrors the MSFT frontend/backend contract for a simple buy-and-hold comparison.

- The endpoint `POST /api/meta/backtests` compares META daily returns with SPY daily returns for the selected interval.
- It does not use valuation-signal strategy logic.
- `daily_price_bars.adjustedClose` is preferred. If only close prices or research-only proxy bars are available, warnings are persisted and returned.
- Historical valuation runs use the nearest prior META trading day where available, via `priceDate <= reportingEvent.eventDate`.

