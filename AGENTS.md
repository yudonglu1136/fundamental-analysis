# Agent Operating Contract

This repository is the Guru Intelligence product. Follow this deployment split unless the user explicitly changes the architecture.

## Deployment Ownership

- Frontend is deployed on Vercel.
- AWS Elastic Beanstalk is backend/API only.
- Browser traffic for `https://www.thesisforge.tech/` must resolve to Vercel, not Lightsail or Elastic Beanstalk.
- Vercel serves the Flutter web build from `dist/`.
- Vercel proxies only `/api/*` to the AWS Elastic Beanstalk API.
- After a production deploy, both `https://www.thesisforge.tech` and `https://thesisforge.tech` must alias to the same latest Vercel deployment.
- AWS API CORS must allow both `https://www.thesisforge.tech` and `https://thesisforge.tech`; stale or diagnostic frontend builds can otherwise receive an HTML 500 from Express instead of JSON.
- Do not deploy the primary frontend by rsyncing `dist/` to Lightsail.
- Do not add DNS `A` records for `www.thesisforge.tech` or `thesisforge.tech` that point to the Lightsail IP.
- Keep `api.thesisforge.tech` or the EB CNAME available for backend diagnostics only.

## iOS / App Store Work

- The repository is Flutter Web first and now includes a generated Flutter iOS
  shell in `ios/`. Do not delete or regenerate it casually; preserve local
  signing, icon, launch image, auth callback, and bundle ID work.
- Before generating or implementing the native iOS app, read:
  - `docs/ios-app-store-readiness.md`
  - `docs/ios-product-design-brief.md`
  - `docs/ios-asset-inventory.md`
- The iOS app should preserve the same backend contract: authenticated API calls through the production HTTPS API contract, user-specific Supabase identity, and encrypted IBKR/Yodlee credentials stored only on the backend.
- Add Sign in with Apple, in-app account deletion, privacy disclosures, and a reviewer demo path before App Store submission.
- Bundle ID is `tech.thesisforge.guru`; display name is `Guru Intelligence`.
- App Store packaging script is `scripts/build-ios-appstore.sh`.
- App Store submission requires a paid Apple Developer Program Team. A Personal
  Team can create development certificates, but cannot upload to TestFlight or
  the App Store.

## Required Vercel Production Env

The Vercel project `fundamental-analysis` must have these production env vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_DEV_BYPASS=false`
- `VITE_AUTH_PROVIDER=supabase`
- Optional serverless proxy override: `AWS_API_ORIGIN`

The Supabase key is browser-publishable. Never use or expose a Supabase service-role key in the frontend.

## Build And Deploy

DBMF is retired. Ontology is the only production replacement for that module.
Do not restore a DBMF tab, screen, API route, build artifact, or deployment.
Legacy `mode=dbmf`, `/dbmf`, and `/api/dbmf` requests must resolve to Ontology.
Never promote a Vercel deployment built from a branch other than `trunk`.

For frontend changes:

1. Commit and push to GitHub `trunk`.
2. Deploy frontend through Vercel.
3. Verify `https://www.thesisforge.tech/` is served by Vercel.
4. Verify `https://www.thesisforge.tech/api/health` reaches AWS through the Vercel proxy.

For backend changes:

1. Deploy the Node/Express API to AWS Elastic Beanstalk.
2. Do not package Flutter `dist/` into AWS unless using the explicit emergency fallback:
   `INCLUDE_FRONTEND_DIST=1 bash scripts/package-aws-backend.sh`.

See `docs/deployment-contract.md` for the full runbook.

## 13F Update Contract

When the user asks to update 13F, guru holdings, Q2/Q3 data, new buys/sells, quarterly contribution, or position history, treat it as one atomic data-refresh job. Do not update only one cache.

Required update surfaces:

- `guru_snapshots`: selected guru header, latest quarter, filing date, filing lag, AUM, holdings count, latest holdings, and new buy/sell activity.
- `dashboard_snapshots`: guru list, overview cards, signal board, ticker heatmap, and cross-guru aggregates.
- `guru_exposure_snapshots`: 13F book history / position trajectory tab.
- `guru_backtests`: copy simulation and quarterly contribution.
- Market prices used by backtests must be current enough for the selected period; refresh latest prices first if the backtest end date is stale.
- If a manager changes or adds SEC reporting entities, add the new filer to `alternateCiks` in `server/gurus.js` and verify all 13F readers merge every CIK. Do not rely on the original `cik` only. Example: Bill Ackman/Pershing Square uses PSCM plus PERSHING SQUARE INC. after the reporting-entity transition.

Use the unified command or endpoint:

- Local/CLI: `npm run refresh:13f -- --reason=manual-13f-update --years=all --detail=compact --exposure-limit=40`
- Production internal API: `POST https://www.thesisforge.tech/api/internal/gurus/refresh` with `Authorization: Bearer $INTERNAL_CRON_SECRET`.
- Status check: `GET https://www.thesisforge.tech/api/internal/gurus/refresh/status`.

Verification after every 13F update:

1. Check `/api/health` and confirm the database timestamp moved.
2. Check `/api/gurus?refresh=1` or the relevant guru detail endpoint and confirm latest quarter, filing date, holdings count, and activity changed together.
3. Check `/api/gurus/{id}/backtest?years=all&detail=compact` for simulation and quarterly contribution.
4. Check `/api/gurus/{id}/exposure?limit=40` for position history.
5. Verify the Vercel frontend at `https://www.thesisforge.tech` still talks to AWS through `/api/*` and does not hit the AWS frontend fallback.

If a manager has filed only `13F-NT` or a 13F without a usable information table, do not fabricate holdings. Keep the prior usable `13F-HR` quarter for holdings/backtest and surface the missing-information-table state in the refresh job errors.

## Valuation PIT Data Contract

When valuation financials, management guidance, or historical fair values are refreshed, replace the valuation layer atomically. Do not mix legacy SEC/Trinity financial rows with the PIT dataset.

- US financials come from `jansen_us_firm_replication` Sharadar SF1 `ARQ` and `ART` records. Select the earliest `datekey` available for each fiscal period; exclude later restatements from historical point-in-time runs.
- Select financials independently for every fiscal period: prefer an `ARQ` row only when it contains core financials, otherwise use that period's valid `ART` row. Mark `ART` as trailing-twelve-month data so it is never multiplied by four or rolled into another TTM window. Do not use `MRQ`, `MRT`, or `MRY` dimensions for historical replay.
- BAE Systems (`BA.L`) and LSEG use official issuer releases. FY and H1 disclosures may be converted to TTM; Q1/Q3 trading updates may carry the latest already-disclosed TTM financial base and add only guidance visible on that event date. Record this construction and every source URL in `sourceRecord`.
- Guidance must be management or issuer guidance observed on or before the model node date. Do not treat analyst questions, replay boilerplate, prior guidance comparisons, or historical actuals as new guidance.
- Rebuild guidance in this order: management transcripts, official UK issuer releases, official SEC issuer filings, then ECB FX reference rates. Each importer may delete only rows owned by its own `source_type`; a transcript refresh must never delete official issuer guidance.
- Preserve guidance in its reported currency. When it differs from the valuation financial currency, convert only the model input with the ECB reference rate visible on the guidance date (or nearest prior rate), and retain source amount, source currency, conversion rate, rate date, and ECB URL in the model input. Never add unlike currencies directly.
- If official filings have been reviewed but contain no quantified group-level guidance, record `no_quantified_official_guidance`; do not manufacture a value. Private companies without public quarterly guidance remain explicitly uncovered.
- Missing values remain `null`. Never use zero, market price, a later filing, or a future share count to fill a historical financial input. A carried prior disclosed value must be explicitly recorded in `sourceRecord.metricDerivation`.
- Preserve Transcript/Q&A, users, portfolios, Guru/Ontology, prices, dividends, and podcast data. A production valuation refresh may replace only `valuation_pit_source_metadata`, `valuation_pit_financials`, `valuation_pit_guidance`, `valuation_pit_model_runs`, `valuation_ticker_snapshots`, and `valuation_snapshots`.
- Back up the AWS runtime database before the transaction. Abort and roll back if any required ticker is blocked, SQLite integrity fails, guidance is dated after its model node, or non-valuation table counts change.
- Run the valuation import twice on a release-database copy and confirm ticker counts, model-run counts, focus ticker fair values, and CIK-dependent supplements are identical before deploying.
