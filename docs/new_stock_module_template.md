# New Stock Module Template

Use this checklist before adding any new ticker. This repository is a plugin-based buy-side fundamental analysis platform, not a set of standalone stock pages.

## 1. Stock Identity

Complete this intake block before creating files.

| Field | Required answer |
| --- | --- |
| Ticker | `<TICKER>` |
| Company name | `<Company>` |
| Sector / industry | `<Sector>` |
| Currency | `USD / GBP / GBX / other` |
| Exchange / listing | `<Exchange or ADR/listing detail>` |
| Module archetype | `<see archetypes below>` |
| Primary business questions | `<3-7 investor questions the module must answer>` |
| Required source set | `<filings, earnings releases, IR deck, transcripts, prices, peers>` |

## 2. Module Archetype

Classify the ticker first. Reuse patterns, but keep company-specific logic inside `src/stocks/{ticker}`.

| Archetype | Likely reusable patterns | Common custom logic |
| --- | --- | --- |
| Standard compounder | DCF, P/E, FCF yield, expected return bridge | organic growth, pricing, capital returns |
| Platform / infrastructure | SOTP, platform moat score, usage or volume KPIs | segment flywheel, ecosystem take-rate, reinvestment logic |
| Biopharma | pipeline value, LOE risk, product concentration | trial/regulatory milestones, patent cliffs, probability-adjusted assets |
| Defense | backlog, program mix, margin bridge, cash conversion | budget cycle, contract risk, geopolitical demand |
| AI infra | revenue multiple, FCF/DCF, capacity and capex bridge | supply constraints, customer concentration, cycle risk |
| Software | ARR/NRR, Rule of 40, FCF margin, SBC | cohort expansion, retention, usage pricing |
| Regulated / exchange | recurring revenue, transaction sensitivity, SOTP | regulatory capital, volume sensitivity, post-trade/workflow mix |
| Other | choose closest existing module | document why existing archetypes do not fit |

## 3. Required Platform Contract

Every registered stock module must satisfy `src/stocks/types.ts` and expose:

- `data`
- `calculateSummary`
- `calculateValuation`
- `Dashboard`
- `valuationConfig`

The module must consume platform state through `StockDashboardProps` where relevant:

- `scenario`
- `period`
- `dataSourceType`

Do not create standalone route pages. The stock must be reachable through the registry and platform shell.

## 4. Required File Structure

Minimum frontend structure:

```text
src/stocks/{ticker}/
  config.ts
  dashboard.tsx
  calculations.ts
  data.ts
```

Use additional files when complexity warrants it:

```text
src/stocks/{ticker}/
  assumptions.ts
  valuation.ts
  model.ts
  realData.ts
  components/
  engines/
  data/
  validation/
```

Material models should add validation:

```text
scripts/{ticker}_model_validation.mjs
```

Backend-capable modules should follow the current per-ticker backend shape:

```text
modules/{ticker}/
  db/schema.mjs
  db/seed.mjs
  market/importDailyPrices.mjs
  valuation/adapter.mjs
  valuation/modelVersion.mjs
  backtest/README.md

scripts/{ticker}_backend_seed.mjs
scripts/{ticker}_backend_import_prices.mjs
scripts/{ticker}_backend_backfill_valuations.mjs
scripts/{ticker}_backend_run_valuation.mjs
scripts/{ticker}_backend_validation.mjs
```

Only add backend files when the ticker actually needs backend support now. If deferred, document the gap.

## 5. Registry And Platform Integration

Required:

- Add the module import to `src/stocks/registry.ts`.
- Add the ticker key to `stockRegistry`.
- Ensure the module type-checks against `StockModule`.
- Ensure the module appears through existing platform navigation.
- Do not bypass `src/stocks/registry.ts`.
- Do not create isolated stock pages or ticker-specific app routes.

Recommended:

- Use `createStockModule`, `createStockValuationConfig`, or `createResearchPriceMetadata` from `src/stocks/moduleAssembly.ts` where useful.
- Keep Home/Sidebar metadata compatible with the existing registry and metadata flow.

## 6. Shared Components And Utilities Checklist

Prefer shared platform pieces before creating ticker-specific equivalents:

- `InteractiveValuationDashboard`
- `ValuationAssumptionsPanel`
- `ValuationSensitivity`
- `EPSBridgeChart`
- `FCFBridgeChart`
- `PeerReadThrough`
- `WaterfallChart`
- `src/components/shared/useValuationAssumptionState.ts`
- `src/utils/financialMath.ts`
- `src/utils/valuation.ts`
- `src/utils/validation.ts`
- `src/stocks/moduleAssembly.ts`

Ticker-specific UI is allowed only when the business question cannot be expressed cleanly with shared components.

## 7. Valuation Output Checklist

`calculateValuation` should return platform-shaped outputs where possible:

- current fair value
- Bear/Base/Bull fair values
- 3Y target price
- expected shareholder CAGR
- method cards
- expected return bridge
- sensitivity tables
- validation warnings
- selected/recommended fair value where relevant
- source confidence for major methods where relevant

Avoid one-off valuation result schemas. If a ticker needs a special output, add it as an extension to the existing `ValuationResult` shape rather than replacing the platform shape.

## 8. Data Quality And Provenance Checklist

Each important field should be labeled as one of:

- `Actual`
- `Assumption`
- `Derived`
- `Placeholder`

For valuation assumptions and reported metrics, preserve where supported:

- `source`
- `unit`
- `periodicity`
- `asOfDate`
- `provenance`

Rules:

- Do not invent current prices, consensus, peer multiples, WACC, market caps, FX rates, or financial actuals.
- Missing data should be `null`, `Placeholder`, or a documented source gap.
- Derived outputs must be reproducible from visible inputs.
- Forecast assumptions must be separate from reported actuals.
- Research-only scores must not directly change valuation unless explicitly mapped to forecast assumptions.

## 9. Modeling Discipline

Required:

- Keep business-specific logic in `src/stocks/{ticker}`.
- Keep reusable math in `src/utils`.
- Explain hardcoded assumptions or move them into `valuationConfig`.
- Avoid double counting between full-company valuation methods and incremental uplift values.
- Keep assumptions editable through shared valuation UI where possible.
- Add validation warnings when data quality, source confidence, or model reliability is weak.

Before editing formulas, state:

- what model output changes
- why existing shared valuation methods are insufficient
- what validation catches the change

## 10. Backend And Data Workflow Compatibility

Every new ticker must explicitly declare backend status:

| Question | Answer |
| --- | --- |
| Backend DB exists now? | `yes / no / deferred` |
| DB path if yes | `data/local/{ticker}/backend/{ticker}_research.sqlite` |
| Official fetch command? | `{ticker}:fetch-official` or deferred |
| Price import command? | `{ticker}:backend:import-prices` or deferred |
| Valuation backfill command? | `{ticker}:backend:backfill-valuations` or deferred |
| Backend validation command? | `{ticker}:backend:validate` or deferred |
| Transcript workflow? | fetch / parse / QA pairs / deferred |
| Source freshness tracked? | yes / no / unknown |
| Manual rows remaining? | list source gaps |

If backend support exists, align with the shared task vocabulary in `scripts/backend_manifest.mjs`:

- `seed`
- `import-prices`
- `backfill-valuations`
- `run-valuation`
- `validate`
- `fetch-official`
- `fetch-transcripts`
- `build-dataset`
- `build-metrics`
- `build-qa-pairs`
- `model-validate`

The broad `data:update` workflow runs only:

```text
import-prices -> backfill-valuations -> validate
```

Do not assume seed, official fetch, transcript fetch, metric build, or QA build will run in broad workflows.

## 11. Validation And Acceptance

Minimum non-destructive checks:

```bash
npm run stocks:contract:validate
npm run typecheck
npm run build
```

If backend support exists:

```bash
npm run data:backend:list
npm run data:workflow -- --workflow update --ticker <ticker> --dry-run
npm run data:validate:ticker -- --ticker <ticker>
```

If ticker-specific scripts exist, run the narrow script names too:

```bash
npm run <ticker>:backend:validate
npm run <ticker>:model-validate
```

Acceptance requires:

- source gaps documented
- operator impact documented
- frontend still renders if backend is offline
- valuation outputs are finite where data exists
- backend historical runs avoid future leakage when present
- no standalone pages or registry bypasses
