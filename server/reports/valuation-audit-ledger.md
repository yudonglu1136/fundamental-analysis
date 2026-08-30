# Valuation PIT Audit Ledger

Generated from model artifact `pit-valuation-v55-actual-value-and-owner-audit-2026-08-30` at 2026-08-30T10:00:00.000Z.

## Release Gate

| Check | Result |
| --- | ---: |
| Overall status | **PASS** |
| Tickers audited | 533 |
| Modeled tickers | 532 |
| Historical PIT nodes audited | 31,953 |
| Selected PIT financial periods | 32,580 |
| Explicitly unmodeled periods | 627 |
| Unexpected modelable gaps | 0 |
| Material adjacent-node transitions | 16 |
| Unexplained material transitions | 0 |
| Blocking P0/P1 findings | 0 |
| Economic watch groups | 423 |
| Recorded watch observations | 1162 |
| Not applicable | 1 |

The release gate fails only for data lineage, arithmetic, model-route, hard economic-bound or look-ahead errors. A market-price divergence is recorded as a watch item and never used to force fair value toward the quote.

## Fixed Issues

| ID | Severity | Status | Issue | Scope | Resolution |
| --- | --- | --- | --- | --- | --- |
| VAL-001 | P0 | fixed | Guidance crossed the next financial-release boundary | DG, FERG, FDX and GPN; 21 guidance metrics across five prior PIT nodes | Each node now receives only guidance observed before the next distinct financial release; the final node may retain all later same-period evidence. |
| VAL-002 | P0 | fixed | Share-count changes were mistaken for stock splits | 92 tickers, 143 material share jumps and 1,614 historical valuation nodes | Removed inferred retrospective split factors. Every node uses its own event-visible quoted-security share count. |
| VAL-003 | P0 | fixed | DGE.L ADR share factor was applied to London ordinary shares | 27 historical DGE.L nodes | The paid ADR factor is retained for lineage but not applied to DGE.L ordinary-share valuation or London price comparison. |
| VAL-004 | P1 | fixed | Fiscal-calendar transition periods looked like duplicate or inverted quarters | GPN and MOS transition histories | Official SEC-supported transition windows are recorded and preserved in filing-date order. |
| VAL-005 | P0 | fixed | Payment processors were valued as card networks or generic software | CPAY, FI/FISV, FIS, GPN, PYPL and XYZ | Introduced a through-cycle payment-processor EPS profile and excluded customer funds from FCFE valuation. |
| VAL-006 | P0 | fixed | Managed-care policyholder cash flows entered operating-company DCF | All managed_care issuers, including CNC and UNH | Managed care now uses point-in-time current/cycle EPS with policyholder cash-flow exclusion instead of FCFE DCF. |
| VAL-007 | P1 | fixed | Optical-networking issuers used a generic hardware profile | CIEN and COHR | Both issuers now use the optical-networking turnaround profile used for AAOI and LITE. |
| VAL-008 | P0 | fixed | Unpriced optionality premiums were multiplied into base fair value | Hypergrowth AI, genetic diagnostics, space-platform and EV/autonomy histories | Base fair value no longer receives a blanket 1.04x-1.55x uplift. The multiplier is retained only as a disclosed bull-case scenario input. |
| VAL-009 | P1 | fixed | Hypergrowth base-case multiple ceilings allowed speculative outputs | Hypergrowth AI software profile | Base-case EV/sales is capped at 40x, P/E at 72x and FCF yield floored at 2.5%; extreme option value belongs in scenarios, not base fair value. |
| VAL-010 | P0 | fixed | AZN USD financials were converted with a cross-listing price ratio | All 134 AZN ARQ/ART source rows used by 67 historical valuation nodes | Financials now retain USD source lineage and are converted to the GBP model currency with the nearest prior official ECB reference rate. Cross-listing prices and fixed 0.75 fallbacks are rejected by the release verifier. |
| VAL-011 | P1 | fixed | LSEG full-year equity FCF guidance was stored as unscoped | LSEG H1 2026 official issuer guidance | The issuer override now carries structured full-year scope and year lineage. The model records the at-least GBP 2.7 billion guide as explicit_full_year instead of an unscoped fallback. |
| VAL-012 | P1 | fixed | Prepared remarks and procedural handoffs were misclassified as analyst Q&A | All transcript-backed valuation periods | Questions must occur after a detected Q&A boundary and must contain a complete analyst question plus a substantive management response. Audio checks, handoffs and stale parsed rows are rejected. |
| VAL-013 | P0 | fixed | Bilingual enrichment could silently fall back to an unaudited online translation | All stored valuation transcript Q&A | Chinese translation is now opt-in and cache-only. Publication fails when any locally generated Qwen 4B translation is missing or fails numeric-placeholder validation. |
| VAL-014 | P0 | fixed | Unscoped monetary guidance could replace annual valuation inputs | Historical revenue, operating-income and free-cash-flow guidance | Only explicitly annual operating-income and FCF amounts can enter the model. Unscoped annual-scale revenue remains research evidence; quarter-scale revenue may only enter through bounded annualization and a disclosed blend with the formula forecast. |
| VAL-015 | P1 | fixed | Near-zero EV-to-equity residuals created false-precision fair values | Highly leveraged loss-making periods, with a stricter 20% residual floor for optical-networking turnarounds | The EV/sales component is excluded when the surviving post-debt equity residual is below the audited profile floor (20% for optical-networking turnarounds; 1% general floor). If no independent earnings or FCFE method remains, the period is explicitly unmodeled instead of publishing false precision. |
| VAL-016 | P0 | fixed | Scoped management guidance was stored but silently ignored by mature-company models | All operating-company PIT nodes, including LSEG annual equity FCF guidance | Operating, growth, and revenue-stage routes now evaluate explicit annual guidance at every node. Plausible guidance enters the applicable revenue, margin, or FCFE input; rejected guidance retains its reported amount and a machine-audited rejection reason. |
| VAL-017 | P0 | fixed | London market prices were divided by 100 after already being stored in GBP | All post-2018 AZN, BA.L, DGE.L, and LSEG historical price-comparison nodes | Valuation imports now consume price_points exactly in their stored quote-currency unit. A shared ticker-to-market-symbol map handles London aliases, and the strict release verifier reconciles every available model-node price back to the raw stored close. |
| VAL-018 | P0 | fixed | Plus-minus guidance tolerances were averaged as range endpoints | 494 historical transcript guidance rows containing +/- disclosures, including WDC quarterly revenue | The extractor and valuation reader now select the quoted center before the plus-minus marker, preserve the tolerance as evidence only, and the strict release verifier rejects any stored scaled guidance amount that differs from that center. |
| VAL-019 | P0 | fixed | A loss-making observed period could depress normalized earnings with a one-off below-operating burden | Loss-making historical nodes without a positive through-cycle burden estimate, including current INTC | Observed below-operating burden is now eligible only when both observed operating and net margins are positive. A loss period may use the tax-based normalized margin only for an explicitly cycle-normalized profile; other loss-making models remain unmodeled unless positive independent valuation evidence exists. |
| VAL-020 | P1 | fixed | A current paid comparison price was not reconciled when the legacy price table lagged | Model nodes whose paid split-adjusted price is newer than the generic price_points table, including current CRWD | The release verifier now reconciles every non-null comparison price to either the exact raw price_points date or the exact paid price stored in the released ticker snapshot. A price absent from both sources, or any value mismatch, blocks release. |
| VAL-021 | P0 | fixed | Single-quarter or transcript growth could create valuation-multiple cliffs | All historical PIT nodes whose P/E, EV/sales, forward revenue, or FCFE assumptions use revenue growth | Every profile now uses an event-visible rolling growth median (eight periods by default). Only clear management guidance growth can influence the model, with a maximum 25% weight and a 15 percentage-point deviation from the PIT financial trend. Other transcript growth remains research-only, and every released node records the growth source, window, sample count, bounds, and weight. |
| VAL-022 | P0 | fixed | Annual and quarterly provider rows could be mixed into a false trailing period | Every historical operating-company PIT node | Trailing values now use a reported ART row or exactly four consecutive ARQ periods. Annual rows are never mixed into a quarterly sum, and every unavailable trailing basis is explicitly classified. |
| VAL-023 | P0 | fixed | Repeated provider TTM values counted as independent valuation evidence | Cycle earnings, cash-flow and growth evidence histories | Repeated reported trailing values count once. Method confidence and normalization maturity advance only with independent event-visible observations. |
| VAL-024 | P1 | fixed | A newly available low-weight method could jump to half of fair value | Sparse two-method histories, including VST 2017 Q3 | Evidence confidence scales requested weights without promoting a requested sub-30% independent method to 50%. The sparse-earnings cap remains active only when the independent requested allocation is material. |
| VAL-025 | P1 | fixed | Cycle-sensitive earnings were activated before enough independent history existed | Materials histories, including DD 2010 Q2 and DOW 2018 Q4 | Materials require four independent profitable PIT observations before reported earnings can enter the valuation. Earlier nodes rely only on independently usable owner cash flow. |
| VAL-026 | P1 | fixed | Economically de minimis earnings or cash flow could create a method component | All operating and growth-company model routes | Unguided earnings and owner cash flow below 1% of revenue are rejected. The stored rejection reason and zero method weight are audited at every node. |
| VAL-027 | P1 | fixed | Pre-model financial periods were indistinguishable from importer omissions | All selected PIT financial periods before the first defensible valuation node | Every selected provider period is now either modeled or assigned a machine-readable reason, including insufficient initial independent evidence, incomplete true-TTM history, precommercial status and missing economic valuation support. |
| VAL-028 | P1 | fixed | Immature corroborative cash flow could become the sole valuation method | Sparse materials and power-utility histories, including APD, DOW, MOS and VST transitions | A profile-specific evidence floor now applies whenever FCFE DCF would stand alone. Materials require at least 62.5% cash-flow evidence confidence and power utilities require 75%; otherwise the PIT period is explicitly unmodeled until an independent earnings method or mature cash-flow history exists. |
| VAL-029 | P1 | fixed | An original full-year guidance range was treated as unscoped segment revenue | GEV 2025 Q2 and any transcript using original-guidance-range wording | Original company guidance ranges are now recognized as explicit annual guidance when no quarter scope is present. The GEV regression fixture selects the USD 36.5 billion company revenue midpoint and prevents segment EBITDA or one-time settlement amounts from becoming forward revenue. |
| VAL-030 | P1 | fixed | The release verifier exhausted memory before reporting audit failures | Multi-gigabyte S&P 500 PIT release artifacts | Model, snapshot, price, path, coverage and temporal checks now iterate or hash in bounded chunks. The same full release audit passes with a 512 MB Node heap instead of loading complete JSON tables into memory. |
| VAL-031 | P1 | fixed | The release audit formula lagged the model's growth-evidence ramp | 6,392 false audit findings across immature historical growth windows | The verifier now independently reconstructs the four-sample admission rule, 25%/50%/75%/100% evidence ramp, conservative 5% anchor, bounded guidance blend, source label and final capped growth value for every node. |
| VAL-032 | P0 | fixed | Parallel guidance metrics could bind to the wrong quoted amount | Compound transcript clauses containing multiple metrics and multiple monetary values, including APTV revenue, EBITDA and operating-income guidance | Ordinal value binding now considers only the leading metric owners before the first amount. Independent source auditing reconstructs the pairing and blocks any released amount assigned to the wrong metric. |
| VAL-033 | P0 | fixed | A shared trailing scale was omitted from the first endpoint of a range | Guidance written as `$1.66-$1.68 billion`, `$205-$225 million`, and equivalent shared-unit ranges | The parser now propagates the explicit trailing currency scale to both endpoints before computing the midpoint. The release verifier independently parses and reconciles every scaled range. |
| VAL-034 | P0 | fixed | Historical actual results and prior-guide comparisons entered the guidance table | Transcript sentences describing results above or below `our guidance`, including prior APP actual-result evidence | Historical-result, exceeded-guide and comparison language is research-only. It cannot create a model-authoritative guidance value, and regression fixtures cover the previously admitted wording. |
| VAL-035 | P0 | fixed | Segment, acquisition, delta and non-company amounts could masquerade as company guidance | Revenue and operating metrics across GPC, CTSH, WMB, CVS and all transcript-backed issuers | Every extracted metric now carries a structured subject classification. Only company-total or explicitly company-unspecified periodic guidance may enter company valuation inputs; segment, acquisition, contribution, delta and non-periodic evidence remains visible but model-excluded. |
| VAL-036 | P0 | fixed | A missing nullable guidance scalar could become zero or coexist with a valued duplicate | All guidance serialization, deduplication and model-selection paths | Nullable scalars remain null end to end. Exact source/metric/period evidence is deduplicated, and the release gate blocks empty-plus-valued duplicate groups or a selected zero manufactured from a missing value. |
| VAL-037 | P0 | fixed | Transcript extraction could override official issuer guidance | SEC and UK issuer guidance sharing the same ticker, fiscal period and metric with transcript evidence | Official SEC and UK issuer records are model-authoritative for the same metric and period. Transcript evidence remains stored for traceability but cannot replace the official value. |
| VAL-038 | P0 | fixed | Legacy UK fiscal calendars could assign a future period end to an earlier release | Historical LSEG releases under the former 31 March fiscal year and subsequent calendar transitions | Issuer-specific fiscal calendars now derive the real period end for each reporting regime. Every official period end must be on or before its availability date, with the derivation retained in source lineage. |
| VAL-039 | P0 | fixed | Named-month quarter guidance and nearby cost amounts were parsed as annual revenue | Phrases such as `June quarter` and `September quarter`, including STX revenue guidance adjacent to opex savings and underutilization costs | All named-month quarter forms now establish quarterly scope. Costs, expenses, savings, charges, synergies, taxes and share counts own their amounts and block those values from ordinal revenue or operating-income binding. |
| VAL-040 | P0 | fixed | The `+ or -` tolerance spelling was treated as a range endpoint | Guidance using textual plus-or-minus variants, including STX `$2.1 billion + or - $150 million` | Symbolic and textual plus-minus variants all retain the first amount as the center and the second as tolerance evidence. Independent release arithmetic blocks any averaged or midpoint substitute. |
| VAL-041 | P1 | fixed | Two identical valuation imports produced different release signatures | Full S&P 500 deterministic rebuild and release comparison | The importer accepts a validated fixed `PIT_VALUATION_GENERATED_AT`; both candidate runs use the same canonical timestamp, allowing model and snapshot signatures to prove data and calculation determinism rather than clock equality. |
| VAL-042 | P0 | fixed | Official filing importers could diverge from the audited transcript amount parser | Official SEC and UK guidance with actual-value comparisons, repeated currencies, ranges and nearby non-guidance amounts | All source paths now share the same actual-versus-guidance, range, scale and economic-owner contract. Independent source auditing reconstructs the original evidence rather than trusting the stored scalar. |
| VAL-043 | P0 | fixed | A legal range endpoint could be replaced by a later amount owned by another metric | Repeated-currency and `range from` forms, including PANW revenue beside shares and STZ guidance beside NCI | The parser completes the local range before scanning later clauses. Regression fixtures prove the correct midpoint while the independent release audit rejects share-count, cost, tax and NCI collisions. |
| VAL-044 | P0 | fixed | A year-end result period could overwrite the forward guidance target year | LSEG FY2024/FY2025 releases and every Q4 result that guides the following year | Reported fiscal year and guidance target year are stored separately. The importer selects the nearest preceding annual-guidance heading and stops before medium-term or later-year sections; all 62 LSEG PIT nodes and 21 explicit full-year rows pass focused lineage, GBP price and model-arithmetic checks. |
| VAL-045 | P0 | fixed | A fiscal year and later capital-allocation amount were combined into false FCF guidance | Year-to-amount wording, including Jacobs `fiscal year 2025 to $1.4 billion` of share repurchases | Bare four-digit years cannot start a shared-scale monetary range. Share-repurchase amounts own themselves and are classified as non-periodic capital allocation, leaving no false company FCF scalar in the rebuilt source data. |
| VAL-046 | P0 | fixed | Guidance values could bind to the wrong metric, scope, range endpoint, or revision amount | Structural transcript and filing forms across CDNS, GTLB, APTV, CARR, RTX and every modeled guidance period | The extractor now binds amounts to explicit economic owners before selection, treats legal ranges and signed ranges as atomic, pairs parallel metric/value lists in source order, gives an explicit quarter label precedence over a nearby fiscal-year token, selects the destination in `raise by X to Y`, and excludes historical or non-periodic owner amounts. An independent audit reconstructed all 18,367 guidance rows used by the model and found zero historical-actual, non-guidance-owner, parallel-pairing, or illegal-midpoint mismatches. |

## Open Blockers

No unresolved P0/P1 findings.

## Economic Watch

These are reviewed conclusions or sensitivity flags, not automatic errors.

| Code | Ticker groups | Recorded observations | Status | Disposition |
| --- | ---: | ---: | --- | --- |
| date_gap | 39 | 65 | explained_watch | Retained only when every selected source period is either modeled or explicitly classified as non-modelable by the release verifier. |
| high_ev_sales | 3 | 3 | sensitivity_watch | Assumption is below the audited 40x hard ceiling and remains visible as a valuation sensitivity. |
| high_normalized_margin | 8 | 8 | sensitivity_watch | Assumption is below the audited 65% hard ceiling and remains visible as a valuation sensitivity. |
| high_target_pe | 2 | 2 | sensitivity_watch | Assumption is below the audited 72x hard ceiling and remains visible as a valuation sensitivity. |
| high_terminal_value_share | 2 | 2 | sensitivity_watch | Terminal value remains below the 80% release ceiling; discount-rate, growth, and cash-flow arithmetic are independently recomputed. |
| large_fair_value_step | 289 | 995 | explained_watch | Retained when the adjacent PIT nodes identify a financial, guidance, share, method, or assumption transition; fourfold moves must also pass the strict temporal release gate. |
| latest_fair_to_price_extreme | 8 | 8 | economic_watch | Market divergence is visible for review; price is comparison-only and cannot alter fair value. |
| share_count_jump | 64 | 71 | explained_watch | Retained after source-basis arithmetic verifies period-end provider shares and confirms no retrospective split inference. |
| short_history | 8 | 8 | coverage_watch | Limited history reflects source/listing coverage and does not permit fabricated backfill. |

Every watch observation, period transition, input-change reason, assumption and source-basis note is retained in `valuation-audit-ledger.json`; the Markdown table is the compact release summary.

## Profile Coverage

| Profile | Tickers | PIT nodes | Blockers | Watch items |
| --- | ---: | ---: | ---: | ---: |
| ads_ai_platform | 1 | 67 | 0 | 0 |
| asset_manager | 9 | 534 | 0 | 9 |
| bank | 13 | 852 | 0 | 1 |
| biopharma | 11 | 718 | 0 | 9 |
| biopharma_growth | 6 | 326 | 0 | 5 |
| bitcoin_treasury_software | 1 | 3 | 0 | 1 |
| capital_markets | 10 | 623 | 0 | 2 |
| card_network_lender | 1 | 67 | 0 | 1 |
| commodity_merchant | 3 | 193 | 0 | 5 |
| consumer_cyclical | 40 | 2495 | 0 | 20 |
| consumer_staples | 23 | 1483 | 0 | 8 |
| credit_services | 2 | 117 | 0 | 2 |
| defense_growth | 3 | 200 | 0 | 4 |
| defense_prime | 13 | 793 | 0 | 14 |
| emerging_biotech | 4 | 165 | 0 | 10 |
| emerging_health_ai | 1 | 7 | 0 | 1 |
| energy_e_and_p | 9 | 542 | 0 | 15 |
| energy_infrastructure | 11 | 713 | 0 | 16 |
| energy_technology | 2 | 95 | 0 | 3 |
| ev_autonomy_platform | 1 | 67 | 0 | 1 |
| genetic_diagnostics_growth | 1 | 46 | 0 | 0 |
| healthcare_distribution | 4 | 267 | 0 | 4 |
| healthcare_services | 15 | 917 | 0 | 13 |
| hypergrowth_ai_software | 3 | 82 | 0 | 6 |
| industrial_gases_compounder | 1 | 31 | 0 | 0 |
| industrial_growth | 43 | 2551 | 0 | 22 |
| information_services | 24 | 1541 | 0 | 22 |
| insurance | 17 | 1139 | 0 | 13 |
| insurance_broker | 6 | 384 | 0 | 3 |
| interactive_entertainment | 2 | 122 | 0 | 4 |
| managed_care | 6 | 384 | 0 | 6 |
| materials | 25 | 1422 | 0 | 21 |
| mature_medtech | 15 | 887 | 0 | 9 |
| media_telecom | 14 | 821 | 0 | 19 |
| medtech_platform | 3 | 179 | 0 | 3 |
| mega_cap_platform | 4 | 255 | 0 | 5 |
| networking_hardware | 2 | 113 | 0 | 0 |
| not_applicable | 1 | 0 | 0 | 0 |
| optical_networking_turnaround | 4 | 227 | 0 | 4 |
| payments_network | 2 | 134 | 0 | 3 |
| payments_processor | 6 | 313 | 0 | 6 |
| platform_marketplace_reinvestment | 9 | 375 | 0 | 8 |
| platform_reinvestment | 1 | 67 | 0 | 1 |
| power_utility | 32 | 1960 | 0 | 19 |
| quality_consumer | 13 | 762 | 0 | 15 |
| reit | 30 | 1952 | 0 | 25 |
| semiconductor_cyclical | 2 | 134 | 0 | 1 |
| semiconductor_equipment | 6 | 340 | 0 | 6 |
| semiconductor_foundry | 1 | 67 | 0 | 1 |
| semiconductor_growth | 6 | 343 | 0 | 3 |
| semiconductor_storage_cycle | 3 | 143 | 0 | 4 |
| semiconductor_value | 7 | 465 | 0 | 5 |
| software_growth | 15 | 767 | 0 | 10 |
| software_platform | 10 | 587 | 0 | 7 |
| space_launch_growth | 1 | 19 | 0 | 1 |
| space_platform_ipo | 1 | 3 | 0 | 1 |
| subscription_streaming_platform | 1 | 67 | 0 | 0 |
| technology_hardware | 17 | 1033 | 0 | 13 |
| transportation | 16 | 994 | 0 | 13 |

## Ticker Ledger

| Ticker | Profile | Nodes | First / latest | Status | Latest FV | Latest price | FV / price | Watch observations | Flags |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| A | healthcare_services | 66 | 2010-Q1 / 2026-Q2 | pass | 86.49 | 157.69 | 0.548 | 0 |  |
| AAOI | optical_networking_turnaround | 53 | 2013-Q2 / 2026-Q2 | watch | 105.19 | 106.23 | 0.99 | 4 | large_fair_value_step |
| AAPL | mega_cap_platform | 67 | 2010-Q1 / 2026-Q3 | watch | 189.43 | 314.58 | 0.602 | 7 | large_fair_value_step |
| ABBV | biopharma | 59 | 2011-Q4 / 2026-Q2 | watch | 92.94 | 258.15 | 0.36 | 3 | large_fair_value_step |
| ABNB | platform_marketplace_reinvestment | 23 | 2020-Q4 / 2026-Q2 | watch | 132.91 | 189.41 | 0.702 | 1 | large_fair_value_step |
| ABT | mature_medtech | 67 | 2009-Q4 / 2026-Q2 | pass | 72.5 | 111.59 | 0.65 | 0 |  |
| ACGL | insurance | 67 | 2009-Q4 / 2026-Q2 | pass | 171.73 | 98.76 | 1.739 | 0 |  |
| ACN | information_services | 66 | 2010-Q2 / 2026-Q3 | pass | 333.93 | 189.53 | 1.762 | 0 |  |
| ADBE | software_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 784.46 | 289.15 | 2.713 | 0 |  |
| ADI | semiconductor_value | 67 | 2010-Q1 / 2026-Q3 | watch | 173.02 | 374.52 | 0.462 | 3 | large_fair_value_step |
| ADM | commodity_merchant | 65 | 2010-Q2 / 2026-Q2 | watch | 41.12 | 79.1 | 0.52 | 2 | date_gap, large_fair_value_step |
| ADP | information_services | 67 | 2010-Q2 / 2026-Q4 | pass | 236.79 | 284.68 | 0.832 | 0 |  |
| ADSK | software_growth | 66 | 2010-Q4 / 2027-Q1 | pass | 444.27 | 270.58 | 1.642 | 0 |  |
| AEE | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 91.42 | 106.75 | 0.856 | 1 | large_fair_value_step |
| AEP | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 103.34 | 122.71 | 0.842 | 0 |  |
| AES | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 25.92 | 14.75 | 1.758 | 6 | large_fair_value_step |
| AFL | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 116.14 | 116.58 | 0.996 | 1 | large_fair_value_step |
| AIG | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 73.5 | 76.63 | 0.959 | 6 | large_fair_value_step, share_count_jump |
| AIZ | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 253.24 | 285.41 | 0.887 | 2 | large_fair_value_step |
| AJG | insurance_broker | 64 | 2010-Q3 / 2026-Q2 | pass | 118.15 | 260.15 | 0.454 | 0 |  |
| AKAM | software_platform | 67 | 2009-Q4 / 2026-Q2 | pass | 85 | 111.24 | 0.764 | 0 |  |
| ALB | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 64 | 135.77 | 0.471 | 2 | large_fair_value_step |
| ALGN | mature_medtech | 67 | 2009-Q4 / 2026-Q2 | watch | 124.99 | 158.84 | 0.787 | 3 | large_fair_value_step |
| ALL | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 433.57 | 257.62 | 1.683 | 5 | large_fair_value_step |
| ALLE | industrial_growth | 53 | 2012-Q4 / 2026-Q2 | watch | 149.33 | 159.72 | 0.935 | 3 | large_fair_value_step |
| ALNY | emerging_biotech | 67 | 2009-Q4 / 2026-Q2 | watch | 134.92 | 237.1 | 0.569 | 7 | large_fair_value_step |
| AMAT | semiconductor_equipment | 67 | 2010-Q1 / 2026-Q3 | pass | 230.88 | 482.36 | 0.479 | 0 |  |
| AMCR | consumer_cyclical | 30 | 2018-Q4 / 2026-Q4 | watch | 54.07 | 46.52 | 1.162 | 3 | large_fair_value_step, share_count_jump |
| AMD | semiconductor_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 261.69 | 476.67 | 0.549 | 1 | large_fair_value_step |
| AME | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 130.1 | 243.67 | 0.534 | 0 |  |
| AMGN | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 241.23 | 436.99 | 0.552 | 2 | large_fair_value_step |
| AMP | asset_manager | 64 | 2010-Q3 / 2026-Q2 | watch | 583.85 | 555.77 | 1.051 | 2 | large_fair_value_step |
| AMT | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 98.8 | 174.16 | 0.567 | 2 | large_fair_value_step |
| AMZN | platform_reinvestment | 67 | 2009-Q4 / 2026-Q2 | watch | 230.93 | 256.26 | 0.901 | 4 | large_fair_value_step |
| ANET | networking_hardware | 47 | 2014-Q4 / 2026-Q2 | pass | 112.66 | 201.09 | 0.56 | 0 |  |
| AON | insurance_broker | 64 | 2010-Q3 / 2026-Q2 | watch | 305.95 | 349.56 | 0.875 | 2 | large_fair_value_step |
| AOS | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 72.53 | 61.95 | 1.171 | 1 | large_fair_value_step |
| APA | energy_e_and_p | 67 | 2009-Q4 / 2026-Q2 | watch | 38.62 | 42.38 | 0.911 | 8 | large_fair_value_step |
| APD | materials | 64 | 2010-Q4 / 2026-Q3 | watch | 104.38 | 305.47 | 0.342 | 1 | large_fair_value_step |
| APH | technology_hardware | 67 | 2009-Q4 / 2026-Q2 | pass | 86.09 | 161.38 | 0.533 | 0 |  |
| APO | asset_manager | 54 | 2013-Q1 / 2026-Q2 | watch | 65.65 | 135.01 | 0.486 | 9 | large_fair_value_step, share_count_jump |
| APP | hypergrowth_ai_software | 23 | 2020-Q4 / 2026-Q2 | watch | 687.28 | 317.76 | 2.163 | 3 | high_ev_sales, high_normalized_margin, high_target_pe |
| APTV | consumer_cyclical | 59 | 2011-Q4 / 2026-Q2 | watch | 42.9 | 45.44 | 0.944 | 2 | large_fair_value_step |
| ARE | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 55.1 | 52.28 | 1.054 | 1 | large_fair_value_step |
| ARES | asset_manager | 45 | 2015-Q2 / 2026-Q2 | watch | 33.86 | 142.41 | 0.238 | 4 | large_fair_value_step, share_count_jump |
| ARM | semiconductor_growth | 13 | 2023-Q4 / 2027-Q1 | pass | 49.23 | 239.13 | 0.206 | 0 |  |
| ASML | semiconductor_equipment | 66 | 2010-Q1 / 2026-Q2 | watch | 785.08 | 1735.01 | 0.452 | 6 | large_fair_value_step |
| ATO | power_utility | 67 | 2010-Q1 / 2026-Q3 | pass | 131.75 | 167.22 | 0.788 | 0 |  |
| AUTL | emerging_biotech | 26 | 2017-Q4 / 2026-Q2 | watch | 0.79 | 2.15 | 0.367 | 5 | date_gap, large_fair_value_step, share_count_jump |
| AVAV | defense_growth | 66 | 2010-Q3 / 2026-Q4 | watch | 171.7 | 147.94 | 1.161 | 3 | large_fair_value_step, share_count_jump |
| AVGO | semiconductor_growth | 65 | 2010-Q2 / 2026-Q2 | pass | 254.27 | 368.59 | 0.69 | 0 |  |
| AVY | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 139.89 | 178.34 | 0.784 | 1 | large_fair_value_step |
| AWK | power_utility | 66 | 2010-Q1 / 2026-Q2 | watch | 95.37 | 136.69 | 0.698 | 1 | large_fair_value_step |
| AXON | defense_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 237.58 | 600.73 | 0.395 | 0 |  |
| AXP | card_network_lender | 67 | 2009-Q4 / 2026-Q2 | watch | 233.65 | 334.16 | 0.699 | 1 | large_fair_value_step |
| AZN | biopharma | 67 | 2009-Q4 / 2026-Q2 | pass | 78.46 | 114.6 | 0.685 | 0 |  |
| AZO | consumer_cyclical | 66 | 2010-Q2 / 2026-Q3 | pass | 1980.88 | 2932.33 | 0.676 | 0 |  |
| BA | defense_prime | 67 | 2009-Q4 / 2026-Q2 | watch | 41.68 | 209.89 | 0.199 | 3 | large_fair_value_step, latest_fair_to_price_extreme |
| BA.L | defense_prime | 60 | 2010-Q2 / 2026-Q2 | watch | 14.35 | 22.58 | 0.635 | 1 | date_gap |
| BAC | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 42.33 | 61.17 | 0.692 | 0 |  |
| BALL | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 38.6 | 63.37 | 0.609 | 3 | large_fair_value_step |
| BAX | mature_medtech | 66 | 2009-Q4 / 2026-Q2 | watch | 26.97 | 25.93 | 1.04 | 1 | date_gap |
| BBY | consumer_cyclical | 67 | 2010-Q3 / 2027-Q1 | pass | 106.64 | 83.56 | 1.276 | 0 |  |
| BDX | mature_medtech | 67 | 2010-Q1 / 2026-Q3 | watch | 127.34 | 188.13 | 0.677 | 1 | large_fair_value_step |
| BE | energy_technology | 28 | 2018-Q4 / 2026-Q2 | watch | 43.04 | 210.66 | 0.204 | 9 | date_gap, large_fair_value_step |
| BEN | asset_manager | 64 | 2010-Q4 / 2026-Q3 | pass | 23.66 | 34.82 | 0.68 | 0 |  |
| BF.B | consumer_staples | 66 | 2010-Q3 / 2026-Q4 | pass | 23.72 | 27.28 | 0.87 | 0 |  |
| BG | commodity_merchant | 61 | 2010-Q4 / 2026-Q2 | watch | 129.13 | 111.57 | 1.157 | 3 | date_gap, large_fair_value_step |
| BIIB | biopharma | 67 | 2009-Q4 / 2026-Q2 | pass | 188.53 | 221.5 | 0.851 | 0 |  |
| BKNG | platform_marketplace_reinvestment | 67 | 2009-Q4 / 2026-Q2 | watch | 159.47 | 202.56 | 0.787 | 2 | large_fair_value_step |
| BKR | industrial_growth | 33 | 2016-Q4 / 2026-Q2 | watch | 40.18 | 62.11 | 0.647 | 8 | date_gap, large_fair_value_step |
| BLDR | materials | 45 | 2015-Q2 / 2026-Q2 | watch | 99.49 | 67.7 | 1.47 | 7 | large_fair_value_step, share_count_jump |
| BLK | asset_manager | 64 | 2010-Q3 / 2026-Q2 | watch | 660.41 | 1167.57 | 0.566 | 1 | share_count_jump |
| BMY | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 58.93 | 66.95 | 0.88 | 3 | large_fair_value_step |
| BNY | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 97.61 | 162.24 | 0.602 | 0 |  |
| BR | information_services | 67 | 2010-Q2 / 2026-Q4 | watch | 212.62 | 183.08 | 1.161 | 9 | large_fair_value_step |
| BRK.B | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 446.17 | 503.7 | 0.886 | 9 | large_fair_value_step |
| BRO | insurance_broker | 64 | 2010-Q3 / 2026-Q2 | pass | 69.41 | 71.39 | 0.972 | 0 |  |
| BSX | mature_medtech | 63 | 2009-Q4 / 2026-Q2 | watch | 39.81 | 46.67 | 0.853 | 4 | date_gap, large_fair_value_step |
| BX | asset_manager | 54 | 2013-Q1 / 2026-Q2 | watch | 73.21 | 142.38 | 0.514 | 5 | large_fair_value_step |
| BXP | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 64.61 | 69.97 | 0.923 | 1 | large_fair_value_step |
| C | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 95.82 | 132.68 | 0.722 | 0 |  |
| CAH | healthcare_distribution | 66 | 2010-Q2 / 2026-Q4 | watch | 199.07 | 235.13 | 0.847 | 18 | large_fair_value_step |
| CARR | materials | 21 | 2021-Q2 / 2026-Q2 | watch | 28.53 | 58.84 | 0.485 | 1 | large_fair_value_step |
| CASY | consumer_cyclical | 66 | 2010-Q3 / 2026-Q4 | watch | 310.91 | 763.38 | 0.407 | 3 | large_fair_value_step |
| CAT | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 433.96 | 817 | 0.531 | 1 | large_fair_value_step |
| CB | insurance | 67 | 2009-Q4 / 2026-Q2 | pass | 345.84 | 338.31 | 1.022 | 0 |  |
| CBOE | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 294.67 | 313.95 | 0.939 | 11 | large_fair_value_step |
| CBRE | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 82.84 | 150.93 | 0.549 | 1 | large_fair_value_step |
| CCEP | quality_consumer | 26 | 2016-Q2 / 2026-Q2 | watch | 112.34 | 107.64 | 1.044 | 6 | date_gap, large_fair_value_step |
| CCI | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 30.23 | 75.03 | 0.403 | 0 |  |
| CCL | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 20.23 | 24.95 | 0.811 | 3 | large_fair_value_step |
| CDNS | software_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 242.38 | 347.55 | 0.697 | 0 |  |
| CDW | information_services | 63 | 2010-Q4 / 2026-Q2 | watch | 290.47 | 148.97 | 1.95 | 3 | large_fair_value_step |
| CEG | power_utility | 14 | 2020-Q4 / 2026-Q2 | watch | 158.92 | 276.93 | 0.574 | 3 | date_gap, large_fair_value_step |
| CF | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 152.04 | 125.71 | 1.209 | 5 | large_fair_value_step |
| CFG | bank | 48 | 2014-Q3 / 2026-Q2 | pass | 45.31 | 70.18 | 0.646 | 0 |  |
| CHD | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 58.19 | 102.37 | 0.568 | 0 |  |
| CHRW | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 63.15 | 151.14 | 0.418 | 1 | large_fair_value_step |
| CHTR | media_telecom | 62 | 2011-Q1 / 2026-Q2 | watch | 450.53 | 153.75 | 2.93 | 7 | large_fair_value_step, share_count_jump |
| CI | managed_care | 64 | 2010-Q3 / 2026-Q2 | watch | 370.25 | 277.67 | 1.333 | 2 | large_fair_value_step, share_count_jump |
| CIEN | optical_networking_turnaround | 66 | 2010-Q1 / 2026-Q2 | pass | 182.49 | 399.85 | 0.456 | 0 |  |
| CINF | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 254.38 | 172.52 | 1.475 | 9 | large_fair_value_step |
| CL | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 62.27 | 90.96 | 0.685 | 0 |  |
| CLX | consumer_staples | 67 | 2010-Q2 / 2026-Q4 | pass | 69.43 | 103.63 | 0.67 | 0 |  |
| CMCSA | media_telecom | 67 | 2009-Q4 / 2026-Q2 | pass | 58.27 | 26.41 | 2.206 | 0 |  |
| CME | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 181.51 | 285.8 | 0.635 | 1 | high_normalized_margin |
| CMG | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 16.9 | 38.06 | 0.444 | 0 |  |
| CMI | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 412.98 | 573.87 | 0.72 | 0 |  |
| CMS | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 62.18 | 68.35 | 0.91 | 0 |  |
| CNC | managed_care | 64 | 2010-Q3 / 2026-Q2 | watch | 58.09 | 65.33 | 0.889 | 7 | large_fair_value_step |
| CNP | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 27.22 | 39.29 | 0.693 | 0 |  |
| COF | credit_services | 67 | 2009-Q4 / 2026-Q2 | watch | 148.51 | 216.67 | 0.685 | 2 | large_fair_value_step, share_count_jump |
| COHR | optical_networking_turnaround | 67 | 2010-Q2 / 2026-Q4 | watch | 147.07 | 295.39 | 0.498 | 3 | large_fair_value_step |
| COIN | information_services | 19 | 2020-Q4 / 2026-Q2 | watch | 136.7 | 178.89 | 0.764 | 8 | date_gap, large_fair_value_step |
| COO | mature_medtech | 66 | 2010-Q1 / 2026-Q2 | watch | 40.35 | 70.96 | 0.569 | 2 | large_fair_value_step |
| COP | energy_e_and_p | 67 | 2009-Q4 / 2026-Q2 | watch | 62.27 | 129.52 | 0.481 | 5 | large_fair_value_step |
| COR | healthcare_distribution | 67 | 2010-Q1 / 2026-Q3 | watch | 258.07 | 321.23 | 0.803 | 21 | large_fair_value_step |
| COST | quality_consumer | 66 | 2010-Q2 / 2026-Q3 | pass | 601.75 | 934.66 | 0.644 | 0 |  |
| CPAY | payments_processor | 58 | 2012-Q1 / 2026-Q2 | pass | 302.3 | 408.67 | 0.74 | 0 |  |
| CPRT | information_services | 66 | 2010-Q2 / 2026-Q3 | pass | 32.31 | 32.76 | 0.986 | 0 |  |
| CPT | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 67.23 | 105.79 | 0.635 | 0 |  |
| CRH | materials | 36 | 2011-Q2 / 2026-Q2 | watch | 63.27 | 95.58 | 0.662 | 4 | date_gap |
| CRL | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 79.41 | 296.41 | 0.268 | 2 | large_fair_value_step |
| CRM | software_growth | 67 | 2010-Q4 / 2027-Q2 | watch | 529.9 | 256.32 | 2.067 | 4 | large_fair_value_step |
| CRWD | software_growth | 31 | 2019-Q4 / 2027-Q2 | watch | 78.17 | 227.96 | 0.343 | 1 | large_fair_value_step |
| CSCO | networking_hardware | 66 | 2010-Q2 / 2026-Q3 | pass | 77.87 | 112.15 | 0.694 | 0 |  |
| CSGP | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 15.12 | 31.34 | 0.482 | 2 | large_fair_value_step |
| CSX | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 31.61 | 51.54 | 0.613 | 0 |  |
| CTAS | industrial_growth | 67 | 2010-Q2 / 2026-Q4 | pass | 91.21 | 204.15 | 0.447 | 0 |  |
| CTSH | information_services | 67 | 2009-Q4 / 2026-Q2 | pass | 130.39 | 63.76 | 2.045 | 0 |  |
| CTVA | materials | 22 | 2021-Q1 / 2026-Q2 | pass | 20.77 | 82.4 | 0.252 | 0 |  |
| CVNA | consumer_cyclical | 12 | 2023-Q3 / 2026-Q2 | watch | 17.04 | 74.13 | 0.23 | 3 | large_fair_value_step |
| CVS | managed_care | 64 | 2010-Q3 / 2026-Q2 | watch | 65.53 | 92.92 | 0.705 | 4 | large_fair_value_step |
| CVX | energy_infrastructure | 67 | 2009-Q4 / 2026-Q2 | watch | 87.09 | 199.77 | 0.436 | 1 | large_fair_value_step |
| D | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 53.78 | 66.5 | 0.809 | 1 | large_fair_value_step |
| DAL | transportation | 66 | 2010-Q1 / 2026-Q2 | watch | 68.16 | 80.01 | 0.852 | 4 | large_fair_value_step |
| DASH | platform_marketplace_reinvestment | 23 | 2020-Q4 / 2026-Q2 | pass | 92.69 | 236.58 | 0.392 | 0 |  |
| DD | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 97.3 | 138.8 | 0.701 | 3 | large_fair_value_step, share_count_jump |
| DDOG | software_growth | 29 | 2019-Q2 / 2026-Q2 | watch | 121.75 | 237 | 0.514 | 1 | large_fair_value_step |
| DE | industrial_growth | 67 | 2010-Q1 / 2026-Q3 | pass | 394.5 | 622.66 | 0.634 | 0 |  |
| DECK | consumer_cyclical | 67 | 2009-Q4 / 2027-Q1 | pass | 102.38 | 86.33 | 1.186 | 0 |  |
| DELL | technology_hardware | 38 | 2017-Q4 / 2027-Q1 | watch | 229.13 | 472.26 | 0.485 | 6 | large_fair_value_step, share_count_jump |
| DG | consumer_staples | 66 | 2010-Q4 / 2027-Q1 | pass | 169.98 | 122.62 | 1.386 | 0 |  |
| DGE.L | quality_consumer | 27 | 2010-Q2 / 2026-Q4 | watch | 24.53 | 17.64 | 1.391 | 13 | date_gap, large_fair_value_step |
| DGX | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 213.94 | 244.61 | 0.875 | 1 | large_fair_value_step |
| DHI | consumer_cyclical | 67 | 2010-Q1 / 2026-Q3 | watch | 165.26 | 145.26 | 1.138 | 4 | large_fair_value_step |
| DHR | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | pass | 109.6 | 215.68 | 0.508 | 0 |  |
| DIS | media_telecom | 67 | 2010-Q1 / 2026-Q3 | pass | 75.55 | 106.82 | 0.707 | 0 |  |
| DLR | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 73.06 | 192.1 | 0.38 | 0 |  |
| DLTR | consumer_staples | 66 | 2010-Q4 / 2027-Q1 | watch | 99.63 | 127 | 0.784 | 4 | large_fair_value_step |
| DOC | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 17.66 | 21.22 | 0.832 | 0 |  |
| DOV | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 161.67 | 201.82 | 0.801 | 0 |  |
| DOW | materials | 28 | 2019-Q3 / 2026-Q2 | watch | 23.14 | 30.33 | 0.763 | 1 | large_fair_value_step |
| DPZ | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 230.16 | 350.75 | 0.656 | 0 |  |
| DRI | consumer_cyclical | 67 | 2010-Q2 / 2026-Q4 | watch | 148.97 | 211.13 | 0.706 | 1 | large_fair_value_step |
| DTE | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 150.66 | 136.24 | 1.106 | 0 |  |
| DUK | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 93.54 | 120.84 | 0.774 | 2 | large_fair_value_step, share_count_jump |
| DVA | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 233.19 | 178.88 | 1.304 | 3 | large_fair_value_step |
| DVN | energy_e_and_p | 66 | 2010-Q1 / 2026-Q2 | watch | 25.36 | 47.12 | 0.538 | 8 | large_fair_value_step, share_count_jump |
| DXCM | medtech_platform | 45 | 2014-Q3 / 2026-Q2 | watch | 131.27 | 90.7 | 1.447 | 14 | date_gap, large_fair_value_step |
| EA | interactive_entertainment | 64 | 2011-Q2 / 2027-Q1 | watch | 105.86 | 209.7 | 0.505 | 5 | large_fair_value_step |
| EBAY | platform_marketplace_reinvestment | 67 | 2009-Q4 / 2026-Q2 | watch | 106.47 | 102.27 | 1.041 | 3 | large_fair_value_step |
| ECHO | media_telecom | 62 | 2010-Q1 / 2025-Q3 | watch | 26.69 | 86.47 | 0.309 | 9 | date_gap, large_fair_value_step, share_count_jump |
| ECL | materials | 64 | 2010-Q3 / 2026-Q2 | pass | 84.22 | 285.91 | 0.295 | 0 |  |
| ED | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 105.15 | 106.69 | 0.986 | 0 |  |
| EFX | information_services | 66 | 2009-Q4 / 2026-Q2 | watch | 166.72 | 190.36 | 0.876 | 7 | large_fair_value_step |
| EG | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 536.1 | 377.66 | 1.42 | 5 | large_fair_value_step |
| EIX | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 92.01 | 73.68 | 1.249 | 0 |  |
| EL | consumer_staples | 67 | 2010-Q2 / 2026-Q4 | pass | 42.05 | 106.21 | 0.396 | 0 |  |
| ELV | managed_care | 64 | 2010-Q3 / 2026-Q2 | watch | 397.35 | 394.48 | 1.007 | 1 | large_fair_value_step |
| EME | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 637.38 | 775.04 | 0.822 | 1 | large_fair_value_step |
| EMR | industrial_growth | 67 | 2010-Q1 / 2026-Q3 | pass | 100.47 | 157.71 | 0.637 | 0 |  |
| EOG | energy_e_and_p | 67 | 2009-Q4 / 2026-Q2 | watch | 92.81 | 144.5 | 0.642 | 6 | large_fair_value_step |
| EQIX | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 398.07 | 1076.45 | 0.37 | 0 |  |
| EQT | energy_e_and_p | 67 | 2009-Q4 / 2026-Q2 | watch | 42.67 | 54.77 | 0.779 | 9 | large_fair_value_step, share_count_jump |
| ERIE | insurance_broker | 64 | 2010-Q3 / 2026-Q2 | pass | 220.36 | 259.44 | 0.849 | 0 |  |
| ES | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 67.91 | 70.92 | 0.958 | 2 | large_fair_value_step, share_count_jump |
| ESS | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 149.21 | 280.76 | 0.531 | 1 | share_count_jump |
| ESTC | software_growth | 29 | 2019-Q4 / 2026-Q4 | watch | 187.5 | 86.68 | 2.163 | 1 | large_fair_value_step |
| ETN | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 218.42 | 416.04 | 0.525 | 0 |  |
| ETR | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 63.77 | 106.49 | 0.599 | 0 |  |
| EVRG | power_utility | 31 | 2018-Q4 / 2026-Q2 | pass | 62.44 | 81.42 | 0.767 | 0 |  |
| EW | mature_medtech | 67 | 2009-Q4 / 2026-Q2 | pass | 44.25 | 89.95 | 0.492 | 0 |  |
| EXC | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 46.01 | 43.96 | 1.047 | 0 |  |
| EXE | energy_e_and_p | 23 | 2020-Q4 / 2026-Q2 | watch | 125.49 | 98 | 1.28 | 7 | large_fair_value_step, share_count_jump |
| EXPD | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 103.54 | 190.72 | 0.543 | 1 | large_fair_value_step |
| EXPE | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 186.15 | 329.23 | 0.565 | 2 | large_fair_value_step |
| EXR | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 75.47 | 142.79 | 0.529 | 1 | share_count_jump |
| F | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 21.34 | 13.95 | 1.53 | 1 | large_fair_value_step |
| FANG | energy_e_and_p | 51 | 2013-Q4 / 2026-Q2 | watch | 129.93 | 200.52 | 0.648 | 9 | large_fair_value_step, share_count_jump |
| FAST | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 22.9 | 51.13 | 0.448 | 0 |  |
| FCX | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 20.81 | 78.42 | 0.265 | 4 | large_fair_value_step |
| FDS | information_services | 67 | 2010-Q1 / 2026-Q3 | pass | 358.74 | 304.47 | 1.178 | 0 |  |
| FDX | transportation | 65 | 2010-Q4 / 2026-Q4 | watch | 230.74 | 331.41 | 0.696 | 1 | large_fair_value_step |
| FDXF | transportation | 3 | 2025-Q4 / 2026-Q4 | watch | 34.21 | 133.25 | 0.257 | 1 | short_history |
| FE | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 27 | 46.25 | 0.584 | 3 | large_fair_value_step |
| FER | industrial_growth | 4 | 2022-Q4 / 2025-Q4 | watch | 22.83 | 64.13 | 0.356 | 5 | date_gap, large_fair_value_step, short_history |
| FERG | industrial_growth | 21 | 2020-Q4 / 2026-Q4 | watch | 213.55 | 228.49 | 0.935 | 2 | date_gap, large_fair_value_step |
| FFIV | software_platform | 67 | 2010-Q1 / 2026-Q3 | pass | 426.78 | 410.22 | 1.04 | 0 |  |
| FICO | software_platform | 67 | 2010-Q1 / 2026-Q3 | pass | 978.34 | 1157.06 | 0.846 | 0 |  |
| FIS | payments_processor | 64 | 2010-Q3 / 2026-Q2 | watch | 52.73 | 40.55 | 1.3 | 6 | large_fair_value_step, share_count_jump |
| FISV | payments_processor | 64 | 2010-Q3 / 2026-Q2 | watch | 88.42 | 52.58 | 1.682 | 1 | share_count_jump |
| FITB | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 28.81 | 54.85 | 0.525 | 0 |  |
| FIX | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 727.55 | 1614.98 | 0.451 | 0 |  |
| FLEX | technology_hardware | 67 | 2010-Q3 / 2027-Q1 | pass | 58.97 | 115.3 | 0.511 | 0 |  |
| FOXA | media_telecom | 33 | 2018-Q4 / 2026-Q4 | pass | 67.44 | 67.22 | 1.003 | 0 |  |
| FRT | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 74.43 | 116.92 | 0.637 | 0 |  |
| FSLR | energy_technology | 67 | 2009-Q4 / 2026-Q2 | watch | 205.04 | 210.1 | 0.976 | 5 | large_fair_value_step |
| FTNT | software_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 136.2 | 166 | 0.82 | 0 |  |
| FTV | technology_hardware | 43 | 2014-Q4 / 2026-Q2 | pass | 28.54 | 59.92 | 0.476 | 0 |  |
| GD | defense_prime | 67 | 2009-Q4 / 2026-Q2 | pass | 285.89 | 380.06 | 0.752 | 0 |  |
| GDDY | software_platform | 47 | 2014-Q4 / 2026-Q2 | pass | 246.01 | 96.98 | 2.537 | 0 |  |
| GE | defense_prime | 67 | 2009-Q4 / 2026-Q2 | watch | 104.94 | 342.73 | 0.306 | 1 | large_fair_value_step |
| GEHC | mature_medtech | 17 | 2021-Q4 / 2026-Q2 | pass | 78.78 | 71.72 | 1.098 | 0 |  |
| GEN | software_platform | 66 | 2010-Q3 / 2027-Q1 | watch | 52.34 | 30.5 | 1.716 | 5 | date_gap, large_fair_value_step |
| GEV | power_utility | 6 | 2025-Q1 / 2026-Q2 | watch | 218.27 | 911.53 | 0.239 | 2 | large_fair_value_step, short_history |
| GILD | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 92.51 | 148.86 | 0.621 | 1 | large_fair_value_step |
| GIS | consumer_staples | 66 | 2010-Q3 / 2026-Q4 | pass | 52.27 | 40.44 | 1.292 | 0 |  |
| GL | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 202.35 | 175.78 | 1.151 | 2 | large_fair_value_step |
| GLW | technology_hardware | 67 | 2009-Q4 / 2026-Q2 | watch | 34.73 | 152.8 | 0.227 | 1 | large_fair_value_step |
| GM | consumer_cyclical | 65 | 2010-Q2 / 2026-Q2 | watch | 146.84 | 86.4 | 1.7 | 2 | large_fair_value_step |
| GNRC | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 114.37 | 183.81 | 0.622 | 3 | large_fair_value_step |
| GOOGL | ads_ai_platform | 67 | 2009-Q4 / 2026-Q2 | pass | 283.91 | 346.67 | 0.819 | 0 |  |
| GPC | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 109.75 | 136.7 | 0.803 | 0 |  |
| GPN | payments_processor | 62 | 2011-Q1 / 2026-Q2 | watch | 56.84 | 92.74 | 0.613 | 4 | large_fair_value_step, share_count_jump |
| GRMN | technology_hardware | 67 | 2009-Q4 / 2026-Q2 | pass | 135.62 | 289.87 | 0.468 | 0 |  |
| GS | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 752.1 | 1040.87 | 0.723 | 0 |  |
| GTLB | software_growth | 20 | 2022-Q2 / 2027-Q1 | watch | 81.98 | 42.62 | 1.923 | 4 | large_fair_value_step |
| GWW | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 831.55 | 1321.08 | 0.629 | 0 |  |
| HAL | energy_infrastructure | 67 | 2009-Q4 / 2026-Q2 | watch | 18.34 | 35.49 | 0.517 | 2 | large_fair_value_step |
| HAS | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 45.85 | 94.18 | 0.487 | 0 |  |
| HBAN | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 12.1 | 16.86 | 0.718 | 0 |  |
| HCA | healthcare_services | 63 | 2010-Q4 / 2026-Q2 | watch | 566.71 | 417.85 | 1.356 | 3 | large_fair_value_step |
| HD | consumer_cyclical | 67 | 2010-Q4 / 2027-Q2 | pass | 217.83 | 328.61 | 0.663 | 0 |  |
| HIG | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 197.75 | 137.8 | 1.435 | 1 | large_fair_value_step |
| HII | defense_prime | 63 | 2009-Q4 / 2026-Q2 | watch | 223.7 | 297.29 | 0.752 | 6 | date_gap, large_fair_value_step |
| HLT | consumer_cyclical | 52 | 2012-Q4 / 2026-Q2 | watch | 91.79 | 322.27 | 0.285 | 3 | large_fair_value_step |
| HON | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 312.99 | 220.39 | 1.42 | 0 |  |
| HONA | defense_prime | 3 | 2025-Q4 / 2026-Q2 | watch | 65 | 160.75 | 0.404 | 1 | short_history |
| HOOD | capital_markets | 20 | 2021-Q3 / 2026-Q2 | watch | 29.6 | 104.3 | 0.284 | 1 | large_fair_value_step |
| HPE | technology_hardware | 44 | 2014-Q4 / 2026-Q2 | watch | 42.41 | 54.41 | 0.779 | 2 | large_fair_value_step |
| HPQ | technology_hardware | 67 | 2010-Q1 / 2026-Q3 | pass | 60.09 | 29.63 | 2.028 | 0 |  |
| HRL | consumer_staples | 66 | 2010-Q1 / 2026-Q2 | watch | 24.58 | 21.28 | 1.155 | 2 | large_fair_value_step |
| HSIC | healthcare_distribution | 67 | 2009-Q4 / 2026-Q2 | watch | 42.74 | 90.28 | 0.473 | 4 | large_fair_value_step |
| HST | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 26.96 | 22.34 | 1.207 | 5 | large_fair_value_step |
| HSY | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 149.11 | 181.32 | 0.822 | 0 |  |
| HUBB | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 303.19 | 470.28 | 0.645 | 0 |  |
| HUM | managed_care | 64 | 2010-Q3 / 2026-Q2 | watch | 228.3 | 392.63 | 0.581 | 1 | large_fair_value_step |
| HWM | defense_prime | 66 | 2010-Q1 / 2026-Q2 | watch | 52.59 | 267.65 | 0.196 | 5 | large_fair_value_step, latest_fair_to_price_extreme |
| IBKR | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 31.01 | 96.55 | 0.321 | 0 |  |
| IBM | information_services | 67 | 2009-Q4 / 2026-Q2 | pass | 239.39 | 238.79 | 1.002 | 0 |  |
| ICE | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 139.17 | 161.24 | 0.863 | 11 | large_fair_value_step, share_count_jump |
| IDXX | medtech_platform | 67 | 2009-Q4 / 2026-Q2 | watch | 557.1 | 545.08 | 1.022 | 1 | large_fair_value_step |
| IEX | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 157.61 | 233.98 | 0.674 | 0 |  |
| IFF | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 16 | 86.85 | 0.184 | 4 | large_fair_value_step, latest_fair_to_price_extreme, share_count_jump |
| INCY | biopharma_growth | 53 | 2009-Q4 / 2026-Q2 | watch | 135.51 | 127.74 | 1.061 | 17 | date_gap, large_fair_value_step |
| INSM | emerging_biotech | 47 | 2009-Q4 / 2026-Q2 | watch | 21.72 | 121.39 | 0.179 | 9 | date_gap, large_fair_value_step, latest_fair_to_price_extreme, share_count_jump |
| INTC | semiconductor_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 24.55 | 92.09 | 0.267 | 0 |  |
| INTU | software_growth | 66 | 2010-Q2 / 2026-Q3 | pass | 966.15 | 348 | 2.776 | 0 |  |
| INVH | reit | 40 | 2015-Q4 / 2026-Q2 | watch | 22.6 | 29.23 | 0.773 | 1 | share_count_jump |
| IP | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 21.07 | 39.88 | 0.528 | 1 | share_count_jump |
| IQV | healthcare_services | 55 | 2012-Q4 / 2026-Q2 | watch | 198.62 | 262.38 | 0.757 | 2 | large_fair_value_step, share_count_jump |
| IR | industrial_growth | 38 | 2016-Q4 / 2026-Q2 | watch | 43.98 | 78.97 | 0.557 | 5 | large_fair_value_step, share_count_jump |
| IRM | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 41.78 | 122.69 | 0.341 | 0 |  |
| ISRG | medtech_platform | 67 | 2009-Q4 / 2026-Q2 | pass | 442.83 | 367.07 | 1.206 | 0 |  |
| IT | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 326.55 | 196.6 | 1.661 | 8 | large_fair_value_step |
| ITW | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 211.82 | 281.67 | 0.752 | 0 |  |
| IVZ | asset_manager | 64 | 2010-Q3 / 2026-Q2 | pass | 12.05 | 33.31 | 0.362 | 0 |  |
| J | industrial_growth | 67 | 2010-Q1 / 2026-Q3 | pass | 109.81 | 150.62 | 0.729 | 0 |  |
| JBHT | transportation | 67 | 2009-Q4 / 2026-Q2 | pass | 97.82 | 263.39 | 0.371 | 0 |  |
| JBL | technology_hardware | 66 | 2010-Q1 / 2026-Q3 | watch | 209.6 | 312.22 | 0.671 | 4 | date_gap, large_fair_value_step |
| JCI | materials | 64 | 2010-Q4 / 2026-Q3 | pass | 39.15 | 142.21 | 0.275 | 0 |  |
| JKHY | information_services | 65 | 2010-Q2 / 2026-Q3 | watch | 153.89 | 169.64 | 0.907 | 1 | date_gap |
| JNJ | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 129.65 | 265.77 | 0.488 | 1 | large_fair_value_step |
| JPM | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 254.28 | 354.22 | 0.718 | 0 |  |
| KDP | quality_consumer | 67 | 2009-Q4 / 2026-Q2 | watch | 27.78 | 31.88 | 0.871 | 6 | large_fair_value_step, share_count_jump |
| KEY | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 13.55 | 22.02 | 0.615 | 0 |  |
| KEYS | technology_hardware | 51 | 2013-Q4 / 2026-Q2 | pass | 111.95 | 325.82 | 0.344 | 0 |  |
| KHC | quality_consumer | 42 | 2015-Q4 / 2026-Q2 | watch | 37.82 | 25.67 | 1.473 | 15 | date_gap, large_fair_value_step |
| KIM | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 15.19 | 23.81 | 0.638 | 0 |  |
| KKR | asset_manager | 61 | 2011-Q2 / 2026-Q2 | watch | 52.68 | 108.69 | 0.485 | 9 | large_fair_value_step, share_count_jump |
| KLAC | semiconductor_equipment | 67 | 2010-Q2 / 2026-Q4 | watch | 80.91 | 183.77 | 0.44 | 1 | large_fair_value_step |
| KMB | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 81.39 | 109.98 | 0.74 | 0 |  |
| KMI | energy_infrastructure | 64 | 2009-Q4 / 2026-Q2 | watch | 12.64 | 31.54 | 0.401 | 5 | large_fair_value_step, share_count_jump |
| KO | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 45.5 | 89.06 | 0.511 | 0 |  |
| KR | consumer_staples | 66 | 2010-Q4 / 2027-Q1 | watch | 139.92 | 56.93 | 2.458 | 2 | large_fair_value_step |
| KTOS | defense_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 31.51 | 64.58 | 0.488 | 5 | large_fair_value_step, share_count_jump |
| KVUE | consumer_staples | 16 | 2021-Q4 / 2026-Q2 | watch | 12.81 | 19.2 | 0.667 | 1 | large_fair_value_step |
| L | insurance | 67 | 2009-Q4 / 2026-Q2 | pass | 93.8 | 109.82 | 0.854 | 0 |  |
| LDOS | information_services | 63 | 2010-Q4 / 2026-Q2 | watch | 343.3 | 139.86 | 2.455 | 9 | date_gap, large_fair_value_step, share_count_jump |
| LEGN | emerging_biotech | 25 | 2019-Q4 / 2026-Q2 | watch | 35.56 | 20.37 | 1.746 | 2 | date_gap, large_fair_value_step |
| LEN | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 137.03 | 85.11 | 1.61 | 1 | large_fair_value_step |
| LH | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | pass | 242.98 | 336.54 | 0.722 | 0 |  |
| LHX | defense_prime | 65 | 2010-Q2 / 2026-Q2 | watch | 163.26 | 261.98 | 0.623 | 5 | date_gap, large_fair_value_step, share_count_jump |
| LII | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 253.81 | 391.15 | 0.649 | 1 | large_fair_value_step |
| LIN | industrial_gases_compounder | 31 | 2018-Q4 / 2026-Q2 | pass | 482.63 | 485.35 | 0.994 | 0 |  |
| LITE | optical_networking_turnaround | 41 | 2014-Q4 / 2026-Q4 | watch | 356.99 | 895 | 0.399 | 7 | date_gap, large_fair_value_step |
| LLY | biopharma_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 505.33 | 1176.1 | 0.43 | 0 |  |
| LMT | defense_prime | 67 | 2009-Q4 / 2026-Q2 | pass | 452.63 | 565.89 | 0.8 | 0 |  |
| LNT | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 49.54 | 68.21 | 0.726 | 1 | large_fair_value_step |
| LOW | consumer_cyclical | 66 | 2010-Q4 / 2027-Q1 | pass | 169.63 | 206.74 | 0.821 | 0 |  |
| LRCX | semiconductor_equipment | 66 | 2010-Q3 / 2026-Q4 | watch | 121.14 | 318.58 | 0.38 | 3 | large_fair_value_step, share_count_jump |
| LSEG | information_services | 62 | 2010-Q4 / 2026-Q2 | watch | 90.71 | 85.36 | 1.063 | 4 | date_gap, large_fair_value_step |
| LULU | consumer_cyclical | 66 | 2010-Q4 / 2027-Q1 | pass | 202.45 | 115 | 1.76 | 0 |  |
| LUV | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 21.12 | 39.76 | 0.531 | 5 | large_fair_value_step |
| LVS | consumer_cyclical | 62 | 2011-Q1 / 2026-Q2 | watch | 36.49 | 44.24 | 0.825 | 2 | large_fair_value_step |
| LYB | materials | 58 | 2012-Q1 / 2026-Q2 | pass | 55.67 | 63.06 | 0.883 | 0 |  |
| LYV | media_telecom | 62 | 2010-Q4 / 2026-Q2 | watch | 106.45 | 180.64 | 0.589 | 19 | large_fair_value_step |
| MA | payments_network | 67 | 2009-Q4 / 2026-Q2 | watch | 503.6 | 595.54 | 0.846 | 1 | high_normalized_margin |
| MAA | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 90.16 | 128.79 | 0.7 | 3 | large_fair_value_step, share_count_jump |
| MAR | quality_consumer | 67 | 2009-Q4 / 2026-Q2 | watch | 218.46 | 353.87 | 0.617 | 11 | large_fair_value_step, share_count_jump |
| MAS | materials | 64 | 2010-Q3 / 2026-Q2 | pass | 50 | 72.79 | 0.687 | 0 |  |
| MCD | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 133.89 | 260.06 | 0.515 | 0 |  |
| MCHP | semiconductor_value | 67 | 2010-Q3 / 2027-Q1 | pass | 24.49 | 75.49 | 0.324 | 0 |  |
| MCK | healthcare_distribution | 67 | 2010-Q3 / 2027-Q1 | watch | 700.79 | 890.51 | 0.787 | 16 | large_fair_value_step |
| MCO | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 317.96 | 509.02 | 0.625 | 2 | large_fair_value_step |
| MDLZ | quality_consumer | 67 | 2009-Q4 / 2026-Q2 | watch | 59.77 | 62.43 | 0.957 | 5 | large_fair_value_step |
| MDT | mature_medtech | 66 | 2010-Q3 / 2026-Q4 | pass | 69.03 | 89.97 | 0.767 | 0 |  |
| MELI | platform_marketplace_reinvestment | 67 | 2009-Q4 / 2026-Q2 | watch | 2240.58 | 1965.91 | 1.14 | 1 | large_fair_value_step |
| MET | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 63.43 | 96.25 | 0.659 | 1 | large_fair_value_step |
| META | mega_cap_platform | 55 | 2012-Q4 / 2026-Q2 | watch | 687.92 | 578.28 | 1.19 | 5 | high_terminal_value_share, large_fair_value_step |
| MGM | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 54.14 | 42.97 | 1.26 | 7 | large_fair_value_step |
| MKC | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 50.05 | 54.54 | 0.918 | 0 |  |
| MLM | materials | 64 | 2010-Q3 / 2026-Q2 | pass | 195 | 528.59 | 0.369 | 0 |  |
| MMM | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 147.35 | 178.83 | 0.824 | 0 |  |
| MNST | quality_consumer | 67 | 2009-Q4 / 2026-Q2 | watch | 24.28 | 46.7 | 0.52 | 1 | large_fair_value_step |
| MO | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 62.51 | 67.67 | 0.924 | 0 |  |
| MOS | materials | 62 | 2011-Q1 / 2026-Q2 | watch | 19.77 | 23.76 | 0.832 | 1 | large_fair_value_step |
| MPC | energy_infrastructure | 63 | 2010-Q4 / 2026-Q2 | watch | 268.43 | 363.54 | 0.738 | 5 | large_fair_value_step, share_count_jump |
| MPWR | semiconductor_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 761.17 | 1311.08 | 0.581 | 0 |  |
| MRK | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 89.04 | 149.54 | 0.595 | 1 | large_fair_value_step |
| MRNA | biopharma_growth | 24 | 2020-Q3 / 2026-Q2 | watch | 230.74 | 137.99 | 1.672 | 6 | large_fair_value_step |
| MRSH | insurance_broker | 64 | 2010-Q3 / 2026-Q2 | pass | 151.96 | 190 | 0.8 | 0 |  |
| MRVL | semiconductor_growth | 64 | 2010-Q4 / 2027-Q1 | watch | 84.13 | 241.45 | 0.348 | 1 | date_gap |
| MS | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 141.33 | 214.86 | 0.658 | 0 |  |
| MSCI | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 353.18 | 570.77 | 0.619 | 1 | large_fair_value_step |
| MSFT | mega_cap_platform | 67 | 2010-Q2 / 2026-Q4 | watch | 330.54 | 505.06 | 0.654 | 1 | high_terminal_value_share |
| MSI | technology_hardware | 67 | 2009-Q4 / 2026-Q2 | watch | 209.34 | 486.54 | 0.43 | 1 | large_fair_value_step |
| MSTR | bitcoin_treasury_software | 3 | 2025-Q4 / 2026-Q2 | watch | 116.38 | 93.04 | 1.251 | 1 | short_history |
| MTB | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 183.47 | 238.68 | 0.769 | 0 |  |
| MTD | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | pass | 782.48 | 1407.43 | 0.556 | 0 |  |
| MU | semiconductor_cyclical | 67 | 2010-Q1 / 2026-Q3 | watch | 465.63 | 935.39 | 0.498 | 1 | large_fair_value_step |
| NCLH | transportation | 56 | 2011-Q4 / 2026-Q2 | watch | 17.51 | 16.66 | 1.051 | 3 | large_fair_value_step |
| NDAQ | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 74.19 | 99.35 | 0.747 | 1 | large_fair_value_step |
| NDSN | industrial_growth | 67 | 2010-Q1 / 2026-Q3 | watch | 183.59 | 330.84 | 0.555 | 1 | large_fair_value_step |
| NEE | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 54.79 | 83.47 | 0.656 | 0 |  |
| NEM | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 65.39 | 132.29 | 0.494 | 4 | large_fair_value_step, share_count_jump |
| NFLX | subscription_streaming_platform | 67 | 2009-Q4 / 2026-Q2 | pass | 92.94 | 81.74 | 1.137 | 0 |  |
| NI | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 35.03 | 40.96 | 0.855 | 0 |  |
| NKE | consumer_cyclical | 67 | 2010-Q2 / 2026-Q4 | pass | 34.24 | 38.44 | 0.891 | 0 |  |
| NOC | defense_prime | 67 | 2009-Q4 / 2026-Q2 | pass | 383.44 | 545.13 | 0.703 | 0 |  |
| NOW | software_growth | 55 | 2012-Q4 / 2026-Q2 | watch | 177.13 | 144.84 | 1.223 | 3 | date_gap, large_fair_value_step |
| NRG | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 124.84 | 114.41 | 1.091 | 1 | large_fair_value_step |
| NSC | transportation | 67 | 2009-Q4 / 2026-Q2 | pass | 114.82 | 347.93 | 0.33 | 0 |  |
| NTAP | technology_hardware | 66 | 2010-Q3 / 2026-Q4 | watch | 105.31 | 190.64 | 0.552 | 2 | large_fair_value_step |
| NTRA | genetic_diagnostics_growth | 46 | 2014-Q4 / 2026-Q2 | pass | 202.53 | 326.52 | 0.62 | 0 |  |
| NTRS | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 137.46 | 186.27 | 0.738 | 0 |  |
| NUE | materials | 63 | 2010-Q4 / 2026-Q2 | watch | 167.32 | 252.37 | 0.663 | 2 | large_fair_value_step |
| NVDA | semiconductor_growth | 67 | 2010-Q4 / 2027-Q2 | watch | 274.86 | 227.98 | 1.206 | 1 | high_normalized_margin |
| NVR | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 6314.73 | 6365.45 | 0.992 | 0 |  |
| NWSA | media_telecom | 54 | 2012-Q4 / 2026-Q4 | watch | 16.95 | 31.19 | 0.543 | 4 | date_gap, large_fair_value_step |
| NXPI | semiconductor_value | 63 | 2010-Q4 / 2026-Q2 | watch | 119.53 | 223.82 | 0.534 | 4 | large_fair_value_step |
| O | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 26.77 | 61.8 | 0.433 | 2 | large_fair_value_step |
| ODFL | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 95.92 | 200.06 | 0.479 | 0 |  |
| OKE | energy_infrastructure | 67 | 2009-Q4 / 2026-Q2 | watch | 71.28 | 94.72 | 0.753 | 12 | large_fair_value_step, share_count_jump |
| OMC | media_telecom | 67 | 2009-Q4 / 2026-Q2 | watch | 124.42 | 87.89 | 1.416 | 1 | share_count_jump |
| ON | semiconductor_value | 67 | 2009-Q4 / 2026-Q2 | watch | 42.2 | 74.8 | 0.564 | 3 | large_fair_value_step |
| ORCL | mega_cap_platform | 66 | 2010-Q3 / 2026-Q4 | watch | 136.27 | 151.94 | 0.897 | 1 | large_fair_value_step |
| ORLY | quality_consumer | 67 | 2009-Q4 / 2026-Q2 | watch | 65.1 | 87.83 | 0.741 | 2 | large_fair_value_step |
| OTIS | industrial_growth | 27 | 2019-Q4 / 2026-Q2 | pass | 75.86 | 71.75 | 1.057 | 0 |  |
| OXY | energy_e_and_p | 67 | 2009-Q4 / 2026-Q2 | watch | 14.65 | 59.17 | 0.248 | 3 | large_fair_value_step |
| PANW | software_growth | 56 | 2012-Q4 / 2026-Q3 | watch | 153.73 | 371.76 | 0.414 | 1 | large_fair_value_step |
| PAYX | information_services | 66 | 2010-Q3 / 2026-Q4 | pass | 117.9 | 126.48 | 0.932 | 0 |  |
| PCAR | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 97.99 | 126.54 | 0.774 | 1 | large_fair_value_step |
| PCG | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 16.82 | 17.95 | 0.937 | 1 | share_count_jump |
| PDD | platform_marketplace_reinvestment | 34 | 2017-Q4 / 2026-Q2 | watch | 203.59 | 85.72 | 2.375 | 1 | large_fair_value_step |
| PEG | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 78.28 | 73.33 | 1.068 | 0 |  |
| PEP | quality_consumer | 67 | 2009-Q4 / 2026-Q2 | pass | 144.3 | 139.72 | 1.033 | 0 |  |
| PFE | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 23.23 | 28.02 | 0.829 | 5 | large_fair_value_step |
| PFG | capital_markets | 67 | 2009-Q4 / 2026-Q2 | watch | 82.18 | 112.17 | 0.733 | 1 | large_fair_value_step |
| PG | consumer_staples | 67 | 2010-Q2 / 2026-Q4 | pass | 105.87 | 143.14 | 0.74 | 0 |  |
| PGR | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 192.13 | 217.65 | 0.883 | 1 | large_fair_value_step |
| PH | industrial_growth | 67 | 2010-Q2 / 2026-Q4 | pass | 489.62 | 1011.2 | 0.484 | 0 |  |
| PHM | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 142.99 | 126.75 | 1.128 | 4 | large_fair_value_step |
| PKG | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 140.74 | 243.69 | 0.578 | 0 |  |
| PLD | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 62.64 | 141.85 | 0.442 | 5 | large_fair_value_step, share_count_jump |
| PLTR | hypergrowth_ai_software | 25 | 2020-Q2 / 2026-Q2 | watch | 82.41 | 186.35 | 0.442 | 2 | high_ev_sales, high_target_pe |
| PM | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | pass | 84.72 | 191.84 | 0.442 | 0 |  |
| PNC | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 176.09 | 243.51 | 0.723 | 0 |  |
| PNR | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 75.45 | 62.1 | 1.215 | 2 | large_fair_value_step, share_count_jump |
| PNW | power_utility | 67 | 2009-Q4 / 2026-Q2 | watch | 95.64 | 97.89 | 0.977 | 1 | large_fair_value_step |
| PODD | mature_medtech | 29 | 2019-Q1 / 2026-Q2 | watch | 99.83 | 145.13 | 0.688 | 1 | large_fair_value_step |
| PPG | materials | 64 | 2010-Q3 / 2026-Q2 | pass | 65.48 | 113.47 | 0.577 | 0 |  |
| PPL | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 23.97 | 34.44 | 0.696 | 0 |  |
| PRU | insurance | 67 | 2009-Q4 / 2026-Q2 | watch | 123.02 | 120.37 | 1.022 | 3 | large_fair_value_step |
| PSA | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 151.82 | 311.2 | 0.488 | 2 | large_fair_value_step |
| PSKY | media_telecom | 66 | 2009-Q4 / 2026-Q2 | watch | 2.63 | 10.8 | 0.243 | 9 | date_gap, large_fair_value_step, share_count_jump |
| PSX | energy_infrastructure | 60 | 2010-Q4 / 2026-Q2 | watch | 102.12 | 244.2 | 0.418 | 10 | large_fair_value_step |
| PTC | software_platform | 67 | 2010-Q1 / 2026-Q3 | pass | 184.92 | 158.95 | 1.163 | 0 |  |
| PWR | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 256.88 | 621.83 | 0.413 | 0 |  |
| PYPL | payments_processor | 41 | 2016-Q2 / 2026-Q2 | pass | 90.5 | 53.7 | 1.685 | 0 |  |
| Q | semiconductor_equipment | 7 | 2024-Q4 / 2026-Q2 | watch | 55.58 | 126.35 | 0.44 | 1 | short_history |
| QCOM | semiconductor_value | 67 | 2010-Q1 / 2026-Q3 | pass | 173.23 | 164.78 | 1.051 | 0 |  |
| RCL | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 106.62 | 284.8 | 0.374 | 4 | large_fair_value_step |
| RDDT | platform_marketplace_reinvestment | 11 | 2023-Q4 / 2026-Q2 | watch | 95.12 | 152.92 | 0.622 | 1 | large_fair_value_step |
| REG | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 45.69 | 75.46 | 0.605 | 6 | large_fair_value_step, share_count_jump |
| REGN | biopharma_growth | 56 | 2012-Q3 / 2026-Q2 | watch | 885.7 | 807.71 | 1.097 | 2 | large_fair_value_step |
| RF | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 24.53 | 30.4 | 0.807 | 0 |  |
| RJF | capital_markets | 67 | 2010-Q1 / 2026-Q3 | pass | 150.59 | 176.11 | 0.855 | 0 |  |
| RKLB | space_launch_growth | 19 | 2021-Q4 / 2026-Q2 | watch | 15.45 | 64.39 | 0.24 | 3 | large_fair_value_step |
| RKLX | n/a | 0 | - / - | not_applicable | - | 24.25 | - | 0 |  |
| RL | consumer_cyclical | 67 | 2010-Q3 / 2027-Q1 | pass | 216.93 | 351.9 | 0.616 | 0 |  |
| RMD | mature_medtech | 67 | 2010-Q2 / 2026-Q4 | pass | 168.94 | 235.76 | 0.717 | 0 |  |
| ROK | industrial_growth | 67 | 2010-Q1 / 2026-Q3 | pass | 214.99 | 433 | 0.497 | 0 |  |
| ROL | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 16.77 | 35.94 | 0.467 | 0 |  |
| ROP | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 358.76 | 422.69 | 0.849 | 0 |  |
| ROST | quality_consumer | 66 | 2010-Q4 / 2027-Q1 | watch | 177.94 | 229.87 | 0.774 | 3 | large_fair_value_step |
| RSG | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 129.32 | 219.27 | 0.59 | 0 |  |
| RTX | defense_prime | 67 | 2009-Q4 / 2026-Q2 | watch | 84.23 | 212.08 | 0.397 | 1 | share_count_jump |
| RVTY | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 59.86 | 129.71 | 0.462 | 4 | large_fair_value_step |
| SBAC | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 115.51 | 186.96 | 0.618 | 0 |  |
| SBUX | quality_consumer | 67 | 2010-Q1 / 2026-Q3 | watch | 48.53 | 107.26 | 0.452 | 3 | large_fair_value_step |
| SCHW | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 63.67 | 108.05 | 0.589 | 0 |  |
| SE | platform_marketplace_reinvestment | 37 | 2016-Q4 / 2026-Q2 | watch | 132.76 | 119.48 | 1.111 | 2 | large_fair_value_step |
| SHOP | platform_marketplace_reinvestment | 46 | 2014-Q4 / 2026-Q2 | watch | 33.16 | 152.77 | 0.217 | 6 | large_fair_value_step |
| SHW | materials | 64 | 2010-Q3 / 2026-Q2 | pass | 132.17 | 345.21 | 0.383 | 0 |  |
| SJM | consumer_staples | 67 | 2010-Q3 / 2027-Q1 | watch | 95.06 | 131.84 | 0.721 | 1 | large_fair_value_step |
| SLB | energy_infrastructure | 67 | 2009-Q4 / 2026-Q2 | watch | 22.7 | 55.01 | 0.413 | 1 | large_fair_value_step |
| SMCI | technology_hardware | 57 | 2010-Q2 / 2026-Q3 | watch | 58.12 | 38.46 | 1.511 | 7 | date_gap, large_fair_value_step |
| SNA | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 370.01 | 395.84 | 0.935 | 0 |  |
| SNDK | semiconductor_storage_cycle | 9 | 2024-Q4 / 2026-Q4 | watch | 1157.77 | 1484.98 | 0.78 | 3 | large_fair_value_step |
| SNOW | software_growth | 24 | 2021-Q2 / 2027-Q1 | watch | 208.88 | 327.77 | 0.637 | 2 | large_fair_value_step |
| SNPS | software_growth | 67 | 2010-Q1 / 2026-Q3 | pass | 619.16 | 464.89 | 1.332 | 0 |  |
| SO | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 68.98 | 89.05 | 0.775 | 0 |  |
| SOLV | healthcare_services | 11 | 2023-Q4 / 2026-Q2 | watch | 62.34 | 90.93 | 0.686 | 3 | large_fair_value_step |
| SPCX | space_platform_ipo | 3 | 2025-Q4 / 2026-Q2 | watch | 28.42 | 140 | 0.203 | 1 | short_history |
| SPG | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 112.01 | 214.89 | 0.521 | 0 |  |
| SPGI | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 336.84 | 435.39 | 0.774 | 5 | large_fair_value_step |
| SRE | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 57.09 | 84.75 | 0.674 | 0 |  |
| STE | mature_medtech | 44 | 2014-Q4 / 2027-Q1 | watch | 139.59 | 232.97 | 0.599 | 2 | date_gap, large_fair_value_step |
| STLD | materials | 63 | 2010-Q4 / 2026-Q2 | watch | 142.64 | 235.84 | 0.605 | 1 | large_fair_value_step |
| STT | capital_markets | 67 | 2009-Q4 / 2026-Q2 | pass | 127.74 | 193.37 | 0.661 | 0 |  |
| STX | semiconductor_storage_cycle | 67 | 2010-Q2 / 2026-Q4 | watch | 248.56 | 847.2 | 0.293 | 6 | large_fair_value_step |
| STZ | consumer_staples | 67 | 2010-Q3 / 2027-Q1 | pass | 91 | 131.43 | 0.692 | 0 |  |
| SW | consumer_cyclical | 11 | 2023-Q4 / 2026-Q2 | watch | 21.51 | 48.63 | 0.442 | 2 | large_fair_value_step |
| SWK | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 86.83 | 99.24 | 0.875 | 5 | large_fair_value_step, share_count_jump |
| SWKS | semiconductor_value | 67 | 2010-Q1 / 2026-Q3 | watch | 66.08 | 67.36 | 0.981 | 1 | large_fair_value_step |
| SYF | credit_services | 50 | 2013-Q4 / 2026-Q2 | pass | 122.69 | 78.05 | 1.572 | 0 |  |
| SYK | mature_medtech | 67 | 2009-Q4 / 2026-Q2 | pass | 188.82 | 322.12 | 0.586 | 0 |  |
| SYY | consumer_staples | 67 | 2010-Q2 / 2026-Q4 | watch | 122.79 | 82.45 | 1.489 | 1 | large_fair_value_step |
| T | media_telecom | 67 | 2009-Q4 / 2026-Q2 | watch | 31 | 25.43 | 1.219 | 1 | large_fair_value_step |
| TAP | consumer_staples | 67 | 2009-Q4 / 2026-Q2 | watch | 84.11 | 41.66 | 2.019 | 2 | large_fair_value_step |
| TDG | defense_prime | 67 | 2010-Q1 / 2026-Q3 | pass | 442.28 | 1186.48 | 0.373 | 0 |  |
| TDY | technology_hardware | 67 | 2009-Q4 / 2026-Q2 | pass | 336.96 | 626.5 | 0.538 | 0 |  |
| TECH | biopharma_growth | 67 | 2010-Q2 / 2026-Q4 | pass | 29.16 | 72.47 | 0.402 | 0 |  |
| TEL | technology_hardware | 67 | 2010-Q1 / 2026-Q3 | watch | 176.28 | 203 | 0.868 | 2 | large_fair_value_step |
| TEM | emerging_health_ai | 7 | 2024-Q4 / 2026-Q2 | watch | 49.49 | 64.04 | 0.773 | 1 | short_history |
| TER | semiconductor_equipment | 67 | 2009-Q4 / 2026-Q2 | watch | 138.57 | 372.06 | 0.372 | 3 | large_fair_value_step |
| TFC | bank | 67 | 2009-Q4 / 2026-Q2 | watch | 40.59 | 50.3 | 0.807 | 1 | share_count_jump |
| TGT | consumer_staples | 66 | 2010-Q4 / 2027-Q1 | watch | 176.32 | 165.93 | 1.063 | 2 | large_fair_value_step |
| TJX | consumer_cyclical | 66 | 2010-Q4 / 2027-Q1 | pass | 67.52 | 134.22 | 0.503 | 0 |  |
| TKO | media_telecom | 13 | 2022-Q4 / 2026-Q2 | watch | 82.88 | 184.34 | 0.45 | 6 | large_fair_value_step |
| TMO | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 520.49 | 630.7 | 0.825 | 1 | large_fair_value_step |
| TMUS | media_telecom | 67 | 2009-Q4 / 2026-Q2 | watch | 176.39 | 177.75 | 0.992 | 6 | large_fair_value_step, share_count_jump |
| TPL | energy_e_and_p | 67 | 2009-Q4 / 2026-Q2 | watch | 47.82 | 369.71 | 0.129 | 3 | high_normalized_margin, large_fair_value_step, latest_fair_to_price_extreme |
| TPR | consumer_cyclical | 67 | 2010-Q2 / 2026-Q4 | pass | 81.41 | 123.24 | 0.661 | 0 |  |
| TRGP | energy_infrastructure | 59 | 2009-Q4 / 2026-Q2 | watch | 79.14 | 288.95 | 0.274 | 11 | date_gap, large_fair_value_step, share_count_jump |
| TRI | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 85.02 | 103.61 | 0.821 | 7 | large_fair_value_step |
| TRMB | technology_hardware | 65 | 2009-Q4 / 2026-Q2 | watch | 34.62 | 61.54 | 0.563 | 1 | date_gap |
| TROW | asset_manager | 64 | 2010-Q3 / 2026-Q2 | pass | 145.55 | 112.36 | 1.295 | 0 |  |
| TRV | insurance | 67 | 2009-Q4 / 2026-Q2 | pass | 464.94 | 369.33 | 1.259 | 0 |  |
| TSCO | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 26.02 | 34.7 | 0.75 | 0 |  |
| TSLA | ev_autonomy_platform | 67 | 2009-Q4 / 2026-Q2 | watch | 137.81 | 349.11 | 0.395 | 4 | large_fair_value_step |
| TSM | semiconductor_foundry | 67 | 2009-Q4 / 2026-Q2 | watch | 299.65 | 427.3 | 0.701 | 1 | large_fair_value_step |
| TSN | commodity_merchant | 67 | 2010-Q1 / 2026-Q3 | watch | 27.62 | 55.35 | 0.499 | 1 | large_fair_value_step |
| TT | materials | 64 | 2010-Q3 / 2026-Q2 | pass | 178.76 | 454.31 | 0.393 | 0 |  |
| TTD | software_platform | 41 | 2015-Q4 / 2026-Q2 | watch | 42.35 | 13.57 | 3.121 | 4 | large_fair_value_step, latest_fair_to_price_extreme |
| TTWO | interactive_entertainment | 58 | 2010-Q3 / 2027-Q1 | watch | 46.52 | 233 | 0.2 | 10 | date_gap, large_fair_value_step, latest_fair_to_price_extreme |
| TXN | semiconductor_value | 67 | 2009-Q4 / 2026-Q2 | watch | 117.44 | 266.54 | 0.441 | 1 | large_fair_value_step |
| TXT | defense_prime | 67 | 2009-Q4 / 2026-Q2 | watch | 82.64 | 82.35 | 1.003 | 3 | large_fair_value_step |
| TYL | software_platform | 67 | 2009-Q4 / 2026-Q2 | watch | 350.4 | 369.88 | 0.947 | 1 | large_fair_value_step |
| UAL | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 113.03 | 110.57 | 1.022 | 6 | large_fair_value_step, share_count_jump |
| UBER | software_platform | 31 | 2018-Q4 / 2026-Q2 | watch | 156.79 | 78.78 | 1.99 | 4 | large_fair_value_step |
| UDR | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 22.05 | 37.08 | 0.595 | 0 |  |
| UHS | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 470.88 | 172.58 | 2.728 | 1 | large_fair_value_step |
| ULTA | consumer_cyclical | 66 | 2010-Q4 / 2027-Q1 | pass | 410.39 | 540.1 | 0.76 | 0 |  |
| UNH | managed_care | 64 | 2010-Q3 / 2026-Q2 | pass | 284.39 | 395.05 | 0.72 | 0 |  |
| UNP | transportation | 67 | 2009-Q4 / 2026-Q2 | pass | 111.72 | 307.67 | 0.363 | 0 |  |
| UPS | transportation | 67 | 2009-Q4 / 2026-Q2 | pass | 68.25 | 105.68 | 0.646 | 0 |  |
| URI | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | watch | 758.46 | 1037.51 | 0.731 | 4 | large_fair_value_step |
| USB | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 48.64 | 62.4 | 0.779 | 0 |  |
| V | payments_network | 67 | 2010-Q1 / 2026-Q3 | watch | 328.21 | 381.79 | 0.86 | 5 | high_normalized_margin, large_fair_value_step |
| VEEV | healthcare_services | 52 | 2014-Q2 / 2027-Q1 | watch | 108.74 | 277.29 | 0.392 | 1 | large_fair_value_step |
| VICI | reit | 37 | 2016-Q4 / 2026-Q2 | watch | 20.73 | 25.77 | 0.804 | 5 | high_normalized_margin, large_fair_value_step, share_count_jump |
| VLO | energy_infrastructure | 65 | 2010-Q2 / 2026-Q2 | watch | 196.68 | 346.59 | 0.567 | 6 | large_fair_value_step |
| VLTO | industrial_growth | 13 | 2022-Q4 / 2026-Q2 | pass | 77.19 | 98.37 | 0.785 | 0 |  |
| VMC | materials | 64 | 2010-Q3 / 2026-Q2 | watch | 89.83 | 273.85 | 0.328 | 3 | large_fair_value_step |
| VMRK | reit | 67 | 2009-Q4 / 2026-Q2 | pass | 41.73 | 64.03 | 0.652 | 0 |  |
| VRSK | information_services | 67 | 2009-Q4 / 2026-Q2 | watch | 152.54 | 191.77 | 0.795 | 2 | large_fair_value_step |
| VRSN | software_platform | 67 | 2009-Q4 / 2026-Q2 | watch | 171.42 | 294.73 | 0.582 | 1 | high_normalized_margin |
| VRT | industrial_growth | 23 | 2020-Q4 / 2026-Q2 | watch | 68.73 | 256.91 | 0.268 | 1 | large_fair_value_step |
| VRTX | biopharma_growth | 59 | 2011-Q4 / 2026-Q2 | watch | 376.44 | 547.55 | 0.687 | 7 | large_fair_value_step |
| VST | power_utility | 34 | 2017-Q2 / 2026-Q2 | watch | 101.28 | 137.16 | 0.738 | 6 | date_gap, large_fair_value_step |
| VTR | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 33.73 | 92.89 | 0.363 | 3 | large_fair_value_step, share_count_jump |
| VTRS | biopharma | 67 | 2009-Q4 / 2026-Q2 | watch | 18.04 | 16.89 | 1.068 | 6 | large_fair_value_step, share_count_jump |
| VZ | media_telecom | 67 | 2009-Q4 / 2026-Q2 | watch | 58.53 | 49.43 | 1.184 | 1 | large_fair_value_step |
| WAB | transportation | 67 | 2009-Q4 / 2026-Q2 | watch | 96.26 | 297.28 | 0.324 | 1 | share_count_jump |
| WAT | healthcare_services | 67 | 2009-Q4 / 2026-Q2 | watch | 111.02 | 421.26 | 0.264 | 2 | large_fair_value_step, share_count_jump |
| WBD | media_telecom | 67 | 2009-Q4 / 2026-Q2 | watch | 9.61 | 28.88 | 0.333 | 3 | large_fair_value_step, share_count_jump |
| WDAY | software_growth | 56 | 2013-Q2 / 2027-Q1 | watch | 396.42 | 193.57 | 2.048 | 2 | large_fair_value_step |
| WDC | semiconductor_storage_cycle | 67 | 2010-Q2 / 2026-Q4 | watch | 62.41 | 462 | 0.135 | 12 | large_fair_value_step, latest_fair_to_price_extreme |
| WEC | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 88.36 | 106.28 | 0.831 | 0 |  |
| WELL | reit | 67 | 2009-Q4 / 2026-Q2 | watch | 52.16 | 239.6 | 0.218 | 1 | large_fair_value_step |
| WFC | bank | 67 | 2009-Q4 / 2026-Q2 | pass | 69.62 | 84.97 | 0.819 | 0 |  |
| WM | industrial_growth | 67 | 2009-Q4 / 2026-Q2 | pass | 144.97 | 217.76 | 0.666 | 0 |  |
| WMB | energy_infrastructure | 67 | 2009-Q4 / 2026-Q2 | watch | 17.55 | 74.19 | 0.237 | 2 | large_fair_value_step |
| WMT | quality_consumer | 66 | 2010-Q4 / 2027-Q1 | pass | 68.37 | 102.63 | 0.666 | 0 |  |
| WRB | insurance | 67 | 2009-Q4 / 2026-Q2 | pass | 66.17 | 68.34 | 0.968 | 0 |  |
| WSM | consumer_cyclical | 66 | 2010-Q4 / 2027-Q1 | watch | 126.45 | 238.4 | 0.53 | 2 | large_fair_value_step |
| WST | mature_medtech | 67 | 2009-Q4 / 2026-Q2 | pass | 138.6 | 346.09 | 0.4 | 0 |  |
| WTW | insurance_broker | 64 | 2010-Q3 / 2026-Q2 | watch | 291.31 | 339.58 | 0.858 | 5 | large_fair_value_step, share_count_jump |
| WY | reit | 66 | 2010-Q1 / 2026-Q2 | watch | 9.59 | 23.7 | 0.405 | 5 | large_fair_value_step, share_count_jump |
| WYNN | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | watch | 60.89 | 93.61 | 0.65 | 8 | large_fair_value_step |
| XEL | power_utility | 67 | 2009-Q4 / 2026-Q2 | pass | 55.6 | 77.16 | 0.721 | 0 |  |
| XOM | energy_infrastructure | 67 | 2009-Q4 / 2026-Q2 | watch | 59.18 | 156.44 | 0.378 | 2 | large_fair_value_step |
| XYL | industrial_growth | 61 | 2010-Q4 / 2026-Q2 | pass | 79.69 | 112.65 | 0.707 | 0 |  |
| XYZ | payments_processor | 24 | 2020-Q3 / 2026-Q2 | watch | 23.2 | 83.61 | 0.278 | 5 | large_fair_value_step |
| YUM | consumer_cyclical | 67 | 2009-Q4 / 2026-Q2 | pass | 77.34 | 150.75 | 0.513 | 0 |  |
| ZBH | mature_medtech | 67 | 2009-Q4 / 2026-Q2 | pass | 85.42 | 99.48 | 0.859 | 0 |  |
| ZBRA | technology_hardware | 67 | 2009-Q4 / 2026-Q2 | watch | 227.29 | 361.11 | 0.629 | 2 | large_fair_value_step |
| ZS | hypergrowth_ai_software | 34 | 2018-Q2 / 2026-Q3 | watch | 468.57 | 184.23 | 2.543 | 1 | high_ev_sales |
| ZTS | biopharma | 56 | 2011-Q4 / 2026-Q2 | pass | 84.12 | 77.57 | 1.084 | 0 |  |

## Audit Policy

- Financials and guidance must be point-in-time visible at every node; market price is comparison-only.
- Cross-currency financials and guidance must use an official event-visible ECB reference rate with source/target currency, rate date, rate math, and URL retained. Cross-listing price ratios and fixed FX fallbacks are forbidden.
- Stored market prices are consumed in their recorded quote-currency unit. A `.L` suffix identifies the market symbol but never authorizes an inferred divide-by-100 conversion; every model-node comparison price is reconciled to `price_points`.
- Period-end quoted-security shares are used exactly once with the recorded provider factor; no retrospective split inference is allowed.
- Customer, policyholder, brokerage and fund cash flows are excluded from operating-company FCFE models.
- Base fair value cannot include a blanket optionality uplift. Optionality belongs in separately labeled bull/bear scenarios.
- EV/sales above 40x, target P/E above 72x, normalized operating margin above 65%, or DCF assumptions outside the release bounds are blockers.
- Extreme fair-value/price ratios remain visible for human review but do not make price an input to fair value.
- Transcript Q&A is research-only, must begin after a detected Q&A boundary, contain a substantive management response, and be stored bilingually before release.
- Chinese Q&A must come from the audited local translation cache. Currency, percentage, basis-point, quarter and numeric tokens are restored deterministically; a missing cache item is a release blocker.

