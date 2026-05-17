# GILD Backtest Notes

GILD backtests are exposed through the unified stock backend stubs:

- `GET /api/stocks/gild/backtests`
- `POST /api/stocks/gild/backtests`

The first backend phase persists event-visible historical valuation runs for every reporting event. A later backtest phase can compare those stored fair values with forward shareholder returns once vendor price/dividend histories are fully imported.
