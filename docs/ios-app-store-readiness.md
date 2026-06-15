# iOS App Store Readiness

Current date: 2026-06-15.

This project is currently a Flutter Web product. There is no `ios/` platform
folder in the repository yet, so the App Store path is: prepare native iOS
project, wire auth/security correctly, then submit through TestFlight and App
Review.

## Product Decision

- App name: Guru Intelligence.
- Subtitle direction: Buy-side terminal for portfolios and valuation.
- Primary category: Finance.
- Initial device scope: iPhone first. Add iPad only after the tablet layout is
  deliberately designed and tested.
- Backend contract: Vercel owns the public frontend and `/api/*` proxy; AWS
  Elastic Beanstalk owns the API backend. Native iOS should call the same HTTPS
  production API contract unless a dedicated `api.thesisforge.tech` mobile base
  URL is introduced.

## Required Build Work

1. Create the iOS platform shell:

   ```bash
   flutter create --platforms=ios .
   ```

2. Set bundle identity and signing:

   - Bundle ID: propose `tech.thesisforge.guru`.
   - Display name: `Guru Intelligence`.
   - Team: Apple Developer Program account holder.
   - Version/build: keep `1.0.0+1` for the first TestFlight build, then bump on
     every upload.

3. Build with Apple's current SDK requirement:

   Apple says that, as of 2026-04-28, iOS/iPadOS apps uploaded to App Store
   Connect must be built with the iOS & iPadOS 26 SDK or later.

4. Add native auth support:

   - Keep Supabase as the identity layer.
   - Add Sign in with Apple before review if Google sign-in remains a primary
     login option.
   - Add native deep links for auth callback, for example
     `guru-intelligence://auth/callback`.
   - Add the same redirect URL in Supabase Auth settings.
   - Store only user session state on device; API credentials and IBKR/Yodlee
     tokens stay encrypted in the backend.

5. Add account deletion:

   - A visible Settings -> Account -> Delete account path is required.
   - Deletion must remove the Supabase user profile and user-owned portfolio
     data, including encrypted IBKR/Yodlee credentials, NAV history, holdings,
     dividend events, and cached personal account metadata.
   - If Sign in with Apple is enabled, revoke Apple tokens during deletion.

6. Add production safety checks:

   - No `VITE_AUTH_DEV_BYPASS=true` equivalent in iOS release builds.
   - No Supabase service-role key in the app bundle.
   - No IBKR/Yodlee token in logs, crash reports, analytics, or screenshots.
   - All network calls over HTTPS.
   - Per-user backend access guarded by Supabase JWT plus row-level ownership
     checks.

## App Store Connect Checklist

- Apple Developer Program membership active.
- App record created in App Store Connect.
- Bundle ID and SKU chosen.
- Privacy Policy URL published on `www.thesisforge.tech`.
- Support URL published.
- App Review contact filled in.
- Demo account or demo video prepared. Because IBKR/Yodlee account linking is
  hard for reviewers to reproduce, include a reviewer note and a seeded demo
  account that shows Guru, DBMF, Valuation, and Portfolio screens.
- Export compliance answered. If only standard HTTPS/TLS encryption is used,
  answer accordingly in App Store Connect.
- Age rating completed. Finance/research content generally should avoid any
  trading, gambling, or investment-return guarantees in copy.
- If paid subscriptions are introduced for research/portfolio features, review
  Apple's In-App Purchase rules before launch.

## Privacy Label Draft

Likely data collected and linked to the user:

- Contact info: name and email from Supabase/Google/Apple login.
- Identifiers: user ID, account ID, device/session identifiers.
- Financial info: user-linked brokerage account metadata, holdings, NAV,
  dividends, cash balance, and performance history.
- User content: saved IBKR/Yodlee connection metadata and user portfolio state.
- Diagnostics: crash logs and performance logs if added.

Likely use:

- App functionality.
- Account management.
- Security and fraud prevention.
- Customer support.

Avoid unless deliberately implemented:

- Third-party advertising.
- Cross-app tracking.
- Selling or sharing personal financial data.

## App Store Product Assets

Apple allows one to ten screenshots per device family. Prepare at least five
iPhone screenshots for the first release:

1. Guru manager cockpit.
2. Portfolio vs SPY simulation.
3. Valuation matrix and ticker detail.
4. Private portfolio cockpit with holdings and NAV.
5. Dividend calendar with monthly view.

Screenshot sizes to prepare:

- iPhone 6.9-inch portrait: `1320 x 2868` or `1290 x 2796`.
- iPhone 6.5-inch portrait fallback: `1284 x 2778` or `1242 x 2688`.

If iPad support is enabled, prepare iPad screenshots separately instead of
letting iPhone layouts stretch.

## Review Risk Register

- Google-only auth can trigger a login-method rejection. Add Sign in with Apple.
- Account creation without in-app deletion can trigger rejection.
- Financial-data collection must be accurately disclosed in App Privacy.
- Portfolio aggregation needs clear user consent and must not expose one user's
  IBKR/Yodlee data to another user.
- Marketing copy must avoid investment advice, performance guarantees, or
  implied endorsement by named managers.
- Reviewer cannot test IBKR/Yodlee without seeded data, so provide a demo path.

## Official References

- Apple App Store submission requirements:
  https://developer.apple.com/app-store/submitting/
- Apple App Review Guidelines:
  https://developer.apple.com/app-store/review/guidelines/
- Apple App Privacy details:
  https://developer.apple.com/app-store/app-privacy-details/
- App Store Connect privacy setup:
  https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Account deletion reminder:
  https://developer.apple.com/news/?id=12m75xbj
- Screenshot specifications:
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
