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

## 3. Valuation Output

- [ ] Bear/Base/Bull outputs exist where possible.
- [ ] Current price is sourced or clearly marked as `Placeholder`.
- [ ] 3Y target price exists where possible.
- [ ] Expected shareholder CAGR exists where possible.
- [ ] Method cards exist.
- [ ] Expected return bridge exists.
- [ ] Sensitivity tables exist.
- [ ] Validation warnings exist for source/model reliability gaps.
- [ ] Full-company and incremental methods are not double-counted.

## 4. Data Quality And Provenance

- [ ] Reported actuals are separate from assumptions.
- [ ] Derived outputs are reproducible from visible inputs.
- [ ] Placeholders are explicitly labeled.
- [ ] Important inputs include source/provenance where supported.
- [ ] Units, periodicity, and as-of dates are documented where supported.
- [ ] Missing data is not invented.
- [ ] Source gaps are documented in the module or validation output.

## 5. Backend And Operator Compatibility

- [ ] Backend status is documented: supported now or deferred.
- [ ] If backend exists, DB path follows `data/local/{ticker}/backend/{ticker}_research.sqlite`.
- [ ] If backend scripts exist, names match the shared task vocabulary.
- [ ] `data:update` compatibility is considered: `import-prices -> backfill-valuations -> validate`.
- [ ] Official fetch/transcript/metric workflows are either implemented or explicitly deferred.
- [ ] Backend panels render a clear offline state if API is unavailable.
- [ ] Operator impact is documented in the final handoff.

## 6. Required Checks

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

## 7. Handoff Summary

The final handoff should include:

- [ ] files added and changed
- [ ] archetype and reusable patterns chosen
- [ ] valuation methods and core assumptions
- [ ] source coverage and source gaps
- [ ] backend/data workflow status
- [ ] validation command results
- [ ] remaining limitations
- [ ] recommended next improvements
