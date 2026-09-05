# ISRG public case: data and calculation audit

Published case: `/research/isrg/`. Reviewed on 2026-09-05. This is a dated public illustration of the existing platform model, not a live valuation or an independent certification of intrinsic value.

## Source selection

- Use the audited v55 release, `pit-valuation-v55-actual-value-and-owner-audit-2026-08-30`, matching the passing committed `server/reports/valuation-audit-ledger.json`. The ledger's ISRG line is $442.83 fair value and $367.07 comparison price, with no blocking finding.
- The guru-intelligence local runtime DB has no ISRG valuation snapshot. The nearby fundamental-analysis runtime contains v4 and gives $424.79; it was rejected as stale.
- Source located in the existing `fundamental-analysis-sp500/server/data/valuation-pit-migration.sqlite.gz` release artifact. It was decompressed to an isolated temporary audit directory and opened with Node `DatabaseSync(..., {readOnly: true})`. No source or runtime database was modified.
- The public JSON stores a SHA-256 fingerprint of the exact source ISRG payload, release generation timestamp, model version and explicit source/date policy. It includes only reviewed derived assumptions, component values and limited dated chart samples. It excludes raw SF1 rows, full financial statements, transcripts, user data, credentials and internal paths.
- Official earnings context: [July 16 earnings release](https://www.sec.gov/Archives/edgar/data/1035267/000103526726000047/q226ex-991earningsrelease.htm), [July 21 Form 10-Q filing details](https://www.sec.gov/Archives/edgar/data/1035267/000103526726000058/0001035267-26-000058-index.htm). Both were verified on 2026-09-05. These references do not certify the model's fair value or turn formula forecasts into company guidance.

## Date and history semantics

| Meaning | Date |
| --- | --- |
| Fiscal period end | 2026-06-30 |
| Current stored Q2 model availability node | 2026-07-21 |
| Previous Q1 model availability node | 2026-04-22 |
| Latest stored market close | 2026-08-27 |
| Audited release snapshot | 2026-08-30 |
| Public case publication | 2026-09-05 |

July 21 must not be described as the July 16 earnings-release date. The model uses the stored PIT availability date. SEC acceptance was July 21 at 17:25:51, after the regular market close: the same-date comparison price is not a demonstrably executable post-filing trade. The public case is not a trading-return claim. Do not describe August 27 prices as today's price.

The curve is a **retrospective constant-method PIT replay under v55**, not a time series of forecasts actually published by ThesisForge at those past dates. It uses no market price as a valuation input, but that does not remove model-selection/research hindsight. This limitation must remain visible on the public page.

Chart window: 2021-08-27 through 2026-08-27. Export contains 21 real model nodes including the immediately prior 2021-07-21 node ($192.50247043914783) for a disclosed opening carry; render fair values as steps until the next model update, not as invented daily estimates. There are 80 exact dated prices: last stored observation in each month of the already sampled release history, plus endpoint/model-event observations reconciled to `valuation_pit_price_observations`. These are not necessarily literal month-end closes. No prices are interpolated or synthesized. Provider provenance for this stored price history is `yahoo`; do not relabel it as a different provider.

## The crucial model distinction

The platform headline is **not a $442.83 DCF**:

| Component | Value/share | Weight | Contribution/share |
| --- | ---: | ---: | ---: |
| Normalized earnings power | $574.1244664742514 | 66% | $378.9221478720059 |
| Five-year FCFE DCF | $187.9527745181568 | 34% | $63.90394333717332 |
| Blended model value | | 100% | **$442.8260912091792** |

The comparison price is $367.07000732421875; `(442.8260912091792 / 367.07000732421875 − 1) × 100 = 20.6380478855%`.

### Three headline assumption groups

1. Formula-forward scale: 20.294374908099968% normalized revenue growth, from an eight-quarter PIT observation window. Trailing revenue $11,034.4m × 1.2029437490809998 = forward revenue $13,273.762504859384m. Trailing cash flow after capex $3,268.6m × the same factor = forward FCFE $3,931.9419382461556m. Neither is management full-year monetary guidance.
2. Earnings quality and premium: effective normalized net margin 31.10905898384493%; period-end shares 353.278038m; target P/E 49.11812469602167×. Earnings value = forward revenue × effective margin ÷ shares × P/E = $574.1244664742514. This high multiple materially drives the headline estimate and must be disclosed, not hidden behind a DCF label.
3. FCFE discounting: 10% cost of equity (not WACC), terminal growth 2.608831247242999%, five year-end model periods and terminal value at the end of year 5. No second net-debt deduction, dividends or buyback value addition.

### Exact DCF reproduction

Let `g0 = 0.20294374908099969`, `g = 0.02608831247242999`, `Ke = 0.10`, `S = 353.278038m`.

- `FCFE1 = 3931.9419382461556m`.
- For `t=2..5`, `growth(t) = g0 + (g−g0) × (t−1)/4`, then `FCFE(t) = FCFE(t−1) × [1+growth(t)]`.
- Five FCFE amounts, in **USD millions**: `3931.9419382461556`, `4556.058649310625`, `5077.800401815598`, `5434.780797139361`, `5576.565056794296`.
- `PVexplicit = Σ FCFE(t)/(1+Ke)^t = $18,329.49356033995m`.
- `TV = FCFE5 × (1+g)/(Ke−g) = $77,417.36685939395m`.
- `PVterminal = TV/(1+Ke)^5 = $48,070.09385809087m`.
- `DCF/share = (PVexplicit+PVterminal)/S = $187.9527745181568`.
- Terminal value is 72.39516949882108% of the standalone DCF, not of the 66%/34% blended valuation.

Year numbers are model forecast periods, not invented calendar-year forecasts. Code evidence: `server/importSecQuarterlyValuations.js` at `medtech_platform` (around 1781), `buildEquityDcf` (around 3026), earnings construction (around 3834) and component blending (around 3894).

## What changed between the two real model nodes

| Metric | Q1 | Q2 | Change |
| --- | ---: | ---: | ---: |
| Formula-forward revenue ($m) | 12,729.671047150048 | 13,273.762504859384 | +4.2742% |
| Formula-forward FCFE ($m) | 3,464.838880478004 | 3,931.9419382461556 | +13.4812% |
| Blended model value/share | 415.94507700734613 | 442.8260912091792 | +6.4626% |

The normalized growth input, Ke, terminal growth and 66%/34% weights were unchanged. Reported trailing fundamentals, normalized effective margin, shares and target multiple changed. Exact weighted component bridge: `$415.94507700734613 + $19.14873001999216 earnings contribution + $7.73228418184095 DCF contribution = $442.8260912091792`. Do not attribute all +6.5% to FCF alone, and do not claim this price/fair-value relationship always held historically.

## Explicit counterexample

An illustrative sensitivity, not an existing stored bear case or an assigned probability:

- Reduce normalized earnings and all projected FCFE by 15%.
- Reduce the earnings P/E from 49.11812469602167× to 35×.
- Keep shares, Ke, terminal growth, cash-flow fade and method weights unchanged.
- Stressed earnings value = `$574.1244664742514 × 0.85 × 35 / 49.11812469602167 = $347.7372758694184`.
- Stressed DCF = `$187.9527745181568 × 0.85 = $159.75985834043325`.
- Stress blend = `0.66 × 347.7372758694184 + 0.34 × 159.75985834043325 = $283.8249539095634`, or **22.67824985797% below** the dated comparison price.

This demonstrates that lower share price alone is not a buy signal. The headline requires the earnings premium and cash generation assumptions to hold.

## Reproduction and tests

`ISRG_CASE_DB=<audited-v55-release.sqlite> node scripts/export-isrg-public-case.mjs` prints the allowlisted JSON; it opens only read-only SQLite and does not import server database initializers. It refuses stale/unreviewed model versions, changed node or price dates, mismatched expected headline values, incomplete curve evidence or a non-passing/mismatched audit ledger. A future data update requires a newly reviewed case and revised expected values; silently publishing the latest database is prohibited.

`node --test scripts/export-isrg-public-case.test.mjs` checks dates, formula-derived earnings, exact component weights, FCFE growth fade and five-year timing, terminal math, denominator and no extra debt deduction, change bridge, scenario recomputation, sorted/correct chart endpoints, opening carry, public-data exclusions and fail-closed export behavior. All eight tests passed on 2026-09-05.

Scope: this audit reproduces the existing model and exposes its high earnings-multiple sensitivity. It does not validate the market's eventual outcome or certify the economic fairness of 49.1× P/E. No valuation model, existing historical node, runtime database or API authorization was changed.
