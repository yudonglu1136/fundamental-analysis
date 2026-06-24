# Platform Feature Audit - 2026-06-24

This audit is the working checklist for Guru Intelligence. It inventories the product surface, records current evidence from the codebase, and tracks fixes by priority.

## Operating Rules

| Rule | Check |
| --- | --- |
| Frontend deploys on Vercel only | `AGENTS.md`, `docs/deployment-contract.md` |
| AWS Elastic Beanstalk is API/backend only | `AGENTS.md`, `docs/deployment-contract.md` |
| Browser app calls `/api/*` through the Vercel proxy in production | `apiUri()` falls back to relative URLs outside localhost |
| Supabase service-role keys must never be bundled into the frontend | Frontend only expects publishable anon key |
| Portfolio/Yodlee credentials stay backend-side and encrypted | Portfolio connection APIs are backend endpoints |

## Skills Installed For This Audit

| Skill | Purpose | Note |
| --- | --- | --- |
| Product Design audit | UX journey and screen-level audit methodology | Used for the feature checklist structure |
| Playwright | Browser flow verification | Installed locally for future visual regression checks |
| Screenshot | Visual evidence capture | Installed locally for future page-state audits |
| Security best practices | Auth, data isolation, credential handling review | Installed locally for follow-up security audit |
| Sentry | Runtime issue/observability planning | Installed locally for production monitoring follow-up |

## Feature Inventory And Audit Table

| Area | Feature | User Goal | Evidence | UX Check | System Check | Priority | Recommendation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | Google/Supabase login | Sign in once and keep user state stable | `AuthGate`, `LoginScreen`, Supabase init | Clear disabled state when keys/auth unreachable | Supabase init timeout exists; runtime env must be present in Vercel | P0 | Add deploy verification for Supabase env and make auth errors actionable | Open |
| Global shell | App nav, language, refresh, route memory | Stay on current page/module after refresh or data reload | `TerminalHome`, `TerminalHeader`, query persistence | Current route is persisted for mode/guru/module/ticker/lang | Secondary load now has stale request guard; API timeout/retry added | P0 | Continue with module-level stale guards for detail panels | First pass fixed |
| Guru universe | Guru/firm search and filters | Find a guru quickly on desktop/mobile | `GuruUniversePanel`, `MobileGuruPicker` | Search/filter exists; mobile picker exists | All guru payload loaded upfront | P1 | Add result counts, empty state actions, and defer heavy right rail data where possible | Open |
| Guru profiles | Header, avatars, metrics | Understand selected investor context | `GuruWorkspaceHeader`, avatar helpers | Avatar fallback exists; AI portrait persistence has been requested | Needs asset/data completeness checks | P1 | Add avatar health audit and missing portrait queue | Open |
| Guru simulation | Portfolio vs SPY, time bar, hover, latest holdings | Compare guru copy performance across long history | `GuruSimulationModule`, `/api/gurus/:id/backtest` | Range presets and hover exist | Chart sampling exists; backend backtest freshness must be monitored | P0 | Add freshness badge/admin job status and retry current module reload | Open |
| Guru trades | New buys/sells and price action | Click a stock and see buy/sell interval on price chart | `GuruTradeModule`, `PriceActionChart` | Core flow exists | Depends on ticker price coverage | P1 | Add missing-price explanation and queued fetch state | Open |
| Guru attribution | Quarterly contribution | Select historical quarter and see contribution by holdings | `GuruQuarterContributionModule` | Horizontal quarter card selector exists | Needs coverage warnings for partial holdings/prices | P1 | Add coverage badge and missing constituents list | Open |
| Right rail | Signal board and crowded holdings carousel | See market-wide top signals without blocking primary work | `GuruRightRail`, signal/heatmap helpers | Compact right rail exists | Aggregation logic needs regression tests | P1 | Add card-level source/date labels and unit tests for aggregation | Open |
| DBMF | Exposure book | See current DBMF sleeves, direction, prior position marker | `DbmfCompactDashboard` | Clean exposure table exists | Needs data freshness and previous period coverage check | P1 | Add timestamp, hover details, and stale-data warning | Open |
| Valuation matrix | Search and rank tickers | Find valuation candidates and filter by ticker | `ValuationCompactDashboard`, `ValuationTickerPickerCard` | Search exists | Ticker detail now caches in memory and rejects stale responses | P0 | Split list summary from ticker detail on the backend next | First pass fixed |
| Valuation detail | Price/fair value chart and quarter cards | Select quarters and inspect model assumptions | `ValuationTickerDetailPanel`, `ValuationTrendChart`, `ValuationQuarterResearchPanel` | Quarter cards and chart exist | Selected card should highlight chart point; detail endpoint requests 900 price points | P1 | Keep selected-quarter highlight robust and reduce initial detail payload | Open |
| Valuation Q&A | Earnings call analyst questions and management answers | Read original and Chinese/English transcript Q&A | `ValuationResearchCard`, `/api/translate/zh` | Toggle exists | Translation quality and coverage remain open | P0 | Store polished bilingual Q&A in DB, not runtime mixed translation | Open |
| Podcast insights | YouTube transcript forward-looking views | See who said what and conclusion per ticker | `ValuationPodcastInsightCard` | Insight cards exist | Needs speaker attribution and conclusion extraction | P1 | Persist conclusion, speaker/channel, evidence quote, and stance | Open |
| Portfolio connection | IBKR/Yodlee setup and multi-account sync | Register once, then sync data without re-entering credentials | Portfolio connection APIs and panels | Onboarding exists | Sync can fail silently or return empty upstream history | P0 | Add first-sync job state, user-visible diagnostics, and admin replay | Open |
| Portfolio holdings | Holdings, logos, valuation gap | Compare own positions with latest model fair value | `PortfolioDashboard`, holdings table | Gap labels exist | UK ticker canonicalization and logo coverage need auditing | P0 | Canonicalize UK tickers (`.L`) and add logo backfill job | Open |
| Portfolio analytics | One-year return, volatility, Sharpe, forward scenario | Understand portfolio risk/return | `PortfolioAnalyticsPanel` | Cards exist | Requires reliable holdings, prices, and valuation coverage | P1 | Add method notes and coverage thresholds before showing metrics | Open |
| Dividend calendar | Income card, monthly bars, calendar/list, hover components | See past/current/forward dividend cash flow by holding | `PortfolioDividendCalendarSection` and child widgets | Rich calendar exists | Currency normalization, historical periods, and month paging issues reported | P0 | Normalize GBp/GBP, support 2025/2026/one-year-ahead ranges, fix month pager | Open |
| Admin | User list and portfolio drilldown | Owner can inspect all accounts safely | `AdminPortfolioDashboard`, admin APIs | Admin tab only for configured email | Needs email visibility and least-privilege verification | P0 | Verify admin auth, show user email from backend, add audit log | Open |
| Scheduled jobs | Backtests, NAV, dividends, logos, transcript Q&A | Keep data fresh automatically | `/api/internal/backtests/*`, scripts | Manual refresh exists | Needs durable daily/weekly scheduler and health dashboard | P0 | Add cron status table and admin refresh controls per job | Open |
| Performance | Page load and long-lived sessions | Avoid browser refresh to recover | `ApiClient`, `TerminalHome`, `SecondaryDashboard` | Empty secondary dashboards now self-recover without a browser reload | API calls time out; idempotent GETs retry once; top-level and valuation detail stale responses are ignored | P0 | Add data freshness telemetry and job health status | Second pass fixed |
| Observability | Diagnose production failures | Know if Vercel/AWS/Supabase/data jobs are healthy | deployment docs, health route | No unified in-app status | `/api/health` exists | P1 | Add admin system health panel: API, DB mtime, job status, Vercel env check | Open |
| iOS readiness | App Store version | Prepare native app shell and assets | `docs/ios-*` | Docs started | Native Flutter platform shell and Apple requirements remain | P2 | Add Apple sign-in, deletion, privacy labels, app icons/screenshots | Open |

## First Optimization Batch

| Item | Why Now | Planned Fix | Status |
| --- | --- | --- | --- |
| API request timeout | Prevents screens from waiting forever when backend/proxy stalls | Add a 25s client timeout with clearer error messages | Fixed |
| Transient GET retry | Reduces blank screens from short network/AWS hiccups | Retry idempotent GETs once after a short delay | Fixed |
| Stale response guard | Prevents old tab/page responses from replacing current page state | Add request serial checks to guru and secondary loaders | Fixed |
| In-page recovery | Avoids full browser reload when a secondary page shows no loaded data | Add a current-page reload action in the empty secondary dashboard state | Fixed |
| Audit trail | Keeps future agents from guessing platform scope | Commit this table and update status as work closes | Fixed |
