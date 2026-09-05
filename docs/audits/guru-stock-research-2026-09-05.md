# Guru → Valuation integration and stock branding audit

Date: 2026-09-05. Scope: implementation on trunk after fd91fa2. This audit records the pre-release verification; deployment was separately authorized after the implementation handoff.

## Delivered behavior

- Desktop: a 580px right-side stock valuation drawer. Mobile: full-screen stock detail. Closing pops only the overlay, retaining the original Guru widget, filters, quarter and simulation range.
- Holdings, reported changes, quarterly contribution and position-history stock labels open the same research component. Existing trade/quarter row selection is retained. Private/unresolved rows cannot trigger a public valuation.
- Quarterly Market Lens opens research inside its existing detail pane, with a return to manager-level evidence; it does not stack dialogs or discard the ranking selection.
- Summary uses the canonical `/api/valuation/:ticker?pricePoints=300&detail=summary`; full research requests 900 points only after a click. Charts and change drivers reuse the terminal's existing implementation. No valuation, ownership, 13F, price, backtest or curve data was changed.
- Response cache is scoped to the API client/session, bounded to 24 entries and five minutes, and coalesces identical concurrent requests. Request sequencing rejects late ticker responses; unrelated/default-ticker payloads are never substituted.
- Model node date, market-price date, model fair value and model gap remain distinct. Data lineage, economic model validation and market calibration are separate statuses. No buy recommendation or inferred Guru entry price is generated.
- The primary full-research action and return control stay visible in a fixed footer.

## Stock Logo coverage

`web/stock-logos/manifest.json` is the reproducible asset ledger: 1,548 recognized symbols / 1,548 PNG assets, about 20.4 MB on disk. Assets are requested on demand, not embedded in the initial Flutter bundle. Every asset has a source URL, date, dimensions, size and SHA-256. All assets passed PNG and hash checks; representative high-visibility marks and provider exceptions were visually inspected. This is not a claim that every third-party mark has received a manual trademark/identity audit.

The common StockLogo component is used in Guru holdings, changes, contribution, position history, latest signals, quarterly concentration/add/trim rows, Market Lens, Valuation cells/selected research and existing Portfolio/Dividend logo placements. Ontology uses the same asset paths in company tables, signals, graph nodes and detail headings. Missing future assets fall back to an exact-ticker backend lookup and finally a clearly labeled ticker placeholder. Share classes and exchange suffixes are not heuristically stripped.

Four FMP images were discovered to be generic US flags (ASIC, HNGE, SLDE, VOYG). They were excluded and moved recoverably to `output/stock-logo-audit-2026-09-05/rejected/`. Correct issuer imagery was subsequently sourced. Recent renamed issuers NXH and VMRK were verified against their own sites; the older JWSM brand image is used for JWSMF. Current branding is not evidence of historical ticker/security identity.

Official exception provenance:

- [Ategrity](https://ategrity.com/)
- [Hinge Health](https://www.hingehealth.com/about/)
- [Slide Insurance](https://www.slideinsurance.com/about)
- [Voyager Technologies](https://voyagertechnologies.com/)
- [Neighborhood Intelligence](https://www.neighborhoodintelligence.com/)
- [Vivmark Residential](https://investors.vivmarkresidential.com/)
- [JAWS Mustang official governance document](https://jawsspac.com/documents/Mustang-Corporate-Governance-Guidelines_%2873936231_2%29.pdf)

Important denominator: this covers the local valuation universe, resolved Guru security master, retained research and local snapshot tickers. The security master separately contains 886 unresolved/ambiguous records; assigning them a guessed company logo would be unsafe. The local SQLite file is a partial fixture, not the full AWS dataset.

## Verification and release boundary

- Flutter: existing 81 regression tests, plus 9 focused tests (90 total), including desktop 1280×720/mobile 390×844 in both languages, context retention, inline Market Lens return, private-security blocking, cache behavior and request races.
- Backend branding: five tests, including all 1,548 asset hashes, exact venue/class handling, bounded remote responses, negative caching and concurrent request coalescing.
- Performance regression suite: 40 tests passed. Ontology: 22 JavaScript and three Python tests passed. Bilingual literal/translation audit includes the new Dart part and passed. Production build succeeded; analyzer reported no issues.
- Browser QA uses the real components and the reviewed public ISRG case; the full-terminal local adapter reads the partial local Guru fixture without migrations or writes. Preview data is explicitly not a live production read.
- Browser interactions verified the fixed footer, full-research expansion, native change-driver/model-book rendering and context-preserving return. Actual Guru entry was also checked with an explicit unavailable-valuation response from the restricted local adapter. See project-root `design-qa.md` for scoped visual findings and remaining release checks.
- AWS read-only coverage check: the Elastic Beanstalk instance was resolved, but SSM returned `InvalidInstanceId` and the managed-instance query was empty. No SSH/IAM/SSM setup or production mutation was attempted. The full live holdings universe and deployed behavior therefore remain unverified.
- Release verification must distinguish deployed files from the still-unverified full live ticker universe and authenticated Guru→Valuation flow. Reconcile any additional issuer assets without claiming the local denominator covers every production holding.

## Reproduction

Asset refresh: `node scripts/sync-stock-logos.mjs` (financial inputs read-only).

Tests: `flutter analyze`, `flutter test`, `node --test server/stockLogoAssets.test.js`, `npm run audit:i18n`, `npm run test:performance`, `npm run verify:ontology-module`, `npm run test:ontology`, `npm run build`.

Visual harness: `tool/stock_research_preview.dart` and `tool/stock_research_preview_server.mjs` are local QA tools only and are not production entrypoints. Screenshots are under `output/stock-research-qa-2026-09-05/`.
