# iOS Asset Inventory

This file lists the design and product assets needed before the iOS App Store
submission.

## Brand Assets

- App icon: GI monogram, dark background, mint foreground, no transparency.
- Small in-app logo: same GI mark, optimized for 24-32 pt.
- Launch screen: dark surface with GI mark and product name only.
- App Store screenshots: generated from real iOS UI, not desktop crops.

## Manager Avatars

Style target:

- Semi-real, soft editorial portrait.
- Light circular background.
- Consistent crop from chest/shoulders up.
- Avoid photorealistic endorsement cues; this is a research UI identity
  treatment, not a claim of partnership.

Storage:

- Store final avatar URLs/paths in the backend database.
- Cache in app for fast load.
- Fallback is initials only when image is missing.

Coverage:

- All 13F managers.
- Form 4 / insider profiles.
- STOCK Act profiles such as Nancy Pelosi.
- Firm-level profiles if exposed in the app.

## Stock Logos

Requirements:

- Cache logo URL/path per ticker in backend.
- Use the logo in holdings, dividend calendar, valuation ticker header, and
  event chips.
- Fallback is a ticker monogram if no licensed logo is available.
- Keep licensing/provider terms documented before App Store submission.

## App Store Screenshot Storyboard

Use portrait screenshots first.

1. "Track top managers" - Guru manager cockpit with Bill Ackman style header.
2. "Simulate 13F copy portfolios" - Portfolio vs SPY long-history chart.
3. "See new buys and exits" - selected ticker with buy interval marker.
4. "Audit fair value by quarter" - valuation chart plus quarterly model book.
5. "Read earnings-call Q&A" - expanded question and management answer with
   Chinese/English toggle.
6. "Connect your portfolio" - private portfolio cockpit with holdings.
7. "Plan dividends" - dividend calendar with monthly bars and stock logos.

Do not include private real account tokens, user names, or hidden credentials in
any screenshot.

## Empty And Error States

Create polished states for:

- Supabase/auth unavailable.
- Backend unavailable.
- No valuation Q&A for a ticker.
- IBKR/Yodlee sync failed.
- No NAV history yet.
- No dividend events for selected range.
- Stock logo missing.
- Manager avatar missing.

Each state should include a clear recovery action, not only an exception string.

## Data Visualization Rules

- Green/mint: portfolio, fair value, positive action.
- Amber: SPY, quarter price, benchmark, caution.
- Red: negative return, short/trim/sell.
- Blue: portfolio/user-specific data where the context is not fair value.
- Purple: historical 2025 dividend bars.
- 2026 dividend comparison bars: blue.
- Use long-press crosshair on iOS where web uses hover.
- Do not animate charts so heavily that values become hard to read.

## Native Interaction Assets

- Tab icons for Guru, Ontology, Valuation, Portfolio.
- Refresh icon.
- Search icon.
- Add account icon.
- Update data icon.
- Calendar/list toggle icons.
- Language toggle states.
- Disclosure chevrons for Q&A.
- Range scrubber handles.

Prefer SF Symbols or the existing Flutter Material/Cupertino icon equivalent in
the native app. Do not hand-draw icons unless a branded symbol is required.
