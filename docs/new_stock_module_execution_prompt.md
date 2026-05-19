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
- historical valuation / backtest references:
  - docs/stock-frontend-backtest-standard.md
  - src/stocks/msft/dashboard.tsx
  - src/stocks/aapl/dashboard.tsx
  - src/stocks/ma/dashboard.tsx

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
- Use bs-earnings-call-analysis and bs-filing-qoe-review when earnings calls, filings, cash conversion, accounting quality, or management guidance are core to the module.

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
6. historical valuation decision:
   - backend-persisted valuation runs now or static local fallback
   - target event coverage
   - daily price source and SPY benchmark source
   - no-future-leakage controls
7. minimal implementation plan

Implementation requirements:
1. Frontend module contract
   - Create or update src/stocks/[ticker]/config.ts.
   - Create or update src/stocks/[ticker]/dashboard.tsx.
   - Create or update src/stocks/[ticker]/calculations.ts.
   - Create or update src/stocks/[ticker]/data.ts or src/stocks/[ticker]/data/*.
   - Expose data, calculateSummary, calculateValuation, Dashboard, valuationConfig.
   - Register the module in src/stocks/registry.ts.
   - Add dashboard tabs that are specific to the company and archetype; do not leave a generic overview-only module.

2. Shared UI and utility compatibility
   - Prefer InteractiveValuationDashboard for assumption controls.
   - Prefer shared valuation/financial math utilities where applicable.
   - Keep ticker-specific business logic inside src/stocks/[ticker].
   - Do not introduce a one-off valuation schema if ValuationResult can express the output.

3. Deep research requirements
   - Build a company-specific analytical framework, not a generic sector dashboard.
   - Add 5-10 core investor questions and map each question to a chart, KPI, assumption, warning, or risk trigger.
   - Add ticker-specific insight panels for the real business drivers.
   - Include a variant-perception or market-debate section where appropriate.
   - Include a risk red-team section with kill criteria and disconfirming evidence.
   - Include a monitoring plan for the next reporting cycle.
   - Explicitly separate facts, assumptions, derived metrics, placeholders, and research-only scores.

4. Valuation output requirements
   - Return Bear/Base/Bull fair values where possible.
   - Include current price only if sourced or clearly marked Placeholder.
   - Include 3Y target price and expected shareholder CAGR where possible.
   - Include method cards, expected return bridge, sensitivity tables, and validation warnings.
   - Avoid double counting full-company valuation methods and incremental uplift values.
   - Do not anchor fair value to current price or current trading multiple without an explicit independent method bridge.
   - Do not use scalar multipliers as the only difference between Bear/Base/Bull cases.

5. Historical valuation requirements
   - Build a historical valuation dataset or backend historical valuation workflow.
   - Prefer MSFT-style backend historical valuations and backtest panels when backend support is in scope.
   - If backend is deferred, include local historical valuation rows as a clearly labeled fallback.
   - Target roughly eight years of reporting-event history where feasible.
   - For quarterly reporters, target at least 32 historical event anchors.
   - For each event include event date, fiscal period, as-of price, fair value, gap percent, method label, source status, and warnings.
   - Historical fair values must vary by event.
   - Use only information available as of the event date; do not leak current margins, TAM, risk framing, or current price into old quarters.
   - Use nearest prior trading day from daily price bars when backend daily prices exist.
   - Add a visible valuation tab panel with oldest-to-newest price vs fair-value chart and event selector.

6. Data quality and provenance
   - Distinguish facts, assumptions, derived outputs, and placeholders.
   - Preserve source, unit, periodicity, asOfDate, and provenance where supported.
   - Missing actuals must be null or documented source gaps.
   - Research-only scores cannot directly affect valuation unless explicitly mapped to forecast assumptions.

7. Backend/data compatibility
   - If backend support is in scope, use per-ticker SQLite under data/local/[ticker]/backend/[ticker]_research.sqlite.
   - Add modules/[ticker] backend files only if needed now.
   - Add ticker scripts only for commands that actually work.
   - Keep task names compatible with scripts/backend_manifest.mjs.
   - Ensure broad data:update can eventually run import-prices -> backfill-valuations -> validate.
   - If backend is deferred, document why and what will be needed later.

8. Offline behavior
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

Publication / deployment workflow:
- If code changes are complete, push frontend/source code to GitHub trunk unless the user asked not to:
  - git status --short
  - git add only the intended module, registry, scripts, docs, and package changes
  - git commit -m "Add [TICKER] research module"
  - git push origin HEAD:trunk
- Tell the user that Vercel should deploy the frontend from trunk and that they should check Vercel logs.
- If backend support exists, explain the AWS/Lightsail data deploy path:
  - run backend seed/import-prices/backfill/validate locally
  - copy data/local/[ticker] to the backend host with rsync
  - ssh to the backend host, pull trunk, install if needed, restart pm2, and health-check the API
- If backend support is deferred, explicitly say no AWS backend push was done and list the missing backend files/scripts.

Final report:
1. files added
2. files changed
3. module archetype and reused patterns
4. registry/platform integration
5. data sources and source gaps
6. valuation methods and assumptions
7. historical valuation coverage and no-future-leakage protections
8. backend/data workflow status
9. frontend push / Vercel status
10. backend push / AWS status
11. validation results
12. remaining limitations and recommended next improvements
```

## Notes For Prompt Users

- Keep `[ticker]` lowercase in paths and script names unless the repo already has a different convention.
- Keep registry keys in the display ticker format, for example `MSFT`, `TSM`, or `DGE.L`.
- If the stock has unusual accounting, listing currency, ADR conversion, or fiscal calendar treatment, require the engineer to document it before coding.
- If official data cannot be fetched during implementation, create source slots and validation warnings rather than filling invented numbers.
