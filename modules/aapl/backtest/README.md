# AAPL Backtest

The AAPL backend backtest is deliberately simple: buy-and-hold AAPL versus SPY over the selected date interval.

- Source table: `daily_price_bars`
- Return basis: adjusted close when available
- Default window: `2018-01-02` through `2026-05-12`
- Benchmark: `SPY`
- Metrics: CAGR, maximum drawdown, Sharpe ratio with zero risk-free rate, and annualized volatility

This panel is not a valuation-signal strategy. Historical valuation signals are persisted separately in `valuation_runs`.
