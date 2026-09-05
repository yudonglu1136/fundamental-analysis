# Guru stock research — design QA

Date: 2026-09-05

final result: passed

This result applies to the locally implemented stock drawer, inline research entry and shared branding components. It is not production-release approval, a full AWS-universe audit, or a certification that the existing terminal matches the concept pixel for pixel.

## Visual truth and evidence

- Selected option 1: `/Users/yudonglu/.codex/generated_images/01a053a9-c799-71d2-aa96-f1299e48de42/exec-2320e897-ffe5-4fc5-ba2b-21af0ecb08de.png`.
- Final English component: `output/stock-research-qa-2026-09-05/desktop-en-final.png`.
- Final Chinese component: `output/stock-research-qa-2026-09-05/desktop-zh-final.png`.
- Expanded research: `output/stock-research-qa-2026-09-05/full-research-expanded.png`.
- Return/context retention: `output/stock-research-qa-2026-09-05/context-retained.png`.
- Actual Guru entry with deliberately unavailable local valuation: `output/stock-research-qa-2026-09-05/guru-missing-coverage-final.png`.
- Mobile component capture: `output/stock-research-qa-2026-09-05/mobile-en.png` (before the fixed-footer refinement). Final desktop/mobile widget coverage uses both languages at 1280×720 and 390×844.

The selected concept and the final English capture were opened together in the same comparison input. The concept is 1487×1058; the final browser captures are 1280×720 at 1:1 density. These are different content/viewport states: the concept shows illustrative Ackman/AMZN data, while the component preview uses the already-published ISRG case and the full terminal uses its partial local Guru fixture. The QA therefore compares the drawer region's hierarchy, tokens and affordances, not whole-frame pixel geometry or financial numbers. No mock financial numbers were copied into production. The readable full-resolution drawer also provided the focused comparison of its logo, metrics, chart labels and footer; a separate upscaled crop was unnecessary.

## Comparison history and findings

1. **Resolved P2 — primary action could fall below the fold.** The first desktop capture (`desktop-en.png`) showed the chart but required scrolling for full research and return controls. Moved both controls into a fixed footer outside the content scroll area. The final English/Chinese captures and expanded-research capture show the footer still reachable at 720px height.
2. **Resolved P2 — generic provider imagery was not issuer branding.** ASIC, HNGE, SLDE and VOYG returned the same generic flag image. Rejected that fingerprint and sourced issuer-specific imagery. The preview's representative logo strip was visually checked; all 1,548 local files separately passed PNG, size and hash validation. This is not a manual identity audit of every provider image.
3. No remaining actionable P0/P1/P2 finding in the changed, locally exercised components. Unverified release scope is listed below rather than treated as passing evidence.

## Required fidelity surfaces

| Surface | Review and disposition |
| --- | --- |
| Fonts / typography | Retains the existing Flutter terminal typography rather than adding a competing font. Issuer/ticker hierarchy is clear, figures use stronger weight, status and dates are subordinate. English and Chinese labels were rendered; the tested mobile size produced no overflow exceptions. |
| Spacing / layout | Right-hand 580px sheet preserves the underlying Guru screen; smaller screens use full width. The existing manager and module layout is intentionally retained instead of rebuilding the illustrative mock's holdings table. Fixed footer resolves the primary fold issue. |
| Colors / tokens | Uses existing Palette surfaces, borders, teal fair-value line, amber quarter-price line, gray daily-price line and semantic positive/negative colors. No new financial color convention. |
| Image quality | Real raster company marks, contained rather than stretched, on a consistent light tile. Uses existing Material icons for controls. Unresolved identity is not assigned a guessed company mark. |
| Copy / content | Distinguishes latest model from Guru entry valuation, price date from model date, and source checks from economic validation/calibration. Missing data is explicit; no replacement stock or fabricated curve. Preview-only QA text is confined to `tool/`, not the production terminal. |

Intentional differences from the concept: native existing chart/method panels, no invented extra time-range controls, full research expands in the same panel, dates and audit statuses are more explicit, and no illustrative Ackman holdings or AMZN valuation values enter the product.

## Interactions checked

- Browser: open ISRG, inspect native curve, expand full research, scroll through valuation drivers/model book, and return with the source text unchanged.
- Browser: actual Guru reported-changes row opens the correct CRWD drawer; the read-only QA adapter deliberately exposes only ISRG valuation, so CRWD shows a clear retryable unavailable state and no substituted stock.
- Widget tests: holdings entry, private-security disabling, English/Chinese desktop/mobile opening and closing, retained source state, quarterly ranking/detail return, lazy full request, coalesced caching and stale/unrelated-response rejection.
- Analyzer, production build, bilingual audit and relevant regression suites pass. No browser-console sweep or screen-reader audit is claimed.

## Release boundaries / open questions

- The local database is a partial fixture: its old Renaissance simulation eligibility, missing manager avatars, absent position-history endpoint and incomplete aggregate panel are not evidence about the live platform. This change does not modify those financial records or silently enable a curve.
- Live authenticated success flow and the complete AWS ticker denominator still need verification at release. The scoped read-only SSM attempt failed before remote execution; no infrastructure configuration was changed.
- The 1,548 recognized local symbols have assets. The separate 886 unresolved/ambiguous security records must be resolved before assigning any additional issuer logo; they must not be advertised as covered.
- At the time of this component QA, no Git commit, push or deployment had been performed. The user subsequently authorized release; deployment checks are a separate audit.

## Implementation checklist

- [x] Shared stock identity/logo component and reproducible source manifest.
- [x] Guru entries reuse canonical valuation API, chart and method components.
- [x] Desktop drawer, mobile full-screen layout, fixed footer, context-preserving close.
- [x] Summary-first and lazy full research; explicit error/empty/private states.
- [x] English/Chinese tests, existing curve regressions, build and static checks.
- [ ] At a separately authorized release, reconcile the live universe, verify authenticated production flows and then confirm frontend/backend deployment versions.

## Follow-up polish

- P3: consider a dedicated holding/report-date breadcrumb once that exact source context is consistently supplied by every entry point. Do not infer a Guru execution date from a filing.
- P3: extend manual issuer-image identity sampling beyond the high-visibility marks and provider exceptions; format/hash validation alone cannot prove branding correctness.
