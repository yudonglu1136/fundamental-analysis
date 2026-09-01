import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustedClosePriceMap,
  filingExecutionDecision,
  nextTradingSessionAfter,
  simulateDriftedPortfolio
} from "./backtestEngine.js";

function map(rows) {
  return new Map(rows);
}

test("13F execution is always on the first session strictly after public acceptance date", () => {
  const sessions = ["2024-05-16", "2024-05-17", "2024-05-20", "2024-05-21"];
  assert.equal(nextTradingSessionAfter(sessions, "2024-05-17T08:00:00-04:00"), "2024-05-20");
  assert.equal(nextTradingSessionAfter(sessions, "2024-05-17T18:00:00-04:00"), "2024-05-20");

  const accepted = filingExecutionDecision({
    filingDate: "2024-05-17",
    acceptanceDateTime: "2024-05-17T18:00:00-04:00"
  }, sessions);
  assert.equal(accepted.executionDate, "2024-05-20");
  assert.equal(accepted.executionTimestampSource, "sec_acceptance_datetime");
  assert.equal(accepted.usedLegacyFilingDateFallback, false);

  const legacy = filingExecutionDecision({ filingDate: "2024-05-17" }, sessions);
  assert.equal(legacy.executionDate, "2024-05-20");
  assert.equal(legacy.executionTimestampSource, "legacy_filing_date");
  assert.equal(legacy.usedLegacyFilingDateFallback, true);
});

test("drifted holdings produce one reconciled equity and attribution engine", () => {
  const tradingDates = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"];
  const priceMaps = new Map([
    ["SPY", map([
      ["2024-01-02", 100], ["2024-01-03", 101], ["2024-01-04", 102], ["2024-01-05", 103]
    ])],
    ["A", map([
      ["2024-01-02", 100], ["2024-01-03", 110], ["2024-01-04", 120], ["2024-01-05", 132]
    ])],
    ["B", map([
      ["2024-01-02", 100], ["2024-01-03", 90], ["2024-01-04", 80], ["2024-01-05", 80]
    ])]
  ]);
  const rebalances = [
    {
      reportDate: "2023-12-31",
      filingDate: "2024-01-01",
      executionDate: "2024-01-02",
      coveragePct: 1,
      cashWeight: 0,
      selectedPositions: 2,
      pricedPositions: 2,
      weights: [
        { ticker: "A", issuer: "A", sector: "Technology", industry: "Software", value: 50, weight: 0.5 },
        { ticker: "B", issuer: "B", sector: "Financials", industry: "Banks", value: 50, weight: 0.5 }
      ]
    },
    {
      reportDate: "2024-03-31",
      filingDate: "2024-01-03",
      executionDate: "2024-01-04",
      coveragePct: 1,
      cashWeight: 0,
      selectedPositions: 1,
      pricedPositions: 1,
      weights: [{ ticker: "A", issuer: "A", sector: "Technology", industry: "Software", value: 100, weight: 1 }]
    }
  ];

  const result = simulateDriftedPortfolio({ rebalances, tradingDates, priceMaps });
  assert.equal(result.ok, true);
  assert.equal(result.equity.length, 4);
  assert.ok(Math.abs(result.equity[1].value - 1) < 1e-12);
  assert.ok(Math.abs(result.equity[2].value - 1) < 1e-12);
  assert.ok(Math.abs(result.equity[3].value - 1.1) < 1e-12);
  assert.equal(result.quarterContributions.length, 2);
  assert.equal(result.quarterContributions[0].endDate, "2024-01-04");
  assert.ok(Math.abs(result.quarterContributions[0].portfolioReturn) < 1e-12);
  assert.ok(Math.abs(result.quarterContributions[1].portfolioReturn - 0.1) < 1e-12);
  for (const quarter of result.quarterContributions) {
    const contributionSum = quarter.contributions.reduce(
      (sum, holding) => sum + holding.contributionPct,
      0
    );
    assert.ok(Math.abs(contributionSum - quarter.portfolioReturn) < 1e-12);
    assert.ok(Math.abs(quarter.attributionReconciliation) < 1e-12);
    assert.ok(Math.abs(quarter.sectorContributionReturn - quarter.portfolioReturn) < 1e-12);
    assert.ok(Math.abs(quarter.sectorAttributionReconciliation) < 1e-12);
    assert.ok(Math.abs(quarter.industryContributionReturn - quarter.portfolioReturn) < 1e-12);
    assert.ok(Math.abs(quarter.industryAttributionReconciliation) < 1e-12);
  }
  assert.deepEqual(result.quarterContributions[0].sectorContributions.map((row) => row.label), [
    "Technology",
    "Financials"
  ]);
  assert.ok(Math.abs(result.reconciliation.headlineTotalReturn - 0.1) < 1e-12);
  assert.ok(Math.abs(result.reconciliation.attributionTotalReturn - 0.1) < 1e-12);
  assert.ok(Math.abs(result.reconciliation.difference) < 1e-12);
});

test("unpriced execution weight remains cash rather than being renormalized", () => {
  const tradingDates = ["2024-01-02", "2024-01-03"];
  const priceMaps = new Map([
    ["SPY", map([["2024-01-02", 100], ["2024-01-03", 100]])],
    ["A", map([["2024-01-02", 100], ["2024-01-03", 110]])]
  ]);
  const result = simulateDriftedPortfolio({
    tradingDates,
    priceMaps,
    rebalances: [{
      reportDate: "2023-12-31",
      filingDate: "2024-01-01",
      executionDate: "2024-01-02",
      coveragePct: 0.8,
      cashWeight: 0.2,
      selectedPositions: 2,
      pricedPositions: 1,
      weights: [{ ticker: "A", issuer: "A", value: 80, weight: 0.8 }]
    }]
  });

  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.equity.at(-1).value - 1.08) < 1e-12);
  assert.ok(Math.abs(result.quarterContributions[0].portfolioReturn - 0.08) < 1e-12);
  assert.equal(result.quarterContributions[0].cashWeight, 0.2);
});

test("adjusted-close mapping neutralizes a split and includes the total-return basis", () => {
  const securityMap = adjustedClosePriceMap([
    { date: "2024-01-02", close: 100, adjustedClose: 50 },
    { date: "2024-01-03", close: 50, adjustedClose: 50 }
  ]);
  const result = simulateDriftedPortfolio({
    tradingDates: ["2024-01-02", "2024-01-03"],
    priceMaps: new Map([
      ["SPY", map([["2024-01-02", 100], ["2024-01-03", 100]])],
      ["A", securityMap]
    ]),
    rebalances: [{
      reportDate: "2023-12-31",
      filingDate: "2024-01-01",
      executionDate: "2024-01-02",
      coveragePct: 1,
      cashWeight: 0,
      selectedPositions: 1,
      pricedPositions: 1,
      weights: [{ ticker: "A", issuer: "A", value: 100, weight: 1 }]
    }]
  });

  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.equity.at(-1).value - 1) < 1e-12);
  assert.ok(Math.abs(result.quarterContributions[0].portfolioReturn) < 1e-12);
});

test("a missing active price fails closed instead of booking zero return", () => {
  const result = simulateDriftedPortfolio({
    tradingDates: ["2024-01-02", "2024-01-03"],
    priceMaps: new Map([
      ["SPY", map([["2024-01-02", 100], ["2024-01-03", 101]])],
      ["A", map([["2024-01-02", 100]])]
    ]),
    rebalances: [{
      reportDate: "2023-12-31",
      filingDate: "2024-01-01",
      executionDate: "2024-01-02",
      coveragePct: 1,
      cashWeight: 0,
      selectedPositions: 1,
      pricedPositions: 1,
      weights: [{ ticker: "A", issuer: "A", value: 100, weight: 1 }]
    }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "incomplete_price_coverage");
  assert.equal(result.failure.code, "missing_active_price");
  assert.equal(result.failure.date, "2024-01-03");
  assert.deepEqual(result.failure.tickers, ["A"]);
  assert.match(result.failure.policy, /fail_closed/);
  assert.equal(result.equity.length, 1);
});

test("multiple 13F rebalances on one execution date fail closed", () => {
  const shared = {
    filingDate: "2024-01-01",
    executionDate: "2024-01-02",
    coveragePct: 1,
    cashWeight: 0,
    selectedPositions: 1,
    pricedPositions: 1,
    weights: [{ ticker: "A", issuer: "A", value: 100, weight: 1 }]
  };
  const result = simulateDriftedPortfolio({
    tradingDates: ["2024-01-02", "2024-01-03"],
    priceMaps: new Map([
      ["SPY", map([["2024-01-02", 100], ["2024-01-03", 101]])],
      ["A", map([["2024-01-02", 100], ["2024-01-03", 101]])]
    ]),
    rebalances: [
      { ...shared, reportDate: "2023-09-30" },
      { ...shared, reportDate: "2023-12-31" }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "duplicate_execution_date");
  assert.equal(result.failure.date, "2024-01-02");
  assert.deepEqual(result.equity, []);
});
