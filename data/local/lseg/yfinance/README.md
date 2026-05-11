# LSEG yfinance Local Store

This directory holds a **local research-use snapshot** for LSEG and selected peers fetched through `yfinance`.

## Important caveat

`yfinance` is an **unofficial Yahoo Finance wrapper**. It is useful for:

- dated market snapshots
- price history
- dividend history
- broad financial statement snapshots
- lightweight analyst-target / recommendation snapshots when available
- peer multiple refresh support

It is **not** institutional-grade source infrastructure. Data can be stale, incomplete, renamed, delayed, or missing without warning.

## What this local store supports

The local store is designed to support future LSEG ingestion work for:

- `marketData.ts` normalization
- peer multiple refreshes
- financial-statement snapshot validation
- consensus / analyst-snapshot scaffolding
- dashboard provenance and stale-data warnings

## What must still stay manually curated

These items should **not** be replaced by yfinance alone:

- company guidance ranges / targets
- reported segment disclosures
- operating-vs-strategic SOTP assumptions
- ownership / NCI bridge
- strategic split assumptions
- post-trade / Tradeweb read-through assumptions
- underwriting WACC / terminal / target-multiple assumptions

## Directory layout

- `raw/`
  - direct-ish `yfinance` outputs saved as JSON or CSV
- `curated/`
  - cleaned snapshots shaped for future LSEG ingestion work

## Refresh instructions

From the repository root:

```bash
python scripts/lseg_fetch_yfinance.py
```

If dependencies are missing:

```bash
pip install yfinance pandas pyarrow
```

`pyarrow` is only needed if the pipeline later moves to parquet output. The current version writes CSV / JSON.

## Files intended to feed the LSEG platform later

- `curated/market_snapshot.json`
- `curated/peer_multiples_snapshot.json`
- `curated/financial_statement_snapshot.json`
- `curated/consensus_snapshot.json`
- `curated/provenance.json`
- `curated/warnings.json`

## Provenance policy

Each fetched dataset should carry:

- `source: yfinance`
- `sourceType: yahoo_finance_snapshot`
- `fetchedAt`
- `ticker`
- `currency` when available
- `qualityTag`

Missing fields are stored as `null` and should also appear in warnings output.
