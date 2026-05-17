AZN backend backtest pilot
==========================

This folder is a placeholder for historical backtesting of the AZN backend valuation system.

Current scope:
- Persist historical reporting-event valuation runs.
- Store backtest request metadata in `backtest_runs`.
- Return placeholder API responses until return-series and trading-rule logic is added.

Future work:
- Compare as-of fair value to subsequent 6/12/24 month returns.
- Attribute errors to revenue, margin, pipeline rNPV, LOE, China and FX assumptions.
- Add kill-criteria monitoring for Buy/Hold/Avoid transitions.
