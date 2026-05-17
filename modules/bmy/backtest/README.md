# BMY Backend Backtest

The BMY backend backtest is a simple buy-and-hold comparison between BMY and SPY.

- Prices are read from `daily_price_bars`.
- Return curves use adjusted close when available.
- The API accepts `startDate`, `endDate`, and `benchmarkTicker`.
- The result returns CAGR, maximum drawdown, Sharpe, annualized volatility and indexed curves for BMY and SPY.

This backtest intentionally does not include valuation-signal strategy logic.
