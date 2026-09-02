# Guru Terminal Redesign QA

final result: passed

Reference: user-provided dark terminal screenshot with compact top bar, left guru list, central manager workspace, right signal/heatmap rail, and light circular manager avatars.

Prototype checked: local Flutter web preview at `http://127.0.0.1:5181`.

Checked viewport: 1600x1000.

Passed:
- Compact top toolbar matches the target direction: GI logo, product name, date/live state, mode segment, refresh/theme/account controls.
- Main guru screen now uses the intended three-column structure: left guru finder, center manager cockpit and modules, right signal board/heatmap/quick links.
- Default guru selection opens Bill Ackman, so the first screen shows the 13F workflow instead of a Form 4 empty state.
- Manager header includes light circular AI portrait, name, firm, chips, AUM, holdings, latest quarter, filing lag, and strategy.
- Module strip exposes the three requested workflows: simulation, new buys/sells, quarterly contribution.
- Simulation panel includes time presets, full-range slider, hover-capable chart, and latest holdings below the chart area.
- Right rail no longer competes with the primary workflow.
- Console check showed no browser errors in the local preview.

P3 follow-up:
- Header strategy text truncates in tight center widths; acceptable for this pass, but can be refined with a wider metrics allocation or tooltip.

## Ontology / Valuation Terminal Refresh

final result: passed

Reference: same user-provided terminal screenshot used for the Guru redesign, with compact top bar, dense dark panels, small-radius cards, primary workspace in the center, and low-priority context moved into rails.

Prototype checked: release build served locally and deployed to `https://www.thesisforge.tech`.

Checked viewport: desktop terminal layout. Browser canvas screenshot capture timed out on the Flutter surface, but the release page loaded without console errors and production build/tests passed.

Passed:
- Ontology now opens as the market-structure and PIT-signal workspace, with strategy evidence, graph context, and historical snapshots as the primary tasks.
- Legacy module links resolve to Ontology without exposing the retired screen or navigation label.
- Valuation now follows the same terminal rhythm: compact mode header, searchable ticker matrix, detail chart/workspace, and model distribution/source controls in a right rail.
- Valuation keeps ticker click-through into historical valuation and price trend detail, while the search bar supports direct ticker lookup.
- Both modes share the same spacing, panel radius, icon treatment, muted labels, and metric typography as the Guru screen.
- Static production bundle, backend health check, Flutter analyze, Flutter test, and production build all passed.

## Right Rail Card Deck

final result: passed

Reference: user annotation on the right-rail `Ticker Heatmap / 拥挤持仓` card asking for a smaller flippable card sequence.

Prototype checked: local release preview at `http://127.0.0.1:5192` with API dev bypass.

Checked viewport: 1600x1000 desktop terminal layout. Browser canvas screenshot capture still timed out on the Flutter surface; interaction and console checks completed through the browser controller.

Passed:
- `拥挤持仓` now renders as a compact carousel card instead of a long static list.
- Right arrow advances through the requested sequence: crowded holdings, recent 13F filings, add ranking, trim ranking.
- Add and trim pages rank rows by estimated disclosed dollar amount from largest to smallest.
- Each ranking row keeps the compact terminal look with ticker/action, guru name, amount, and a small relative bar.
- Browser smoke test loaded the local app and clicked through the card deck without console errors.

## Portfolio Dividend Calendar

final result: passed

Reference: user-provided dark dividend calendar screenshot with a one-year range control, annual income card, stacked monthly payout chart, search/filter controls, and Calendar/List toggle.

Prototype checked: local release QA build at `http://127.0.0.1:8791` using `AUTH_DEV_BYPASS=true` and API `http://127.0.0.1:8787`.

Checked viewport: desktop code/layout pass plus mobile smoke at 390x844. Flutter canvas screenshot capture timed out in the in-app browser, so verification used build/analyze/API checks and browser console checks.

Passed:
- Dividend calendar is now placed directly below the private portfolio holdings table, not in the narrow right rail.
- The module follows the reference structure: title, one-year-ahead range controls, ticker search, status filter, payout-date/ex-date filter, annual income summary, monthly stacked bars, and Calendar/List toggle.
- Monthly bars split events into Paid, Declared, and Estimated buckets with hover tooltips for monthly totals.
- Event rows include ticker logos through the existing `PortfolioHoldingLogo` path.
- Future per-share dividend events are estimated against current holding quantity, while actual IBKR cash dividend rows keep their absolute payout amount.
- Local API returned 7 holdings and 20 future dividend events for the QA dataset.
- Mobile 390px smoke loaded without console errors, and narrow controls use stacking/wrapping instead of horizontal overflow.

## Portfolio Dividend Month Grid

final result: passed

Source visual truth path: `/var/folders/3k/0wsqd58n6w71n8tyql0t09fc0000gn/T/codex-clipboard-3797c45c-75b8-4c41-8c5b-de86c8b6b8e8.png`

Implementation: `PortfolioDividendCalendarSection` in `lib/main.dart`, below the holdings table and below the annual dividend summary/chart.

Viewport/state: Portfolio page, dark terminal theme, dividend Calendar mode, current month selected via the existing month pager.

Implementation screenshot path: blocked by the same Flutter canvas capture timeout seen in prior QA passes; browser console/build checks completed instead.

Full-view comparison evidence: reference shows a dark monthly calendar with top month pager, month total chip, Calendar/List segmented control, weekday headers, 7-column grid, highlighted today cell, and per-day dividend cards with logos and payout values. Implementation now mirrors that structure in the existing app tokens.

Focused region comparison evidence: focused source region is the monthly calendar grid. Implementation adds `DividendMonthCalendarGrid`, `DividendCalendarDayCell`, and `DividendCalendarEventChip` with logo, ticker/company text, payout, portfolio-weight text, status color stripe, tooltip, today highlight, and `+N more` overflow handling.

Patches made:
- Calendar mode now renders a monthly grid instead of the previous date-group list.
- List mode now shows the selected month’s full event list, so month paging affects both Calendar and List.
- The month header total chip now shows current-month payout instead of the full one-year payout.
- Desktop uses a 7-column calendar; mobile switches to an agenda-style day list to avoid cramped cells.
- Event cards use existing ticker logo rendering and real dividend event data.

Findings:
- No actionable P0/P1/P2 issues after code review, static analysis, and production build.

Residual test gap:
- Flutter canvas screenshot capture timed out in the in-app browser, so visual comparison could not be captured as an image artifact in this environment.

## Guru History Range Restoration — Design QA

## Comparison target

- Source visual truth: `/Users/yudonglu/Documents/guru-intelligence/docs/images/guru-dashboard.png`
- Rendered implementation: `/Users/yudonglu/Documents/guru-intelligence/output/playwright/guru-range-final-en-10y-1280x720.png`
- Mobile implementation: `/Users/yudonglu/Documents/guru-intelligence/output/playwright/guru-range-final-en-mobile-controls-390x844.png`
- Full-view comparison: `/Users/yudonglu/Documents/guru-intelligence/output/playwright/guru-range-reference-vs-final-2560x720.png`
- Focused control comparison: `/Users/yudonglu/Documents/guru-intelligence/output/playwright/guru-range-controls-reference-vs-final-1380x230.png`
- CSS viewport: 1280 × 720 desktop and 390 × 844 mobile
- Pixel dimensions / density: source 1280 × 720, implementation 1280 × 720, mobile 390 × 844; all captured at device scale factor 1, so no density normalization was required
- State: dark theme, Bill Ackman, Simulation module, English UI. The source has All selected; the implementation evidence uses the current audited 10Y window because All remains a fail-closed forensic window until its legacy corporate-action history passes audit.

## Findings

No actionable P0, P1, or P2 mismatch remains for the requested history-control restoration.

- Typography: the implementation retains the product's existing sans-serif hierarchy and compact terminal weights. Preset labels, performance metrics, date labels, and sampling disclosure remain readable at both tested viewports. No central-module wrapping or clipping is visible.
- Spacing and layout rhythm: the five presets, performance legend, two-handle range bar, and equity curve fit together in the 1280 × 720 first viewport. The implementation is intentionally denser than the old source so the curve stays visible without scrolling.
- Colors and visual tokens: navy surfaces, teal active/range state, yellow benchmark, and red drawdown match the established terminal palette and source hierarchy. Disabled/loading behavior retains visible contrast.
- Image quality and asset fidelity: the supplied Guru logo and Bill Ackman avatar remain sharp and correctly masked. No source image or logo was replaced with placeholder, CSS art, or a hand-built SVG.
- Copy and content: the English state is internally consistent. The current implementation correctly says `Reported 13F value` rather than the source's ambiguous `AUM`, and distinguishes exact full-window `MDD` from sampled custom-window `MDD≈`.
- Icons and affordances: the calendar, simulation, refresh, reset, range handles, selected preset, and disabled states are visually legible and use the existing Material icon family.
- Responsiveness and accessibility: at 390 × 844, all five preset controls and both range handles remain usable without horizontal overflow. The range reset and refresh controls meet the existing 44 px touch-target contract. The central workflow scrolls vertically as expected.

## Interaction and runtime evidence

- Verified 5Y → 10Y switches to a distinct server-backed window.
- Verified the left range handle can be dragged to a custom date, with the curve rebased and metrics recalculated.
- Verified reset returns to the complete loaded 10Y range.
- Verified All cache miss retains the latest ready curve and shows a localized fail-closed explanation instead of triggering a cold synchronous computation.
- Verified the 10Y compact response exposes 520 rendered points from 2,461 source trading days and preserves sampling lineage.
- Browser diagnostics showed no Flutter render overflow or application exception during the core interactions. Flutter's local debug-only DWDS injected client logged reconnect/deserialization diagnostics after manual reloads; this code is not present in the release build. Production browser diagnostics are a release verification item after deployment.
- Deployed the identical release build to Vercel deployment `dpl_FJ4rerPYtroG7MKseM3DGUv5WYaT`; both `www.thesisforge.tech` and `thesisforge.tech` resolve to it, and the production `/api/health` proxy reports all modules healthy.
- The production unauthenticated shell and Google sign-in gate were visually checked. The automated QA browser did not transmit a Google identity, so authenticated production-canvas interaction was not repeated there; the signed release artifact is the same build exercised in the local 1280 × 720 and 390 × 844 interaction runs above.

## Intentional deviations from the source

- The old source shows an All window beginning in 2013. The release uses 5Y as the safe default, serves a pre-warmed audited 10Y window on request, and keeps All fail closed until older corporate-action coverage is complete.
- The current right rail is the retained Market Lens rather than the older ticker heatmap. It is outside the requested simulation-control restoration and preserves newer product functionality.
- The legend shares the preset row on desktop to keep the range bar and curve above the fold. This is a deliberate density improvement, not a missing element.

## Comparison history

1. Earlier regression: the simulation was restricted to a fixed 5Y response and could render only a failure card. Fix: restored the historical 1Y / 3Y / 5Y / 10Y / All controls and two-handle range bar while preserving the newer audit gates.
2. First restored pass: the curve and bar were visible, but full-window MDD could be recomputed from a sampled response and overlapping requests could replace the user's selected window. Fix: use server summary metrics for exact full windows, label selected sampled-window MDD as approximate, serialize conflicting UI actions, resume warming polls, and defer attribution requests.
3. Final pass: public cold 10Y/All requests, repeated refreshes, and double compaction still needed hardening. Fix: canonical extended-window policy, current-cache-only public reads, per-manager/window single-flight, preserved source-point lineage, refresh de-duplication, and regression coverage. Post-fix evidence is the full-view and focused comparison listed above.

## Follow-up polish

- P3: the narrow desktop Market Lens title truncates more aggressively than the old right-rail label. This does not affect the restored history workflow and can be tightened in a separate right-rail pass.

## Implementation checklist

- [x] Restore 1Y / 3Y / 5Y / 10Y / All presets
- [x] Restore two-handle arbitrary date-range selection
- [x] Keep range bar and curve in the 1280 × 720 first viewport
- [x] Verify desktop and 390 × 844 mobile layouts
- [x] Verify exact-versus-sampled metric labeling
- [x] Verify loading, cancellation, retry, mismatch, warming, and fail-closed states
- [x] Compare source and implementation in full-view and focused composites

final result: passed
