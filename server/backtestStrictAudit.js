export const minimumManager13fExecutionCoverage = 0.9;

export function normalizedManager13fExecutionCoverage(value) {
  const parsed = Number(value);
  return Math.max(
    minimumManager13fExecutionCoverage,
    Math.min(
      1,
      Number.isFinite(parsed) ? parsed : minimumManager13fExecutionCoverage
    )
  );
}

/** Re-validate a strict manager curve whenever it crosses a cache boundary. */
export function auditManager13fStrictReadyPayload(
  payload,
  { minimumCoverage = process.env.BACKTEST_MIN_EXECUTION_COVERAGE } = {}
) {
  const configuredFloor = normalizedManager13fExecutionCoverage(minimumCoverage);
  const methodFloorRaw = Number(payload?.method?.minimumExecutionCoverage);
  const qualityFloorRaw = Number(payload?.dataQuality?.minimumExecutionCoverage);
  if (!Number.isFinite(methodFloorRaw) || !Number.isFinite(qualityFloorRaw) ||
      Math.abs(methodFloorRaw - qualityFloorRaw) > 1e-12) {
    return { ok: false, reason: "strict_declared_coverage_floor_mismatch" };
  }
  const coverageFloor = Math.max(
    configuredFloor,
    normalizedManager13fExecutionCoverage(methodFloorRaw)
  );
  const rebalances = Array.isArray(payload?.rebalances) ? payload.rebalances : [];
  if (!rebalances.length) {
    return { ok: false, reason: "strict_rebalances_missing" };
  }
  const coverages = [];
  for (const rebalance of rebalances) {
    const coverage = Number(rebalance?.coveragePct);
    if (!Number.isFinite(coverage) || coverage > 1 + 1e-12 ||
        coverage + 1e-12 < coverageFloor) {
      return { ok: false, reason: "strict_rebalance_coverage_below_minimum" };
    }
    coverages.push(coverage);
  }
  const observedMinimum = Math.min(...coverages);
  const rebalanceAverage = coverages.reduce((sum, value) => sum + value, 0) /
    coverages.length;
  const disclosedMinimum = Number(
    payload?.dataQuality?.minimumObservedExecutionCoverage
  );
  const disclosedAverage = Number(payload?.summary?.averageCoverage);
  if (!Number.isFinite(disclosedMinimum) ||
      Math.abs(disclosedMinimum - observedMinimum) > 1e-12) {
    return { ok: false, reason: "strict_summary_minimum_coverage_mismatch" };
  }
  // `summary.averageCoverage` is the daily holding-period-weighted mean emitted
  // by the simulator. Rebalance rows are only quarter snapshots, so their
  // simple mean is not the same statistic. Validate the disclosed daily mean
  // as a bounded coverage value without pretending the two are comparable.
  if (!Number.isFinite(disclosedAverage) || disclosedAverage < 0 ||
      disclosedAverage > 1 + 1e-12 ||
      disclosedAverage + 1e-12 < observedMinimum) {
    return { ok: false, reason: "strict_summary_average_coverage_invalid" };
  }
  if (!Array.isArray(payload?.equity) || payload.equity.length < 2) {
    return { ok: false, reason: "strict_equity_missing" };
  }
  return {
    ok: true,
    coverageFloor,
    observedMinimum,
    rebalanceAverage,
    disclosedAverage
  };
}
