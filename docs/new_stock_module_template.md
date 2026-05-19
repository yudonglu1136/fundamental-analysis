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

## 3. Required Buy-Side Research Depth

New stock modules must be useful investment research products, not generic dashboards. Before coding, inspect available buy-side skills and state which were used. At minimum, apply the equivalent of:

- initiation research: business model, KPI tree, segment economics, moat, cycle position, catalysts
- valuation triangulation: DCF/FCF yield/multiple/SOTP logic as appropriate
- model audit: unit checks, scenario logic, double-counting checks, price-anchor checks
- risk red-team: kill criteria, disconfirming evidence, monitoring triggers
- earnings-call or filing review when transcripts/filings are part of the source set

Every module should include:

- a company-specific analytical framework, not a generic sector template
- 5-10 core investor questions mapped to metrics, charts, assumptions, risks, or valuation sensitivity
- source-backed actuals separated from research assumptions and placeholders
- explicit "what would change my mind" kill criteria
- monitoring KPIs for the next earnings cycle
- source gaps and manual rows surfaced visibly

For a module to be considered complete, its dashboard should include several ticker-specific insight sections. Examples:

- AI infra: supply constraints, customer concentration, capacity/capex, gross-margin durability, accelerator/platform roadmap exposure
- Software: ARR/NRR, seat expansion, usage pricing, agent/AI monetization, SBC and FCF conversion
- Biopharma: product durability, LOE/patent cliffs, pipeline probability, regulatory milestones, concentration risk
- Energy/power: generation mix, power-price exposure, contracted vs merchant economics, capex, regulation, cash conversion

Do not let research-only scores directly drive valuation unless the score is explicitly mapped into a forecast assumption and disclosed.

## 4. Historical Valuation Requirement

Every new module must include a historical valuation plan. Backend-persisted history is preferred; static local research history is acceptable only as an interim fallback and must be labeled clearly.

Study these first:

- `docs/stock-frontend-backtest-standard.md`
- `src/stocks/msft/dashboard.tsx` (`MsftHistoricalValuationPanel`, `MsftBacktestPanel`)
- `src/stocks/aapl/dashboard.tsx` for backend historical valuation UX
- `src/stocks/ma/dashboard.tsx` / `src/stocks/ceg/dashboard.tsx` for newer backend-backed panels

Historical valuation minimum:

- roughly eight years of reporting events where feasible
- for quarterly reporters, target at least 32 event anchors
- Base valuation run or local fair-value snapshot for every event
- event date, fiscal period, as-of price, fair value, gap percent, method label, source status, warnings
- fair values must vary by event and reflect only information available at that event date
- old quarters must not use current margins, current TAM, current multiples, current risks, or current price anchors
- do not create Bear/Base/Bull by scalar multipliers; scenarios need distinct assumptions or method outputs

As-of price standard:

- backend modules should use `daily_price_bars.adjustedClose` from the nearest prior trading day
- static fallback rows must state the price source and warn when price data is proxy/manual
- if SPY backtest is in scope, import target ticker and SPY daily bars

Historical valuation UI should follow the MSFT/AAPL pattern:

- API status badge or local fallback badge
- saved run/event count
- selected fair value
- selected upside/downside
- horizontal event selector
- visible-window controls: `8Q`, `12Q`, `16Q`, `24Q`, `All` where applicable
- chart sorted oldest to newest
- gray bar = as-of price
- blue bar = fair value
- tooltip with event date, fiscal period, as-of price, fair value, gap percent
- summary cards for visible window, latest gap, average gap

If historical valuation is deferred, the final answer must say exactly why and what files/scripts are needed next. Do not call the module production-ready without historical valuation coverage.

## 5. Required Platform Contract

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

## 6. Required File Structure

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

## 7. Registry And Platform Integration

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

## 8. Shared Components And Utilities Checklist

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

## 9. Valuation Output Checklist

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

## 10. Data Quality And Provenance Checklist

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

## 11. Modeling Discipline

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

## 12. Backend And Data Workflow Compatibility

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

## 13. Validation And Acceptance

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

## 14. Frontend And Backend Push / Deployment Handoff

The final answer after adding a module must include a clear workflow for what was pushed and what remains to deploy.

Frontend code workflow:

```bash
npm run stocks:contract:validate
npm run typecheck
npm run build
git status --short
git add src/stocks/{ticker} src/stocks/registry.ts package.json scripts docs
git commit -m "Add {TICKER} research module"
git push origin HEAD:trunk
```

State whether the code was actually pushed. If pushed to `trunk`, state that Vercel should deploy from GitHub and that the operator should inspect the Vercel deployment log.

Backend/data workflow when backend support exists:

```bash
npm run {ticker}:backend:seed
npm run {ticker}:backend:import-prices
npm run {ticker}:backend:backfill-valuations
npm run {ticker}:backend:validate
npm run data:workflow -- --workflow update --ticker {ticker} --dry-run
```

Cloud backend handoff for the current Lightsail-style setup:

```bash
rsync -az data/local/{ticker}/ ubuntu@<backend-host>:~/fundamental-analysis/data/local/{ticker}/
ssh ubuntu@<backend-host> "cd ~/fundamental-analysis && git pull origin trunk && npm ci && pm2 restart fundamental-api && curl -s https://api.thesisforge.tech/api/health"
```

Never commit `.env`, Supabase secrets, private keys, OAuth client secrets, or bulky `data/local` raw downloads. If backend support is deferred, say "No AWS backend push required for this module yet" and list the backend files needed to make it deployable.

Acceptance requires:

- source gaps documented
- operator impact documented
- frontend still renders if backend is offline
- valuation outputs are finite where data exists
- backend historical runs avoid future leakage when present
- no standalone pages or registry bypasses
