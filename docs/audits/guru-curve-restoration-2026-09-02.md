# Guru Curve Restoration Audit — 2026-09-02

## Verdict

- **PASS: 36/36 displayable curves; 0 failures.**
- Enabled manager population: 18; windows recomputed: 5Y and 10Y.
- Strict ready: 17; explicitly labeled public-holdings proxy ready: 19.
- 5Y: 12 strict + 6 proxy = 18/18.
- 10Y: 5 strict + 13 proxy = 18/18.
- Method: `manager13f-drifted-total-return-v8`.
- Proxy method: `manager13f-public-holdings-proxy-v1`.
- Security master: `holding-resolution-v1-d31b8b7721ffafc5`.
- Strict minimum execution coverage: 90%; proxy minimum selected-book coverage: 30%; proxy minimum positions: 2.

The acceptance runner opened the 218,767,360-byte source database read-only, serialized it to an isolated writable database, and recomputed all 36 rows there. Source SHA-256 remained `3cb507a0f5b2c253c189684eeb416573cc80d4e860ea65c477c16fb54b30b51f` before snapshot, after snapshot, and after the run. No private holdings or price rows are stored in this report.

## Manager-by-manager acceptance

| Manager | 5Y result | 5Y points | 5Y minimum coverage | 10Y result | 10Y points | 10Y minimum coverage |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| Gavin Baker | proxy | 1,202 | 77.7% | proxy | 1,644 | 77.7% |
| Chamath Palihapitiya | strict | 1,202 | 93.4% | proxy | 2,461 | 31.8% |
| Bill Ackman | strict | 1,202 | 100.0% | strict | 2,461 | 100.0% |
| Stanley Druckenmiller | proxy | 1,202 | 92.1% | proxy | 2,461 | 77.3% |
| Brad Gerstner | proxy | 1,202 | 89.1% | proxy | 2,461 | 82.7% |
| Chase Coleman | strict | 1,202 | 94.7% | proxy | 2,461 | 73.1% |
| Philippe Laffont | strict | 1,203 | 90.6% | proxy | 2,463 | 49.7% |
| Li Lu | strict | 1,202 | 100.0% | strict | 2,316 | 100.0% |
| Chuck Akre | strict | 1,203 | 93.0% | proxy | 2,460 | 80.5% |
| Dev Kantesaria | strict | 1,202 | 97.4% | strict | 2,400 | 97.4% |
| Chris Bloomstran | proxy | 1,202 | 84.2% | proxy | 2,463 | 78.5% |
| Samantha McLemore | proxy | 1,140 | 80.2% | proxy | 1,140 | 80.2% |
| Terry Smith | strict | 1,203 | 99.1% | proxy | 2,461 | 77.7% |
| Stan Moss | strict | 1,205 | 99.9% | strict | 2,461 | 93.8% |
| Baillie Gifford | strict | 1,221 | 98.1% | proxy | 2,464 | 72.7% |
| Warren Buffett | strict | 1,202 | 96.8% | strict | 2,399 | 96.0% |
| Tom Gayner | strict | 1,208 | 90.9% | proxy | 2,467 | 82.5% |
| George Soros | proxy | 1,203 | 55.7% | proxy | 2,461 | 33.4% |

Renaissance Technologies and Nick Sleep / Qais Zakaria remain intentionally disabled: their public data do not support a truthful proportional copy simulation. They are excluded from the 18-manager acceptance population rather than shown with fabricated curves.

## What was restored and hardened

- Restored the classic curve-first layout for every displayable manager, with 1Y, 3Y, 5Y, 10Y, All, and a freely draggable date range.
- Separated strict and proxy storage. A proxy can appear only when linked to the exact current strict failure; a valid strict curve always wins.
- Bound caches to the current engine, effective security-master hash, and exact requested window.
- Added audited historical security mappings, same-session filing supersession, active holding intervals, adjusted-close completeness checks, and non-common 13F title filtering.
- Preserved observed adjusted points for earlier valid proxy intervals while the strict engine remains fail-closed on an internal active-session gap.
- Added sequential 5Y/10Y daily refresh, aggregate multi-window job status, and a public health gate requiring all 36 current curves.
- Aligned the health/serving end-date grace with the bounded seven-day common vendor lag plus five-day market-calendar buffer.

## Verification

- Real isolated acceptance: 36/36 displayable, 0 failures, completed in 14m52s.
- Backend suite: 318/318 passed.
- Flutter widget suite: 60/60 passed; `flutter analyze`: 0 issues.
- Performance suite: 31/31 passed.
- Ontology suite: 17/17 passed; module verification passed.
- Bilingual coverage audit passed.
- SEC/OpenFIGI classifier/master tests: 22/22 passed; 743 official filings and approximately 85,000 reported rows audited.
- Security-master artifact: 1,823 observed CUSIPs, 1,222 resolved, 601 unresolved, 0 ambiguous.

## Interpretation

`strict` means every selected Top-60 common-long rebalance passed the 90% adjusted-close execution-coverage audit. `proxy` means the strict book failed that threshold, but a separately labeled, fully priceable public-holdings sleeve retained at least 30% of the disclosed selected book and at least two positions in every quarter. Proxy performance is not represented as the manager's audited fund return.
