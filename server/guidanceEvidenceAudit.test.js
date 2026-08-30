import assert from "node:assert/strict";
import test from "node:test";

import {
  guidanceMonetaryAmountsM,
  independentGuidanceMidpointMismatch,
  independentHistoricalActualAmountMismatch,
  independentNonGuidanceOwnerAmountMismatch,
  independentParallelMetricAmountMismatch
} from "./guidanceEvidenceAudit.js";

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
