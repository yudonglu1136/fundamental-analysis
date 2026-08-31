# LSEG valuation model audit and correction

Release date: 2026-08-30
Valuation date: 2026-08-28
Currency and security: GBP per LSEG ordinary share

## Outcome

The current LSEG API value is now **£103.52 per share**. The standalone
parent-economic FCFE DCF is **£102.88**, and the pre-risk triangulated value is
**£105.27**.

The prior AWS-compatible v55 snapshot displayed **£90.71**, but that number was
not a DCF. It was a 56% / 44% blend of normalized earnings power and a guided
FCFE DCF:

| Prior component | Value/share | Weight | Contribution |
| --- | ---: | ---: | ---: |
| Normalized earnings power | £99.7586 | 56% | £55.8648 |
| Guided FCFE DCF | £79.1931 | 44% | £34.8450 |
| Prior headline |  |  | **£90.7098** |

The DCF-to-DCF comparison was therefore £102.8847 versus £79.1931, a
£23.6915 per-share difference. Comparing £102.88 directly with the old
£90.71 headline mixed a standalone method with a composite value.

## Prior AWS model reproduction

The exact source artifact was the audited AWS-compatible v55 release candidate,
model `pit-valuation-v55-actual-value-and-owner-audit-2026-08-30`, LSEG fiscal
node 2026-Q2. The release candidate itself remains outside Git because runtime
SQLite data is not a repository artifact.

The old DCF used:

- issuer 2026 Equity FCF guidance of £2.700bn;
- five FCFE values of £2.700bn, £2.842bn, £2.963bn, £3.058bn and
  £3.125bn;
- a 9.4243% rule-based equity discount rate, including a 42bp operating-net-debt
  premium;
- 2.1888% terminal growth;
- 497m H1 weighted-average shares;
- no separate net-debt or NCI deduction.

Its explicit-period PV was £11.227bn, terminal PV was £28.132bn, total equity
PV was £39.359bn, and standalone DCF value was £79.1931 per share. Terminal
value represented 71.5% of equity value.

## Error and scope diagnosis

The prior calculation did not mix FCFF with FCFE, did not use WACC, did not
deduct net debt twice, and did not add dividends or buybacks. Its main issues
were:

1. The headline was a P/E-plus-DCF blend but could be mistaken for a standalone
   DCF.
2. The DCF used the whole issuer-reported £2.7bn Equity FCF without a separately
   disclosed LSEG-parent economic ownership adjustment for Tradeweb and other
   non-controlling interests.
3. The denominator was the 497m H1 weighted-average EPS share count, not the
   485.634019m current ordinary shares excluding treasury supplied for the
   2026-08-28 valuation.
4. The discount rate was a profile heuristic rather than a disclosed CAPM-style
   cost of equity.
5. The first £2.7bn cash flow was treated as a full year-one cash flow and
   discounted for one year, despite the 2026-08-28 valuation date.

The issuer-reported £2.7bn and the analyst-estimated £2.35bn are now stored as
different fields. The £2.35bn figure is explicitly labeled an analyst estimate;
it is not represented as LSEG guidance.

## Corrected parent-economic FCFE DCF

| Year | Parent-economic FCFE | Discount factor | Present value |
| --- | ---: | ---: | ---: |
| 2027 | £2.590bn | 0.917431 | £2.376bn |
| 2028 | £2.860bn | 0.841680 | £2.407bn |
| 2029 | £3.150bn | 0.772183 | £2.432bn |
| 2030 | £3.420bn | 0.708425 | £2.423bn |
| 2031 | £3.700bn | 0.649931 | £2.405bn |

Assumptions and results:

- 2026 parent-economic FCFE: £2.350bn, analyst estimate;
- cost of equity: 9.0%;
- terminal growth: 2.5%;
- year-end discounting;
- terminal value at 2031 year-end: £58.346bn;
- explicit cash-flow PV: £12.043bn;
- terminal-value PV: £37.921bn;
- total parent common-equity value: £49.964bn;
- current shares excluding treasury: 485.634019m;
- DCF value: **£102.8847 per share**;
- terminal-value share: 75.9%;
- net debt deducted in this parent FCFE DCF: zero;
- NCI deducted again in this parent FCFE DCF: zero.

## Sensitivity

| Cost of equity / terminal growth | 2.0% | 2.5% | 3.0% |
| --- | ---: | ---: | ---: |
| 8.0% | £113.65 | £122.13 | £132.32 |
| 8.5% | £104.66 | £111.70 | £120.03 |
| 9.0% | £96.95 | **£102.88** | £109.80 |
| 9.5% | £90.28 | £95.33 | £101.15 |
| 10.0% | £84.45 | £88.78 | £93.74 |

## New headline construction

| Method | Value/share | Weight | Contribution |
| --- | ---: | ---: | ---: |
| Parent-economic FCFE DCF | £102.8847 | 40% | £41.1539 |
| Operating SOTP | £117.6600 | 30% | £35.2980 |
| 2026E adjusted EPS £4.803 x 20x | £96.0600 | 30% | £28.8180 |
| Gross triangulated value |  |  | **£105.2699** |
| CCP / cyber / regulatory reserve |  |  | **(£1.7503)** |
| Risk-adjusted headline |  |  | **£103.5196** |

This changes the displayed value from £90.7098 to £103.5196, an increase of
£12.8098 per share. At the snapshot's latest £85.36 market price, the modeled
upside becomes 21.3%. Market price remains a comparison field and is not a fair-
value input.

## Implementation and controls

- Added `server/lsegValuationOverlay.js`, a dated LSEG-only current valuation.
- Added a synthetic 2026-08-28 analyst valuation node; the preceding 62 PIT
  historical nodes are not rewritten.
- A persisted valuation node dated after 2026-08-28 automatically supersedes
  the dated overlay, so a future LSEG release cannot remain locked to this model.
- Exposed `valuationKind`, standalone `dcfFairValue`, gross fair value, risk-
  adjusted fair value, ownership basis, explicit annual FCFE, and zero debt/NCI
  double deductions in the API payload.
- Updated `server/valuationClient.js` so both dashboard and full-ticker API reads
  apply the same model.
- Added the LSEG ownership and current-share contract to `AGENTS.md`.
- Added six unit/regression tests, including exact DCF reproduction, all 15
  sensitivity cells, component arithmetic, PIT-history preservation, price-input
  independence, and non-LSEG isolation.

## Source and judgment boundary

LSEG's official H1 2026 release supports Equity FCF guidance of at least
£2.7bn. LSEG's 13 August 2026 consensus page supports 2026 adjusted EPS of
480.3p and separately shows non-controlling interest. The £2.35bn parent-economic
FCFE, £117.66 SOTP, 485.634019m current share count, 9.0% cost of equity, 2.5%
terminal growth and £850m risk reserve are dated analyst-model inputs. They are
shown as such in the payload and should be refreshed only through a new dated
model revision.

- LSEG H1 2026 results: <https://www.lseg.com/en/media-centre/press-releases/2026/london-stock-exchange-group-plc-h1-2026-interim-results>
- LSEG analyst consensus: <https://www.lseg.com/en/investor-relations/consensus>

No production database, AWS environment, or Vercel deployment was changed as
part of this local correction and audit.
