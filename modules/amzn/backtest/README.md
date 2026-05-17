# AMZN Backtest

The AMZN backend exposes a simple buy-and-hold AMZN versus SPY interval comparison.

- Price source table: `daily_price_bars`
- Return basis: `adjustedClose` when available
- Fallback: close-price or proxy rows are explicitly flagged in `sourceType` and returned as warnings
- Metrics: CAGR, max drawdown, Sharpe with zero risk-free rate, and annualized volatility

The simple frontend panel does not render valuation-signal strategy logic.
