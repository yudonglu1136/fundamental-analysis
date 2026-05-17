# TSM Backend Backtest Notes

The first TSM backend pass focuses on reporting-event valuation snapshots and ADR as-of price anchors. A full TSM-vs-SPY backtest can be added once SPY daily price bars are imported into the same SQLite database.

Historical valuation runs must use only reporting-event financial rows, management guidance and nearest-prior ADR prices available on or before each event date.
