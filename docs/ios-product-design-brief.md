# iOS Product Design Brief

This is the mobile design brief for the future iOS version of Guru
Intelligence. It translates the current web terminal into a native, thumb-first
finance app without losing the serious buy-side feel.

## North Star

Make the iPhone app feel like a compact research cockpit: dense enough for real
analysis, calm enough to use every day, and safe enough for private portfolio
data.

## Existing Product DNA

- Dark terminal surface.
- Compact top identity: GI mark, date/live state, segmented product modes.
- Primary accent: mint green.
- Secondary accents: amber for benchmark/quarter price, blue for portfolio
  lines, red for negative risk.
- Card radius: restrained, roughly 12-16 on mobile; avoid bubbly marketing
  cards.
- Typography: high-contrast, heavy labels for tickers and money, muted small
  context below.
- Real assets: manager avatars, stock logos, real chart data, no fake UI art.

## iOS Navigation

Use a native bottom tab bar with four tabs:

1. Guru
2. DBMF
3. Valuation
4. Portfolio

Each tab keeps its own navigation stack. Refreshing or returning to the app
must preserve the current tab, selected guru/ticker, selected date range, and
expanded cards.

Global profile/settings live in the top-right avatar button. Settings contains
account deletion, auth providers, data/privacy, IBKR/Yodlee connections, and
support.

## Screen Inventory

### 1. Auth

Purpose: get the user into the product safely.

Key states:

- Signed out.
- Supabase unavailable.
- Google sign-in.
- Sign in with Apple.
- Local development fallback only in non-production builds.

### 2. Guru Universe

Purpose: browse managers and select a research source.

Mobile pattern:

- Search at top.
- Filter chips: All, 13F, Form 4, STOCK, Profile.
- Manager cards with avatar, name, source, AUM/activity, live state.
- Non-13F profiles must still open a working detail surface.

### 3. Guru Manager Detail

Purpose: understand one manager quickly.

Header:

- Large generated/stored avatar.
- Name, firm/source, strategy chips.
- AUM/activity, holdings, latest quarter, filing lag, focus ticker.

Module tabs:

- Simulation.
- New buys/sells.
- Quarterly contribution.

### 4. Guru Simulation

Purpose: compare copied portfolio return vs SPY over long history.

Mobile pattern:

- Range chips: 1Y, 3Y, 5Y, 10Y, All.
- Mini range scrubber.
- Hover equivalent: long-press crosshair with date, portfolio, SPY, excess.
- Latest holdings table below the chart.

### 5. New Buys/Sells

Purpose: show which stocks changed and what happened around the filing window.

Mobile pattern:

- Search ticker.
- Action filters: new, add, trim, exit.
- Stock list left/top becomes a vertical list on iPhone.
- Detail chart below selected ticker with buy/sell window highlight.

### 6. Quarterly Contribution

Purpose: pick a historical quarter and see portfolio contribution.

Mobile pattern:

- Horizontal quarter cards.
- Summary metrics.
- Position contribution list sorted by contribution.
- Selected quarter should highlight corresponding chart point where applicable.

### 7. DBMF

Purpose: make the exposure book readable at a glance.

Mobile pattern:

- Exposure rows sorted by absolute net exposure.
- Previous-period dot on every bar.
- Long-press tooltip for current and previous exposure.
- Source and update timestamp tucked into a small info row, not a hero.

### 8. Valuation Matrix

Purpose: find attractive names and open ticker research.

Mobile pattern:

- Search ticker.
- Sort/filter controls.
- Fair value cards with ticker, company, upside, price/FV, target, quality.
- Tap opens ticker detail.

### 9. Ticker Valuation Detail

Purpose: explain how valuation changed over time.

Mobile pattern:

- Price, fair value, upside, 3Y target cards.
- Chart with daily price, quarter price, and fair value.
- Selected quarter card highlights the chart dot.
- Quarterly research card below chart.
- Transcript Q&A below the model card.

### 10. Transcript Q&A

Purpose: show actual analyst questions and management answers from the earnings
call transcript.

Mobile pattern:

- Collapsed accordions by analyst question.
- Expanded state shows full question, analyst name, company, call date,
  management responder, and full answer.
- Language toggle: 中文 / English.
- Chinese should come from database-prepared translations, not mixed inline
  machine snippets.

### 11. Portfolio Cockpit

Purpose: private user portfolio dashboard.

Mobile pattern:

- Net liquidation, day P/L, unrealized, cash, top weight.
- Account selector for multi-account aggregation.
- Update data button writes current NAV/holdings/dividends to backend.
- NAV chart appears only after real NAV history exists.

### 12. IBKR/Yodlee Connect

Purpose: one-time secure setup.

Mobile pattern:

- First-use tutorial with IBKR path: Performance & Reports -> Third-Party
  Reports -> Third-Party Services -> Yodlee.
- Fields: Yodlee Token and Query ID. Do not ask for "NAV ID".
- Save once, then hide setup form.
- Existing users see connection cards, Add account, Update data, Disconnect.

### 13. Holdings

Purpose: explain the user's portfolio composition.

Mobile pattern:

- Holdings table with stock logo, ticker, market value, weight, quantity, P/L.
- Pie chart or stacked allocation card.
- Sector and risk cards.

### 14. Dividend Calendar

Purpose: help users see paid, declared, and estimated cash flow.

Mobile pattern:

- Range selector: 2025, 2026, One year ahead.
- Annual/monthly/daily/yield summary.
- Monthly bar chart with 2025 purple and 2026 blue comparison when applicable.
- Bar long-press shows contributing tickers and amounts.
- Calendar view by month plus list view.
- Currency handling must normalize GBp/GBX vs GBP before summing.

### 15. Settings

Purpose: privacy, account, and support.

Must include:

- Profile.
- Auth providers.
- Connected accounts.
- Data export.
- Delete account.
- Privacy policy/support links.
- App version/build.

## Design Assets To Produce After Brief Approval

Product Design should generate exactly three visual directions before the iOS
build starts:

1. Terminal Native: closest to current web terminal, optimized for iPhone.
2. Research Cards: more readable mobile hierarchy while preserving density.
3. Portfolio First: makes the user's portfolio cockpit the home moment, with
   Guru/Valuation as research tabs.

After a direction is chosen, produce:

- App icon concept.
- Launch screen.
- 6.9-inch App Store screenshot set.
- Screen-by-screen iOS mockups.
- Manager avatar style sheet.
- Stock-logo treatment.
- Empty/loading/error state sheet.

## Open Brief Decision

Before generating visual directions, confirm whether the first iOS release
should be:

- Research-first: default tab is Guru.
- Portfolio-first: default tab is Portfolio after login.
