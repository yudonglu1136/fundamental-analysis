# New Stock Module Execution Prompt

Copy this prompt when asking an engineer-agent to add a future stock module. Fill in the bracketed fields.

```text
You are engineer-agent-fundamental.

Repository:
fundamental-analysis

Task:
Add a new platform-compatible stock module for [TICKER] / [COMPANY].

Hard scope:
- [TICKER] only.
- Do not refactor unrelated stock modules.
- Do not create standalone pages or alternate routes.
- Do not bypass src/stocks/registry.ts.
- Do not invent market data, consensus estimates, peer multiples, WACC, current prices, or financial actuals.
- UI text must be English unless explicitly requested otherwise.
- Preserve the stock module contract and shared valuation output shape.

Read first:
- AGENTS.md
- docs/new_stock_module_template.md
- src/stocks/types.ts
- src/stocks/registry.ts
- src/stocks/moduleAssembly.ts
- docs/platform_operations_guide.md
- docs/data_operator_runbook.md
- docs/backend_consolidation_phase5.md
- scripts/backend_manifest.mjs
- scripts/backend_runner.mjs
- scripts/data_workflow.mjs
- .agents/skills/bs-platform-adapter/SKILL.md

Also inspect:
- relevant shared UI components:
  - InteractiveValuationDashboard
  - ValuationAssumptionsPanel
  - ValuationSensitivity
  - EPSBridgeChart
  - FCFBridgeChart
  - PeerReadThrough
  - WaterfallChart
  - useValuationAssumptionState
- relevant shared utilities:
  - src/utils/financialMath.ts
  - src/utils/valuation.ts
  - src/utils/validation.ts
- closest existing stock modules by archetype:
  - [CLOSEST_MODULE_1]
  - [CLOSEST_MODULE_2]

Company intake:
- Ticker: [TICKER]
- Company name: [COMPANY]
- Sector: [SECTOR]
- Currency: [CURRENCY]
- Exchange/listing: [EXCHANGE]
- Module archetype: [standard compounder / platform infrastructure / biopharma / defense / AI infra / software / regulated exchange / other]
- Primary investor questions:
  1. [QUESTION_1]
  2. [QUESTION_2]
  3. [QUESTION_3]
- Required source set:
  - [official filings/releases]
  - [IR decks]
  - [transcripts]
  - [market prices]
  - [peers]

Use buy-side skills appropriately:
- Use bs-platform-adapter for platform contract, registry, shared UI, shared utility, and backend compatibility.
- Use bs-initiation-research to structure the business model, segment/KPI map, thesis questions, and risks.
- Use bs-valuation-triangulation to choose valuation methods and scenario architecture.
- Use bs-model-audit before finalizing assumptions, formulas, output shape, and validation warnings.
- Use bs-risk-red-team or bs-position-monitor if the module needs a risk register, disconfirming evidence, or monitoring triggers.

Before editing, report:
1. files inspected
2. ticker archetype and closest reusable module patterns
3. compatibility gaps versus StockModule / ValuationResult / shared UI expectations
4. source gaps and fields that must remain Placeholder or Assumption
5. backend/data workflow decision:
   - backend DB now or deferred
   - supported commands now
   - deferred commands
   - manual data remaining
6. minimal implementation plan

Implementation requirements:
1. Frontend module contract
   - Create or update src/stocks/[ticker]/config.ts.
   - Create or update src/stocks/[ticker]/dashboard.tsx.
   - Create or update src/stocks/[ticker]/calculations.ts.
   - Create or update src/stocks/[ticker]/data.ts or src/stocks/[ticker]/data/*.
   - Expose data, calculateSummary, calculateValuation, Dashboard, valuationConfig.
   - Register the module in src/stocks/registry.ts.

2. Shared UI and utility compatibility
   - Prefer InteractiveValuationDashboard for assumption controls.
   - Prefer shared valuation/financial math utilities where applicable.
   - Keep ticker-specific business logic inside src/stocks/[ticker].
   - Do not introduce a one-off valuation schema if ValuationResult can express the output.

3. Valuation output requirements
   - Return Bear/Base/Bull fair values where possible.
   - Include current price only if sourced or clearly marked Placeholder.
   - Include 3Y target price and expected shareholder CAGR where possible.
   - Include method cards, expected return bridge, sensitivity tables, and validation warnings.
   - Avoid double counting full-company valuation methods and incremental uplift values.

4. Data quality and provenance
   - Distinguish facts, assumptions, derived outputs, and placeholders.
   - Preserve source, unit, periodicity, asOfDate, and provenance where supported.
   - Missing actuals must be null or documented source gaps.
   - Research-only scores cannot directly affect valuation unless explicitly mapped to forecast assumptions.

5. Backend/data compatibility
   - If backend support is in scope, use per-ticker SQLite under data/local/[ticker]/backend/[ticker]_research.sqlite.
   - Add modules/[ticker] backend files only if needed now.
   - Add ticker scripts only for commands that actually work.
   - Keep task names compatible with scripts/backend_manifest.mjs.
   - Ensure broad data:update can eventually run import-prices -> backfill-valuations -> validate.
   - If backend is deferred, document why and what will be needed later.

6. Offline behavior
   - The static dashboard must render without backend/API.
   - Backend panels must show a clear API offline/source gap warning rather than crashing.

Validation:
Run non-destructive platform checks:
- npm run stocks:contract:validate
- npm run typecheck
- npm run build

If backend support exists, also run:
- npm run data:backend:list
- npm run data:workflow -- --workflow update --ticker [ticker] --dry-run
- npm run data:validate:ticker -- --ticker [ticker]
- npm run [ticker]:backend:validate

Final report:
1. files added
2. files changed
3. module archetype and reused patterns
4. registry/platform integration
5. data sources and source gaps
6. valuation methods and assumptions
7. backend/data workflow status
8. validation results
9. remaining limitations and recommended next improvements
```

## Notes For Prompt Users

- Keep `[ticker]` lowercase in paths and script names unless the repo already has a different convention.
- Keep registry keys in the display ticker format, for example `MSFT`, `TSM`, or `DGE.L`.
- If the stock has unusual accounting, listing currency, ADR conversion, or fiscal calendar treatment, require the engineer to document it before coding.
- If official data cannot be fetched during implementation, create source slots and validation warnings rather than filling invented numbers.
