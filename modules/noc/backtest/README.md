# NOC Backtest Backend Pilot

This backend pilot stores daily adjusted close bars for `NOC` and `SPY` in `data/local/noc/backend/noc_research.sqlite`.

The implemented endpoint is intentionally simple:

- `POST /api/noc/backtests`
- `POST /api/stocks/noc/backtests`

It compares NOC buy-and-hold against SPY over the requested date interval. It does not use a valuation-signal strategy, does not trade around reporting events, and does not promote transcript or guidance candidates into model signals.

Price source:

- Yahoo Finance chart API cached under `data/local/noc/market/`
- `adjustedClose` is used when available; `close` is only a fallback if Yahoo omits adjusted close for a row.

Useful commands:

- `npm run noc:backend:seed`
- `npm run noc:backend:import-prices`
- `npm run noc:backend:backfill-valuations`
- `npm run noc:backend:validate`
