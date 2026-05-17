# NVDA Backtest Backend

The NVDA backend implements the stock-module standard simple buy-and-hold comparison:

- target ticker: `NVDA`
- benchmark: `SPY`
- default window: `2018-01-02` to `2026-05-12`
- data source: `daily_price_bars.adjustedClose`
- endpoint: `POST /api/nvda/backtests`
- unified endpoint: `POST /api/stocks/nvda/backtests`

This is intentionally not a valuation-signal strategy. It compares indexed NVDA and SPY daily adjusted-close returns and returns CAGR, max drawdown, Sharpe, and annualized volatility for both series.
