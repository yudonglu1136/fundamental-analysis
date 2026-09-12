import assert from "node:assert/strict";

test("revenue growth oracle cannot borrow EPS/EBITDA/margin or net-income ranges", () => {
  for (const [evidence, growthYoy] of [
    ["For full year we expect revenue up 12%, adjusted EBITDA up 17%-18%.", 12],
    ["Our guidance calls for 6%-9% recurring revenue growth and 7%-11% adjusted EPS growth.", 7.5],
    ["We expect 6% organic revenue growth and adjusted operating margin of 19.5%-20%.", 6],
    ["We expect operational growth of 6%-8% in revenue and 7%-9% in adjusted net income.", 7],
  ]) assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy }), null, evidence);
  assert.ok(independentGuidanceGrowthRangeMismatch({ evidence: "We expect 6%-9% recurring revenue growth and 7%-11% adjusted EPS growth.", growthYoy: 9 }));
});

test("revenue growth ranges preserve explicit cross-zero signs and common decline language", () => {
  for (const [evidence, growthYoy] of [
    ["For the full year we expect revenue to decline in the range of 2% to down 0.5%.", -1.25],
    ["We anticipate revenue growth between -0.5% and 1% for the full year.", 0.25],
    ["We expect revenue growth down 2% to 1%.", -1.5],
    ["We expect revenue growth negative 2% to plus 1%.", -0.5],
  ]) {
    assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy }), null, evidence);
    assert.ok(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: growthYoy + 1 }), evidence);
  }
});
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  guidanceMonetaryAmountsM,
  independentFullDollarTargetMismatch,
  independentGuidanceMidpointMismatch,
  independentHistoricalActualAmountMismatch,
  independentNonGuidanceOwnerAmountMismatch,
  independentParallelMetricAmountMismatch,
  independentGuidanceCurrencyMismatch,
  independentGuidanceGrowthRangeMismatch,
  independentExplicitGrowthBasisMismatch
} from "./guidanceEvidenceAudit.js";

test("a quoted breakeven range independently requires its zero endpoint", () => {
  const evidence = "For the second quarter, we expect adjusted revenues to be within the range of $151 million-$156 million, and adjusted EBITDA to be in the range of negative $4 million to break even.";
  assert.deepEqual(guidanceMonetaryAmountsM(evidence).map(v => v.amountM), [151, 156, -4, 0]);
  assert.equal(independentGuidanceMidpointMismatch({ amount: -2, evidence }), null);
  assert.equal(independentGuidanceMidpointMismatch({ amount: 153.5, evidence }), null);
  assert.equal(independentGuidanceMidpointMismatch({ amount: -4, evidence }).reason, "guidance_breakeven_range_endpoint_used_as_midpoint");
  assert.equal(independentGuidanceMidpointMismatch({ amount: -4, evidence: "We expect EBITDA of negative $4 million this quarter, with a goal of reaching break even next year." }), null);
});

test("explicit sequential growth and year-over-year growth have independent basis and sign", () => {
  for (const [evidence, growthYoy, growthQoq] of [
    ["Revenue guidance represents 6% sequential increase and 27.6% year-over-year increase.", 27.6, 6],
    ["Revenue guidance represents 1% sequential decrease or 22% year-over-year increase.", 22, -1],
    ["Revenue guidance represents a 6.2% sequential decline.", null, -6.2],
    ["Revenue guidance represents 6%-8% sequential decline and 20%-22% year over year growth.", 21, -7],
    ["Revenue is down 1% year-over-year and between 7% and 10% sequentially.", -1, 8.5],
    ["Revenue is expected to decline in the range of 2% to down 0.5% year-over-year and 5% sequentially.", -1.25, 5],
  ]) {
    assert.equal(independentExplicitGrowthBasisMismatch({ evidence, growthYoy, growthQoq }), null);
    assert.ok(independentExplicitGrowthBasisMismatch({ evidence, growthYoy: growthQoq, growthQoq: null }));
    assert.ok(independentExplicitGrowthBasisMismatch({ evidence, growthYoy, growthQoq: null }));
  }
});

test("same-period reported growth and an explicitly qualified constant-currency alternative are not ambiguous", () => {
  const evidence = "We expect total revenue representing 12% year-over-year growth at the midpoint or 11% year-over-year constant currency growth at the midpoint.";
  assert.equal(independentExplicitGrowthBasisMismatch({ evidence, growthYoy: 12 }), null);
  assert.equal(independentExplicitGrowthBasisMismatch({ evidence, growthYoy: 11 }).reason, "guidance_growth_period_basis_mismatch");
  assert.equal(independentExplicitGrowthBasisMismatch({ evidence: evidence.replace('constant currency ', ''), growthYoy: 12 }).reason, "guidance_growth_period_basis_ambiguous");
  assert.equal(independentExplicitGrowthBasisMismatch({ evidence: "Revenue is expected to grow 11% year-over-year constant currency.", growthYoy: 11 }), null);
});

test("revised percentage point target is the new level, not a fabricated range midpoint", () => {
  const evidence = "We increased our 2022 full year revenue growth projection from 8.75% to 10.25% at the midpoint of our guidance range.";
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: 10.25 }), null);
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: 9.5 }).expectedGrowth, 10.25);
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence: "We increased our full-year revenue growth guidance to a range from 8.75% to 10.25%.", growthYoy: 9.5 }), null);
});

test("growth range preceding underlying net sales binds to sales rather than operating income", () => {
  const evidence = "The company reaffirmed full year expectations for 4-5% underlying net sales growth and 6-8% underlying operating income growth.";
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: 4.5 }), null);
  assert.ok(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: 7 }));
});

test("full-dollar original evidence is independently normalized and range-audited", () => {
  for (const [evidence, amount] of [
    ["We expect Q4 2025 worldwide revenues to be in the range of $1,025,000,000- $1,045,000,000, up sequentially from Q3 of 2025.", 1035],
    ["For the fourth quarter, we expect revenue in the range of $1,370 ,000,000- $1,390,000,000 and Q4 earnings per share in the range of $1.79- $1.85, based on a weighted diluted share count of approximately 173 million shares.", 1380],
  ]) {
    const args = { evidence, metricName: "revenue_guidance", amount, sourceCurrency: "USD" };
    assert.equal(independentFullDollarTargetMismatch(args), null);
    assert.ok(independentFullDollarTargetMismatch({ ...args, amount: amount * 1000000 }));
    assert.ok(independentFullDollarTargetMismatch({ ...args, amount: amount - 10 }));
  }
  assert.deepEqual(guidanceMonetaryAmountsM("For 2026 EPS is $1.20 and diluted shares are 1,025,000,000."), []);
  assert.equal(guidanceMonetaryAmountsM("USD (1,200,000,000)")[0].amountM, -1200);
  assert.equal(guidanceMonetaryAmountsM("MXN 1,025,000,000")[0].currency, "MXN");
  assert.equal(guidanceMonetaryAmountsM("$1,025,000,000")[0].currency, null);
  assert.equal(guidanceMonetaryAmountsM("$1,200,000,000 million").length, 1);
  assert.equal(independentFullDollarTargetMismatch({ metricName: "revenue_guidance", amount: 38900,
    evidence: "For the full year we expect sales of $38.,100,000,000-$38,900,000,000." }).reason,
    "guidance_original_currency_number_format_requires_review");
});

// Original transcript excerpt, FFIV sourceId289307d5bd86ad62e8ecc2c0.
const ffivFiscalRangeEvidence = "Balancing the strength, we are currently seeing in the business with some prudence in relation to the macro environment, we are raising our revenue outlook for FY 2025 to 6.5%-7.5% growth, up from our prior range of 6%-7%.";
test("FFIV fiscal year cannot consume the real following percentage range", () => {
  const args = { evidence: ffivFiscalRangeEvidence, targetYear: 2025 };
  assert.equal(independentGuidanceGrowthRangeMismatch({ ...args, growthYoy: 7 }), null);
  for (const growthYoy of [-0.5, 6.5, 7.5, 1015.75]) {
    const mismatch = independentGuidanceGrowthRangeMismatch({ ...args, growthYoy });
    assert.equal(mismatch.reason, "guidance_growth_range_mismatch");
    assert.equal(mismatch.expectedGrowth, 7);
  }
  assert.equal(independentGuidanceGrowthRangeMismatch({ ...args, growthYoy: 7, targetYear: 2024 }).reason, "guidance_target_year_mismatch");
});

test("year exclusion does not suppress a percentage explicitly written on the left endpoint", () => {
  for (const marker of ["FY 2025", "FY2025", "fiscal year 2025"]) {
    assert.equal(independentGuidanceGrowthRangeMismatch({
      evidence: `Our revenue outlook for ${marker} is growth between 6.5% and 7.5%.`, growthYoy: 7
    }), null);
  }
  assert.equal(independentGuidanceGrowthRangeMismatch({
    evidence: "For FY2025, we expect revenue growth of 2000%-2100%.", growthYoy: 2050
  }), null);
});

// Original transcript excerpt, ABNB sourceId8db6fb03e7e1da7208434b97.
const abnbReportedFxEvidence = "You know, in our guidance for Q4, we're anticipating revenue growth between 17% and 23%, and that's 23%-29%, excluding the impact of foreign exchange.";
test("ABNB primary between-and range cannot be replaced by the later FX-excluded range", () => {
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence: abnbReportedFxEvidence, growthYoy: 20 }), null);
  for (const growthYoy of [17, 23, 26, 29]) {
    const mismatch = independentGuidanceGrowthRangeMismatch({ evidence: abnbReportedFxEvidence, growthYoy });
    assert.equal(mismatch.reason, "guidance_growth_range_mismatch");
    assert.equal(mismatch.expectedGrowth, 20);
  }
  assert.equal(independentGuidanceGrowthRangeMismatch({
    evidence: "For Q4, we expect revenue growth of 23%-29%, excluding the impact of foreign exchange.", growthYoy: 26
  }), null, "A standalone constant-currency target is not globally suppressed");
});

test("between-and endpoints preserve negative direction and do not invent a range from plain conjunction", () => {
  const evidence = "For the full year we expect revenue growth between down 3% and up 1%.";
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: -1 }), null);
  assert.equal(independentGuidanceGrowthRangeMismatch({ evidence, growthYoy: 2 }).expectedGrowth, -1);
  assert.equal(independentGuidanceGrowthRangeMismatch({
    evidence: "Revenue grew 17% and 23% of customers are international.", growthYoy: 20
  }), null, "No declared range means this range-only audit cannot reconstruct a midpoint");
});

test("independent currency scanner recognizes peso ranges without relying on extractor ISO", () => {
  for (const evidence of ["Revenue guidance is MXN 80-84 billion.", "Revenue guidance is Ps. 80 billion to Ps. 84 billion.", "Revenue guidance is 80–84 billion Mexican pesos."]) {
    const values = guidanceMonetaryAmountsM(evidence);
    assert.deepEqual(values.map((value) => value.amountM), [80_000, 84_000]);
    assert.deepEqual(values.map((value) => value.currency), ["MXN", "MXN"]);
    assert.equal(independentGuidanceMidpointMismatch({ amount: 82_000, evidence }), null);
    assert.equal(independentGuidanceCurrencyMismatch({ amount: 82_000, currency: "MXN", evidence }), null);
    assert.equal(independentGuidanceCurrencyMismatch({ amount: 82_000, currency: "USD", evidence }).reason, "source_currency_mismatch");
  }
});

test("explicit Mexican-peso context defeats a bare-dollar USD assumption", () => {
  const evidence = "In Mexican pesos, full year revenue guidance is $80 billion.";
  assert.equal(independentGuidanceCurrencyMismatch({ amount: 80_000, currency: "USD", evidence }).reason, "source_currency_mismatch");
  assert.equal(independentGuidanceCurrencyMismatch({ amount: 80_000, currency: "MXN", evidence }), null);
  assert.equal(guidanceMonetaryAmountsM("Full year revenue guidance is $80 billion.")[0].currency, null);
});

test("independent scalar currency audit recognizes compact ISO amounts without word-prefix false positives", () => {
  for (const currency of ["MXN", "USD", "GBP", "EUR"]) {
    const evidence = `Full year revenue guidance is ${currency}80–84 billion.`;
    assert.deepEqual(guidanceMonetaryAmountsM(evidence).map((v) => v.currency), [currency, currency]);
    assert.equal(independentGuidanceCurrencyMismatch({ amount: 82_000, currency, evidence }), null);
    if (currency !== "USD") {
      assert.equal(independentGuidanceCurrencyMismatch({ amount: 82_000, currency: "USD", evidence }).reason, "source_currency_mismatch");
    }
  }
  assert.equal(guidanceMonetaryAmountsM("Revenue guidance is AMXN80 billion.")[0].currency, null);
});

test("FX-aware independent scalar audit compares original MXN amount, not model USD", () => {
  const evidence = "We expect to spend around MXN 80 billion versus free cash flow of MXN 40 billion.";
  const fxConversion = { sourceCurrency: "MXN", targetCurrency: "USD", sourceAmountM: 60_000, modelAmountM: 3_000, conversionRate: 0.05 };
  assert.equal(independentGuidanceMidpointMismatch({ amount: 3_000, fxConversion, evidence }).storedAmountM, 60_000);
  const valid = { ...fxConversion, sourceAmountM: 40_000, modelAmountM: 2_000 };
  assert.equal(independentGuidanceMidpointMismatch({ amount: 2_000, fxConversion: valid, evidence }), null);
  assert.equal(independentGuidanceCurrencyMismatch({ amount: 2_000, fxConversion: valid, evidence }), null);
});

test("independent review preserves TBBB 2025-Q4 release versus FY2026 growth target", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/tbbb-fy2026-guidance.json", import.meta.url), "utf8"));
  assert.equal(fixture.fiscal_period, "Q42025");
  assert.deepEqual(guidanceMonetaryAmountsM(fixture.evidence), []);
  assert.equal(independentGuidanceGrowthRangeMismatch({ growthYoy: 30.5, targetYear: 2026, evidence: fixture.evidence }), null);
  assert.equal(independentGuidanceGrowthRangeMismatch({ growthYoy: 30.5, targetYear: 2025, evidence: fixture.evidence }).reason, "guidance_target_year_mismatch");
  assert.equal(independentGuidanceGrowthRangeMismatch({ growthYoy: 32, targetYear: 2026, evidence: fixture.evidence }).expectedGrowth, 30.5);
  assert.equal(independentGuidanceCurrencyMismatch({ amount: null, currency: null, evidence: fixture.evidence }), null);
});

test("real DUOL and ELF ranges use both current endpoints, not the prior outlook or constant-currency case", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/guidance-review-seven-2026.json", import.meta.url), "utf8"));
  for (const { original, expected } of fixture.events.filter((caseRow) => ["DUOL", "ELF"].includes(caseRow.original.ticker))) {
    const args = { evidence: original.evidence_excerpt, targetYear: expected.guidance_target_year };
    assert.equal(independentGuidanceGrowthRangeMismatch({ ...args, growthYoy: expected.growth_yoy }), null);
    const mismatch = independentGuidanceGrowthRangeMismatch({ ...args, growthYoy: original.growth_yoy });
    assert.equal(mismatch.reason, "guidance_growth_range_mismatch");
    assert.equal(mismatch.expectedGrowth, expected.growth_yoy);
    assert.equal(independentGuidanceGrowthRangeMismatch({ ...args, growthYoy: expected.growth_yoy, targetYear: 2025 }).reason, "guidance_target_year_mismatch");
  }
});

test("normalizes monetary guidance values to millions", () => {
  assert.deepEqual(
    guidanceMonetaryAmountsM("$3.5 billion versus free cash flow of $2.4 billion").map((row) => row.amountM),
    [3_500, 2_400]
  );
});

test("expands a shared trailing scale across both range endpoints", () => {
  assert.deepEqual(
    guidanceMonetaryAmountsM("Adjusted EBITDA of $1.66-$1.68 billion and operating income of $205-$225 million.")
      .map((row) => row.amountM),
    [1_660, 1_680, 205, 225]
  );
});

test("preserves direction signs in down-to-up monetary ranges", () => {
  const evidence = "We expect operating profit in the range of down $125 million to up $25 million.";
  assert.deepEqual(guidanceMonetaryAmountsM(evidence).map((row) => row.amountM), [-125, 25]);
  assert.equal(independentGuidanceMidpointMismatch({ amount: -50, evidence }), null);
});

test("does not inherit a monetary scale onto a bare fiscal year", () => {
  const evidence = "This brings total share repurchases since the beginning of fiscal year 2025 to $1.4 billion, and we see continued runway given our strong outlook for free cash flow.";
  assert.deepEqual(
    guidanceMonetaryAmountsM(evidence).map((row) => row.amountM),
    [1_400]
  );
  assert.ok(independentNonGuidanceOwnerAmountMismatch({
    amount: 1_400,
    evidence
  }));
});

test("rejects an operating cash flow amount assigned to revenue growth", () => {
  const evidence = "At the midpoint, we now expect revenue growth of 19%, operating margin of 44.25%, EPS of $8.10, and operating cash flow of $2 billion for the year.";
  assert.ok(independentNonGuidanceOwnerAmountMismatch({
    amount: 2_000,
    evidence
  }));
});

test("accepts an operating cash flow amount for its own explicit metric", () => {
  const evidence = "At the midpoint, we now expect revenue growth of 19%, operating margin of 44.25%, EPS of $8.10, and operating cash flow of $2 billion for the year.";
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    metricName: "operating_cash_flow_guidance",
    amount: 2_000,
    evidence
  }), null);
});

test("does not let operating cash flow own a later capex amount across a new verb", () => {
  const evidence = "We expect to generate approximately $100 million in operating cash flow and deploy approximately $180 million for capital expenditures.";
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    metricName: "capex_guidance",
    amount: 180,
    evidence
  }), null);
});

test("does not join operating cash flow and a later capex amount through an earlier EPS range", () => {
  const evidence = "We expect revenue growth of 10.5%-11%, adjusted EPS excluding amortization in the range of $6.28-$6.33, operating cash flow of approximately $900 million, excluding the Hunter Labs settlement, and capital expenditures of $150 million.";
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    amount: 150,
    evidence
  }), null);
  assert.ok(independentNonGuidanceOwnerAmountMismatch({
    amount: 900,
    evidence
  }));
});

test("blocks averaging independent versus values", () => {
  assert.deepEqual(
    independentGuidanceMidpointMismatch({
      amount: 2_950,
      evidence: "We expect to spend around $3.5 billion versus free cash flow of $2.4 billion."
    }),
    {
      storedAmountM: 2_950,
      midpointM: 2_950,
      quotedAmountsM: [3_500, 2_400],
      quotedValues: ["$3.5 billion", "$2.4 billion"],
      connector: "versus free cash flow of"
    }
  );
});

test("accepts the metric-owned value from an independent comparison", () => {
  assert.equal(
    independentGuidanceMidpointMismatch({
      amount: 2_400,
      evidence: "We expect to spend around $3.5 billion versus free cash flow of $2.4 billion."
    }),
    null
  );
});

test("does not reject the midpoint of an explicit range", () => {
  assert.equal(
    independentGuidanceMidpointMismatch({
      amount: 4_100,
      evidence: "We expect full-year revenue of $4.0 billion to $4.2 billion."
    }),
    null
  );
  assert.equal(
    independentGuidanceMidpointMismatch({
      amount: 1_000,
      evidence: "We expect free cash flow in a range between $900 million and $1.1 billion."
    }),
    null
  );
  assert.equal(
    independentGuidanceMidpointMismatch({
      amount: 8_700,
      evidence: "We expect revenue between EUR 8.4 billion and EUR 9 billion."
    }),
    null
  );
  assert.equal(
    independentGuidanceMidpointMismatch({
      amount: 8_800,
      evidence: "We are raising the low end of revenue guidance to $8.7 billion and maintaining the high end at $8.9 billion."
    }),
    null
  );
});

test("rejects a midpoint formed by separate revenue and EBIT values", () => {
  const mismatch = independentGuidanceMidpointMismatch({
    amount: 10_367.5,
    evidence: "For the full year, we expect revenue of $16.5 billion and adjusted EBIT of $4.235 billion."
  });
  assert.equal(mismatch?.midpointM, 10_367.5);
});

test("rejects depreciation owned amount blended into capex", () => {
  const mismatch = independentNonGuidanceOwnerAmountMismatch({
    metricName: "capex_guidance",
    amount: 51,
    evidence: "We expect depreciation and amortization of $57 million and capital expenditures of $35 million to $45 million."
  });
  assert.equal(mismatch?.reason, "non_guidance_cross_owner_midpoint");
});

test("accepts a current explicit range compared with a prior range", () => {
  assert.equal(
    independentGuidanceMidpointMismatch({
      amount: 1_500,
      evidence: "We now expect revenue in the range of $1.4 billion-$1.6 billion versus our prior range of $1.4 billion-$1.7 billion."
    }),
    null
  );
});

test("does not consume the end of versus as a US currency prefix", () => {
  const values = guidanceMonetaryAmountsM("$2 billion versus $1.5 billion");
  assert.deepEqual(values.map((row) => row.text), ["$2 billion", "$1.5 billion"]);
});

test("blocks a parallel metric from taking the preceding metric amount", () => {
  assert.deepEqual(
    independentParallelMetricAmountMismatch({
      metricName: "operating_income_guidance",
      amount: 2_400,
      evidence: "EBITDA and operating income are expected to be $2.4 billion and $1.6 billion at the midpoint, respectively, with strong year-over-year sales conversion."
    }),
    {
      storedAmountM: 2_400,
      expectedAmountM: 1_600,
      metricOrder: ["ebitda_guidance", "operating_income_guidance"],
      quotedAmountsM: [2_400, 1_600],
      quotedValues: ["$2.4 billion", "$1.6 billion"]
    }
  );
});

test("accepts the amount owned by a parallel metric", () => {
  assert.equal(
    independentParallelMetricAmountMismatch({
      metricName: "operating_income_guidance",
      amount: 1_600,
      evidence: "EBITDA and operating income are expected to be $2.4 billion and $1.6 billion at the midpoint, respectively, with strong year-over-year sales conversion."
    }),
    null
  );
});

test("blocks a historical actual embedded beside a forward sentence", () => {
  assert.deepEqual(
    independentHistoricalActualAmountMismatch({
      amount: 934,
      evidence: "We expect other income expense to remain flat. non-GAAP net income grew to $934 million."
    }),
    {
      storedAmountM: 934,
      quotedValues: ["$934 million"],
      reason: "historical_actual_or_comparison_base"
    }
  );
});

test("blocks a delivered comparison base but accepts a forward amount", () => {
  assert.ok(independentHistoricalActualAmountMismatch({
    amount: 518,
    evidence: "We expect free cash flow above $700 million versus the $518 million we delivered in 2023."
  }));
  assert.equal(independentHistoricalActualAmountMismatch({
    amount: 700,
    evidence: "We expect free cash flow above $700 million versus the $518 million we delivered in 2023."
  }), null);
});

test("blocks a cost range midpoint assigned to revenue", () => {
  assert.deepEqual(
    independentNonGuidanceOwnerAmountMismatch({
      amount: 55,
      evidence: "At the midpoint of revenue guidance, operating margin includes between $50 million and $60 million in underutilization costs."
    }),
    {
      storedAmountM: 55,
      owner: "costs",
      quotedValues: ["$50 million", "$60 million"],
      reason: "non_guidance_amount_owner"
    }
  );
});

test("accepts company revenue when a separate cost amount follows", () => {
  assert.equal(
    independentNonGuidanceOwnerAmountMismatch({
      amount: 2_000,
      evidence: "We expect revenue of $2 billion, including underutilization costs of $50 million."
    }),
    null
  );
});

test("does not confuse reported revenue or closed sales with past-tense verbs", () => {
  assert.equal(independentHistoricalActualAmountMismatch({
    amount: 1_805,
    evidence: "We expect reported revenue in the range of $1.79 billion-$1.82 billion."
  }), null);
  assert.equal(independentHistoricalActualAmountMismatch({
    amount: 190,
    evidence: "We expect closed sales in the range of $170 million-$210 million."
  }), null);
});

test("does not treat an unrelated hyphen between values as a range connector", () => {
  const mismatch = independentGuidanceMidpointMismatch({
    amount: 1_420,
    evidence: "We achieved EBITDA of $2.64 billion after a one-time weather event that reduced profit by $200 million."
  });
  assert.equal(mismatch?.midpointM, 1_420);
  assert.equal(mismatch?.connector.includes("one-time"), true);
});

test("accepts a legal range when the right endpoint repeats the currency symbol", () => {
  assert.equal(independentGuidanceMidpointMismatch({
    amount: 1_575,
    evidence: "We expect Q2 revenue will be in the range of $1.56-$1.59 billion."
  }), null);
});

test("does not average a from-to trajectory as a guidance range", () => {
  assert.ok(independentGuidanceMidpointMismatch({
    amount: 1_500,
    evidence: "We expect annual revenue to grow from $1 billion to $2 billion."
  }));
});

test("accepts a range explicitly introduced with range from", () => {
  assert.equal(independentGuidanceMidpointMismatch({
    amount: 285,
    evidence: "We narrowed the guidance range from $270 million-$300 million to $280 million-$300 million."
  }), null);
  assert.equal(independentGuidanceMidpointMismatch({
    amount: 1_500,
    evidence: "We expect revenue in a range from $1 billion to $2 billion."
  }), null);
});

test("does not let an excluded expense clause own operating income", () => {
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    amount: 350,
    evidence: "We anticipate operating income, which excludes other operating expense, to be between $275 million and $425 million."
  }), null);
});

test("does not combine cash balance with a later forward FCF amount", () => {
  assert.ok(independentNonGuidanceOwnerAmountMismatch({
    amount: 14_700,
    evidence: "Our cash balance at year end was $8.4 billion, and we expect free cash flow of $21 billion."
  }));
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    amount: 21_000,
    evidence: "Our cash balance at year end was $8.4 billion, and we expect free cash flow of $21 billion."
  }), null);
});

test("recognizes a multiword synergy owner after the amount", () => {
  assert.ok(independentNonGuidanceOwnerAmountMismatch({
    amount: 400,
    evidence: "We remain focused on capturing over $400 million of run-rate commercial and operating synergies by year end."
  }));
});

test("accepts a revenue range midpoint that equals a later share-count endpoint", () => {
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    amount: 82,
    evidence: "We expect revenue to be in the range of $80 million-$84 million and non-GAAP EPS to be approximately $0.03 per share, using 80 million-82 million shares on a diluted basis."
  }), null);
});

test("accepts a later range midpoint when an earlier expense repeats its endpoint", () => {
  assert.equal(independentNonGuidanceOwnerAmountMismatch({
    amount: 22.5,
    evidence: "The decrease in our interest expense guidance of approximately $20 million primarily reflects interest favorability, partially offset by an increase in the net income attributable to the non-controlling interest line, which we now expect to be approximately $20 million-$25 million for fiscal 2019."
  }), null);
});
