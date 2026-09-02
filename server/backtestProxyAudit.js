export const minimumPublicHoldingsProxyCoverage = 0.3;
export const minimumPublicHoldingsProxyPositions = 2;

export function normalizedProxyCoverageFloor(value) {
  const parsed = Number(value);
  return Math.max(
    minimumPublicHoldingsProxyCoverage,
    Math.min(
      0.9,
      Number.isFinite(parsed) ? parsed : minimumPublicHoldingsProxyCoverage
    )
  );
}

export function normalizedProxyPositionFloor(value) {
  const parsed = Number(value);
  return Math.max(
    minimumPublicHoldingsProxyPositions,
    Math.min(
      60,
      Number.isFinite(parsed) ? Math.round(parsed) : minimumPublicHoldingsProxyPositions
    )
  );
}

/**
 * Re-audit a persisted proxy at every trust boundary. Version matching alone
 * is not evidence that its selected-book sleeve still meets the public floor.
 */
export function auditPublicHoldingsProxyPayload(
  payload,
  {
    minimumCoverage = process.env.BACKTEST_MIN_PROXY_COVERAGE,
    minimumPositions = process.env.BACKTEST_MIN_PROXY_POSITIONS
  } = {}
) {
  const configuredCoverageFloor = normalizedProxyCoverageFloor(minimumCoverage);
  const configuredPositionFloor = normalizedProxyPositionFloor(minimumPositions);
  const declaredCoverageFloor = normalizedProxyCoverageFloor(
    payload?.proxy?.minimumProxyCoverage
  );
  const declaredPositionFloor = normalizedProxyPositionFloor(
    payload?.proxy?.minimumProxyPositions
  );
  const coverageFloor = Math.max(configuredCoverageFloor, declaredCoverageFloor);
  const positionFloor = Math.max(configuredPositionFloor, declaredPositionFloor);
  const minimumSelectedBookCoverage = Number(
    payload?.proxy?.minimumSelectedBookCoverage
  );
  const minimumIncludedPositions = Number(payload?.proxy?.minimumIncludedPositions);
  const averageSelectedBookCoverage = Number(
    payload?.proxy?.averageSelectedBookCoverage
  );
  const maximumExcludedBookWeight = Number(
    payload?.proxy?.maximumExcludedBookWeight
  );
  const rebalances = Array.isArray(payload?.rebalances) ? payload.rebalances : [];

  if (!Number.isFinite(minimumSelectedBookCoverage) ||
      minimumSelectedBookCoverage + 1e-12 < coverageFloor) {
    return { ok: false, reason: "proxy_summary_coverage_below_minimum" };
  }
  if (!Number.isInteger(minimumIncludedPositions) ||
      minimumIncludedPositions < positionFloor) {
    return { ok: false, reason: "proxy_summary_positions_below_minimum" };
  }
  if (!rebalances.length) {
    return { ok: false, reason: "proxy_rebalances_missing" };
  }
  const observedCoverages = [];
  const observedPositionCounts = [];
  for (const rebalance of rebalances) {
    const coverage = Number(
      rebalance?.selectedBookCoverage ?? rebalance?.reportedCoveragePct
    );
    const includedPositions = Number(
      rebalance?.includedPositions ?? rebalance?.pricedPositions
    );
    if (!Number.isFinite(coverage) || coverage > 1 + 1e-12 ||
        coverage + 1e-12 < coverageFloor) {
      return { ok: false, reason: "proxy_rebalance_coverage_below_minimum" };
    }
    if (!Number.isInteger(includedPositions) || includedPositions < positionFloor) {
      return { ok: false, reason: "proxy_rebalance_positions_below_minimum" };
    }
    observedCoverages.push(coverage);
    observedPositionCounts.push(includedPositions);
  }
  const observedMinimumCoverage = Math.min(...observedCoverages);
  const observedAverageCoverage = observedCoverages.reduce(
    (sum, value) => sum + value,
    0
  ) / observedCoverages.length;
  const observedMinimumPositions = Math.min(...observedPositionCounts);
  const observedMaximumExcludedWeight = Math.max(
    ...observedCoverages.map((value) => Math.max(0, 1 - value))
  );
  if (Math.abs(minimumSelectedBookCoverage - observedMinimumCoverage) > 1e-12) {
    return { ok: false, reason: "proxy_summary_minimum_coverage_mismatch" };
  }
  if (minimumIncludedPositions !== observedMinimumPositions) {
    return { ok: false, reason: "proxy_summary_minimum_positions_mismatch" };
  }
  if (!Number.isFinite(averageSelectedBookCoverage) ||
      Math.abs(averageSelectedBookCoverage - observedAverageCoverage) > 1e-12) {
    return { ok: false, reason: "proxy_summary_average_coverage_mismatch" };
  }
  if (!Number.isFinite(maximumExcludedBookWeight) ||
      Math.abs(maximumExcludedBookWeight - observedMaximumExcludedWeight) > 1e-12) {
    return { ok: false, reason: "proxy_summary_excluded_weight_mismatch" };
  }
  return {
    ok: true,
    coverageFloor,
    positionFloor,
    minimumSelectedBookCoverage,
    minimumIncludedPositions
  };
}
