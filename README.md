# Fundamental Analysis

Unified multi-stock fundamental analysis platform for buy-side dashboards.

The project currently includes two stock modules:

- `MCK`: McKesson
- `LSEG`: London Stock Exchange Group

Each stock keeps its own business logic, data model, and stock-specific views, while the app shares one router, layout shell, selectors, cards, charts, formatting utilities, and validation helpers.

## Purpose

This app is designed to avoid building a separate frontend for every stock. Instead, each company is implemented as a plug-in style module that registers itself with the platform.

## Run

```bash
cd /Users/yudonglu/Documents/fundamental-analysis
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Architecture

Core app structure:

- `src/routes/`
  - `Home.tsx`: lists available stocks
  - `StockDashboard.tsx`: loads the selected stock module from the registry
- `src/components/layout/`
  - shared shell, sidebar, top nav, selectors
- `src/components/shared/`
  - reusable cards, badges, charts, valuation tables, peer tables, tooltips
- `src/stocks/`
  - one folder per stock module
  - `registry.ts`: central module registry
  - `types.ts`: shared stock module interface and platform types
- `src/utils/`
  - shared math, formatting, validation, and chart helpers
- `src/data/mock/`
  - bundled mock or snapshot data used as fallback

## Stock Modules

Each stock module exports:

- metadata
- tabs
- default periods
- data
- summary calculation
- valuation calculation
- dashboard component

The central registry lives in:

- [src/stocks/registry.ts](/Users/yudonglu/Documents/fundamental-analysis/src/stocks/registry.ts)

## Data Handling

The platform is structured for these data source types:

- `mock`
- `excel`
- `csv`
- `api`
- `manual`

Current state:

- `MCK` supports bundled workbook snapshot data and Excel upload parsing
- `LSEG` currently uses bundled mock data

Each module can expose:

- missing fields
- validation warnings
- valuation reliability
- manual assumption overrides

## Validation Utilities

Shared validation helpers live in:

- [src/utils/validation.ts](/Users/yudonglu/Documents/fundamental-analysis/src/utils/validation.ts)

Included checks:

- `checkMissingFields()`
- `checkExtremeGrowthRates()`
- `checkSegmentSumConsistency()`
- `checkEPSConsistency()`
- `checkValuationReliability()`

## How To Add A New Stock

1. Create `src/stocks/{ticker}/`
2. Add `config.ts`, `data.ts`, `dashboard.tsx`, `calculations.ts`
3. Export a `StockModule`
4. Register it in `src/stocks/registry.ts`
5. The app will automatically show it in the sidebar and home page

Use the example template here:

- [src/stocks/template/config.example.ts](/Users/yudonglu/Documents/fundamental-analysis/src/stocks/template/config.example.ts)
- [src/stocks/template/data.example.ts](/Users/yudonglu/Documents/fundamental-analysis/src/stocks/template/data.example.ts)
- [src/stocks/template/dashboard.example.tsx](/Users/yudonglu/Documents/fundamental-analysis/src/stocks/template/dashboard.example.tsx)
- [src/stocks/template/calculations.example.ts](/Users/yudonglu/Documents/fundamental-analysis/src/stocks/template/calculations.example.ts)

## Notes

- The current build succeeds.
- Vite reports a large bundle warning, so route-level or module-level code-splitting would be the next optimization pass.
- `npm install` reported 3 dependency vulnerabilities in the dependency tree; I did not change packages further.
