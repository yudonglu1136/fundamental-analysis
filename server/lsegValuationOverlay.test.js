import test from "node:test";
import assert from "node:assert/strict";
import {
  LSEG_PARENT_ECONOMIC_MODEL,
  applyLsegValuationOverlay,
  buildLsegValuation,
  buildParentEconomicFcfeDcf,
  lsegDcfSensitivity
} from "./lsegValuationOverlay.js";

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function awsLsegSnapshot(overrides = {}) {
  return {
    ticker: "LSEG",
    key: "LSEG",
    name: "London Stock Exchange Group",
    currency: "GBP",
    generatedAt: "2026-08-30T10:30:00.000Z",
    latest: {
      latestPrice: 85.36,
      latestPriceDate: "2026-08-14",
      latestPriceSource: "yahoo",
      valuationAnchorPrice: 86.06,
      valuationAnchorDate: "2026-07-30",
      baseFairValue: 90.7098136141649,
      targetPrice3Y: 114.69542892318529
    },
    priceHistory: [
      { date: "2026-07-30", close: 86.06, source: "yahoo" },
      { date: "2026-08-14", close: 85.36, source: "yahoo" }
    ],
    history: [{
      periodId: "official-issuer-pit-lseg-fy2026-q2",
      label: "FY2026 Q2",
      asOfDate: "2026-07-30",
      fairValue: 90.7098136141649,
      priceAtDate: 86.06,
      currentPrice: 86.06,
      methodOutputs: [
        { key: "normalized-earnings-power", value: 99.75863504307831 },
        { key: "fcfe-dcf", value: 79.19313179554815 }
      ],
      dataSnapshot: {
        valuationSemantics: {
          modelVersion: "pit-valuation-v55-actual-value-and-owner-audit-2026-08-30",
          fairValueFormula: "56% normalized earnings power + 44% five-year FCFE DCF",
          scoreInputs: {
            sharesM: 497,
            valuationFreeCashFlow: 2700,
            methodWeights: {
              "normalized-earnings-power": 0.56,
              "fcfe-dcf": 0.44
            }
          }
        }
      }
    }],
    methodCards: [],
    scenarios: [],
    warnings: [],
    dataQuality: { modelVersion: "pit-valuation-v55-actual-value-and-owner-audit-2026-08-30" },
    ...overrides
  };
}

test("LSEG parent-economic FCFE DCF reproduces the audited £102.884651 per share", () => {
  const dcf = buildParentEconomicFcfeDcf();

  close(dcf.annualCashFlows[0].presentValueM, 2_376.1467889908254);
  close(dcf.annualCashFlows[1].presentValueM, 2_407.2047807423614);
  close(dcf.annualCashFlows[2].presentValueM, 2_432.3779621923522);
  close(dcf.annualCashFlows[3].presentValueM, 2_422.8142218429716);
  close(dcf.annualCashFlows[4].presentValueM, 2_404.7461293038778);
  close(dcf.explicitPresentValueM, 12_043.289883072388);
  close(dcf.terminalValueM, 58_346.15384615384);
  close(dcf.terminalPresentValueM, 37_920.996654407296);
  close(dcf.equityValueM, 49_964.28653747968);
  close(dcf.fairValue, 102.88465095662848);
  close(dcf.terminalValueShare, 0.7589620363329244);
  assert.equal(dcf.discountTiming, "year_end");
  assert.equal(dcf.discountRateType, "levered_cost_of_equity");
  assert.equal(dcf.ownershipBasis, "parent_common_equity");
  assert.equal(dcf.netDebtDeductedM, 0);
  assert.equal(dcf.nciDeductedM, 0);
});

test("LSEG DCF reproduces the 15-cell Ke and terminal-growth sensitivity table", () => {
  const expected = [
    [113.65, 122.13, 132.32],
    [104.66, 111.70, 120.03],
    [96.95, 102.88, 109.80],
    [90.28, 95.33, 101.15],
    [84.45, 88.78, 93.74]
  ];
  const costs = [0.08, 0.085, 0.09, 0.095, 0.10];
  const growthRates = [0.02, 0.025, 0.03];

  for (let row = 0; row < costs.length; row += 1) {
    for (let column = 0; column < growthRates.length; column += 1) {
      const value = lsegDcfSensitivity({
        costOfEquity: costs[row],
        terminalGrowth: growthRates[column]
      });
      close(value, expected[row][column], 0.0051);
    }
  }
});

test("LSEG risk-adjusted triangulation is calculated from disclosed components", () => {
  const valuation = buildLsegValuation();

  close(valuation.dcf.fairValue, 102.88465095662848);
  close(valuation.adjustedEpsValue, 96.06);
  close(valuation.sotpPerShare, 117.66);
  close(valuation.grossFairValue, 105.26986038265139);
  close(valuation.riskReservePerShare, 1.7502892440490252);
  close(valuation.fairValue, 103.51957113860236);
  close(
    LSEG_PARENT_ECONOMIC_MODEL.weights.dcf +
      LSEG_PARENT_ECONOMIC_MODEL.weights.sotp +
      LSEG_PARENT_ECONOMIC_MODEL.weights.adjustedEps,
    1
  );
});

test("LSEG overlay adds a dated current node without rewriting historical PIT rows", () => {
  const original = awsLsegSnapshot();
  const overlaid = applyLsegValuationOverlay(original);
  const latestRow = overlaid.history.at(-1);
  const scoreInputs = latestRow.dataSnapshot.valuationSemantics.scoreInputs;

  assert.equal(original.history.length, 1);
  assert.equal(overlaid.history.length, 2);
  assert.equal(overlaid.history[0].fairValue, 90.7098136141649);
  assert.equal(latestRow.periodId, "lseg-parent-economic-2026-08-28");
  assert.equal(latestRow.asOfDate, "2026-08-28");
  close(latestRow.dcfFairValue, 102.88465095662848);
  close(overlaid.latest.baseFairValue, 103.51957113860236);
  assert.equal(overlaid.latest.valuationKind, "risk_adjusted_triangulation");
  assert.equal(scoreInputs.issuerReportedEquityFcfM, 2700);
  assert.equal(scoreInputs.parentEconomicFcfe2026M, 2350);
  assert.equal(scoreInputs.parentAttributionSource, "analyst_estimate");
  assert.equal(scoreInputs.sharesM, 485.634019);
  assert.equal(scoreInputs.shareBasis, "current_ordinary_shares_ex_treasury");
  assert.equal(scoreInputs.netDebtDeductedM, 0);
  assert.equal(scoreInputs.nciDeductedM, 0);
  close(scoreInputs.previousPlatformHeadlineFairValue, 90.7098136141649);
  close(scoreInputs.previousPlatformDcfFairValue, 79.19313179554815);
  assert.equal(scoreInputs.sensitivity.length, 5);
  assert.equal(scoreInputs.sensitivity.every((row) => row.values.length === 3), true);
  assert.strictEqual(applyLsegValuationOverlay(overlaid), overlaid);
});

test("LSEG fair value never uses market price as an input", () => {
  const lowPrice = applyLsegValuationOverlay(awsLsegSnapshot({
    latest: { latestPrice: 40, latestPriceDate: "2026-08-14" },
    priceHistory: [{ date: "2026-08-14", close: 40 }]
  }));
  const highPrice = applyLsegValuationOverlay(awsLsegSnapshot({
    latest: { latestPrice: 160, latestPriceDate: "2026-08-14" },
    priceHistory: [{ date: "2026-08-14", close: 160 }]
  }));

  close(lowPrice.latest.baseFairValue, highPrice.latest.baseFairValue);
  close(lowPrice.latest.dcfFairValue, highPrice.latest.dcfFairValue);
  assert.notEqual(lowPrice.latest.upsideToBase, highPrice.latest.upsideToBase);
});

test("LSEG overlay leaves every other ticker unchanged", () => {
  const msft = { ticker: "MSFT", latest: { baseFairValue: 500 } };
  assert.strictEqual(applyLsegValuationOverlay(msft), msft);
});

test("a newer persisted LSEG valuation node supersedes the dated analyst overlay", () => {
  const snapshot = awsLsegSnapshot({
    history: [
      ...awsLsegSnapshot().history,
      {
        periodId: "official-issuer-pit-lseg-fy2026-q3",
        asOfDate: "2026-11-05",
        fairValue: 108.25
      }
    ]
  });

  assert.strictEqual(applyLsegValuationOverlay(snapshot), snapshot);
  assert.equal(snapshot.history.at(-1).fairValue, 108.25);
});
