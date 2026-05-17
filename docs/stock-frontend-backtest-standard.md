# Stock Frontend Historical Valuation and Backtest Standard

This document standardizes the stock-module frontend pattern that is currently implemented in the MSFT module. Other stock modules should study the MSFT design and implementation first, then migrate toward the same user experience and backend contract without changing their valuation formulas unless the work explicitly requires backend decoupling.

## Reference Implementation

Use MSFT as the canonical reference:

- Frontend dashboard: `src/stocks/msft/dashboard.tsx`
- Historical valuation panel: `MsftHistoricalValuationPanel`
- Backtest panel: `MsftBacktestPanel`
- Backend backtest service: `apps/api/src/services/msftBacktestService.mjs`
- Backend valuation persistence: `apps/api/src/services/msftValuationService.mjs`
- Price-bar schema: `apps/api/src/db/migrations/001_msft_schema.sql`
- Price import layer: `modules/msft/market/importDailyPrices.mjs`
- Price import script: `scripts/msft_backend_import_prices.mjs`
- Validation script: `scripts/msft_backend_validation.mjs`

## Product Goal

Every stock module should let the user:

1. Open the existing stock dashboard.
2. Go to the valuation tab.
3. See persisted historical valuation snapshots by reporting event.
4. Select a clear visible interval for the historical valuation chart.
5. See the gap between as-of price and model fair value.
6. Run a simple date-range backtest comparing the stock against SPY.
7. Read CAGR, maximum drawdown, Sharpe, and annualized volatility for both the stock and SPY.
8. Continue using static frontend valuation views when the backend API is offline.

The UI must be in English.

## Backend Data Ownership Standard

Every stock module should treat the backend SQLite database as the source of truth for historical research facts, dated market data, and persisted valuation outputs. The frontend can keep static fallback data so the page still renders offline, but the historical valuation and backtest UX should map backend API responses into the existing frontend view model instead of carrying another independent historical dataset in React code.

Required local backend foundation per module:

- `modules/{slug}/db/schema.mjs`
- `apps/api/src/db/migrations/001_{slug}_schema.sql`
- `data/local/{slug}/backend/{slug}_research.sqlite`
- package scripts:
  - `{slug}:backend:seed`
  - `{slug}:backend:import-prices`
  - `{slug}:backend:backfill-valuations`
  - `{slug}:backend:validate`

Required minimum tables:

- `reporting_events`
- `valuation_runs`
- `daily_price_bars`

Each company should have roughly eight years of reporting-event history. For quarterly reporters, the target is at least 32 quarterly anchors. If the issuer reports semiannually or the historical source set is incomplete, the backend may include explicit `research_only` or `forecast_assumption` event anchors, but those rows must be labeled clearly and validators must not present them as official actuals.

Historical valuation runs must be persisted in `valuation_runs` and should cover every reporting event at least for the `Base` scenario. Frontend historical charts should load these runs from:

```text
GET /api/{tickerSlug}/historical-valuations?scenario=Base&modelVersion={modelVersion}
GET /api/stocks/{tickerSlug}/historical-valuations?scenario=Base&modelVersion={modelVersion}
```

The browser should not recalculate old fair values from current-period assumptions. The backend adapter may map an as-of database snapshot into the existing frontend valuation model shape, but the dated snapshot and the persisted run are the historical record.

## Historical Valuation Panel Standard

The historical valuation panel should use persisted backend valuation runs. It must not recompute historical fair values in the browser.

Required API:

```text
GET /api/{tickerSlug}/historical-valuations?scenario=Base&modelVersion={modelVersion}
GET /api/stocks/{tickerSlug}/historical-valuations?scenario=Base&modelVersion={modelVersion}
```

Required display:

- API status badge: `API online`, `Loading`, or `API offline`.
- Saved run count.
- Reporting-event count.
- Selected fair value.
- Selected upside/downside.
- Horizontal scroll row of reporting events.
- User-friendly visible-window controls:
  - Quick buttons such as `8Q`, `12Q`, `16Q`, `24Q`, `All`.
  - A range input or equivalent compact selector.
- Chart of as-of price versus fair value.
- Tooltip showing:
  - event label
  - fiscal period
  - as-of price
  - fair value
  - gap percent
- Summary stats for selected visible window:
  - visible event count
  - latest gap
  - average gap

Recommended chart convention:

- Gray bar: as-of price.
- Blue bar: fair value.
- X-axis should run oldest to newest from left to right.
- If fiscal years differ from calendar years, label clearly. MSFT uses `CYxx Qx / FYxx Qx` to avoid confusion.

## Price and Fair Value Gap

Gap calculation:

```text
gapPct = fairValue / asOfPrice - 1
```

The as-of price should come from daily market data if available:

```text
daily_price_bars.adjustedClose where ticker = target ticker and priceDate <= eventDate order by priceDate desc limit 1
```

If only proxy market snapshots exist, the UI and backend warnings must state that the price is a proxy. Do not present proxy rows as official market data.

## Backtest Panel Standard

The backtest panel should be deliberately simple. It is a stock-versus-SPY interval comparison, not a valuation-signal strategy panel.

Required title:

```text
{TICKER} vs SPY Backtest
```

Required controls:

- Start date input.
- End date input.
- Run backtest button.

Required chart:

- Line 1: target stock total return/indexed return.
- Line 2: SPY total return/indexed return.
- Both series start at 0% return or 1.0 indexed value.

Required metrics:

- Stock CAGR.
- SPY CAGR.
- Stock MDD.
- SPY MDD.
- Stock Sharpe.
- SPY Sharpe.
- Stock Vol.
- SPY Vol.

Do not show valuation-signal exposure, model-signal return, or trading-rule text in this simple comparison panel. Those can be a separate advanced panel later.

## Backtest Backend Standard

Required API:

```text
GET /api/{tickerSlug}/backtests
POST /api/{tickerSlug}/backtests
GET /api/stocks/{tickerSlug}/backtests
POST /api/stocks/{tickerSlug}/backtests
```

Required POST body:

```json
{
  "startDate": "2018-01-02",
  "endDate": "2026-05-12",
  "benchmarkTicker": "SPY"
}
```

Required response shape:

```json
{
  "status": "completed",
  "ticker": "MSFT",
  "benchmarkTicker": "SPY",
  "startDate": "2018-01-02",
  "endDate": "2026-05-12",
  "priceBars": {
    "MSFT": 2101,
    "SPY": 2101,
    "sources": {
      "MSFT": "Alpha Vantage TIME_SERIES_DAILY_ADJUSTED",
      "SPY": "Nasdaq historical quote API"
    }
  },
  "metrics": {
    "msftBuyHold": {
      "totalReturn": 4.17,
      "cagr": 0.217,
      "maxDrawdown": -0.371,
      "sharpe": 0.83,
      "volatility": 0.285
    },
    "spy": {
      "totalReturn": 1.75,
      "cagr": 0.129,
      "maxDrawdown": -0.341,
      "sharpe": 0.72,
      "volatility": 0.193
    }
  },
  "curve": [
    {
      "date": "2018-01-02",
      "spy": 1,
      "benchmark": 1,
      "msftBuyHold": 1
    }
  ],
  "warnings": []
}
```

The backend may still include additional fields for advanced use cases, but the frontend simple panel should render only the stock-vs-SPY comparison.

## Daily Price Schema Standard

Each module backend should support a daily price table equivalent to MSFT's `daily_price_bars`:

```sql
CREATE TABLE IF NOT EXISTS daily_price_bars (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  priceDate TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  adjustedClose REAL,
  volume REAL,
  dividendAmount REAL,
  splitCoefficient REAL,
  source TEXT,
  sourceType TEXT,
  fetchedAt TEXT,
  rawJson TEXT
);
```

Required index:

```sql
CREATE INDEX IF NOT EXISTS idx_{slug}_daily_price_bars_ticker_date
  ON daily_price_bars(ticker, priceDate);
```

Use adjusted close for performance and as-of price anchoring when available. If only unadjusted close is available, clearly warn that benchmark or stock returns are not dividend-adjusted.

## Backtest Metric Algorithms

Use daily returns.

CAGR:

```text
cagr = (endingValue / startingValue) ** (365.25 / calendarDays) - 1
```

Maximum drawdown:

```text
maxDrawdown = min(value / runningPeak - 1)
```

Annualized volatility:

```text
volatility = stdev(dailyReturns) * sqrt(252)
```

Sharpe:

```text
sharpe = averageDailyReturn * 252 / annualizedVolatility
```

Use a zero risk-free rate unless the module has an explicit dated risk-free-rate table.

## Data Quality Rules

- Keep official financial actuals, management guidance, forecast assumptions, transcript commentary, research-only data, and market data explicitly separated.
- Do not pretend proxy/backcast rows are official actuals.
- Do not use future prices for historical valuation snapshots.
- For historical valuation as-of price, use the nearest prior trading day if the event date is not a trading day.
- If benchmark data starts later than stock data, warn and use the overlapping range.
- If SPY is not dividend-adjusted, warn that SPY total return may be understated.

## Validation Requirements

Each migrated module should add validation checks equivalent to MSFT:

- Backend DB exists.
- Required tables exist.
- `daily_price_bars` exists.
- Target stock daily prices exist for the intended date range.
- SPY daily prices exist for the intended date range.
- Historical valuation runs exist by reporting event.
- Historical fair values vary by event and are not a flat line.
- Historical as-of price equals daily market data when daily data is available.
- Backtest endpoint returns finite CAGR, MDD, Sharpe, and Vol for both stock and SPY.
- Frontend build/typecheck passes.

The cross-module gate is:

```text
npm run stocks:backend:audit
```

Use the strict form in CI or before declaring full migration coverage:

```text
npm run stocks:backend:audit:strict
```

The audit discovers frontend modules from `src/stocks/*/config.ts`, then checks backend schema/migration files, SQLite DB presence, core tables, event coverage, Base valuation coverage, AAPL-or-stock/SPY price bars, required package scripts, and whether the frontend valuation tab appears to call the backend historical valuation or backtest APIs.

## Migration Checklist

1. Read the MSFT implementation files listed at the top of this document.
2. Identify the target module slug, ticker, model version, backend DB path, and dashboard valuation tab.
3. Add or reuse `daily_price_bars`.
4. Import target stock and SPY daily prices.
5. Add a backend backtest service modeled on MSFT, but use the target module DB path and ticker.
6. Wire legacy and unified routes:
   - `/api/{slug}/backtests`
   - `/api/stocks/{slug}/backtests`
7. Add the frontend backtest panel to the valuation tab.
8. Add visible-window controls and gap labels to historical valuation charts.
9. Ensure the frontend still renders if API is offline.
10. Add validation checks.
11. Run seed/import/backfill/validation/typecheck/build as applicable.

## Non-Goals

- Do not refactor unrelated modules while migrating one module.
- Do not change valuation formulas unless the user explicitly asks for model changes.
- Do not replace the simple stock-vs-SPY panel with a valuation-signal strategy panel.
- Do not introduce a second backend server. Use the unified `apps/api/src/server.mjs`.
