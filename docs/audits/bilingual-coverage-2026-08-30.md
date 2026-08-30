# Bilingual Coverage Audit

Date: 2026-08-30
Scope: Flutter application, standalone Ontology explorer, dynamic API labels, desktop and mobile layouts.

## Acceptance Contract

- English mode contains no CJK UI copy. Company names, tickers, brand names, and standard financial acronyms are allowed.
- Chinese mode contains no untranslated interface copy. Company legal names, tickers, brand names, source titles, and standard financial acronyms may remain in their official form.
- Language choice survives navigation between the Flutter shell and `/ontology/` and is represented in the URL where required.
- Navigation, filters, buttons, charts, tables, cards, dialogs, tooltips, loading states, empty states, errors, and API-supplied labels use the same language.
- Desktop and 390px mobile layouts must expose a usable language control without overflow.

## Coverage Ledger

| Surface | Desktop ZH | Desktop EN | Mobile ZH | Mobile EN | Dynamic / hidden states | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication and login | PASS | PASS | PASS | PASS | Provider, bypass, validation, error copy | PASS |
| Global header and navigation | PASS | PASS | PASS | PASS | Tooltips, account menu, refresh, contrast | PASS |
| Guru overview | PASS | PASS | PASS | PASS | Guru type, source, strategy tags, empty/error states | PASS |
| Guru simulation and backtest | PASS | PASS | PASS | PASS | Period controls, metrics, chart labels, warnings | PASS |
| Guru buys/sells and contribution | PASS | PASS | PASS | PASS | Activity types, dynamic ticker context, chart labels | PASS |
| Guru 13F history | PASS | PASS | PASS | PASS | Filing status, quarter labels, exposure states | PASS |
| Ontology strategy view | PASS | PASS | PASS | PASS | Strategy names, descriptions, parameters, validation copy | PASS |
| Ontology decision history | PASS | PASS | PASS | PASS | Decision drawer, BUY/SELL, reason and risk labels | PASS |
| Ontology market map | PASS | PASS | PASS | PASS | Sector, industry, company modal, financial drivers | PASS |
| Ontology graph | PASS | PASS | PASS | PASS | Node labels, relationships, company dialog | PASS |
| Ontology ranking | PASS | PASS | PASS | PASS | Ranking labels, company detail, score components | PASS |
| Ontology methodology | PASS | PASS | PASS | PASS | Source names, model terms, risk and validation text | PASS |
| Valuation market map | PASS | PASS | PASS | PASS | Sector/industry taxonomy, filters, distribution bars | PASS |
| Valuation company research | PASS | PASS | PASS | PASS | PIT source, guidance, model methods, Q&A and errors | PASS |
| Portfolio cockpit | PASS | PASS | PASS | PASS | Connection status, NAV, allocation, risk and empty states | PASS |
| Portfolio dividends and analytics | PASS | PASS | PASS | PASS | Month labels, currencies, valuation status, notices | PASS |
| Admin health and user index | PASS | PASS | PASS | PASS | Job status, user status, search, empty/error states | PASS |
| Admin read-only portfolio detail | PASS | PASS | PASS | PASS | Selected-user detail and nested Portfolio surfaces | PASS |

## Fixed Findings

| Finding | Fix |
| --- | --- |
| Independent Ontology page did not share the application language state | Added a standalone bidirectional translation layer, URL/local-storage state, and cross-module language links. |
| API-supplied labels could bypass static dictionaries | Added dynamic templates and exact mappings for sectors, industries, categories, strategies, companies, statuses, and financial-driver text. |
| English Ontology could expose Chinese after opening dialogs | Mutation-based localization now covers inserted nodes, attributes, dialog content, and asynchronously rendered values. |
| Chinese Ontology retained English taxonomy and signal labels | Added reverse exact mappings for the complete released sector/industry/security taxonomy and trading signals. |
| Mobile header could hide the language control in horizontal navigation | Added one fixed compact language button in the first header row and removed the duplicate mobile language segment below. |
| Decision replay and market detail could expand the mobile document width | Compressed timeline bars responsively and contained wide data tables, company controls, and dialogs within local scroll surfaces. |
| Six Ontology view tabs could overflow the desktop header at intermediate widths | Added stable two-row and three-row header layouts for 761–1540px viewports. |
| Reverse translation could mutate legal names containing a status token, such as `COMPASS` | Replaced raw substring rewrites with ASCII word-boundary matching and added a non-corruption regression assertion. |
| Browser cache could retain stale Ontology translations | Versioned Ontology CSS, application JavaScript, and translation assets as one release unit. |
| Admin nested Portfolio detail was not represented in language regression tests | Added an API-backed widget fixture and English zero-CJK assertion over the full rendered tree. |
| The unauthenticated shell used a fixed 520px panel and widened a 390px mobile document | Replaced the fixed width with a safe-area constrained layout, verified a 390px document width in a real browser, and added a widget regression assertion. |

## Automated Gates

Run before release:

```bash
npm run audit:i18n
flutter analyze
flutter test
npm run verify:ontology-module
npm run test:ontology
npm run build
node scripts/verify-ontology-module.mjs --built
```

Browser verification must exercise both languages on desktop and 390x844 mobile viewports, including the unauthenticated shell, Ontology dialogs, and the Guru, Valuation, Portfolio, and Admin routes. A release is blocked by CJK copy in English mode, untranslated UI English in Chinese mode, a translation fallback warning, or a layout overflow.
