# AGENTS.md

This repository is a plugin-based buy-side fundamental analysis platform, not a collection of standalone stock pages.

## 1. Platform Architecture

- The app shell and routing layer are responsible for the research workspace, navigation, global state, and stock switching.
- Stock modules must be registered through `src/stocks/registry.ts`.
- Shared stock types and valuation schemas are defined in `src/stocks/types.ts`.
- Do not create isolated stock pages outside the stock registry.
- Operator-facing architecture and maintenance guidance lives in `docs/platform_operations_guide.md` and `docs/data_operator_runbook.md`.

## 2. Global Platform State

The platform centrally manages:

- `scenario`
- `period`
- `dataSourceType`

Stock modules should consume these states where relevant rather than creating incompatible local alternatives.

## 3. Required Stock Module Contract

Each stock module should provide or preserve:

- `data`
- `calculateSummary`
- `calculateValuation`
- `Dashboard`
- `valuationConfig`

Do not break this interface unless a type-safe migration is required and clearly explained.

## 4. Shared UI Components

Prefer existing shared components when possible:

- `InteractiveValuationDashboard`
- `ValuationAssumptionsPanel`
- `ValuationSensitivity`
- `EPSBridgeChart`
- `FCFBridgeChart`
- `PeerReadThrough`
- `WaterfallChart`

## 5. Shared Utilities

Prefer shared utilities instead of duplicating math:

- `src/utils/financialMath.ts`
- `src/utils/valuation.ts`
- `src/utils/validation.ts`

## 6. Data And Assumption Quality

Use the platform's data quality approach:

- `Actual`
- `Assumption`
- `Derived`
- `Placeholder`

Valuation assumptions should preserve `source`, `unit`, `periodicity`, `asOfDate`, and `provenance` where supported.

## 7. Unified Valuation Output

Valuation output should include where possible:

- current fair value
- Bear/Base/Bull fair values
- 3Y target price
- expected shareholder CAGR
- method cards
- expected return bridge
- sensitivity tables
- validation warnings

## 8. Modeling Discipline

When changing valuation logic:

- Avoid mixing full-company valuation methods with incremental uplift values unless the bridge explicitly prevents double counting.
- Avoid hardcoded unexplained assumptions.
- Separate business-specific logic inside `src/stocks/{ticker}`.
- Keep shared reusable math in `src/utils`.
- Add or update validation scripts for material model changes.
- Ensure new features are reachable from the stock module dashboard.
- Preserve existing UI behavior unless explicitly asked to change it.

## 9. Buy-Side Analysis Discipline

When using buy-side skills:

- Map every research conclusion to model drivers, assumptions, KPIs, valuation sensitivity, risk triggers, or validation warnings.
- Clearly separate facts, assumptions, derived outputs, and placeholders.
- Never invent market data, consensus estimates, current prices, peer multiples, or WACC inputs. If missing, mark as missing and add a TODO or source gap.
