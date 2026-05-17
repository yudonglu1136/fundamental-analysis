# LSEG Event Snapshot Valuation Semantics

LSEG does not provide full quarterly financial statements. Trading updates are
modeled as disclosure snapshots rather than audited actual periods.

The valuation model separates:

- `auditedActualBase`: the latest full-year actual available as of the event.
- `eventVisibleRunRate`: an annualized trading-update or interim-results
  run-rate visible at the event date.
- `guidanceAnchor`: management guidance visible at that event.
- `forecastStartYear`: the fiscal year represented by the first forecast row.
- `isAnnualizedRunRate`: whether the event row is a run-rate estimate.
- `isSameYearForecastAnchor`: whether that run-rate already represents the
  current fiscal-year forecast anchor.

Core rule:

If an event row is an annualized same-year forecast anchor, DCF year one uses
the run-rate directly. Same-year growth is suppressed and growth resumes in the
next forecast year.

For Q1 2026 this means:

- FY2025 audited revenue base: GBP 8.986bn
- Q1 2026 event-visible run-rate revenue: GBP 9.615bn
- DCF FY2026E revenue after the fix: GBP 9.615bn
- Growth resumes from FY2027E

This prevents the prior double compounding pattern where the model used the Q1
2026 run-rate and then applied another same-year growth step.

Partial-year/trading-update balance-sheet policy:

- Use explicitly disclosed net debt, share count and run-rate operating metrics.
- Carry forward undisclosed lease liabilities, pension surplus/deficit,
  minority interest, finance cost and similar enterprise-to-equity bridge items
  from the latest full-year actual.
- Do not turn transcript or guidance commentary into official actual data.
