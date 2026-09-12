import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

function corruptSourceFixture() {
  const hash = text => crypto.createHash("sha256").update(text).digest("hex");
  const official = event({ source_id: "official-hon-same-date", growth_yoy: null, amount: 38500,
    currency: "USD", unit: "USD millions", source_url: "https://www.sec.gov/Archives/edgar/data/773840/official.htm",
    evidence_excerpt: "Full-year sales are expected to be $38.1 billion to $38.9 billion." });
  const broken = event({ source_database: "downloaded_online_earnings_transcript", source_id: "corrupt-hon",
    growth_yoy: null, amount: null, currency: null, quality_status: "research_only_corrupt_source",
    evidence_excerpt: "For the full year, we expect sales of $38.,100,000,000-$38,900,000,000.",
    source_review: { type: "corrupt_numeric_source_superseded", originalEvidenceSha256: "",
      replacement: { sourceId: official.source_id, sourceDatabase: official.source_database,
        ticker: official.ticker, fiscalPeriod: official.fiscal_period, observedAt: official.observed_at,
        metricName: official.metric_name, sourceUrl: official.source_url, evidenceSha256: hash(official.evidence_excerpt) } } });
  broken.source_review.originalEvidenceSha256 = hash(broken.evidence_excerpt);
  return { official, broken, hash };
}

test("dated current annual guidance column is annual but historical results and cumulative plans are not approved", () => {
  const evidence_excerpt = "Year ended 31 December 2025 | Updated guidance. Free cash flow target | >£1.1bn";
  const common = { metric_name: "free_cash_flow_guidance", amount: 1100, currency: "GBP", growth_yoy: null };
  assert.equal(assessGuidanceReleaseEvent(event({ ...common, evidence_excerpt })).usable, true);
  for (const evidence of [evidence_excerpt.replace("Updated guidance", "Results"),
    evidence_excerpt.replace("Free cash flow target", "Cumulative free cash flow target")]) {
    assert.equal(assessGuidanceReleaseEvent(event({ ...common, evidence_excerpt: evidence })).usable, false);
  }
});

test("corrupt original is retained and rejected after independently verified same-date official replacement", () => {
  const { official, broken } = corruptSourceFixture();
  const result = audit([broken, official]);
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures));
  assert.equal(result.usableEvents, 1);
  assert.equal(result.researchEvents, 1);
  assert.equal(result.supersededCorruptSources.length, 1);
  assert.equal(result.supersededCorruptSources[0].independentlyReconstructedRange.amountM, 38500);
  assert.ok(result.rejectedEventKeys.has(guidanceReleaseEventKey(broken)));
  assert.ok(result.researchEvidence[0].reasons.includes("guidance_corrupt_original_source"));
  assert.equal(assessGuidanceReleaseEvent(broken).usable, false);
  const consumed = audit([broken, official], { modelRuns: [run({ guidanceSelection: {
    revenue: { acceptedEvidenceIds: [broken.source_id] }
  } })] });
  assert.ok(consumed.failures.some(failure => failure.code === "research_only_guidance_selected"));
});

test("corrupt-source replacement fails closed for missing, later, wrong owner, forged amount or broken lineage", () => {
  for (const change of [
    fixture => { fixture.official = null; },
    fixture => { fixture.official.observed_at = "2026-03-12"; fixture.broken.source_review.replacement.observedAt = "2026-03-12"; },
    fixture => { fixture.official.ticker = "OTHER"; fixture.broken.source_review.replacement.ticker = "OTHER"; },
    fixture => { fixture.official.metric_name = "ebitda_guidance"; },
    fixture => { fixture.official.guidance_target_year = 2027; },
    fixture => { fixture.official.amount = 38100; },
    fixture => { fixture.official.quality_status = "ambiguous"; },
    fixture => { fixture.broken.source_review.originalEvidenceSha256 = "forged"; },
    fixture => { fixture.broken.source_review.replacement.evidenceSha256 = "forged"; },
    fixture => { fixture.broken.amount = 38900; },
    fixture => { fixture.broken.evidence_excerpt = "For the full year, we expect sales of £38.,100,000,000-£38,900,000,000.";
      fixture.broken.source_review.originalEvidenceSha256 = fixture.hash(fixture.broken.evidence_excerpt); },
    fixture => { fixture.official.evidence_excerpt = "For the full year, we expect segment sales of $38.1 billion-$38.9 billion.";
      fixture.broken.source_review.replacement.evidenceSha256 = fixture.hash(fixture.official.evidence_excerpt); },
    fixture => { fixture.official.evidence_excerpt = "Full-year sales are expected to be $38.9 billion to $38.1 billion.";
      fixture.broken.source_review.replacement.evidenceSha256 = fixture.hash(fixture.official.evidence_excerpt); },
  ]) {
    const fixture = corruptSourceFixture(); change(fixture);
    const result = audit([fixture.broken, fixture.official].filter(Boolean));
    assert.equal(result.supersededCorruptSources.length, 0, String(change));
    assert.ok(result.failures.some(failure => failure.code === "guidance_corrupt_source_replacement_invalid"));
    assert.ok(result.failures.some(failure => failure.code === "guidance_quantified_evidence_review_incomplete"));
  }
});

test("a corrupt-source label cannot hide an otherwise intact original target", () => {
  const { broken, official, hash } = corruptSourceFixture();
  broken.evidence_excerpt = "For the full year, we expect sales of $38.1 billion-$38.9 billion.";
  broken.source_review.originalEvidenceSha256 = hash(broken.evidence_excerpt);
  const result = audit([broken, official]);
  assert.ok(result.failures.some(failure => failure.code === "guidance_corrupt_source_replacement_invalid"));
  assert.equal(result.supersededCorruptSources.length, 0);
});

test("numeric corruption in a preceding amount owner does not invent corruption in a later percentage owner", () => {
  const row = event({ amount: null, growth_yoy: 5,
    evidence_excerpt: "For the full year we expect sales of $38.,100,000,000-$38,900,000,000, which represents organic sales growth of 4%-6% for the year." });
  assert.ok(!assessGuidanceReleaseEvent(row).rejectionReasons.includes("guidance_corrupt_original_source"));
});
test("EPS drivers remain retained research rather than unfulfilled absolute earnings targets", () => {
  for (const noun of ["headwind", "benefit", "contribution"]) {
    const result = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null,
      per_share_value: 0.275, unit: "currency_per_share", currency: "USD", growth_yoy: null,
      evidence_excerpt: `For 2026 we expect an EPS ${noun} of $0.25-$0.30.` }));
    assert.equal(result.usable, false);
    assert.equal(result.quantifiedReviewIncomplete, false);
    assert.ok(result.rejectionReasons.includes("guidance_non_company_or_non_periodic"));
  }
  assert.equal(assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null,
    per_share_value: 5.1, unit: "currency_per_share", currency: "USD", growth_yoy: null,
    evidence_excerpt: "For 2026 we expect EPS of $5.00-$5.20 after a tax benefit." })).usable, true);
});

test("old official EPS evidence does not borrow a historical base or FX assumption", () => {
  const evidence_excerpt = "We expect the Group's underlying earnings per share to grow by mid-single digit compared to full-year earnings per share in 2018 of 42.9p, assuming a US$1.30 to sterling exchange rate.";
  const result = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", evidence_excerpt,
    amount: null, growth_yoy: null, quality_status: "ambiguous" }));
  assert.equal(result.usable, false);
  assert.equal(result.quantifiedReviewIncomplete, false);
});

test("historical statement tables and questions are retained without inventing future revenue or FCF", () => {
  for (const row of [
    { metric_name: "free_cash_flow_guidance", evidence_excerpt: "14. Based on the strong free cash flow model should we expect further increases? How can we utilize the $1B cash balance?" },
    { metric_name: "revenue_guidance", evidence_excerpt: "Income Statement - 2025 Fourth Quarter and Year-To-Date ($ in millions) QTD Total operating revenues $3,995. Gain on sale of project $4." },
    { metric_name: "eps_guidance", evidence_excerpt: "For full year 2018 earnings per share will be negatively impacted by $0.13." },
  ]) {
    const assessed = assessGuidanceReleaseEvent(event({ ...row, amount: null, growth_yoy: null, quality_status: "ambiguous" }));
    assert.equal(assessed.usable, false);
    assert.equal(assessed.quantifiedReviewIncomplete, false, JSON.stringify(assessed.rejectionReasons));
  }
});

test("reported EPS growth and achieved prior range remain actual, while a direct future EPS level stays usable", () => {
  const actual = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null,
    growth_yoy: null, per_share_value: 0.79, currency: "USD", unit: "currency_per_share", per_share_basis: "adjusted",
    evidence_excerpt: "Q1 2026 adjusted earnings per share of $0.80 grew 6% versus 2025, achieving the high end of our guidance range of $0.78-$0.80." }));
  assert.equal(actual.usable, false);
  assert.equal(actual.quantifiedReviewIncomplete, false);
  assert.ok(actual.rejectionReasons.includes("guidance_historical_actual"));
  const target = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null,
    growth_yoy: null, per_share_value: 0.80, currency: "USD", unit: "currency_per_share", per_share_basis: "adjusted", guidance_scope: "quarter",
    evidence_excerpt: "For Q1 we expect adjusted earnings per share of $0.80 representing growth of 6%." }));
  assert.equal(target.usable, true, JSON.stringify(target.rejectionReasons));
});

test("growth-period oracle is local to revenue and cannot borrow EPS or EBITDA growth", () => {
  const row = event({ growth_yoy: 7, amount: 7100, currency: "USD", guidance_scope: "quarter",
    evidence_excerpt: "For fiscal Q2 we expect total revenue of $7.1 billion, representing a 7% increase year-over-year, and non-GAAP EPS of $2.30, representing a 10% increase year-over-year." });
  const assessed = assessGuidanceReleaseEvent(row);
  assert.ok(!assessed.rejectionReasons.some(reason => reason.startsWith("guidance_growth_period_basis")));
  assert.ok(assessGuidanceReleaseEvent({ ...row, growth_yoy: 10 }).rejectionReasons.includes("guidance_growth_period_basis_mismatch"));
});
test("fiscal two-digit year has independent annual support without stealing quarter scope", () => {
  const evidence_excerpt = "For fiscal 26, given further weakness through the first half in the US we have updated both organic net sales and operating profit growth guidance. We have reiterated free cash flow guidance of $3 billion.";
  const result = assessGuidanceReleaseEvent(event({ metric_name: "free_cash_flow_guidance", amount: 3000,
    evidence_excerpt, growth_yoy: null, currency: "USD", guidance_scope: "full_year" }));
  assert.equal(result.usable, true, result.rejectionReasons.join(","));
  for (const prefix of ["For Q2 fiscal 26", "For the second quarter of fiscal 26"]) {
    const quarter = assessGuidanceReleaseEvent(event({ evidence_excerpt: prefix + " we expect revenue of $1 billion.",
      amount: 1000, currency: "USD", growth_yoy: null, guidance_scope: "quarter" }));
    assert.equal(quarter.usable, true, quarter.rejectionReasons.join(","));
    assert.equal(assessGuidanceReleaseEvent(event({ evidence_excerpt: prefix + " we expect revenue of $1 billion.",
      amount: 1000, currency: "USD", growth_yoy: null, guidance_scope: "full_year" })).usable, false);
  }
});
test("raw currency-unit normalization is a release-blocking independent check", () => {
  const evidence_excerpt = "For the full year we expect revenue of $1,200,000,000-$1,400,000,000 and EPS of $1.20.";
  const common = { evidence_excerpt, currency: "USD", growth_yoy: null,
    selected_values: [{ value: 1300 }], metric_position: 9999 };
  assert.equal(assessGuidanceReleaseEvent(event({ ...common, amount: 1300 })).usable, true);
  for (const amount of [1200, 1400, 1300000000]) {
    const bad = assessGuidanceReleaseEvent(event({ ...common, amount }));
    assert.equal(bad.usable, false);
    assert.equal(bad.quantifiedReviewIncomplete, true);
    assert.ok(bad.rejectionReasons.includes("guidance_full_dollar_amount_mismatch"));
  }
});
test("qualitative revenue targets do not borrow other metric growth or margin percentages", () => {
  for (const evidence_excerpt of [
    "We expect our fiscal 2022 revenue growth to be low to mid-teens and free cash flow growth to re-accelerate to approximately 20%.",
    "We continue to target double-digit revenue growth, non-GAAP operating margins in the 38% to 40% range, and double-digit free cash flow growth on a compound annual basis.",
    "For 2025, we anticipate solid mid-single digit organic sales growth, strong margin expansion, and close to 20% Adjusted EPS growth.",
    "With the change in revenue, we now expect full-year fiscal 2023 non-GAAP earnings per share to be between $5.60 and $5.65, representing growth of 7%-8%.",
  ]) {
    const assessed = assessGuidanceReleaseEvent(event({ evidence_excerpt, amount: null, growth_yoy: null, quality_status: "ambiguous" }));
    assert.equal(assessed.usable, false);
    assert.equal(assessed.quantifiedReviewIncomplete, false, evidence_excerpt + assessed.rejectionReasons.join(","));
    assert.ok(!assessed.rejectionReasons.includes("guidance_quantified_source_not_extracted"));
  }
  const real = assessGuidanceReleaseEvent(event({ evidence_excerpt: "For 2026 we expect revenue growth of 7%-8% and EPS growth of 20%.", amount: null, growth_yoy: null, quality_status: "ambiguous" }));
  assert.equal(real.quantifiedReviewIncomplete, true);
});
test("missing EPS targets cannot be inferred from reserve amounts in millions", () => {
  const evidence_excerpt = "We now expect full year adjusted EBITDA and earnings per share to grow low single digits, both excluding CATs, overcoming $94 million of lower favorable prior year reserve development.";
  const result = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", evidence_excerpt,
    amount: null, growth_yoy: null, quality_status: "ambiguous" }));
  assert.equal(result.quantifiedReviewIncomplete, false);
  assert.equal(result.usable, false);
  const real = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance",
    evidence_excerpt: "For the full year we expect earnings per share of $5.25 after $94 million of reserve development.",
    amount: null, growth_yoy: null, quality_status: "ambiguous" }));
  assert.equal(real.quantifiedReviewIncomplete, true);
});
test("newly quantified observations still require the correct total-company and temporal owner", () => {
  const cases = [
    { metric_name: "net_income_guidance", amount: 17,
      evidence_excerpt: "For the fourth quarter we expect non-GAAP other net income to be $17 million and diluted share count of 1.64 billion shares.",
      reason: "guidance_non_company_or_non_periodic" },
    { metric_name: "net_income_guidance", amount: 8.5,
      evidence_excerpt: "For the third quarter GAAP diluted net income per common share includes approximately $8.5 million in expected stock-based compensation.",
      reason: "guidance_per_share_not_total_income" },
    { metric_name: "capex_guidance", amount: 150,
      evidence_excerpt: "Capital spending in the second quarter was about $150,000,000 and we expect capital spending in the third quarter to decline sequentially by $15,000,000.",
      reason: "guidance_historical_actual" },
    { ticker: "NEE", metric_name: "capex_guidance", amount: 9000,
      evidence_excerpt: "FPL's capital expenditures were $2,500,000,000 for the quarter, and we expect FPL's full year 2023 capital investment to be between $8,500,000,000 and $9,500,000,000.",
      reason: "guidance_non_company_or_non_periodic" },
  ];
  for (const { reason, ...row } of cases) {
    const result = assessGuidanceReleaseEvent(event({ ...row, growth_yoy: null, currency: "USD", guidance_scope: "quarter" }));
    assert.equal(result.usable, false, row.evidence_excerpt);
    assert.ok(result.rejectionReasons.includes(reason), result.rejectionReasons.join(","));
  }
  assert.equal(assessGuidanceReleaseEvent(event({ metric_name: "net_income_guidance", amount: 17,
    evidence_excerpt: "For the full year we expect total net income of $17 million.", growth_yoy: null, currency: "USD" })).usable, true);
});
test("ARE range-width revisions are research, not missing absolute EPS levels", () => {
  const quotes = [
    "Turning to guidance, we updated our conservative guidance for 2021, including narrowing the range for EPS and FFO per share from a range of $0.08 to a range of $0.02 per share.",
    "Lastly, on guidance, we updated our guidance for 2022 and narrowed the range for EPS and FFO per share from a range of $0.06 to a range of $0.02 per share.",
  ];
  for (const evidence_excerpt of quotes) {
    const result = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", evidence_excerpt,
      amount: null, growth_yoy: null, per_share_value: null, quality_status: "ambiguous" }));
    assert.equal(result.usable, false);
    assert.equal(result.quantifiedReviewIncomplete, false);
    assert.ok(result.rejectionReasons.includes("guidance_per_share_range_width_not_level"));
  }
  const missing = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null, growth_yoy: null,
    evidence_excerpt: "For the full year we have narrowed EPS guidance to $5.10 to $5.20.", quality_status: "ambiguous" }));
  assert.equal(missing.quantifiedReviewIncomplete, true);
  const actualLevel = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null, growth_yoy: null,
    per_share_value: 5.15, unit: "currency_per_share", currency: "USD", per_share_basis: "unspecified",
    evidence_excerpt: quotes[0] + " For the full year we now expect EPS of $5.10 to $5.20." }));
  assert.equal(actualLevel.usable, true, actualLevel.rejectionReasons.join(", "));
});
test("ARE width exemption cannot conceal missing or incorrect later EPS guidance", () => {
  const width = "Turning to guidance, we updated our conservative guidance for 2021, including narrowing the range for EPS and FFO per share from a range of $0.08 to a range of $0.02 per share.";
  for (const per_share_value of [null, 5.10]) {
    const row = event({ metric_name: "eps_guidance", amount: null, growth_yoy: null,
      per_share_value, unit: "currency_per_share", currency: "USD", per_share_basis: "unspecified",
      metric_position: 9999, selected_values: [{ value: 5.15 }],
      evidence_excerpt: width + " For the full year we now expect EPS of $5.10 to $5.20." });
    const result = assessGuidanceReleaseEvent(row);
    assert.equal(result.usable, false);
    assert.equal(result.quantifiedReviewIncomplete, true, result.rejectionReasons.join(", "));
    assert.ok(result.rejectionReasons.includes("guidance_other_per_share_target_requires_review"));
    const release = audit([row], { noQuantifiedTickers: ["TEST"],
      coverageRows: [{ ticker: "TEST", status: "no_quantified_official_guidance" }] });
    assert.ok(release.failures.some(f => f.code === "guidance_quantified_evidence_review_incomplete"));
  }
});
test("ARE width followed by historical EPS or another width remains research-only", () => {
  const width = "For the full year we narrowed the range for EPS and FFO per share from a range of $0.08 to a range of $0.02 per share.";
  for (const suffix of [" For last year we reported EPS of $5.10.", " We previously expected EPS of $5.10.", " " + width]) {
    const result = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null, growth_yoy: null,
      per_share_value: null, evidence_excerpt: width + suffix }));
    assert.equal(result.usable, false);
    assert.equal(result.quantifiedReviewIncomplete, false, result.rejectionReasons.join(", "));
  }
});
test("ABT repeated EPS owns its exact value and period without trusting producer offsets", () => {
  const evidence_excerpt = "For the full year, we now forecast ongoing EPS of $5.17-$5.23, which is comprised of our year-to-date results through September, plus ongoing EPS guidance of $0.86-$0.92 for the fourth quarter.";
  const common = { metric_name: "eps_guidance", evidence_excerpt, amount: null, growth_yoy: null,
    currency: "USD", unit: "currency_per_share", per_share_basis: "unspecified", metric_position: 9999, selected_values: [{ value: 999 }] };
  for (const [per_share_value, guidance_scope] of [[0.89, "quarter"], [5.2, "full_year"]]) {
    const result = assessGuidanceReleaseEvent(event({ ...common, per_share_value, guidance_scope }));
    assert.equal(result.usable, true, result.rejectionReasons.join(", "));
    const wrong = assessGuidanceReleaseEvent(event({ ...common, per_share_value,
      guidance_scope: guidance_scope === "quarter" ? "full_year" : "quarter" }));
    assert.equal(wrong.usable, false);
    assert.ok(wrong.rejectionReasons.includes("guidance_scope_not_supported_by_evidence"));
  }
  const unknown = assessGuidanceReleaseEvent(event({ ...common, currency: null, per_share_value: 0.89, guidance_scope: "quarter" }));
  assert.equal(unknown.usable, false);
  assert.equal(unknown.currencyReviewIncomplete, true);
});
test("identical EPS at multiple original owners cannot be resolved by stored scope", () => {
  const row = event({ metric_name: "eps_guidance", amount: null, growth_yoy: null, currency: "USD",
    per_share_value: 1, unit: "currency_per_share", per_share_basis: "unspecified", guidance_scope: "quarter",
    evidence_excerpt: "For the full year we expect EPS of $1.00. For the fourth quarter we expect EPS of $1.00." });
  const result = assessGuidanceReleaseEvent(row);
  assert.equal(result.usable, false);
  assert.equal(result.quantifiedReviewIncomplete, true);
  assert.ok(result.rejectionReasons.includes("guidance_per_share_owner_ambiguous"));
  assert.ok(audit([row]).failures.some(f => f.code === "guidance_quantified_evidence_review_incomplete"));
});
test("BLK capital-spending context does not turn a repurchase target into missing capex", () => {
  // BLK Q1 2024, 2024-04-12, original retained transcript excerpt; source ID
  // eb5e502634a6c9d6e4c3dc86. The $375m has its own repurchasing owner.
  const evidence_excerpt = "At present, based on our capital spending plans for the year and subject to market conditions, we still anticipate repurchasing at least $375 million of shares per quarter for the balance of the year, consistent with our January guidance.";
  const result = assessGuidanceReleaseEvent(event({ metric_name: "capex_guidance", evidence_excerpt,
    amount: null, growth_yoy: null, quality_status: "ambiguous" }));
  assert.equal(result.usable, false);
  assert.equal(result.quantifiedReviewIncomplete, false);
  assert.equal(result.metadataConflict, false);
  assert.ok(result.rejectionReasons.includes("guidance_no_owned_quantified_target"));
  assert.ok(!result.rejectionReasons.includes("guidance_quantified_source_not_extracted"));
  assert.equal(assessGuidanceReleaseEvent(event({ metric_name: "capex_guidance", evidence_excerpt,
    amount: 375, growth_yoy: null, currency: "USD" })).usable, false);
});
test("separately quantified capex must still be extracted when repurchases are nearby", () => {
  for (const evidence_excerpt of [
    "For the full year we expect capital spending of $100 million and share repurchases of $375 million.",
    "For the full year we expect share repurchases of $375 million and capital spending of $100 million.",
  ]) {
    const result = assessGuidanceReleaseEvent(event({ metric_name: "capex_guidance", evidence_excerpt,
      amount: null, growth_yoy: null, quality_status: "ambiguous" }));
    assert.equal(result.quantifiedReviewIncomplete, true, result.rejectionReasons.join(", "));
    assert.ok(result.rejectionReasons.includes("guidance_quantified_source_not_extracted"));
  }
});
test("ALK corporate actual cannot borrow a later forward held-revenue clause", () => {
  const row = event({ amount: null, growth_yoy: 19, guidance_scope: "quarter", actual_or_guidance: "actual", quality_status: "historical_actual", evidence_excerpt: "We expect a unit revenue drag on the second quarter. Corporate travel is accelerating — Managed corporate revenue was up 19% in Q1, with held revenue over the next 90 days up nearly 30%." });
  const result = assessGuidanceReleaseEvent(row);
  assert.equal(result.usable, false);
  assert.equal(result.metadataConflict, false);
  assert.ok(result.rejectionReasons.includes("guidance_historical_actual"));
});
test("first-batch explicit headings and liquidity owner are checked independently", () => {
  for (const evidence_excerpt of ["Outlook for Fiscal Year 2026. Net sales growth of 4% to 6%", "Third Quarter 2026 Financial Outlook. Core revenue of approximately $214 to $216 million"]) {
    const quarter = evidence_excerpt.startsWith("Third");
    assert.equal(assessGuidanceReleaseEvent(event({ evidence_excerpt, amount: quarter ? 215 : null, growth_yoy: quarter ? null : 5, currency: "USD", guidance_scope: quarter ? "quarter" : "full_year" })).usable, true);
  }
  const ratio = assessGuidanceReleaseEvent(event({ evidence_excerpt: "We raised $1 billion in financing during the quarter, bolstering liquidity to the top end of our target range of 15% to 25% of trailing-12-month revenue.", amount: 1000, growth_yoy: 20, currency: "USD", guidance_scope: null }));
  assert.equal(ratio.usable, false);
  assert.equal(ratio.metadataConflict, false);
  assert.ok(ratio.rejectionReasons.includes("guidance_percentage_other_economic_owner"));
});
test("maintaining reported-revenue basis is forward, unlike an issuer-reported actual", () => {
  const row = event({ amount: 6700, growth_yoy: null, currency: "USD", evidence_excerpt: "This results in us maintaining our full year reported revenue guidance range of $6.67 billion-$6.73 billion for the full year." });
  assert.equal(assessGuidanceReleaseEvent(row).usable, true);
  const actual = assessGuidanceReleaseEvent({ ...row, evidence_excerpt: "We reported revenue of $6.7 billion for the full year. Next year we expect operating margin to improve." });
  assert.equal(actual.usable, false);
  assert.ok(actual.rejectionReasons.includes("guidance_historical_actual"));
});
test("SOFI same-clause adjusted EPS inherits the explicit management expectation", () => {
  const row = event({ metric_name: "eps_guidance", amount: null, growth_yoy: null, per_share_value: 0.6, per_share_basis: "adjusted", unit: "currency_per_share", currency: "USD", evidence_excerpt: "For the full year 2026, management also continues to expect adjusted net income of approximately $825 million, which equates to a margin of approximately 17%, and adjusted EPS of approximately 60 cents per share." });
  assert.equal(assessGuidanceReleaseEvent(row).usable, true);
});
test("actual first-batch replay preserves target headings and rejects realised/qualitative/multiyear values", () => {
  const examples = [
    ["gross_margin", "Meanwhile, the team continues to demonstrate high levels of project execution, delivering a gross margin of 29.6% in the quarter.", { margin_pct: 29.6, guidance_scope: "quarter" }, "guidance_historical_actual"],
    ["revenue_guidance", "Over the medium term, management expects to deliver compounded annual growth in adjusted net revenue of at least 30% from 2025 to 2028.", { growth_yoy: 30, guidance_scope: "multi_year_target" }, "guidance_non_company_or_non_periodic"],
    ["revenue_guidance", "For 2026, we expect:. Revenues to be down approximately 1% to up slightly compared to full-year 2025.", { growth_yoy: -1 }, "guidance_qualitative_range_endpoint_unquantified"],
  ];
  for (const [metric_name, evidence_excerpt, fields, reason] of examples) {
    const result = assessGuidanceReleaseEvent(event({ amount: null, growth_yoy: null, metric_name, evidence_excerpt, ...fields }));
    assert.equal(result.usable, false);
    assert.ok(result.rejectionReasons.includes(reason), result.rejectionReasons.join(", "));
  }
  for (const [metric_name, evidence_excerpt, fields] of [
    ["operating_margin", "For the second quarter of 2026, we expect:. Adjusted operating margin to be approximately 24.7%.", { margin_pct: 24.7, guidance_scope: "quarter" }],
    ["eps_guidance", "For 2026, we expect:. Adjusted diluted earnings per share to be in the range of $13.70 to $14.00, up from our previous guidance range of $13.20 to $13.75.", { per_share_value: 13.85, per_share_basis: "adjusted", unit: "currency_per_share", currency: "USD" }],
  ]) {
    const result = assessGuidanceReleaseEvent(event({ amount: null, growth_yoy: null, metric_name, evidence_excerpt, ...fields }));
    assert.equal(result.usable, true, result.rejectionReasons.join(", "));
  }
});
test("first-batch actual consumption findings stay source-bound", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/guidance-first-batch-consumption-2026.json", import.meta.url), "utf8"));
  for (const item of fixture.events) {
    const row = { ...item.original, ...item.expected, evidence_excerpt: item.correctedEvidence };
    const result = assessGuidanceReleaseEvent(row);
    if (row.ticker === "POWL") {
      assert.equal(result.usable, false);
      assert.ok(result.rejectionReasons.includes("guidance_historical_actual"));
      assert.equal(result.metadataConflict, false);
    } else if (row.ticker === "CROX") {
      assert.equal(result.usable, true, result.rejectionReasons.join(", "));
      if (row.growth_yoy === 0) {
        const wrong = assessGuidanceReleaseEvent({ ...row, growth_yoy: 1 });
        assert.ok(wrong.rejectionReasons.includes("guidance_growth_range_mismatch"));
      }
    } else {
      assert.equal(result.currencyReviewIncomplete, true, "SOFI scope repair still needs dated currency");
      assert.ok(!result.rejectionReasons.some((reason) => reason.includes("scope")));
    }
  }
});

test("typed EPS remains separate and bare currency still requires dated evidence", () => {
  const row = event({ metric_name: "eps_guidance", amount: null, per_share_value: 7, per_share_basis: "adjusted",
    growth_yoy: null, unit: "currency_per_share", evidence_excerpt: "FY2026 guidance. Adjusted EPS is expected to be between $6 and $8." });
  const unknown = assessGuidanceReleaseEvent(row);
  assert.equal(unknown.currencyReviewIncomplete, true);
  const resolved = assessGuidanceReleaseEvent(row, { reportingCurrencyAtOrBefore: () => ({ currency: "USD", evidence: [{ availableAt: "2026-01-01", field: "reportingCurrency", currency: "USD" }] }) });
  assert.equal(resolved.usable, true);
  assert.equal(resolved.scalarValues.amount, null);
  assert.equal(resolved.scalarValues.per_share_value, 7);
});
const remainingFixture = JSON.parse(fs.readFileSync(new URL("./fixtures/guidance-remaining-88-2026.json", import.meta.url), "utf8"));
const remainingCorrections = new Map(JSON.parse(fs.readFileSync(new URL("./fixtures/guidance-remaining-corrections-2026.json", import.meta.url), "utf8")).entries.map((row) => [row.id, row]));
for (const { row } of remainingFixture.events) {
  test(`remaining source evidence: ${row.ticker} ${row.id}`, () => {
    const correction = remainingCorrections.get(row.id);
    assert.ok(correction);
    const result = assessGuidanceReleaseEvent(row);
    if (/^(?:helper_false_positive_research|research_|historical_preliminary)/.test(correction.disposition)) {
      assert.equal(result.usable, false);
      assert.equal(result.quantifiedReviewIncomplete, false, result.rejectionReasons.join(", "));
      assert.equal(result.metadataConflict, false, result.rejectionReasons.join(", "));
      assert.ok(result.rejectionReasons.length);
    } else if (correction.disposition === "helper_false_positive_quarter") {
      assert.ok(!result.rejectionReasons.includes("guidance_scope_not_supported_by_evidence"));
      assert.equal(result.metadataConflict, false);
      assert.equal(result.currencyReviewIncomplete, true, "quarter repair cannot invent currency");
    } else if (correction.oldFailure === "guidance_quantified_evidence_review_incomplete") {
      assert.equal(result.quantifiedReviewIncomplete, true, result.rejectionReasons.join(", "));
      assert.equal(result.usable, false);
    } else {
      assert.equal(result.usable, false, "unfixed parser classifications cannot become usable");
      assert.ok(result.rejectionReasons.some((reason) => /scope|quantified/.test(reason)));
    }
  });
}

test("three-state coverage preserves incomplete issuers instead of declaring no guidance", () => {
  const result = audit([event()], { requiredTickers: ["TEST", "EMPTY", "PENDING"],
    noQuantifiedTickers: ["EMPTY"], coverageRows: [
      { ticker: "TEST", status: "covered_official_filing" },
      { ticker: "EMPTY", status: "no_quantified_official_guidance" },
      { ticker: "PENDING", status: "official_guidance_review_incomplete" }
    ], declaredCoverage: { covered_official_filing: 1, no_quantified_official_guidance: 1, official_guidance_review_incomplete: 1 } });
  assert.deepEqual(result.expectedNoQuantifiedTickers, ["EMPTY"]);
  assert.deepEqual(result.failures.map((row) => row.code), ["guidance_coverage_review_incomplete"]);
  assert.deepEqual(result.coverageReconciliation.incompleteTickers, ["PENDING"]);
  assert.equal(result.coverageReconciliation.completeIssuers, 2);
  assert.equal(result.rawStats.events, 1);
});

test("three-state ledger cannot conceal issuer swaps, duplicates or missing coverage with totals", () => {
  const result = audit([], { requiredTickers: ["TEST", "MISSING"], noQuantifiedTickers: ["TEST"],
    coverageRows: [{ ticker: "TEST", status: "no_quantified_official_guidance" }, { ticker: "TEST", status: "no_quantified_official_guidance" }, { ticker: "EXTRA", status: "covered" }],
    declaredCoverage: { no_quantified_official_guidance: 1, covered: 1 } });
  for (const code of ["guidance_coverage_duplicate_issuer", "guidance_coverage_unexpected_issuer", "guidance_coverage_missing_issuer", "guidance_coverage_status_count_mismatch"]) assert.ok(result.failures.some((row) => row.code === code), code);
});

test("three-state ledger still rejects genuine guidance labelled no quantified", () => {
  const result = audit([event()], { noQuantifiedTickers: ["TEST"], coverageRows: [{ ticker: "TEST", status: "no_quantified_official_guidance" }], declaredCoverage: { no_quantified_official_guidance: 1 } });
  assert.ok(result.failures.some((row) => row.code === "no_quantified_guidance_evidence_mismatch"));
  assert.ok(result.failures.some((row) => row.code === "guidance_coverage_usable_count_mismatch"));
});
const semanticConflictFixture = JSON.parse(fs.readFileSync(new URL("./fixtures/guidance-semantic-conflicts-45-2026.json", import.meta.url), "utf8"));
for (const { original, expected } of semanticConflictFixture.events) {
  test(`candidate semantic conflict ${original.index}: ${original.ticker} ${original.id}`, () => {
    const result = assessGuidanceReleaseEvent(original);
    assert.equal(result.metadataConflict, expected.semanticConflict, result.rejectionReasons.join(", "));
    if (expected.classification === "research_only" || expected.semanticConflict) assert.equal(result.usable, false);
    if (expected.classification === "valid_periodic_target") {
      if (original.amount == null) assert.equal(result.usable, true);
      else {
        assert.equal(result.usable, false, "bare currency cannot become usable when period parsing is repaired");
        assert.equal(result.currencyReviewIncomplete, true);
        assert.ok(result.rejectionReasons.includes("guidance_source_currency_unresolved"));
      }
    }
    if (expected.classification === "quantified_source_requires_extraction_review") {
      assert.equal(result.quantifiedReviewIncomplete, true);
      assert.ok(result.rejectionReasons.includes("guidance_quantified_source_not_extracted"));
    }
  });
}

test("explicit ROU-inclusive capital budget requires a cash/noncash bridge independently of parser labels", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/tbbb-q1-2026-capital-budget.json", import.meta.url), "utf8"));
  const evidence = `${fixture.lines[3]}\n${fixture.lines[2]}`;
  const row = event({ ...fixture.expected, ticker: "TBBB", growth_yoy: null, evidence_excerpt: evidence, actual_or_guidance: "guidance", guidance_subject: "company_total" });
  for (const quality_status of ["clear", fixture.expected.quality_status]) {
    const result = assessGuidanceReleaseEvent({ ...row, quality_status });
    assert.equal(result.usable, false);
    assert.equal(result.independentlyEligible, false);
    assert.equal(result.metadataConflict, false);
    assert.ok(result.rejectionReasons.includes("guidance_cash_noncash_mapping_required"));
  }
  const cashOnly = assessGuidanceReleaseEvent({ ...row, quality_status: fixture.expected.quality_status, evidence_excerpt: "For the full year 2026, we expect cash capital expenditures under our budget to be MXN 5,250 million." });
  assert.ok(!cashOnly.rejectionReasons.includes("guidance_cash_noncash_mapping_required"));
  assert.equal(cashOnly.independentlyEligible, true, "a research label alone must not exempt an ordinary cash budget");
});
import {
  assessGuidanceReleaseEvent,
  auditGuidanceCoverageRelease,
  createGuidanceReportingCurrencyResolver,
  guidanceReleaseEventKey
} from "./guidanceCoverageReleaseAudit.js";

function event(overrides = {}, semantics = {}) {
  return {
    source_database: "official_issuer_sec_filing", source_id: "r1", ticker: "TEST",
    fiscal_period: "Q42025", observed_at: "2026-03-11", metric_name: "revenue_guidance",
    amount: null, growth_yoy: 30.5, growth_qoq: null, margin_pct: null, currency: null,
    quality_status: "clear", evidence_excerpt: "2026 guidance. We expect total revenue to grow by 29% to 32%.",
    payload_json: JSON.stringify({ actual_or_guidance: "guidance", payload_json: { guidance_subject: "company_total", guidance_scope: "full_year", guidance_target_year: 2026, ...semantics } }),
    ...overrides
  };
}

test("current original revenue growth forecast is not rejected solely for its later old-guidance comparator", () => {
  const quote = "For the full-year 2021, we now expect revenue growth of approximately 50% over 2020, driven by growth across all businesses, up from the prior guidance of approximately 37%.";
  const row = event({ evidence_excerpt: quote, growth_yoy: 50 }, { guidance_target_year: 2021 });
  const result = assessGuidanceReleaseEvent(row);
  assert.equal(result.usable, true, JSON.stringify(result));
  for (const evidence of [quote.replace("we now expect", "we previously expected"), "For full-year 2021, our previous guidance was revenue growth of 50%, before the outlook was withdrawn."]) {
    const invalid = assessGuidanceReleaseEvent(event({ evidence_excerpt: evidence, growth_yoy: 50 }, { guidance_target_year: 2021 }));
    assert.equal(invalid.usable, false);
    assert.ok(invalid.rejectionReasons.includes("guidance_not_forward"));
  }
});

test("one explicit expect verb governs same-sentence parallel annual cash targets, not later actual results", () => {
  const quote = "For the full fiscal 2020, we expect operating cash flow to be in the range of $6.35 billion-$6.75 billion, property and equipment additions to be approximately $650 million, and our free cash flow to be in the range of $5.7 billion-$6.1 billion.";
  const common = { metric_name: "free_cash_flow_guidance", growth_yoy: null, amount: 5900, unit: "reported millions", currency: "USD" };
  assert.equal(assessGuidanceReleaseEvent(event({ ...common, evidence_excerpt: quote }, { guidance_target_year: 2020 })).usable, true);
  for (const evidence of [quote.replace("we expect", "we previously expected"), quote.replace("and our free cash flow to be", "and our free cash flow was")]) {
    assert.equal(assessGuidanceReleaseEvent(event({ ...common, evidence_excerpt: evidence }, { guidance_target_year: 2020 })).usable, false);
  }
});

test("same-company growth explicitly translated from a current sales target retains original owner", () => {
  const quote = "Bringing this all together, we expect revenue of between $5.99 billion and $6.09 billion in fiscal 2025, which translates into revenue growth of about 9%-11% compared to fiscal 2024.";
  const result = assessGuidanceReleaseEvent(event({ evidence_excerpt: quote, growth_yoy: 10 }, { guidance_target_year: 2025 }));
  assert.equal(result.usable, true, JSON.stringify(result));
  assert.equal(assessGuidanceReleaseEvent(event({ evidence_excerpt: quote.replace("we expect", "we previously expected"), growth_yoy: 10 }, { guidance_target_year: 2025 })).usable, false);
});

function run(guidance, overrides = {}) {
  return { ticker: "TEST", fiscal_period: "2025-Q4", as_of_date: "2026-03-11", input: { guidance }, ...overrides };
}

test("independent quarter evidence accepts named-month quarter but not annual closing dates or old-quarter comparators", () => {
  for (const month of ["June", "September"]) {
    const row = event({ evidence_excerpt: `We expect ${month} quarter revenue to be in a range of $2.1 billion plus or minus $150 million.`, amount: 2100, unit: "reported millions", currency: "USD", growth_yoy: null }, { guidance_scope: "quarter", guidance_target_year: null });
    assert.equal(assessGuidanceReleaseEvent(row).usable, true);
  }
  for (const quote of ["For the fiscal year ending June 2026, we expect revenue of $4 billion.", "For full-year 2026, we expect revenue of $4 billion, compared with the prior June quarter."]) {
    const row = event({ evidence_excerpt: quote, amount: 4000, unit: "reported millions", currency: "USD", growth_yoy: null }, { guidance_scope: "quarter" });
    assert.ok(assessGuidanceReleaseEvent(row).rejectionReasons.includes("guidance_scope_not_supported_by_evidence"));
  }
});

function audit(rows, overrides = {}) {
  return auditGuidanceCoverageRelease({ rows, requiredTickers: ["TEST"], noQuantifiedTickers: [], ...overrides });
}

test("unresolved original EPS revisions stay blocking after nulling their absolute scalar", () => {
  for (const quote of [
    "Today, we're raising our adjusted EPS guidance for 2021 by $0.01- $2.83-$2.87, with a focus on the midpoint.",
    "As a result, we're raising our adjusted earnings per share guidance for the year by $0.50- $6.25-$6.75.",
    "For the full year, we are raising the midpoint of our adjusted EPS guidance by $0.03- $3.78.",
    "On the bottom line, we're raising our adjusted EPS guidance for 2022 by $0.28- $22.93."
  ]) {
    const row = event({ metric_name: "eps_guidance", evidence_excerpt: quote,
      amount: null, growth_yoy: null, per_share_value: null,
      quality_status: "research_only_unresolved_eps_change_target" }, {
      extraction_review_required: "eps_change_target_original_source_required"
    });
    const assessed = assessGuidanceReleaseEvent(row);
    assert.equal(assessed.usable, false);
    assert.equal(assessed.quantifiedReviewIncomplete, true);
    assert.ok(assessed.rejectionReasons.includes("guidance_original_source_review_pending"));
    assert.ok(audit([row]).failures.some(f => f.code === "guidance_quantified_evidence_review_incomplete" &&
      f.reasons.includes("guidance_original_source_review_pending")));
  }
});

test("clear quality or populated EPS cannot override a pending original-source review", () => {
  const fields = { metric_name: "eps_guidance", growth_yoy: null, amount: null,
    per_share_value: 5.15, per_share_basis: "adjusted", unit: "currency_per_share", currency: "USD",
    evidence_excerpt: "For full-year 2026, we expect adjusted EPS of $5.10-$5.20." };
  for (const flag of [undefined, null, false, ""]) {
    assert.equal(assessGuidanceReleaseEvent(event(fields, { extraction_review_required: flag })).usable, true);
  }
  for (const flag of [true, "original_table_column_review_required"]) {
    const result = assessGuidanceReleaseEvent(event(fields, { extraction_review_required: flag }));
    assert.equal(result.usable, false);
    assert.equal(result.quantifiedReviewIncomplete, true);
  }
});

function reviewedEventCurrencyFixture() {
  const original = JSON.parse(fs.readFileSync(new URL("./fixtures/event-guidance-currency-evidence.json", import.meta.url), "utf8"))
    .find(row => row.ticker === "TSM");
  return event({ ticker: original.ticker, source_id: original.sourceId,
    source_database: "downloaded_online_earnings_transcript",
    fiscal_period: original.fiscalPeriod, observed_at: original.observedAt,
    evidence_excerpt: original.evidence, amount: original.amount, currency: original.currency,
    unit: original.unit, metric_name: original.metricName, growth_yoy: 35, growth_qoq: 13,
    official_guidance_currency_evidence: structuredClone(original.contract)
  }, { guidance_scope: "quarter", guidance_target_year: 2024 });
}

test("same-event official currency is independently revalidated and logged without changing issuer currency", () => {
  const row = reviewedEventCurrencyFixture();
  const assessed = assessGuidanceReleaseEvent(row, { reportingCurrencyAtOrBefore: () => ({ currency: "TWD", evidence: [] }) });
  assert.equal(assessed.usable, true, JSON.stringify(assessed.rejectionReasons));
  assert.equal(assessed.issuerCurrencyEvidence, null);
  assert.equal(assessed.officialCurrencyEvidence.evidenceType, "explicit_same_event_guidance_currency");
  const result = audit([row], { requiredTickers: ["TSM"] });
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures));
  assert.equal(result.resolvedCurrencyEvidence.length, 1);
  assert.equal(result.resolvedCurrencyEvidence[0].currency, "USD");
});

test("stored USD and research labels cannot bypass a forged declared currency contract", () => {
  for (const change of [
    row => { row.official_guidance_currency_evidence.proof.documentSha256 = "0".repeat(64); },
    row => { row.evidence_excerpt += " revised"; },
    row => { row.amount *= 1000; },
    row => { row.currency = "TWD"; },
    row => { row.official_guidance_currency_evidence.proof.availableAt = "2030-01-01";
      row.quality_status = "research_only"; row.actual_or_guidance = "actual"; },
    row => { row.official_guidance_currency_evidence = {}; },
    row => { row.currency_resolution = { status: "independently_reviewed_official_event_currency" };
      delete row.official_guidance_currency_evidence; },
  ]) {
    const row = reviewedEventCurrencyFixture(); change(row);
    const result = audit([row], { requiredTickers: ["TSM"] });
    assert.equal(result.resolvedCurrencyEvidence.length, 0, String(change));
    assert.ok(result.failures.some(failure => failure.code === "guidance_currency_review_incomplete"), String(change));
    assert.ok(result.researchEvidence[0].reasons.some(reason => reason.startsWith("guidance_official_event_currency_")));
  }
});

test("currency contract validates actual SQL fields even when payload still claims original values", () => {
  const row = reviewedEventCurrencyFixture();
  row.payload_json = JSON.stringify({ ...JSON.parse(row.payload_json), amount: row.amount, unit: row.unit,
    metric_name: row.metric_name, fiscal_period: row.fiscal_period, currency: row.currency });
  for (const overrides of [{ amount: null }, { amount: 1 }, { unit: null }, { unit: "billions" },
    { metric_name: "ebitda_guidance" }, { fiscal_period: "Q42024" }]) {
    const assessed = assessGuidanceReleaseEvent({ ...row, ...overrides });
    assert.equal(assessed.currencyReviewIncomplete, true, JSON.stringify(overrides));
    assert.equal(assessed.officialCurrencyEvidence, null);
  }
});

test("separated per-share net and operating income are not missing total-company profit amounts", () => {
  for (const [metric_name, evidence_excerpt] of [
    ["net_income_guidance", "For Q2 we expect net income to range from $1.20 to $1.35 per share."],
    ["net_income_guidance", "For Q3 we expect non-GAAP net income for diluted share in a range of $1 to $1.04."],
    ["operating_income_guidance", "For 2012 we expect net operating income per share in a range of $5.10-$5.40 per share."],
    ["operating_income_guidance", "For 2016 we expect net operating income from continuing operations per share in a range of $4.35-$4.51."],
  ]) {
    const row = event({ metric_name, evidence_excerpt, growth_yoy: null, amount: null, quality_status: "ambiguous" });
    const result = audit([row], { noQuantifiedTickers: ["TEST"], declaredCoverage: { no_quantified_official_guidance: 1 } });
    assert.ok(result.researchEvidence[0].reasons.includes("guidance_per_share_not_total_income"), evidence_excerpt);
    assert.ok(!result.failures.some(f => f.code === "guidance_quantified_evidence_review_incomplete"), evidence_excerpt);
    const forged = assessGuidanceReleaseEvent({ ...row, quality_status: "clear", amount: 5.25, currency: "USD" });
    assert.equal(forged.usable, false);
  }
  const valid = assessGuidanceReleaseEvent(event({ metric_name: "eps_guidance", amount: null, growth_yoy: null,
    per_share_value: 1.275, per_share_basis: "unspecified", unit: "currency_per_share", currency: "USD",
    evidence_excerpt: "For Q2 we expect net income to range from $1.20 to $1.35 per share." }, { guidance_scope: "quarter" }));
  assert.equal(valid.usable, true, JSON.stringify(valid.rejectionReasons));
});

test("current WELL net-income/share level is eligible while later FFO is explicitly not EPS", () => {
  for (const [evidence_excerpt, per_share_value, ffo] of [
    ["Last night, we updated our previously issued full year 2023 outlook for net income attributable to common stockholders to a range of $0.73-$0.84 per diluted share, and normalized FFO of $3.48-$3.59 per diluted share, or $3.535 at the midpoint.", 0.785, 3.535],
    ["Last night, we updated our previously issued full-year 2023 outlook for net income attributable to common stockholders to a range of $0.91-$0.95 per diluted share, and normalized FFO of $3.59-$3.63 per diluted share, or $3.61 per share at the midpoint.", 0.93, 3.61],
  ]) {
    const row = event({ metric_name: "eps_guidance", amount: null, growth_yoy: null, per_share_value,
      per_share_basis: "unspecified", unit: "currency_per_share", currency: "USD", evidence_excerpt });
    const result = assessGuidanceReleaseEvent(row);
    assert.equal(result.usable, true, JSON.stringify(result.rejectionReasons));
    assert.equal(assessGuidanceReleaseEvent({ ...row, per_share_value: ffo }).usable, false);
  }
});

test("original EPS impact/headwind/pickup/dilution is a bridge component even with a forged total label", () => {
  for (const evidence_excerpt of [
    "For 2026, we expect approximately $0.85 of non-GAAP EPS dilution, primarily from financing costs associated with the transaction.",
    "We continue to expect an approximate $0.04 foreign exchange headwind on full-year adjusted earnings per share.",
    "We anticipate $0.05 of EPS pickup attributable to rate relief for this year.",
    "For the fiscal year, we anticipate an adverse impact of approximately $6 million or $0.12 on earnings per share.",
    "We expect FX to be around $0.03 headwind to adjusted EPS for the year.",
    "At current spot rates, we expect a tailwind of approximately $0.30 to adjusted EPS for 2026.",
  ]) {
    const raw = event({ evidence_excerpt, metric_name: "eps_guidance", amount: null, growth_yoy: null,
      per_share_value: null, quality_status: "research_only_eps_component" });
    const assessed = assessGuidanceReleaseEvent(raw);
    assert.ok(assessed.rejectionReasons.includes("guidance_non_company_or_non_periodic"));
    assert.equal(assessed.quantifiedReviewIncomplete, false);
    const forged = assessGuidanceReleaseEvent({ ...raw, per_share_value: 0.04, quality_status: "clear",
      unit: "currency_per_share", currency: "USD", guidance_subject: "company_total" });
    assert.equal(forged.usable, false, evidence_excerpt);
  }
  for (const evidence_excerpt of [
    "We expect full-year adjusted EPS of $3.70-$3.80, despite the impact of delayed deals.",
    "Despite a $0.04 FX headwind, we expect full-year adjusted EPS of $3.70-$3.80.",
  ]) {
    const assessed = assessGuidanceReleaseEvent(event({ evidence_excerpt, metric_name: "eps_guidance", amount: null,
      growth_yoy: null, per_share_value: 3.75, per_share_basis: "adjusted", unit: "currency_per_share", currency: "USD" }));
    assert.equal(assessed.usable, true, JSON.stringify(assessed.rejectionReasons));
  }
});

test("genuine forward annual growth cannot be hidden by no-quantified coverage", () => {
  const result = audit([event()], { noQuantifiedTickers: ["TEST"], declaredCoverage: { no_quantified_official_guidance: 1 } });
  assert.equal(result.usableEvents, 1);
  assert.deepEqual(result.expectedNoQuantifiedTickers, []);
  assert.ok(result.failures.some((row) => row.code === "no_quantified_guidance_evidence_mismatch"));
  assert.ok(result.failures.some((row) => row.code === "guidance_coverage_usable_count_mismatch"));
});

test("explicit research-only raw events are retained with per-source rejection ledger", () => {
  const row = event({ quality_status: "ambiguous", evidence_excerpt: "Gross profit was 25% of revenue for the fourth quarter of 2025.", metric_name: "gross_margin", growth_yoy: null, margin_pct: 25 });
  const result = audit([row], { noQuantifiedTickers: ["TEST"], modelRuns: [run({})], declaredStats: { events: 1, tickers: 1, periods: 1 } });
  assert.deepEqual(result.failures, []);
  assert.equal(result.researchEvents, 1);
  assert.equal(result.usableEvents, 0);
  assert.deepEqual(result.researchOnlyTickers, ["TEST"]);
  assert.ok(result.researchEvidence[0].reasons.includes("guidance_historical_actual"));
  assert.ok(result.researchEvidence[0].reasons.includes("guidance_quality_not_clear"));
  assert.match(result.researchEvidence[0].evidenceSha256, /^[a-f0-9]{64}$/);
  assert.ok(result.rejectedEventKeys.has(guidanceReleaseEventKey(row)));
});

test("raw event/ticker/period reconciliation cannot be removed when research rows exist", () => {
  const result = audit([event()], { declaredStats: { events: 0, tickers: 0, periods: 0 } });
  assert.equal(result.failures.filter((row) => row.code === "guidance_raw_count_mismatch").length, 3);
});

test("empty evidence population distinguishes no-evidence from research-only tickers", () => {
  const result = audit([], { noQuantifiedTickers: ["TEST"], declaredStats: { events: 0, tickers: 0, periods: 0 } });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.noEvidenceTickers, ["TEST"]);
  assert.deepEqual(result.researchOnlyTickers, []);
});

test("a parser quality label alone cannot hide unambiguously usable guidance", () => {
  const result = audit([event({ quality_status: "ambiguous" })], { noQuantifiedTickers: ["TEST"] });
  assert.ok(result.failures.some((row) => row.code === "usable_guidance_rejected_only_by_quality"));
});

test("missing scope or a forged segment label cannot conceal explicit company annual guidance", () => {
  for (const semantics of [{ guidance_scope: "unknown" }, { guidance_subject: "segment_or_subset" }]) {
    const result = audit([event({}, semantics)], { noQuantifiedTickers: ["TEST"] });
    assert.ok(result.failures.some((row) => row.code === "guidance_semantic_classification_conflict"));
  }
});

test("TBBB complete paragraph binds total revenue range instead of preceding same-store sales", () => {
  const row = event({ evidence_excerpt: "2026 guidance. For 2026, the Company plans to open between 590 and 630 stores during the year. We expect Same Store Sales growth between 13% and 16%, and total revenue is forecast to grow by 29% to 32%." });
  assert.equal(assessGuidanceReleaseEvent(row).usable, true);
  assert.ok(assessGuidanceReleaseEvent({ ...row, growth_yoy: 14.5 }).rejectionReasons.includes("guidance_growth_range_mismatch"));
});

test("TBBB annual target year stays separate from reported Q4 fiscal year", () => {
  const assessment = assessGuidanceReleaseEvent(event({}, { guidance_target_year: 2025 }));
  assert.ok(assessment.rejectionReasons.includes("guidance_target_year_mismatch"));
  const result = audit([event({}, { guidance_target_year: 2025 })], { noQuantifiedTickers: ["TEST"] });
  assert.ok(result.failures.some((row) => row.code === "guidance_quantified_evidence_review_incomplete"));
});

test("forged company-total label cannot authorize plainly segment-owned growth", () => {
  const row = event({ evidence_excerpt: "For full-year 2026, we expect cloud revenue to grow by 29% to 32%." });
  const assessment = assessGuidanceReleaseEvent(row);
  assert.equal(assessment.usable, false);
  assert.ok(assessment.rejectionReasons.includes("guidance_non_company_or_non_periodic"));
});

test("unresolved monetary currency blocks completion, not proof of no guidance", () => {
  const row = event({ amount: 4000, growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect total revenue of $4 billion." });
  const result = audit([row], { noQuantifiedTickers: ["TEST"] });
  assert.ok(result.failures.some((row) => row.code === "guidance_currency_review_incomplete"));
});

test("three-letter unknown currency and malformed event dates cannot pass review", () => {
  const row = event({ amount: 4000, growth_yoy: null, currency: "ZZZ", evidence_excerpt: "For full-year 2026, we expect total revenue of $4 billion." });
  assert.ok(audit([row], { noQuantifiedTickers: ["TEST"] }).failures.some((finding) => finding.code === "guidance_currency_review_incomplete"));
  assert.ok(audit([event({ observed_at: "2026-02-30" })]).failures.some((finding) => finding.code === "guidance_raw_temporal_identity_unresolved"));
});

test("dated original reporting-currency evidence makes bare-dollar guidance usable", () => {
  const row = event({ amount: 4000, growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect total revenue of $4 billion." });
  const financialRows = [{ ticker: "TEST", available_at: "2026-03-11", payload_json: JSON.stringify({ reportingCurrency: "MXN", sourceRecord: { sourceCurrency: "MXN", dataset: "official release" } }) }];
  const result = audit([row], { financialRows, noQuantifiedTickers: ["TEST"] });
  assert.equal(result.usableEvents, 1);
  assert.ok(result.failures.some((finding) => finding.code === "no_quantified_guidance_evidence_mismatch"));
  const assessed = assessGuidanceReleaseEvent(row, { reportingCurrencyAtOrBefore: createGuidanceReportingCurrencyResolver(financialRows) });
  assert.equal(assessed.sourceCurrency, "MXN");
  assert.equal(assessed.issuerCurrencyEvidence.evidence[0].availableAt, "2026-03-11");
});

test("reporting-currency resolver never borrows quote currency, future evidence, or conflicting dimensions", () => {
  const financial = (currency, available_at = "2026-03-11") => ({ ticker: "TEST", available_at, currency: "USD", payload_json: JSON.stringify({ sourceRecord: { sourceCurrency: currency } }) });
  assert.equal(createGuidanceReportingCurrencyResolver([financial("MXN", "2026-03-12")])("TEST", "2026-03-11"), null);
  assert.equal(createGuidanceReportingCurrencyResolver([financial("MXN"), financial("USD")])("TEST", "2026-03-11"), null);
  assert.equal(createGuidanceReportingCurrencyResolver([financial(null)])("TEST", "2026-03-11"), null);
});

test("independent monetary audit rejects USD assigned to explicit MXN amount", () => {
  const row = event({ amount: 80000, currency: "USD", growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect total revenue of MXN 80 billion." });
  assert.ok(assessGuidanceReleaseEvent(row).rejectionReasons.includes("guidance_source_currency_mismatch"));
  assert.ok(audit([row], { noQuantifiedTickers: ["TEST"] }).failures.some((finding) => finding.code === "guidance_currency_review_incomplete"));
});

test("no-quantified research monetary evidence must never be selected by a model", () => {
  const row = event({ amount: 4000, currency: "USD", growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect cloud revenue of $4 billion." }, { guidance_subject: "segment_or_subset" });
  const result = audit([row], { noQuantifiedTickers: ["TEST"], modelRuns: [run({ guidanceSelection: { revenue: { acceptedEvidenceIds: ["r1"] } } })] });
  assert.ok(result.failures.some((finding) => finding.code === "research_only_guidance_selected"));
});

test("independent scalar re-computation detects research growth sneaking into models", () => {
  const row = event({ evidence_excerpt: "2026 guidance. We expect cloud revenue to grow by 29% to 32%." }, { guidance_subject: "segment_or_subset" });
  const result = audit([row], { noQuantifiedTickers: ["TEST"], modelRuns: [run({ revenueGuidanceGrowth: 30.5, revenueGrowth: 30.5 })] });
  assert.equal(result.failures.filter((finding) => finding.code === "guidance_scalar_research_exclusion_mismatch").length, 1);
});

test("same-value research and usable quotes need explicit scalar contributor IDs", () => {
  const rows = [event(), event({ source_id: "segment", evidence_excerpt: "2026 guidance. We expect cloud revenue to grow by 29% to 32%." }, { guidance_subject: "segment_or_subset" })];
  const guidance = { revenueGuidanceGrowth: 30.5, revenueGrowth: 30.5 };
  const missing = audit(rows, { modelRuns: [run(guidance)] });
  assert.equal(missing.failures.filter((finding) => finding.code === "missing_scalar_guidance_exclusion_lineage").length, 1);
  const valid = audit(rows, { modelRuns: [run({ ...guidance, scalarEvidenceIds: { revenueGuidanceGrowth: ["r1"], revenueGrowth: ["r1"] } })] });
  assert.deepEqual(valid.failures, []);
  const bad = audit(rows, { modelRuns: [run({ ...guidance, scalarEvidenceIds: { revenueGuidanceGrowth: ["segment"], revenueGrowth: ["segment"] } })] });
  assert.ok(bad.failures.some((finding) => finding.code === "research_only_guidance_selected"));
});

test("usable scalar guidance cannot be silently ignored by a model node", () => {
  const result = audit([event()], { modelRuns: [run({})] });
  assert.ok(result.failures.some((finding) => finding.code === "usable_quantified_guidance_silently_ignored"));
});

test("non-model research display aggregates are not mistaken for consumption", () => {
  const row = event({ quality_status: "ambiguous", growth_yoy: null, margin_pct: 25, metric_name: "gross_margin", evidence_excerpt: "Gross profit was 25% for full-year 2025." });
  const result = audit([row], { noQuantifiedTickers: ["TEST"], modelRuns: [run({ revenueGrowth: 25, operatingMargin: 25, grossMargin: 25 })] });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.researchOnlyDisplayFields, ["revenueGrowth", "operatingMargin", "grossMargin"]);
});

test("usable annual amount cannot be silently ignored even when coverage says covered", () => {
  const row = event({ amount: 4000, currency: "USD", growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect total revenue of $4 billion." });
  const result = audit([row], { modelRuns: [run({})] });
  assert.ok(result.failures.some((finding) => finding.code === "usable_quantified_guidance_silently_ignored"));
});

test("monetary model inputs cannot evade raw research checks by dropping contributor IDs", () => {
  const row = event({ amount: 4000, currency: "USD", growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect cloud revenue of $4 billion." }, { guidance_subject: "segment_or_subset" });
  const result = audit([row], { noQuantifiedTickers: ["TEST"], modelRuns: [run({ revenueGuidanceM: 4000, guidanceSelection: { revenue: { mode: "explicit_full_year", acceptedEvidenceIds: [] } } })] });
  assert.ok(result.failures.some((finding) => finding.code === "monetary_guidance_missing_contributor_ids"));
});

test("monetary contributors reconcile amounts and event-visible FX without raw-amount fallback", () => {
  const row = event({ amount: 80000, currency: "MXN", growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect total revenue of MXN 80 billion." });
  const financialRows = [{ ticker: "TEST", available_at: "2026-03-11", currency: "USD", payload_json: JSON.stringify({ reportingCurrency: "MXN" }) }];
  const guidance = { revenueGuidanceM: 4000, guidanceSelection: { revenue: { acceptedEvidenceIds: ["r1"] } }, fxConversions: [{ sourceCurrency: "MXN", targetCurrency: "USD", sourceAmountM: 80000, modelAmountM: 4000, conversionRate: 0.05, sourceRateDate: "2026-03-10", targetRateDate: "2026-03-10", source: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" }] };
  assert.deepEqual(audit([row], { financialRows, modelRuns: [run(guidance)] }).failures, []);
  const missing = audit([row], { financialRows, modelRuns: [run({ ...guidance, revenueGuidanceM: 80000, fxConversions: [] })] });
  assert.ok(missing.failures.some((finding) => finding.code === "monetary_guidance_missing_event_visible_fx"));
  const future = audit([row], { financialRows, modelRuns: [run({ ...guidance, fxConversions: [{ ...guidance.fxConversions[0], sourceRateDate: "2026-03-12" }] })] });
  assert.ok(future.failures.some((finding) => finding.code === "monetary_guidance_fx_evidence_invalid"));
});

test("future guidance neither counts as node input nor can be selected", () => {
  const row = event({ amount: 4000, currency: "USD", growth_yoy: null, evidence_excerpt: "For full-year 2026, we expect total revenue of $4 billion.", observed_at: "2026-03-12" });
  const valid = audit([row], { modelRuns: [run({})] });
  assert.deepEqual(valid.failures, []);
  const bad = audit([row], { modelRuns: [run({ guidanceSelection: { revenue: { acceptedEvidenceIds: ["r1"] } } })] });
  assert.ok(bad.failures.some((finding) => finding.code === "selected_guidance_not_event_visible"));
});

test("invalid official evidence cannot suppress valid transcript guidance", () => {
  const rows = [event({ source_database: "downloaded_online_earnings_transcript", source_id: "transcript" }), event({ source_id: "official", quality_status: "ambiguous", evidence_excerpt: "Total revenue was up 30.5% for full-year 2025." })];
  const result = audit(rows, { modelRuns: [run({})] });
  assert.ok(result.failures.some((finding) => finding.code === "usable_quantified_guidance_silently_ignored" && finding.expectedEvidenceIds.includes("transcript")));
});

test("usable official source supersedes transcript for same metric without dropping raw rows", () => {
  const rows = [event(), event({ source_database: "downloaded_online_earnings_transcript", source_id: "transcript", growth_yoy: 20, evidence_excerpt: "2026 guidance. We expect total revenue to grow by 20%." })];
  const result = audit(rows, { modelRuns: [run({ revenueGuidanceGrowth: 30.5, revenueGrowth: 30.5 })] });
  assert.deepEqual(result.failures, []);
  assert.equal(result.rawStats.events, 2);
  assert.equal(result.usableEvents, 2);
});

const sevenOriginalEvents = JSON.parse(fs.readFileSync(new URL("./fixtures/guidance-review-seven-2026.json", import.meta.url), "utf8")).events.map((entry) => entry.original);

test("original CHYM long-term gross margin target is research, not Q4 guidance or metadata conflict", () => {
  const row = sevenOriginalEvents.find((entry) => entry.ticker === "CHYM");
  for (const guidance_scope of [null, "quarter", "multi_year_target"]) {
    const original = { ...row, guidance_scope };
    const assessed = assessGuidanceReleaseEvent(original);
    assert.equal(assessed.usable, false);
    assert.equal(assessed.metadataConflict, false);
    assert.equal(assessed.details.guidance_non_company_or_non_periodic.basis, "metric_owned_multi_year_target");
    assert.deepEqual(auditGuidanceCoverageRelease({ rows: [original], requiredTickers: ["CHYM"], noQuantifiedTickers: ["CHYM"], modelRuns: [run({ grossMargin: 90 }, { ticker: "CHYM", fiscal_period: row.fiscal_period, as_of_date: row.observed_at })] }).failures, []);
  }
});

test("original IDCC results-versus-outlook table remains historical despite its old clear guidance label", () => {
  const row = sevenOriginalEvents.find((entry) => entry.ticker === "IDCC");
  for (const correction of [{ guidance_scope: null }, { guidance_scope: "quarter" }, { guidance_scope: null, actual_or_guidance: "actual", quality_status: "historical_actual" }]) {
    const original = { ...row, ...correction };
    const assessed = assessGuidanceReleaseEvent(original);
    assert.equal(assessed.usable, false);
    assert.equal(assessed.metadataConflict, false);
    assert.ok(assessed.rejectionReasons.includes("guidance_historical_results_vs_outlook"));
    assert.equal(assessed.currencyReviewIncomplete, false);
    assert.deepEqual(auditGuidanceCoverageRelease({ rows: [original], requiredTickers: ["IDCC"], noQuantifiedTickers: ["IDCC"], modelRuns: [run({}, { ticker: "IDCC", fiscal_period: row.fiscal_period, as_of_date: row.observed_at })] }).failures, []);
  }
});

test("a later explicitly annual forward section is not suppressed by an earlier comparison table", () => {
  const row = event({ amount: 1000, currency: "USD", growth_yoy: null, evidence_excerpt: "Financial Results vs. Outlook. Revenue was $260.2 million against prior guidance of $139 million to $143 million. For full-year 2026, we now expect total revenue of $1 billion." });
  assert.equal(assessGuidanceReleaseEvent(row).usable, true);
});

test("FY26E explicitly supports INIO annual EBITDA, never the unrelated earlier Q2 heading", () => {
  const original = sevenOriginalEvents.find((entry) => entry.ticker === "INIO");
  const annual = assessGuidanceReleaseEvent({ ...original, guidance_scope: "full_year", guidance_target_year: 2026 });
  assert.equal(annual.currencyReviewIncomplete, true);
  assert.deepEqual(annual.rejectionReasons, ["guidance_source_currency_unresolved"]);
  const quarterly = assessGuidanceReleaseEvent({ ...original, guidance_scope: "quarter", guidance_target_year: 2026 });
  assert.equal(quarterly.usable, false);
  assert.equal(quarterly.metadataConflict, true);
  assert.ok(quarterly.rejectionReasons.includes("guidance_scope_not_supported_by_evidence"));
});
