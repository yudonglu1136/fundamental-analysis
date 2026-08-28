import assert from "node:assert/strict";
import test from "node:test";
import {
  attachMstrCryptoMetrics,
  buildEquityDcf,
  digestGuidanceMetrics,
  hasExplicitValuationProfile,
  normalizedMarginRatio,
  normalizedNetIncomePower
} from "./importSecQuarterlyValuations.js";

function guidance(metricName, amount, excerpt, qualityStatus = "clear") {
  return {
    actual_or_guidance: "guidance",
    metric_name: metricName,
    amount,
    unit: "USD millions",
    currency: "USD",
    quality_status: qualityStatus,
    excerpt
  };
}

test("PLTR Q2 uses explicit FY revenue and FCF guidance, not Q3 guidance", () => {
  const digest = digestGuidanceMetrics([
    guidance(
      "revenue_guidance",
      2160,
      "For Q3 2026, we expect revenue of between $2.16 billion and $2.164 billion."
    ),
    guidance(
      "revenue_guidance",
      8154,
      "For full year 2026, we are raising our revenue guidance to between $8.15 billion and $8.158 billion."
    ),
    guidance(
      "free_cash_flow_guidance",
      4500,
      "We are raising adjusted free cash flow guidance to between $4.5 billion and $4.7 billion for this year."
    ),
    guidance(
      "operating_income_guidance",
      1728,
      "For Q3 2026, adjusted income from operations is expected between $1.292 billion and $1.296 billion."
    ),
    guidance(
      "operating_income_guidance",
      4700,
      "We are raising adjusted free cash flow guidance and continue to expect GAAP operating income and net income."
    )
  ]);

  assert.equal(digest.revenueGuidanceM, 8154);
  assert.equal(digest.fcfGuidanceM, 4500);
  assert.equal(digest.operatingIncomeGuidanceM, null);
  assert.equal(digest.guidanceSelection.revenue.mode, "explicit_full_year");
  assert.equal(digest.guidanceSelection.revenue.rejectedQuarterCount, 1);
});

test("PLTR Q1 prefers total FY revenue over quarterly and segment guidance", () => {
  const digest = digestGuidanceMetrics([
    guidance(
      "revenue_guidance",
      7656,
      "We are raising our full year 2026 revenue guidance midpoint to $7.656 billion."
    ),
    guidance(
      "revenue_guidance",
      3224,
      "We are raising our U.S. commercial revenue guidance to in excess of $3.224 billion."
    ),
    guidance(
      "revenue_guidance",
      1797,
      "For Q2 2026, we expect revenue of between $1.797 billion and $1.801 billion."
    ),
    guidance(
      "operating_income_guidance",
      4446,
      "We are raising our adjusted income from operations guidance to between $4.440 billion and $4.452 billion."
    )
  ]);

  assert.equal(digest.revenueGuidanceM, 7656);
  assert.equal(digest.operatingIncomeGuidanceM, 4446);
  assert.equal(digest.guidanceSelection.operatingIncome.mode, "unscoped_fallback");
});

test("year-only annual wording is a safe fallback when no quarter scope is present", () => {
  const digest = digestGuidanceMetrics([
    guidance("revenue_guidance", 9200, "For 2027, we expect revenue of approximately $9.2 billion."),
    guidance("revenue_guidance", 2400, "For Q1 2027, we expect revenue of approximately $2.4 billion.")
  ]);

  assert.equal(digest.revenueGuidanceM, 9200);
  assert.equal(digest.guidanceSelection.revenue.mode, "explicit_full_year");
  assert.equal(digest.guidanceSelection.revenue.rejectedQuarterCount, 1);
});

test("quarter shorthand, ARR and segment guides cannot become annual total revenue", () => {
  const digest = digestGuidanceMetrics([
    guidance("revenue_guidance", 3977.5, "For Q3, we expect subscription revenues between $3.975 billion and $3.980 billion."),
    guidance("revenue_guidance", 100000, "For fiscal year 2027, AI semiconductor revenue will exceed $100 billion."),
    guidance("revenue_guidance", 56000, "For the full year 2026, AI semiconductor revenue will be $56 billion."),
    guidance("revenue_guidance", 20500, "We forecast semiconductor revenue of approximately $20.5 billion."),
    guidance("revenue_guidance", 8900, "We forecast software revenue of approximately $8.9 billion."),
    guidance("revenue_guidance", 6607.5, "For the full fiscal year 2027, annual recurring revenue will be $6.6075 billion."),
    guidance("free_cash_flow_guidance", 1040, "We expect free cash flow margin of 35% and 1.04 billion weighted average shares.")
  ]);

  assert.equal(digest.revenueGuidanceM, null);
  assert.equal(digest.fcfGuidanceM, null);
  assert.equal(digest.guidanceSelection.revenue.rejectedQuarterCount, 1);
});

test("year outlook survives when a Q3 shorthand guide is also present", () => {
  const digest = digestGuidanceMetrics([
    guidance("revenue_guidance", 6340, "For our updated outlook for 2026, we now expect revenue of $6.34 billion."),
    guidance("revenue_guidance", 1625, "For Q3, we expect revenue of $1.625 billion.")
  ]);

  assert.equal(digest.revenueGuidanceM, 6340);
  assert.equal(digest.guidanceSelection.revenue.mode, "explicit_full_year");
});

test("normalized earnings preserve the observed below-operating burden", () => {
  const result = normalizedNetIncomePower({
    ttm: {
      revenue_m: 54_396,
      operating_income_m: 12_663,
      net_income_m: 4_924
    },
    valuationRevenue: 54_396,
    normalizedOperatingMargin: 0.224
  });

  assert.ok(result.belowOperatingIncomeBurden > 0.13);
  assert.ok(result.normalizedNetMargin < 0.09);
  assert.ok(result.netIncomeM < 4_900);
});

test("industry margin target cannot cap a structurally higher company margin", () => {
  const highMargin = normalizedMarginRatio(
    { operating_margin_pct: 29.16 },
    { targetMargin: 0.04, marginActualWeight: 0.7 }
  );
  const lowMargin = normalizedMarginRatio(
    { operating_margin_pct: 4 },
    { targetMargin: 0.04, marginActualWeight: 0.7 }
  );

  assert.ok(highMargin > 0.21 && highMargin < 0.22);
  assert.equal(lowMargin, 0.04);
});

test("all formerly defaulted PIT issuers have explicit valuation profiles", () => {
  for (const ticker of ["DGE.L", "ESTC", "GTLB", "IBM", "ORCL", "SNOW"]) {
    assert.equal(hasExplicitValuationProfile(ticker), true, ticker);
  }
  assert.equal(hasExplicitValuationProfile("RKLX"), false);
});

test("MSTR point-in-time supplement cannot use a later comparative disclosure", () => {
  const facts = {
    "us-gaap": {
      CryptoAssetFairValue: {
        units: {
          USD: [{ val: 1_840_028_000, filed: "2026-02-19", end: "2022-12-31", form: "10-K" }]
        }
      }
    }
  };
  const early = attachMstrCryptoMetrics(facts, [{
    fiscalYear: 2022,
    fiscalQuarter: "Q4",
    asOfDate: "2023-02-16",
    sources: {}
  }], { pointInTime: true })[0];
  const visible = attachMstrCryptoMetrics(facts, [{
    fiscalYear: 2022,
    fiscalQuarter: "Q4",
    asOfDate: "2026-02-19",
    sources: {}
  }], { pointInTime: true })[0];

  assert.equal(early.crypto_asset_fair_value_m, undefined);
  assert.equal(visible.crypto_asset_fair_value_m, 1_840.028);
});

test("FCFE DCF is monotonic in cash flow and penalizes high leverage", () => {
  const common = {
    sharesM: 100,
    growthPct: 12,
    settings: { profile: "media_telecom" },
    targetFcfYield: 0.065
  };
  const lowLeverage = buildEquityDcf({
    ...common,
    baseFcfM: 1_000,
    ttm: { cash_m: 500, debt_m: 1_000 }
  });
  const highLeverage = buildEquityDcf({
    ...common,
    baseFcfM: 1_000,
    ttm: { cash_m: 500, debt_m: 10_000 }
  });
  const higherCashFlow = buildEquityDcf({
    ...common,
    baseFcfM: 1_250,
    ttm: { cash_m: 500, debt_m: 1_000 }
  });

  assert.ok(lowLeverage.fairValue > highLeverage.fairValue);
  assert.ok(higherCashFlow.fairValue > lowLeverage.fairValue);
  assert.ok(highLeverage.discountRate > lowLeverage.discountRate);
  assert.ok(highLeverage.discountRate > highLeverage.terminalGrowth);
  assert.ok(highLeverage.terminalValueShare > 0 && highLeverage.terminalValueShare < 1);
});

test("CHTR-like leverage receives a double-digit discount rate", () => {
  const result = buildEquityDcf({
    baseFcfM: 4_735,
    sharesM: 121.255667,
    growthPct: 1,
    ttm: { cash_m: 509, debt_m: 95_555 },
    settings: { profile: "media_telecom" },
    targetFcfYield: 0.07
  });

  assert.ok(result.discountRate >= 0.145);
  assert.ok(result.fairValue > 0 && result.fairValue < 400);
  assert.ok(result.terminalValueShare < 0.8);
});
