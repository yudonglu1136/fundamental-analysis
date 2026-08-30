# Agent Operating Contract

This repository is the Guru Intelligence product. Follow this deployment split unless the user explicitly changes the architecture.

## Deployment Ownership

- Frontend is deployed on Vercel.
- AWS Elastic Beanstalk is backend/API only.
- Browser traffic for `https://www.thesisforge.tech/` must resolve to Vercel, not Lightsail or Elastic Beanstalk.
- Vercel serves the Flutter web build from `dist/`.
- Vercel proxies only `/api/*` to the AWS Elastic Beanstalk API.
- After a production deploy, both `https://www.thesisforge.tech` and `https://thesisforge.tech` must alias to the same latest Vercel deployment.
- The confirmed 2026-08-30 production baseline is Vercel deployment
  `fundamental-analysis-cqreyaz5s-yudonglu1136s-projects.vercel.app`, built from
  GitHub `trunk` commit `1a630a8`. Both public domains must remain on this
  deployment until a newer verified `trunk` deployment replaces it.
- A split alias is a release blocker. After every production deployment, run
  `vercel inspect` for both public domains and confirm that they return the same
  deployment ID and URL. If either domain is stale, explicitly assign both
  domains to the verified deployment with `vercel alias set`; never update only
  one of them.
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
- For UK issuer PDFs, normalize split thousands and decimals before parsing (`£9, 982m` means £9,982m; `£2. 2bn` means £2.2bn). Prefer exact table values over rounded headlines. When LSEG presents both pro-forma and statutory tables, use the statutory continuing-operations table for PIT financials and record that basis in `sourceRecord`; pro-forma acquisition comparatives are context, not reported history. Use operating/adjusted net debt from LSEG's management leverage framework before accounting total/net debt fallbacks, and record the selected debt basis. When an H1 release restates the prior H1 comparator, use that event-visible comparator in `current H1 + prior FY - prior H1`; do not reuse the older definition. Treat issuer-reported equity free cash flow as direct FCFE, not as CFO, and retain it when CFO/capex fields are unavailable. If an official issuer release and a transcript extraction provide the same guidance metric in one fiscal period, the official release is model-authoritative while the raw transcript evidence remains stored for audit.
- Guidance must be management or issuer guidance observed on or before the model node date. Do not treat analyst questions, replay boilerplate, prior guidance comparisons, or historical actuals as new guidance.
- Every extracted guidance metric must identify its economic subject. Only `company_total` or defensibly `company_total_or_unspecified` periodic evidence may enter a company-level revenue, operating-income, or FCF input. Segment, acquisition, contribution, loss, delta, synergy, non-company and non-periodic amounts remain research evidence with a machine-readable exclusion reason.
- Treat every symbolic or textual plus-minus form (`+/-`, `±`, `plus or minus`, `+ or -`) as a center and uncertainty band, never as a two-endpoint range. For example, `$4.1 billion +/- $100 million` has a model amount of `$4.1 billion`, not `$2.1 billion`. Preserve the complete wording, and block release when a stored scaled monetary amount does not reconcile to the quoted center.
- Average two guidance amounts only when the source explicitly defines a range with `to`, `through`, a range dash, or `between ... and`. When only the last endpoint carries a scale, such as `$1.66-$1.68 billion`, propagate that same scale to both endpoints before computing the midpoint. Values connected by `versus`, `compared with`, ordinary `and`, capex-versus-FCF commentary, or separate metric clauses are independent observations, never range endpoints; select the amount nearest the owned metric and retain the other values only as evidence. Add a regression fixture whenever this rule changes.
- Legal range wording includes `range from X to Y`, repeated currency symbols (`$80 million to $84 million`), and the corresponding `between X and Y` forms. Reconstruct both endpoints before considering any later amount in the sentence; a subsequent share count, cost, NCI, tax or other metric must never replace the range endpoint. The release audit must test the original evidence independently of the extractor output.
- Compound clauses with multiple metrics and values require explicit owner binding. Ordinal pairing may use only metric owners that precede the first quoted amount, and the release verifier must independently reconstruct the pairings. A nearby cost, expense, saving, charge, synergy, tax or share-count amount owns itself and must never bind to revenue, operating income, EBITDA, EPS or FCF.
- Bind each monetary scalar to its explicit economic metric before selecting a model input. Treat all endpoints of one legal range as an atomic unit owned by the same metric; do not combine endpoints across clauses. For parallel lists such as `EBITDA and operating income of $2.6 billion and $1.9 billion`, preserve source order and bind each value once, including when `respectively` is omitted. The independent release audit must reconstruct these relationships from the original quote rather than trust the extractor's stored metric name or scalar.
- Preserve signs in directional ranges (`down $125 million to up $25 million` has a midpoint of `-$50 million`). In revision language such as `raise by X to Y`, the revised model target is `Y`; `X` is the change amount and remains evidence only. An amount immediately before its owner (`$11 billion of operating cash flow`) belongs to that following metric.
- A four-digit fiscal/calendar year is a date token, never the left endpoint of a shared-scale monetary range. In wording such as `fiscal year 2025 to $1.4 billion`, the year must not inherit `billion`; share repurchases and other capital-allocation amounts own their quoted values and cannot become FCF guidance merely because FCF appears later in the sentence.
- Official SEC and UK importers must use the same audited monetary/range parser and subject-owner rules as transcript extraction. Do not maintain a looser second parser for filings. Historical actuals, prior-guide comparisons and non-guidance amounts remain research evidence regardless of source type.
- Named-month quarter wording such as `March quarter`, `June quarter`, `September quarter`, and `December quarter` is quarterly scope. Do not annualize or treat such guidance as an unscoped annual amount.
- An explicit quarter target such as `Q2 FY2027` is quarterly guidance even though it also contains a fiscal-year token. Quarter scope outranks the year token. Statements that a company `met`, `exceeded`, or `was within` prior guidance describe historical performance and cannot create a new forward model input.
- Preserve guidance scope. Prefer explicit full-year guidance; never use a quarterly or unscoped amount as full-year revenue, operating income, or free cash flow. When only quarterly revenue guidance is available, annualize it, bound it against PIT trailing revenue, blend it with the formula forward estimate, and record the raw amount, annualized amount, bounded amount, blend weight, and inferred/explicit scope in the model inputs. Ambiguous annual-scale amounts remain research evidence and do not replace formula/TTM model inputs.
- An annual value and a cumulative multi-year target are different economic inputs. Never average them, annualize the cumulative target, or let a medium-term section heading re-label an annual bullet. Store the cumulative target as research evidence unless the model has a separately audited multi-year route.
- Storing guidance is not enough: every applicable operating, growth, or revenue-stage model node must either consume plausible explicit annual guidance or record the reported amount and a machine-readable rejection reason. The strict release verifier must fail when scoped revenue, operating-income, or free-cash-flow guidance is silently ignored. Financial/customer-cash routes may exclude non-applicable guidance only through their disclosed economic model route.
- Normalize reported growth continuously with only information visible at that node: winsorize finite source observations, take the configured rolling median (eight reporting periods by default), and then apply the valuation-profile cap. Never discard a valid triple-digit growth observation and fall back to a default merely because it crossed an arbitrary threshold. Transcript-reported actual growth is research-only. Only a clear management guidance growth metric may enter the model, at no more than 25% weight and bounded to within 15 percentage points of the PIT financial trend; store the raw guidance, bounded guidance, financial trend, window, sample count, and applied weight in every model node.
- Rebuild guidance in this order: management transcripts, official UK issuer releases, official SEC issuer filings, then ECB FX reference rates. Each importer may delete only rows owned by its own `source_type`; a transcript refresh must never delete official issuer guidance.
- A reported fiscal year and the forward guidance target year are separate fields. In particular, a Q4/FY release may report FY2025 results while guiding FY2026. Derive the target year from the nearest preceding annual-guidance heading, stop at the next medium-term or later-year heading, retain both years, and regression-test every year-end rollover used by the model.
- Preserve guidance in its reported currency. When it differs from the valuation financial currency, convert only the model input with the ECB reference rate visible on the guidance date (or nearest prior rate), and retain source amount, source currency, conversion rate, rate date, and ECB URL in the model input. Never add unlike currencies directly.
- Apply the same official-rate contract to financial statements. A cross-listed/ADR price ratio is not FX and must never convert financials; fixed currency fallbacks are forbidden. Store the paid source currency, target model currency, ECB rate pair/date/value/URL, conversion formula, and raw provider FX field at every converted PIT row, and fail closed when the event-visible official rate is unavailable.
- If official filings have been reviewed but contain no quantified group-level guidance, record `no_quantified_official_guidance`; do not manufacture a value. Private companies without public quarterly guidance remain explicitly uncovered.
- Missing values remain `null`. Never use zero, market price, a later filing, or a future share count to fill a historical financial input. A carried prior disclosed value must be explicitly recorded in `sourceRecord.metricDerivation`.
- Preserve Transcript/Q&A, users, portfolios, Guru/Ontology, prices, dividends, and podcast data. A production valuation refresh may replace only `valuation_pit_source_metadata`, `valuation_pit_financials`, `valuation_pit_guidance`, `valuation_pit_model_runs`, `valuation_ticker_snapshots`, and `valuation_snapshots`.
- Before replacing valuation snapshots, carry forward stored transcript Q&A and its bilingual fields only when the normalized fiscal period matches exactly; never carry guidance or model inputs from the prior snapshot. First rebuild English coverage with `TRANSCRIPT_QA_TRANSLATE_ZH=false`. Then generate and audit the local Qwen cache, and attach Chinese only with `TRANSCRIPT_QA_TRANSLATE_ZH=true`, a fixed `TRANSCRIPT_QA_GENERATED_AT`, and a persistent `TRANSCRIPT_QA_TRANSLATION_CACHE_PATH`. Translation is opt-in and cache-only; a missing cache item must fail the run instead of calling an online translator. Every modeled history row must have an explicit Q&A coverage status, every `has_qa` row must contain complete stored English and Chinese Q&A, and transcript research must be marked `includedInValuationInputs: false` so it cannot alter historical fair value.
- Transcript Q&A extraction must begin strictly after a detected Q&A boundary. Reject prepared-remarks questions, audio checks, procedural handoffs, name-only fragments, and answers without substantive management context. Rebuild Chinese fields with `scripts/translate-valuation-qa-mlx.py`; its deterministic number protection and audit sidecar must pass before enrichment, and the strict verifier must show every attached Q&A row is bilingual.
- Back up the AWS runtime database before the transaction. Abort and roll back if any required ticker is blocked, SQLite integrity fails, guidance is dated after its model node, or non-valuation table counts change.
- Run the valuation import twice on a release-database copy with the same validated fixed `PIT_VALUATION_GENERATED_AT`. Confirm ticker counts, model-run counts, focus ticker fair values, CIK-dependent supplements, model signatures, and snapshot signatures are identical before deploying; wall-clock timestamps must not make an otherwise deterministic release differ.
- Build current US index coverage from the official SPY holdings workbook and the paid Sharadar S&P 500 snapshot. Deduplicate issuers by normalized SEC CIK, retain alternate listed share classes as aliases, and choose the largest official SPY weight as the canonical share class. The release manifest must contain exactly 503 securities and 500 unique issuer CIKs.
- Keep existing non-index research tickers in Valuation unless the user explicitly retires them. A current S&P refresh is a union with tracked extras, not a destructive replacement of the research universe.
- Paid split-adjusted price rows must be strictly positive. Reject zero or negative closes when seeding, refreshing, selecting a historical price, and writing compact valuation snapshots. Every current S&P issuer and every retained tracked ticker must have a positive latest price and at least one positive stored price point before release.
- Treat `price_points` and paid split-adjusted ticker-snapshot OHLC values as already normalized to the quoted security currency. Map valuation aliases such as AZN and LSEG to `AZN.L` and `LSEG.L`, but never infer pence conversion from a `.L` suffix or divide a stored price again. The release verifier must reconcile every non-null model-node comparison price to the exact dated close in either raw `price_points` or the released paid ticker snapshot; a price absent from both sources is a release blocker.
- Every modeled historical node must retain both the selected fiscal-period source record and its ART trailing-twelve-month source record when available. Audit the filing/availability date for the base record, TTM record, every metric-level lineage record, guidance evidence, and FX conversion; none may occur after the model node.
- A single loss-making observed period may not supply the below-operating burden for normalized earnings. Use an observed burden only when both operating and net margins are positive. Only an explicitly cycle-normalized economic profile may fall back to its modeled operating margin and tax rate; other loss-making profiles require positive independent evidence or remain unmodeled.
- Apply valuation methods by economic profile. Banks, insurers, capital-markets firms, asset managers, and insurance brokers must not use customer cash flow in an operating-company DCF. Cyclical companies use through-cycle margins/earnings and a recorded FCF sustainability cap. Every DCF must satisfy the release bounds for WACC, terminal growth, WACC-minus-growth spread, and terminal-value share.
- Treat managed-care issuers and payment processors as customer/policyholder-cash businesses. They use point-in-time current/cycle EPS and must emit the customer-cash-flow exclusion; they must not use customer, settlement, or policyholder cash in FCFE DCF. Do not map PayPal, Fiserv, Global Payments, Corpay, FIS, or Block to either a generic software DCF or the Visa/Mastercard card-network profile.
- Use an issuer's economic profile, not only its broad sector label. CIEN and COHR use the optical-networking turnaround family; CPAY, FI/FISV, FIS, GPN, PYPL, and XYZ use the payment-processor family. Keep ticker-specific exceptions and the S&P universe manifest aligned.
- Base fair value must not contain a blanket platform, autonomy, space, or other optionality multiplier. Store an explicit optionality multiplier only as a separately labeled bull-case scenario input. Base-case hard ceilings are 40x EV/sales, 72x target P/E, and 65% normalized operating margin unless the release contract is deliberately revised with tests and an audit note.
- Reject an EV/sales component when net debt cancels at least 99% of its enterprise value. A tiny positive residual is false precision, not a defensible equity fair value; leave the PIT period explicitly unmodeled when no independent method remains.
- Use period-end quoted-security shares for per-share valuation: `sharesbas` first, then `shareswadil`, then `shareswa`, multiplied exactly once by the recorded applicable security factor. Never infer a split from a change in reported shares or retroactively rescale prior fair values. DGE.L is a London ordinary share and therefore records but does not apply the DEO ADR factor.
- A source fiscal period may be absent from model runs only when it is explicitly classified as non-modelable with an auditable reason. Never silently skip a period because earnings or FCF are negative.
- Run the strict release verifier before production: `node server/verifyPitValuationRelease.js <baseline.sqlite> <run1.sqlite> <run2.sqlite>`. It must report `status: pass`, identical model and snapshot signatures across both runs, zero unexplained temporal jumps, zero unexpected modelable gaps, zero source-date failures, zero non-positive stored prices, and unchanged non-valuation table counts.
- Generate the persistent all-ticker audit ledger with `SQLITE_DB_PATH=<candidate.sqlite> npm run audit:valuation:ledger`. Commit `server/reports/valuation-audit-ledger.json` and `.md`; production is blocked while the ledger contains any unresolved P0/P1 finding. Price/fair-value divergence is a watch item, never a reason to feed market price into fair value.
- Build the production artifact from one audited candidate with `python3 scripts/build-pit-migration-artifact.py --database <run1.sqlite> --release-audit <release-audit.json> --output <valuation-pit-migration.sqlite.gz>`. The generated manifest owns the artifact SHA-256, model version, strict-audit signatures, and expected table counts; never hand-edit those release values into the deployment hook.
- Deploy only a strict-audit candidate. Record the pre-deploy Elastic Beanstalk version, create a fresh compressed database backup and EBS snapshot, stage the six valuation tables, replace them in one `BEGIN IMMEDIATE` transaction, and retain the prior version and backup for rollback. Re-run health, coverage, valuation, Portfolio, Guru, Ontology, and Transcript checks against production before declaring the update complete.

## Bilingual UI Contract

Chinese and English are release-critical product modes, not best-effort labels.

- Route all Flutter UI copy through `context.tr`, `context.ui`, or the shared localization helpers. Route all standalone Ontology copy through `web/ontology/i18n.js`. Do not add visible hard-coded copy outside those layers.
- Translate API-supplied statuses, sectors, industries, strategy names, model labels, error messages, and dynamic sentence templates in both directions. Do not assume a backend value is already presentation-ready.
- English mode must contain zero CJK UI copy. Chinese mode must contain zero untranslated interface copy; official company names, tickers, brands, source titles, and standard financial acronyms are the only allowed exceptions.
- Include navigation, filters, buttons, charts, tables, dialogs, tooltips, placeholders, loading, empty, disabled, warning, and error states in every language review.
- Preserve language across Flutter/Ontology navigation and URL state. The compact mobile header must always expose a language switch without requiring horizontal scrolling.
- Whenever `web/ontology/styles.css`, `web/ontology/i18n.js`, or `web/ontology/app.js` changes, bump their shared query-string asset version in `web/ontology/index.html` to prevent stale mixed-language clients.
- Before publishing a UI change, run `npm run audit:i18n`, `flutter analyze`, `flutter test`, `npm run verify:ontology-module`, `npm run test:ontology`, and `npm run build`. Verify both languages on desktop and a 390x844 mobile viewport, including dynamically opened Ontology panels and dialogs.
- Keep the current release ledger in `docs/audits/bilingual-coverage-2026-08-30.md` and update it whenever a new user-facing surface is added.
