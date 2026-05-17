# DGE.L Backtest Pilot

The DGE.L backend backtest is intentionally simple: it compares an indexed buy-and-hold DGE.L local-price series with SPY over a selected date range.

- DGE.L prices are stored from Stooq in GBp and converted only for valuation; the backtest uses the indexed local-price series.
- SPY prices are stored in USD.
- The DGE.L vs SPY chart is not FX-hedged and does not convert either leg into a common reporting currency.
- Stooq daily OHLCV does not include an adjusted-close field, so imported rows are flagged as price-return only until a richer adjusted-price source is added.
