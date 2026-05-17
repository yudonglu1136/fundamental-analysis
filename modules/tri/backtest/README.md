# TRI Backend Backtest

The TRI backend backtest is intentionally simple in this phase: TRI buy-and-hold versus SPY buy-and-hold over a selected date range.

- Price source: local `daily_price_bars` loaded from Yahoo Finance chart JSON files under `data/local/tri/market/`.
- Return basis: `adjustedClose` when present; the importer marks close-fallback rows as `market_data_unadjusted_or_close_fallback`.
- No valuation-signal strategy is applied in this panel.
- Historical valuation snapshots use the nearest prior TRI adjusted close on or before each reporting event date.

Run order:

```bash
npm run tri:backend:seed
npm run tri:backend:import-prices
npm run tri:backend:backfill-valuations
npm run tri:backend:validate
```
