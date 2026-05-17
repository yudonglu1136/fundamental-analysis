# fundamental-analysis Codex Rules

This repository is a plugin-based buy-side fundamental analysis platform.

Do not create isolated stock pages. Every stock must be registered through `src/stocks/registry.ts` and conform to `src/stocks/types.ts`.

## Global Platform State

- `scenario`
- `period`
- `dataSourceType`

## Stock Module Contract

Each stock module should provide:

- `data`
- `calculateSummary`
- `calculateValuation`
- `Dashboard`
- `valuationConfig`

## Valuation Output Expectations

Valuation outputs should include where possible:

- current fair value
- Bear/Base/Bull fair values
- 3Y target price
- expected shareholder CAGR
- method cards
- expected return bridge
- sensitivity tables
- validation warnings

## Data Quality Tags

- `Actual`
- `Assumption`
- `Derived`
- `Placeholder`

## Modeling Rules

When adding or changing a model:

1. Keep business-specific logic inside `src/stocks/{ticker}`.
2. Keep shared financial math inside `src/utils`.
3. Do not duplicate valuation utilities.
4. Add or update validation scripts for material model changes.
5. Ensure new dashboard features are reachable from the stock module UI.
6. Do not mix full-company valuation methods with incremental uplift values unless the bridge explicitly prevents double counting.
7. Preserve existing public interfaces unless explicitly asked to refactor.
