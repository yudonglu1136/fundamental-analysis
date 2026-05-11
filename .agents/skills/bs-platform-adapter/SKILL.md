---
name: bs-platform-adapter
description: Use this skill when adapting buy-side analyst research outputs into the fundamental-analysis repository's plugin-based platform. It is for ticker-by-ticker migration, platform-compatible valuation/model integration, schema alignment, and preserving the stock module contract, registry integration, shared valuation UI, shared utilities, and validation discipline.
---

# bs-platform-adapter

Use this skill when research conclusions, model outputs, or valuation work need to be integrated into this repository's platform structure instead of being delivered as a standalone stock page or one-off schema.

## Read First

1. Read `AGENTS.md` before planning changes.
2. Read `src/stocks/types.ts` before changing model outputs, valuation shapes, warnings, or assumption schemas.
3. Read `src/stocks/registry.ts` before adding, removing, or restructuring stock modules.

## Platform Context

This repository is a plugin-based buy-side fundamental analysis platform.

- The platform layer owns routing, shell, shared charts, shared valuation UI, and common types.
- Stock modules are registered through `src/stocks/registry.ts`.
- Shared types live in `src/stocks/types.ts`.
- Global state includes `scenario`, `period`, and `dataSourceType`.
- Each stock module should expose `data`, `calculateSummary`, `calculateValuation`, `Dashboard`, and `valuationConfig`.

Do not treat the repo as a collection of standalone stock pages.

## What To Preserve

Preserve the stock module contract unless a type-safe migration is necessary and clearly explained:

- `data`
- `calculateSummary`
- `calculateValuation`
- `Dashboard`
- `valuationConfig`

Preserve existing Dashboard import paths unless an explicit migration requires changing them.

## How To Map Research Into The Platform

Map research outputs into platform-compatible structures:

- `valuationConfig`
- `calculateSummary`
- `calculateValuation`
- method cards
- expected return bridge
- sensitivity tables
- validation warnings
- data quality tags

When adapting a buy-side research model:

- Convert company-specific assumptions into typed valuation assumptions.
- Preserve `source`, `unit`, `periodicity`, `asOfDate`, and `provenance` where the platform supports them.
- Separate facts, assumptions, derived outputs, and placeholders.
- If market data, consensus, prices, peer multiples, or WACC inputs are missing, mark them as missing and add a source gap or TODO instead of inventing values.

## Shared Components To Prefer

Prefer existing shared components when possible:

- `InteractiveValuationDashboard`
- `ValuationAssumptionsPanel`
- `ValuationSensitivity`
- `EPSBridgeChart`
- `FCFBridgeChart`
- `PeerReadThrough`
- `WaterfallChart`

Only introduce ticker-specific UI when the shared component cannot express the research question cleanly.

## Shared Utilities To Prefer

Prefer existing utilities before adding new math helpers:

- `src/utils/financialMath.ts`
- `src/utils/valuation.ts`
- `src/utils/validation.ts`

Do not duplicate valuation helpers, CAGR logic, price logic, warning logic, or basic financial math if a shared utility already exists.

## Workflow

1. Identify the target ticker and the current module files.
2. Read the module's `config.ts`, `calculations.ts`, `valuation.ts` if present, `Dashboard`, data files, and validation script if present.
3. Compare the module output against `src/stocks/types.ts` and the platform valuation schema.
4. List compatibility gaps before editing.
5. Propose a minimal migration plan.
6. Apply changes in small, type-safe steps.
7. Run TypeScript/build/tests/validation scripts.
8. Summarize changed files and remaining gaps.

## Compatibility Checklist

Before editing, check:

- Is the ticker already registered in `src/stocks/registry.ts`?
- Does the module consume `scenario`, `period`, and `dataSourceType` in a platform-compatible way?
- Does `calculateValuation` return platform-shaped fair values, method cards, return bridge, sensitivity tables, and warnings?
- Does `valuationConfig` expose assumptions in a form that the shared valuation UI can consume?
- Are data quality tags aligned with `Actual`, `Assumption`, `Derived`, and `Placeholder`?
- Are warnings, price logic, and CAGR logic using shared utilities where possible?
- Is the feature reachable from the module Dashboard?

## Hard Rules

- Do not create standalone stock pages.
- Do not bypass `src/stocks/registry.ts`.
- Do not break existing Dashboard imports.
- Do not mix full-company valuation methods with incremental uplift methods unless they are explicitly bridged to prevent double counting.
- Do not invent missing data.
- Preserve existing public interfaces unless a type-safe migration is necessary.
- Do not refactor all stocks at once; prefer incremental, ticker-by-ticker migration.

## Modeling Discipline

When changing valuation logic:

- Keep business-specific logic inside `src/stocks/{ticker}`.
- Keep reusable math and shared valuation mechanics in `src/utils`.
- Add or update validation scripts when model logic changes materially.
- Ensure any new feature is reachable from the stock module Dashboard.
- Preserve current UI behavior unless the task explicitly asks for UI change.

## Expected Output Style

When finishing work with this skill:

- list the module files inspected
- list compatibility gaps found
- summarize the minimal migration plan used
- summarize changed files
- note validation commands run
- note remaining platform or sourcing gaps
