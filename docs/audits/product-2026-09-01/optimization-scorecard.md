# Guru Intelligence 82/100 Optimization Scorecard

Started: 2026-09-01
Baseline: 64/100
Target: at least 82/100
Production deployment: out of scope until explicitly authorized

## Stop conditions

The optimization goal is complete only when:

1. Every P0 below is closed with automated regression coverage.
2. The selected high-value P1 items are closed or explicitly documented as blocked by an external dependency.
3. Flutter, server, Ontology, i18n, performance and production build gates pass.
4. Desktop 1440, tablet 1024/768 and mobile 390 screenshots show no blocking overflow or misleading state.
5. A before/after report quantifies test coverage, payload/latency impact and remaining risk.

## Work items

| Priority | Item | Baseline | Exit criterion | Status |
| --- | --- | --- | --- | --- |
| P0 | Truth Layer | Header can hard-code live/today and reuse Guru freshness in other modules | Module-specific as-of/source/state; missing/stale/sample cannot render as live | Complete |
| P0 | Guru 13F semantics | 13F table value labeled AUM; options not separated | Reported table/common-long/options fields and precise UI labels | Complete |
| P0 | Guru backtest | filing-date close execution; return/attribution engines diverge | Acceptance-aware next-session execution and one reconciled return engine | Complete; authoritative archive coverage still gates publication |
| P0 | Valuation audit semantics | Input lineage pass shown as PIT audited/model confidence | Four explicit layers: lineage, release, economic validation, market calibration | Complete |
| P0 | Portfolio safety | Sample resembles real account; destructive disconnect has no confirmation | Persistent sample treatment and confirmed/recoverable disconnect | Complete |
| P1 | Responsive/accessibility | 768px RenderFlex overflow; small targets; chart semantics gaps | 390/768/1024/1440 pass, 44px critical targets and chart summaries | Complete for audited critical paths; not a full WCAG certification |
| P1 | Ontology resilience | One Promise.all can block the full application | View-level loading/error/retry and valid release artifact guard | Complete |
| P1 | Navigation/filter consistency | replaceState only, fake controls, stale selection/detail | Back/forward works; controls are real or removed; selection follows filters | Engineering complete; native history-button acceptance remains pending |
| P1 | Auth/refresh recovery | Failed init can stick; refresh can hide content/errors | In-page retry and non-blocking refresh/error state | Complete |
| P1 | Health/performance release gate | Health and benchmark artifacts can produce false green | Fail-closed health and input-identified 60-sample/3-run gate | Complete locally; baseline source archive and AWS/Vercel telemetry remain pending |

## Quantitative target

| Dimension | Baseline | Target | Final engineering audit |
| --- | ---: | ---: | ---: |
| Usability | 63 | 85 | 86 |
| Ease of use | 66 | 82 | 84 |
| Professional value | 68 | 88 | 87 |
| Reliability / operating maturity | 53 | 80 | 80 |
| Weighted overall | 64 | >=82 | **84** |

## Decision KPIs

The 82-point score is a summary, not the release decision. Release readiness is
decided by three operational KPIs and two guardrails that can be reproduced from
tests and benchmark artifacts.

| KPI | Exact definition | Baseline | Exit target | Evidence source |
| --- | --- | ---: | ---: | --- |
| Decision-safety pass rate | Passed critical truth/method/safety scenarios / all critical scenarios. The denominator covers module freshness, sample-vs-live, 13F ownership/options, next-session execution, return-attribution reconciliation, valuation audit layers and destructive portfolio actions. | 0/7 formally gated | 7/7 and no known P0 misstatement | Node/Flutter golden tests plus API fixtures |
| Core-workflow resilient completion | Viewport/state combinations that complete without overflow, stale-detail leakage or unrecoverable full-screen failure / all required combinations. Required viewports: 390, 768, 1024 and 1440; required failure states: auth, refresh and one failed Ontology shard. | 390 usable; 768 blocking overflow; Ontology/auth recovery absent | 100% of required combinations | Flutter widget tests, browser screenshots and console/error log |
| Release-confidence gate | One Boolean AND across server, Flutter, Ontology, proxy, i18n, PIT semantics, production build, 3-run API benchmark input consistency and health fail-closed tests. | Partial; benchmark and health could false-green | 100% green from one documented command sequence | CI/local command receipts and machine-readable gate JSON |

Driver metrics:

- `truth_state_coverage`: core modules exposing their own `asOf`, source and
  `live/cached/sample/stale/error` state / all core modules; target `5/5`.
- `reconciled_backtest_quarters`: quarters where headline NAV movement equals
  shared-engine attribution within the declared tolerance / tested quarters;
  target `100%`.
- `critical_target_size_coverage`: tested critical actions at least 44 CSS px /
  tested critical actions; target `100%` at 390/768/1024/1440.
- `recoverable_failure_coverage`: auth, refresh and Ontology partial-failure
  fixtures with a working in-page retry / three required fixtures; target `3/3`.

Guardrails:

- No required API route may regress by more than 5% in three-run median hot
  concurrent p95 on identical database SHA-256 inputs; response semantics must
  remain identical across identity and compressed encodings.
- Release `main.dart.js` gzip size and total `dist/` bytes may not regress more
  than 5% without an explicit, documented value trade-off; bilingual and auth
  production configuration gates must stay green.

Target confidence is high for engineering and decision-safety gates because the
inputs are repository-controlled. The 82/100 expert score remains provisional
until real target users complete the five core tasks; no synthetic test is a
substitute for the 8-user, >=90% completion, <=45-second evidence-finding and
SUS >=80 validation target in the audit.
