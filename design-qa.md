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

## DBMF / Valuation Terminal Refresh

final result: passed

Reference: same user-provided terminal screenshot used for the Guru redesign, with compact top bar, dense dark panels, small-radius cards, primary workspace in the center, and low-priority context moved into rails.

Prototype checked: release build served locally and deployed to `https://www.thesisforge.tech`.

Checked viewport: desktop terminal layout. Browser canvas screenshot capture timed out on the Flutter surface, but the release page loaded without console errors and production build/tests passed.

Passed:
- DBMF now opens as a focused exposure terminal instead of a large marketing-style hero: compact mode header, exposure book as the primary task, and posture/source context in the right rail.
- DBMF retains the previous-period marker on exposure bars with hover tooltip for date and value.
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
