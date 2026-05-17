# LSEG Historical Backtest Plan

This backend pilot introduces the storage model needed for LSEG as-of valuation snapshots. It does not yet populate a full eight-year history.

## Historical reporting events

Add each LSEG disclosure as a `reporting_events` row:

- Q1 trading update
- H1 interim results
- Q3 trading update
- FY preliminary results
- Annual report
- transcript event
- market snapshot

Use `eventDate` as the investor's information date. Do not attach data published after that date to the event.

## Avoiding future-data leakage

For each as-of valuation:

1. Select the latest `reporting_events.eventDate <= asOfDate`.
2. Use only `financial_periods`, `segment_financials`, `market_snapshots`, `peer_snapshots`, `guidance_items`, and `transcript_extractions` with `asOfDate <= valuation.asOfDate`.
3. Keep transcript and guidance candidates as `modelReady = false` and `valuationImpactAllowed = false` until reviewed.
4. Store the entire payload in `valuation_runs.dataSnapshotJson` so the model can be reproduced later.

## Valuation runs

Each valuation run should store:

- as-of date
- reporting event id
- selected scenario
- model version
- assumption set id
- method outputs
- warnings
- data snapshot

This allows the frontend to select prior events and compare current valuation logic with historical model versions.

## Future 1Y / 3Y return comparison

After eight-year market history is backfilled:

1. Join each valuation run to subsequent price/dividend outcomes.
2. Calculate 1Y and 3Y total shareholder return.
3. Compare predicted upside/downside and expected shareholder CAGR against realized outcomes.
4. Attribute errors to growth, margin, multiple, market price, FX, and capital return assumptions.
