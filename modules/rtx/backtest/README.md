# RTX Backtest Backend

RTX backtests use the unified stock backend and the local SQLite database at:

`data/local/rtx/backend/rtx_research.sqlite`

The simple panel compares RTX buy-and-hold with SPY over a selected interval. It does not use valuation-signal exposure logic. Daily bars are read from `daily_price_bars`, and `adjustedClose` is used when available. If a source only provides close prices, the import layer labels the rows as an unadjusted fallback and validation reports the limitation.

Default request:

```json
{
  "startDate": "2018-01-02",
  "endDate": "2026-05-12",
  "benchmarkTicker": "SPY"
}
```
