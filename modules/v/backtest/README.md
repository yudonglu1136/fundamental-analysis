# V backend backtest

The V backend backtest is a persisted buy-and-hold comparison of Visa Class A common stock against SPY.

- Source table: `daily_price_bars`
- Stock series: `V`
- Benchmark series: `SPY`
- Price anchor: adjusted close
- Metrics: total return, CAGR, maximum drawdown, Sharpe ratio with zero risk-free rate, and annualized daily volatility

The current implementation can ingest real Yahoo chart JSON if present in `data/local/v/market/yahoo_ma_chart.json` and `data/local/v/market/yahoo_spy_chart.json`. When those files are missing, `npm run v:backend:import-prices` writes deterministic proxy bars and flags the source as `market_data_proxy`, so validation can exercise the backend contract without pretending the price series is official.
