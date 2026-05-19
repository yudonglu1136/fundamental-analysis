# New Stock Acceptance Checklist

Use this before merging or handing off a newly added stock module.

## 1. Contract And Registry

- [ ] The module exports a `StockModule`-compatible object.
- [ ] The module includes `data`.
- [ ] The module includes `calculateSummary`.
- [ ] The module includes `calculateValuation`.
- [ ] The module includes `Dashboard`.
- [ ] The module includes `valuationConfig`.
- [ ] The module is imported in `src/stocks/registry.ts`.
- [ ] The module is added to `stockRegistry` with the intended display ticker.
- [ ] No standalone stock page or alternate route was created.

## 2. Shared Platform Fit

- [ ] Dashboard consumes `scenario`, `period`, and `dataSourceType` where relevant.
- [ ] Shared components are used where practical:
  - [ ] `InteractiveValuationDashboard`
  - [ ] `ValuationAssumptionsPanel` / `ValuationSensitivity`
  - [ ] bridge charts / peer / waterfall components where useful
- [ ] Shared utilities are used for common math and validation where practical.
- [ ] Business-specific logic remains inside `src/stocks/{ticker}`.

## 3. Research Depth

- [ ] The module is company-specific, not a generic sector dashboard.
- [ ] Buy-side skills or equivalent frameworks were checked and disclosed.
- [ ] Core investor questions are listed and mapped to metrics, charts, assumptions, warnings, or risk triggers.
- [ ] The dashboard includes multiple ticker-specific research panels.
- [ ] Variant perception / market debate is represented where relevant.
- [ ] Risk red-team, kill criteria, and disconfirming evidence are included.
- [ ] Monitoring KPIs for the next reporting cycle are included.
- [ ] Source gaps and manual/proxy rows are visible rather than hidden.

## 4. Historical Valuation And Backtest

- [ ] Historical valuation data exists as backend persisted runs or clearly labeled local fallback rows.
- [ ] Roughly eight years of reporting-event history is included where feasible.
- [ ] Quarterly reporters target at least 32 event anchors, or the shortfall is documented.
- [ ] Each event has event date, fiscal period, as-of price, fair value, gap percent, method label, source status, and warnings.
- [ ] Historical fair values vary by event.
- [ ] Historical valuations use only information available as of each event date.
- [ ] Current margins, current TAM, current risks, current multiples, and current price are not backfilled into old quarters.
- [ ] Bear/Base/Bull cases are not just scalar multipliers.
- [ ] As-of price comes from nearest prior daily price bar when backend prices exist.
- [ ] Historical valuation UI follows the MSFT/AAPL pattern: event selector, visible window controls, gray price bars, blue fair-value bars, tooltip, summary cards.
- [ ] Stock-vs-SPY backtest is included when backend daily prices are available, or explicitly deferred.

## 5. Valuation Output

- [ ] Bear/Base/Bull outputs exist where possible.
- [ ] Current price is sourced or clearly marked as `Placeholder`.
- [ ] 3Y target price exists where possible.
- [ ] Expected shareholder CAGR exists where possible.
- [ ] Method cards exist.
- [ ] Expected return bridge exists.
- [ ] Sensitivity tables exist.
- [ ] Validation warnings exist for source/model reliability gaps.
- [ ] Full-company and incremental methods are not double-counted.
- [ ] Fair value is not anchored to current price or current trading multiple without an independent bridge.

## 6. Data Quality And Provenance

- [ ] Reported actuals are separate from assumptions.
- [ ] Derived outputs are reproducible from visible inputs.
- [ ] Placeholders are explicitly labeled.
- [ ] Important inputs include source/provenance where supported.
- [ ] Units, periodicity, and as-of dates are documented where supported.
- [ ] Missing data is not invented.
- [ ] Source gaps are documented in the module or validation output.

## 7. Backend And Operator Compatibility

- [ ] Backend status is documented: supported now or deferred.
- [ ] If backend exists, DB path follows `data/local/{ticker}/backend/{ticker}_research.sqlite`.
- [ ] If backend scripts exist, names match the shared task vocabulary.
- [ ] `data:update` compatibility is considered: `import-prices -> backfill-valuations -> validate`.
- [ ] Official fetch/transcript/metric workflows are either implemented or explicitly deferred.
- [ ] Backend panels render a clear offline state if API is unavailable.
- [ ] Operator impact is documented in the final handoff.

## 8. Required Checks

Run:

```bash
npm run stocks:contract:validate
npm run typecheck
npm run build
```

If backend support exists, also run:

```bash
npm run data:backend:list
npm run data:workflow -- --workflow update --ticker <ticker> --dry-run
npm run data:validate:ticker -- --ticker <ticker>
```

Run ticker-specific checks if present:

```bash
npm run <ticker>:backend:validate
npm run <ticker>:model-validate
```

## 9. Push / Deployment Handoff

- [ ] Final answer says whether code was pushed to GitHub `trunk`.
- [ ] Final answer says whether Vercel frontend deployment should be checked.
- [ ] If backend exists, final answer says whether `data/local/{ticker}` was copied to AWS/Lightsail.
- [ ] If backend exists, final answer includes backend validation, pm2 restart, and API health-check status.
- [ ] If backend is deferred, final answer says no AWS backend push was required and lists missing backend files/scripts.
- [ ] Final answer does not imply production backend data exists unless it was actually seeded, copied, validated, and reachable.

## 10. Handoff Summary

The final handoff should include:

- [ ] files added and changed
- [ ] archetype and reusable patterns chosen
- [ ] skills checked and used
- [ ] valuation methods and core assumptions
- [ ] historical valuation coverage
- [ ] no-future-leakage protections
- [ ] source coverage and source gaps
- [ ] backend/data workflow status
- [ ] frontend push / Vercel status
- [ ] backend push / AWS status
- [ ] validation command results
- [ ] remaining limitations
- [ ] recommended next improvements
