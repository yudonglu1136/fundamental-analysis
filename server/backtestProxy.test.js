import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicHoldingsProxy,
  buildTrailingAwarePublicHoldingsProxy
} from "./backtestProxy.js";
import { simulateDriftedPortfolio } from "./backtestEngine.js";

const dates = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"];
const prices = new Map([
  ["SPY", new Map(dates.map((date, index) => [date, 100 + index]))],
  ["PUBLIC", new Map(dates.map((date, index) => [date, 50 + index]))],
  ["SECOND", new Map(dates.map((date, index) => [date, 70 + index]))],
  ["GAPPY", new Map([[dates[0], 30], [dates[2], 32], [dates[3], 33]])]
]);

function rebalance(weights, unpricedPositions = [{
  issuer: "PRIVATE",
  cusip: "PRIVATE",
  weight: 0.55,
  value: 55
}]) {
  return {
    reportDate: "2023-12-31",
    filingDate: "2024-01-01",
    executionDate: dates[0],
    selectedValue: 100,
    selectedPositions: 4,
    pricedPositions: weights.length,
    coveragePct: weights.reduce((sum, row) => sum + row.weight, 0),
    cashWeight: 1 - weights.reduce((sum, row) => sum + row.weight, 0),
    unpricedPositions,
    weights
  };
}

test("public proxy preserves selected-book weights beside normalized proxy weights", () => {
  const result = buildPublicHoldingsProxy({
    rebalances: [rebalance([
      { ticker: "PUBLIC", issuer: "Public Corp", weight: 0.3, value: 30 },
      { ticker: "SECOND", issuer: "Second Corp", weight: 0.15, value: 15 }
    ])],
    tradingDates: dates,
    priceMaps: prices,
    endDate: dates.at(-1)
  });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.minimumSelectedBookCoverage - 0.45) < 1e-12);
  assert.ok(Math.abs(result.averageSelectedBookCoverage - 0.45) < 1e-12);
  assert.ok(Math.abs(result.maximumExcludedBookWeight - 0.55) < 1e-12);
  assert.equal(result.minimumIncludedPositions, 2);
  assert.equal(result.rebalances[0].weights[0].reportedBookWeight, 0.3);
  assert.ok(Math.abs(result.rebalances[0].weights[0].proxyWeight - 2 / 3) < 1e-12);
  assert.ok(Math.abs(result.rebalances[0].weights[0].weight - 2 / 3) < 1e-12);
  assert.equal(result.rebalances[0].cashWeight, 0);
  assert.equal(result.rebalances[0].proxyNormalizationFactor, 1 / 0.45);
  assert.deepEqual(result.topExcludedHoldings, [{
    ticker: null,
    issuer: "PRIVATE",
    maxExcludedBookWeight: 0.55
  }]);

  const simulation = simulateDriftedPortfolio({
    rebalances: result.rebalances,
    tradingDates: dates,
    priceMaps: prices,
    benchmarkSymbol: "SPY",
    endDate: dates.at(-1)
  });
  assert.equal(simulation.ok, true);
  assert.equal(simulation.equity.length, dates.length);
  const publicContribution = simulation.quarterContributions[0].contributions
    .find((holding) => holding.ticker === "PUBLIC");
  assert.equal(publicContribution.reportedBookWeight, 0.3);
  assert.ok(Math.abs(publicContribution.proxyWeight - 2 / 3) < 1e-12);
});

test("proxy excludes an active-period gap and reports the top excluded holding", () => {
  const result = buildPublicHoldingsProxy({
    rebalances: [rebalance([
      { ticker: "PUBLIC", issuer: "Public Corp", weight: 0.25, value: 25 },
      { ticker: "SECOND", issuer: "Second Corp", weight: 0.1, value: 10 },
      { ticker: "GAPPY", issuer: "Gappy Corp", weight: 0.1, value: 10 }
    ], [])],
    tradingDates: dates,
    priceMaps: prices,
    endDate: dates.at(-1)
  });
  assert.equal(result.ok, true);
  assert.equal(result.minimumSelectedBookCoverage, 0.35);
  assert.deepEqual(result.rebalances[0].weights.map((row) => row.ticker), ["PUBLIC", "SECOND"]);
  assert.equal(
    result.rebalances[0].unpricedPositions.find((row) => row.ticker === "GAPPY")?.reason,
    "incomplete_active_adjusted_price_history"
  );
  assert.deepEqual(result.topExcludedHoldings, [{
    ticker: "GAPPY",
    issuer: "Gappy Corp",
    maxExcludedBookWeight: 0.1
  }]);
});

test("a later FISV gap does not erase an earlier complete proxy interval", () => {
  const intervalDates = [
    "2025-11-07",
    "2025-11-10",
    "2025-11-11",
    "2025-11-12",
    "2025-11-13"
  ];
  const intervalPrices = new Map([
    ["SPY", new Map(intervalDates.map((date, index) => [date, 100 + index]))],
    ["PUBLIC", new Map(intervalDates.map((date, index) => [date, 50 + index]))],
    ["SECOND", new Map(intervalDates.map((date, index) => [date, 70 + index]))],
    ["FISV", new Map(intervalDates
      .filter((date) => date !== "2025-11-12")
      .map((date, index) => [date, 30 + index]))]
  ]);
  const weights = [
    { ticker: "PUBLIC", issuer: "Public Corp", weight: 0.2, value: 20 },
    { ticker: "SECOND", issuer: "Second Corp", weight: 0.15, value: 15 },
    { ticker: "FISV", issuer: "Fiserv", weight: 0.25, value: 25 }
  ];
  const rebalances = [
    { ...rebalance(weights, []), executionDate: "2025-11-07" },
    {
      ...rebalance(weights, []),
      reportDate: "2025-09-30",
      executionDate: "2025-11-11"
    }
  ];

  const strict = simulateDriftedPortfolio({
    rebalances,
    tradingDates: intervalDates,
    priceMaps: intervalPrices,
    benchmarkSymbol: "SPY",
    endDate: intervalDates.at(-1)
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.failure.code, "missing_active_price");
  assert.equal(strict.failure.date, "2025-11-12");
  assert.deepEqual(strict.failure.tickers, ["FISV"]);

  const proxy = buildPublicHoldingsProxy({
    rebalances,
    tradingDates: intervalDates,
    priceMaps: intervalPrices,
    endDate: intervalDates.at(-1)
  });
  assert.equal(proxy.ok, true);
  assert.deepEqual(
    proxy.rebalances[0].weights.map((row) => row.ticker),
    ["PUBLIC", "SECOND", "FISV"]
  );
  assert.equal(
    proxy.rebalances[0].unpricedPositions.some((row) => row.ticker === "FISV"),
    false
  );
  assert.equal(proxy.rebalances[0].selectedBookCoverage, 0.6);
  assert.deepEqual(
    proxy.rebalances[1].weights.map((row) => row.ticker),
    ["PUBLIC", "SECOND"]
  );
  assert.equal(proxy.rebalances[1].selectedBookCoverage, 0.35);
  assert.equal(
    proxy.rebalances[1].unpricedPositions.find((row) => row.ticker === "FISV")?.reason,
    "incomplete_active_adjusted_price_history"
  );

  const proxySimulation = simulateDriftedPortfolio({
    rebalances: proxy.rebalances,
    tradingDates: intervalDates,
    priceMaps: intervalPrices,
    benchmarkSymbol: "SPY",
    endDate: intervalDates.at(-1)
  });
  assert.equal(proxySimulation.ok, true);
  assert.equal(proxySimulation.equity.length, intervalDates.length);
});

test("proxy enforces an irreducible 30% selected-book coverage floor", () => {
  const result = buildPublicHoldingsProxy({
    rebalances: [rebalance([
      { ticker: "PUBLIC", issuer: "Public Corp", weight: 0.16, value: 16 },
      { ticker: "SECOND", issuer: "Second Corp", weight: 0.13, value: 13 }
    ])],
    tradingDates: dates,
    priceMaps: prices,
    endDate: dates.at(-1),
    minimumCoverage: 0.1
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "proxy_coverage_below_minimum");
  assert.ok(Math.abs(result.failure.coveragePct - 0.29) < 1e-12);
  assert.equal(result.failure.minimumCoverage, 0.3);
  assert.deepEqual(result.failure.topExcludedHoldings, [{
    ticker: null,
    issuer: "PRIVATE",
    cusip: "PRIVATE",
    reportedBookWeight: 0.55,
    reason: "unavailable_for_public_holdings_proxy"
  }]);
});

test("a one-stock sleeve is rejected even when duplicate rows make its coverage high", () => {
  const result = buildPublicHoldingsProxy({
    rebalances: [rebalance([
      { ticker: "PUBLIC", issuer: "Public Corp", weight: 0.7, value: 70 },
      { ticker: "PUBLIC", issuer: "Public Corp class", weight: 0.1, value: 10 }
    ], [])],
    tradingDates: dates,
    priceMaps: prices,
    endDate: dates.at(-1)
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "proxy_included_positions_below_minimum");
  assert.equal(result.failure.includedPositions, 1);
  assert.equal(result.failure.minimumPositions, 2);
});

test("bounded common trailing lag is resolved before sleeve completeness", () => {
  const laggedPrices = new Map([
    ["SPY", prices.get("SPY")],
    ["PUBLIC", new Map(dates.slice(0, 3).map((date, index) => [date, 50 + index]))],
    ["SECOND", new Map(dates.slice(0, 3).map((date, index) => [date, 70 + index]))]
  ]);
  const result = buildTrailingAwarePublicHoldingsProxy({
    rebalances: [rebalance([
      { ticker: "PUBLIC", issuer: "Public Corp", weight: 0.3, value: 30 },
      { ticker: "SECOND", issuer: "Second Corp", weight: 0.2, value: 20 }
    ])],
    tradingDates: dates,
    priceMaps: laggedPrices,
    requestedEnd: dates.at(-1),
    maxLagDays: 7
  });

  assert.equal(result.trailingPriceEnd.reason, "bounded_trailing_vendor_lag");
  assert.equal(result.trailingPriceEnd.adjusted, true);
  assert.equal(result.effectiveEnd, dates[2]);
  assert.equal(result.ok, true);
  assert.equal(result.minimumSelectedBookCoverage, 0.5);
  assert.equal(result.minimumIncludedPositions, 2);
});
