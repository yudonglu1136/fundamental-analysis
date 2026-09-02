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

## Performance Regression Contract (2026-08-30)

- Measure backend changes with `npm run bench:api` against the same SQLite and
  Ontology snapshots, runtime, sample count, and concurrency. Use at least 60
  samples and concurrency 20 for a release comparison; run both revisions three
  times and compare the median results.
- A performance optimization is complete only when at least one critical path
  improves p95 latency by 30% or more, no other measured critical path regresses
  by more than 5%, response semantic hashes remain unchanged, large JSON
  responses save at least 75% over identity transfer, and conditional requests
  return 304. Run `npm run check:performance` for the machine-readable gate.
- Run `npm run test:performance` for every transport, cache, payload-shaping,
  proxy, or static-cache change. This is additive to the normal server, Flutter,
  Ontology, i18n, and production-build checks.
- The Vercel API proxy must preserve streaming, `Accept-Encoding`,
  `Content-Encoding`, `Content-Length`, `ETag`, and `If-None-Match`; do not
  re-buffer an upstream response or silently discard its compression metadata.
- Keep the Valuation landing request on `detail=summary&pricePoints=300`; fetch
  `detail=full&pricePoints=900` only after the user opens full research. A
  non-Guru initial route must not fetch `/api/gurus` until Guru is opened.
- Use immutable caching only for content-versioned URLs. When an immutable
  avatar or Ontology asset changes, update its URL version in the same release.
  Keep HTML, Flutter bootstrap/main/service-worker files, and Ontology HTML on
  revalidation. Legacy service-worker cache cleanup must run once per migration,
  not on every visit.
- Store the reproducible benchmark inputs, before/after results, tests, and
  limitations under `docs/performance/YYYY-MM-DD/`. Do not claim production
  latency from a local benchmark, and do not deploy as part of an optimization
  audit unless the user explicitly requests deployment.

## 13F Update Contract

When the user asks to update 13F, guru holdings, Q2/Q3 data, new buys/sells, quarterly contribution, or position history, treat it as one atomic data-refresh job. Do not update only one cache.

Required update surfaces:

- `guru_snapshots`: selected guru header, latest quarter, filing date, filing lag, AUM, holdings count, latest holdings, and new buy/sell activity.
- `dashboard_snapshots`: guru list, overview cards, signal board, ticker heatmap, and cross-guru aggregates.
- `guru_exposure_snapshots`: 13F book history / position trajectory tab.
- `guru_backtests`: copy simulation and quarterly contribution.
- Market prices used by backtests must be current enough for the selected period; refresh latest prices first if the backtest end date is stale.
- If a manager changes or adds SEC reporting entities, add the new filer to `alternateCiks` in `server/gurus.js` and verify all 13F readers merge every CIK. Do not rely on the original `cik` only. Example: Bill Ackman/Pershing Square uses PSCM plus PERSHING SQUARE INC. after the reporting-entity transition.
- The product-default manager backtest is the trailing five-year audited window. Keep the 90% adjusted-close execution-coverage gate and leave missing weight in cash; never make a curve appear by lowering the gate or renormalizing only the covered subset. `years=all` remains an explicit forensic mode and must fail closed while legacy text 13F tables or point-in-time security histories are incomplete.
- Treat issuer and CUSIP continuity as audited security-master data. In particular, Howard Hughes CUSIP `44267D107` continues 1:1 into `HHH`, and Canadian Pacific CUSIPs `13645T100` and `13646K108` use ticker `CP`. Do not revert these to stale or unmapped symbols.
- A refresh is successful only when an enabled manager's backtest is `ready`; `insufficient_data` is a failed refresh, not a completed one. A manager with `disableSimulation: true` must return `unsupported`.
- An adjusted SQLite price subset is not proof that the requested history is covered. Refresh both a truncated database range and any internal hole against the benchmark's expected trading sessions from the upstream source, then let the active-holding engine decide whether a shorter IPO/delisting history or genuine trading halt is legitimate; never treat any non-empty adjusted subset as a full-range cache hit, skip an internal session, or forward-fill it.
- A production price repair must use exact independently verified provider rows through the internal audited repair route. Create a fresh EBS snapshot before the write, validate every OHLC/adjusted-close value, write the entire batch and its SHA-256 audit record in one transaction, and refresh the affected backtest. Never interpolate, forward-fill, lower coverage, commit licensed rows to Git, or expose provider/API credentials.
- Treat a shared trailing market-data cutoff as a bounded operational heuristic, not proof that no halt or corporate action occurred. It may move the effective backtest end only when the SPY series reaches its requested market end and at least two active holdings share the exact same trailing cutoff, and only within seven calendar days. Persist the requested end, requested market end, effective end, lag, stale tickers, and every active ticker's latest date. A single stale security, mixed cutoff dates, internal price gap, or lag beyond the bound remains fail closed; investigate repeated or issuer-specific gaps rather than widening the heuristic.

Use the unified command or endpoint:

- Local/CLI: `npm run refresh:13f -- --reason=manual-13f-update --years=5 --detail=compact --exposure-limit=40`
- Production internal API: `POST https://www.thesisforge.tech/api/internal/gurus/refresh` with `Authorization: Bearer $INTERNAL_CRON_SECRET`.
- Status check: `GET https://www.thesisforge.tech/api/internal/gurus/refresh/status`.

Verification after every 13F update:

1. Check `/api/health` and confirm the database timestamp moved.
2. Check `/api/gurus?refresh=1` or the relevant guru detail endpoint and confirm latest quarter, filing date, holdings count, and activity changed together.
3. Check `/api/gurus/{id}/backtest?years=5&detail=compact` for the product simulation and quarterly contribution. Check `years=all` separately only as a forensic coverage audit.
4. Check `/api/gurus/{id}/exposure?limit=40` for position history.
5. Verify the Vercel frontend at `https://www.thesisforge.tech` still talks to AWS through `/api/*` and does not hit the AWS frontend fallback.

If a manager has filed only `13F-NT` or a 13F without a usable information table, do not fabricate holdings. Keep the prior usable `13F-HR` quarter for holdings/backtest and surface the missing-information-table state in the refresh job errors.

## Valuation PIT Data Contract

When valuation financials, management guidance, or historical fair values are refreshed, replace the valuation layer atomically. Do not mix legacy SEC/Trinity financial rows with the PIT dataset.

- US financials come from `jansen_us_firm_replication` Sharadar SF1 `ARQ` and `ART` records. Select the earliest `datekey` available for each fiscal period; exclude later restatements from historical point-in-time runs.
- Select financials independently for every fiscal period: prefer an `ARQ` row only when it contains core financials, otherwise use that period's valid `ART` row. Mark `ART` as trailing-twelve-month data so it is never multiplied by four or rolled into another TTM window. Do not use `MRQ`, `MRT`, or `MRY` dimensions for historical replay.
- BAE Systems (`BA.L`) and LSEG use official issuer releases. FY and H1 disclosures may be converted to TTM; Q1/Q3 trading updates may carry the latest already-disclosed TTM financial base and add only guidance visible on that event date. Record this construction and every source URL in `sourceRecord`.
- For UK issuer PDFs, normalize split thousands and decimals before parsing (`£9, 982m` means £9,982m; `£2. 2bn` means £2.2bn). Prefer exact table values over rounded headlines. When LSEG presents both pro-forma and statutory tables, use the statutory continuing-operations table for PIT financials and record that basis in `sourceRecord`; pro-forma acquisition comparatives are context, not reported history. Use operating/adjusted net debt from LSEG's management leverage framework before accounting total/net debt fallbacks, and record the selected debt basis. When an H1 release restates the prior H1 comparator, use that event-visible comparator in `current H1 + prior FY - prior H1`; do not reuse the older definition. Treat issuer-reported equity free cash flow as direct FCFE, not as CFO, and retain it when CFO/capex fields are unavailable. If an official issuer release and a transcript extraction provide the same guidance metric in one fiscal period, the official release is model-authoritative while the raw transcript evidence remains stored for audit.
- The dated LSEG current-valuation overlay (2026-08-28 assumptions, 2026-08-30 release) must keep three amounts distinct: issuer-reported consolidated Equity FCF, analyst-estimated parent-economic FCFE, and any FCFF/enterprise-value cash flow. The parent-economic FCFE DCF uses levered cost of equity, five explicit year-end cash flows, current ordinary shares excluding treasury, and no second deduction for net debt or Tradeweb/NCI. Its standalone DCF value must remain separately visible from the 40% DCF / 30% operating SOTP / 30% adjusted-EPS triangulation and the subsequent risk reserve. The analyst ownership adjustment, SOTP, and risk reserve must be labeled as estimates rather than issuer guidance. Never apply these 2026-08-28 assumptions retroactively to historical PIT rows, never use the 497m H1 weighted-average EPS denominator as the current-share DCF denominator, and never add buybacks or dividends again after valuing FCFE. A persisted valuation node dated after 2026-08-28 supersedes this overlay automatically; replace it only with a newly dated and audited model revision.
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

## Guru Terminal Visual Baseline (2026-09-02)

- Preserve the compact three-column Guru research terminal established by the
  2026-08-31 Bill Ackman reference screen: universe rail, research workspace,
  and signal/market-lens rail remain visible together at desktop widths.
- Keep the desktop brand subtitle as `Guru Stock Analysis`, the functional
  `Gurus / Firms` universe switch, the compact five-metric manager header, the
  `New Buys & Sells` module label, and the `1Y / 3Y / 5Y` chart controls. The
  full audited backtest window is labeled `5Y`; do not expose `10Y` or `All`
  until those longer windows are actually requested and audited. Do not replace
  this shell with a taller audit-card layout unless the user explicitly requests
  a redesign.
- The compact header must remain economically accurate: `Reported 13F value`
  is the reported information-table market value, not total fund AUM. Keep
  common-long and option attribution available in research detail even when the
  compact header does not show separate cards.
- Retain the quarterly Market Lens, Renaissance coverage, audited five-year
  default backtest, force-refresh path, truth-state status, and bilingual error
  handling behind the restored visual shell. A visual restoration must never
  roll back those data or safety features.
- Every deck page with a bounded height must scroll its rows rather than use an
  overflowing `Column`. Verify the Guru page at 1280x720 and 390x844 with zero
  Flutter render overflows before release.

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

## Social Creative Data Contract

- Keep the current ThesisForge social brand pack under
  `docs/brand/2026-08-30/`. New assets in this release family must retain the
  August 30, 2026 release date while separately displaying the true underlying
  data cut; never relabel stale market or strategy data as August 30.
- The canonical NVDA Q2 valuation asset is
  `nvda-q2-valuation-card-windowed-en-1600x900.png`, generated by
  `scripts/export-nvda-q2-valuation-social.mjs` from the audited v55 NVDA PIT
  snapshot and the preserved native curve crop
  `nvda-q2-valuation-curve-windowed-source.png`. Its chart viewport begins at
  the first valid fair-value node rather than the earlier price-only history;
  the source database history remains intact. Its release date is 2026-08-30,
  its valuation node is 2026-08-26, and its latest market-price observation is
  2026-08-27. Preserve the native curve, axes, dates, and legend; never redraw,
  smooth, or manually reshape it. The $274.86 headline is a 36% EV/sales / 32%
  normalized-earnings / 32% FCFE-DCF blended fair value, not a standalone DCF.
  Keep reported TTM FCF ($127.0bn) distinct from forward model FCF ($182.2bn),
  and label the $108bn Q3 revenue amount as management guidance with a ±2%
  range. At the $227.98 price cut the modeled gap is 20.6%, so use
  `Undervalued` or `model gap`, never `very cheap`, `deep value`, or a
  guaranteed-return claim. The NVIDIA mark must come only from the official
  NVIDIA Newsroom asset preserved at
  `assets/branding/external/nvidia-logo-horiz-wht-16x9-official.png`; keep its
  artwork, proportions, colors, and clear space unchanged and visually separate
  it from ThesisForge branding. Always include the NVIDIA trademark notice plus
  an independent-research/no-affiliation-or-endorsement disclosure.
- Strategy graphics must render exact reproducible observations. Do not invent,
  smooth, or manually reshape an equity curve. Preserve the source series,
  methodology, validation status, caveats, and provenance beside the exported
  image.
- The canonical Ontology social asset is
  `ontology-soft-overlay-6m-en-1600x900.png`, generated by
  `scripts/export-ontology-strategy-social.mjs` from the full 2,165-point
  `ontology-soft-overlay-6m-equity-daily.json` series. Its release date is
  2026-08-30 and its latest reproducible strategy data is 2026-08-13.
- The canonical PLTR evidence asset is
  `pltr-ontology-case-study-en-1600x900.png`, generated by
  `scripts/export-pltr-ontology-case-study.mjs` from
  `pltr-ontology-case-study-data.json`. Its release date is 2026-08-30, its
  filing data cut is 2026-08-04, and its verified post-filing heat snapshot is
  2026-08-05. The graphic is a Q2 confirmation story, not a post-Q2 rank-jump
  story.
- Describe the PLTR case study as an August 2026 point-in-time diagnostic
  replay, never as proof that a live alert was archived or delivered. On the
  historical AI value-chain financial-change ranking, PLTR was already #2/74
  with heat 85.2 on 2026-07-31 and remained #2/74 with heat 85.7 on the
  2026-08-04 filing date (85.9 on the next trading day). Say Q2 confirmed an
  existing lead; do not say the latest Q2 caused the ranking to explode.
- `Heat rank` is the descending `heat_score` order on the historical ranking
  tab over 74 graph companies with a report period and normal signal state.
  It is separate from V2 decision-snapshot `ontology_score` ordering,
  strategy/book ranks, valuation, and price performance. In particular, the
  V2 decision ordering moved from #18/146 at 1.318 on 2026-07-31 to #32/177 at
  1.166 on 2026-08-13; never mix that series into the heat-rank chart.
- The actual historical heat-rank breakout occurred after 2025 Q3: #6/74 on
  2025-10-31, #3 on 2025-11-04, #2 on 2025-11-05, and #1 on 2025-11-14.
  PLTR remained #1 on 2026-02-17 and had been #2 since 2026-03-19 before the
  latest Q2 filing. Keep this history distinct from the V2 sequence: first
  green flag on 2025-08-06, reset to watch on 2025-11-05, peer-context rebuild
  on 2026-02-18, and fixed-rule Top-20 replay entry on 2026-05-08.
- The canonical PLTR product screenshot is
  `pltr-ontology-graph-screenshot-en-1600x900.png`, generated by
  `scripts/export-pltr-ontology-graph-screenshot.mjs` from the preserved
  `pltr-ontology-graph-source.png`. Package the screenshot only outside its
  rounded frame: do not regenerate, relabel, retouch, or crop away the selected
  PLTR node, the right-side PLTR detail panel, or the visible data cut. Keep the
  official ThesisForge mark deterministic and add no Palantir logo or implied
  endorsement.
- In PLTR materials, `peer context` means the Ontology V2 broad-stage composite
  score. It is not peer-stock performance, measured customer contracts, or
  revenue, and it must not be conflated with the V4 soft overlay's separate
  `peer_confirmed` field. The latest V2 peer-context score stayed elevated but
  declined quarter over quarter; do not say it exploded in the latest quarter.
- Treat “Palantir is becoming mission-critical software for the AI era” as a
  ThesisForge research interpretation, not a model output or established fact.
  Use the Palantir name and PLTR ticker only for editorial identification; do
  not use Palantir logos, interface captures, trade dress, or imply affiliation
  or endorsement. Keep the independent-research and no-affiliation disclosure.
- Competition and mission-criticality claims in PLTR social copy must be tied to
  primary evidence: official customer deployment demonstrations plus public
  procurement, evaluation, justification, or award records. Treat
  Palantir-produced customer videos as issuer/customer claims and government
  award records as procurement facts. Do not say every case or tender was
  reviewed unless a complete source ledger exists, and keep “mission-critical”
  explicitly framed as the ThesisForge conclusion.
- Describe the 2018–2026 Ontology result as a diagnostic research evaluation,
  not a live result or fresh blind test. Always disclose the −42.5% historical
  maximum drawdown, high turnover, modeled-cost basis, and that the V4 overlay's
  incremental bootstrap 95% confidence interval versus V2 crosses zero.
- Keep the ThesisForge mark, dark navy shell, mint strategy line, amber benchmark,
  red risk treatment, and `thesisforge.tech` lockup deterministic. Generated
  imagery may be used only as a low-contrast atmospheric background, never for
  exact copy, logos, portfolio holdings, or quantitative charts.
- The canonical Gavin Baker sector-edge asset is
  `gavin-baker-sector-edge-en-1600x900.png`, generated by
  `scripts/export-gavin-baker-sector-edge-social.mjs` from the public-filing
  production backtest, official Atreides SEC 13F reported-share history, and
  the frozen Sharadar SF1 taxonomy. Its release date is 2026-08-30. The card
  covers 26 completed filing-to-filing windows from 2020-02-14 through
  2026-08-14 and 634 priced common-stock observations; exclude the current
  incomplete 2026 Q2 window. `Win` means beating SPY over the identical public
  filing-execution window, and `payoff` means average positive excess return
  divided by the absolute average negative excess return. `High-conviction
  add` means a new common-stock position or at least a 50% quarter-over-quarter
  increase in reported shares ending at 10% or more of the priced disclosed
  long book. The displayed 48% / 1.52x overall big-add result and 63% / 3.33x
  semiconductor big-add result are delayed 13F proxies; the semiconductor
  subset has only eight observations. Never present them as Gavin Baker's
  personal trades or Atreides fund performance, and retain the disclosure that
  13F omits shorts, cash, private assets, derivatives, and intra-quarter trades.
- The canonical 10-second ThesisForge product promo is
  `thesisforge-system-promo-en-10s-1920x1080.mp4`, generated by
  `scripts/export-thesisforge-system-promo-video.mjs`. Its release date is
  2026-08-30 and its preserved product recording was captured on 2026-08-14.
  Keep the source Market Ontology UI recognizable: cropping, scaling,
  color-balancing, framing, and deterministic motion overlays are allowed, but
  never redraw, relabel, or fabricate the recorded product state. Preserve the
  10.0-second duration, 1920x1080 16:9 canvas, 30 fps H.264/AAC delivery,
  ThesisForge mark, `thesisforge.tech` CTA, and exact copy recorded in the
  companion manifest. The `500+ companies` statement is a coverage claim, not
  a performance claim. Keep `Research only · not investment advice` visible.
