export function guidanceMetricsBeforeNextFinancialRelease(metrics, nextFinancialAvailableAt) {
  return (metrics || []).filter((metric) => {
    const observedAt = String(metric?.observed_at || "").slice(0, 10);
    if (!observedAt) return false;
    return !nextFinancialAvailableAt || observedAt < String(nextFinancialAvailableAt).slice(0, 10);
  });
}

export function nextDistinctFinancialReleaseDate(rows, currentFinancialAvailableAt) {
  const current = String(currentFinancialAvailableAt || "").slice(0, 10);
  if (!current) return null;
  return (rows || [])
    .map((row) => String(row?.financialAvailableAt || "").slice(0, 10))
    .filter((date) => date && date > current)
    .sort()[0] || null;
}

export function guidanceBoundaryAudit(metrics, includedMetrics, nextFinancialAvailableAt) {
  const included = new Set((includedMetrics || []).map((metric) => String(metric?.id ?? metric?.evidence_id ?? "")));
  const excluded = (metrics || []).filter((metric) => !included.has(String(metric?.id ?? metric?.evidence_id ?? "")));
  return {
    policy: "guidance observed before the next distinct financial release only",
    nextFinancialAvailableAt: nextFinancialAvailableAt || null,
    candidateMetricCount: (metrics || []).length,
    includedMetricCount: (includedMetrics || []).length,
    excludedMetricCount: excluded.length,
    excludedObservedAt: [...new Set(excluded.map((metric) => metric?.observed_at).filter(Boolean))].sort()
  };
}
