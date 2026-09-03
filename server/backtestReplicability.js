const privateBeforeExecutionPolicies = Object.freeze([
  Object.freeze({
    guruId: "nelson-peltz",
    reportDate: "2026-06-30",
    quarterLabel: "2026 Q2",
    cusips: Object.freeze(["G4474Y214"]),
    ticker: "JHG",
    issuer: "Janus Henderson Group plc",
    code: "reported_security_private_before_execution",
    effectiveDate: "2026-06-30",
    publicTradingEndExclusive: "2026-07-01",
    sources: Object.freeze([
      "https://www.sec.gov/Archives/edgar/data/1274173/000110465926079401/tm2619303d2_8k.htm"
    ])
  })
]);

function normalized(value) {
  return String(value || "").trim();
}

function normalizedCusip(value) {
  return normalized(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function finiteFraction(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function policyForHolding({ guruId, reportDate, holding } = {}) {
  const cusip = normalizedCusip(holding?.cusip);
  return privateBeforeExecutionPolicies.find((policy) =>
    policy.guruId === normalized(guruId) &&
    policy.reportDate === normalized(reportDate) &&
    policy.cusips.includes(cusip)
  ) || null;
}

function privateRolloverPolicyForHolding({ guruId, holding } = {}) {
  const cusip = normalizedCusip(holding?.cusip);
  return privateBeforeExecutionPolicies.find((policy) =>
    policy.guruId === normalized(guruId) &&
    policy.cusips.includes(cusip)
  ) || null;
}

/**
 * Identify the holder-specific private rollover transition while preserving
 * its non-public, non-cash nature. The simulator may use the transition date
 * to stop requesting public prices, but it must fail or use a separately
 * labelled public-sleeve proxy once the private interest replaces the stock.
 */
export function knownPrivateRolloverTransition({ guruId, holding } = {}) {
  const policy = privateRolloverPolicyForHolding({ guruId, holding });
  if (!policy) return null;
  return {
    actionId: "trian-janus-henderson-private-rollover-2026",
    actionType: "private_rollover",
    considerationType: "private_equity_rollover",
    effectiveDate: policy.effectiveDate,
    publicTradingEndExclusive: policy.publicTradingEndExclusive,
    ticker: normalized(holding?.ticker) || policy.ticker,
    issuer: normalized(holding?.issuer) || policy.issuer,
    cusip: normalizedCusip(holding?.cusip),
    syntheticPriceUsed: false,
    publicReplicable: false,
    sources: [...policy.sources]
  };
}

/**
 * API-safe annotation for dashboard holdings that ceased public trading after
 * the disclosed quarter. This is intentionally holder- and quarter-specific:
 * it must not relabel other JHG owners, older Trian quarters, or a recycled
 * ticker. It supplies status and evidence only—never a price or successor.
 */
export function manager13fHoldingPublicTradingAnnotation({
  guruId,
  reportDate,
  holding
} = {}) {
  const policy = policyForHolding({ guruId, reportDate, holding });
  if (!policy) return null;
  return {
    code: "reported_security_private_after_reported_quarter",
    publicTradingStatus: "private_after_reported_quarter",
    publicReplicable: false,
    syntheticPriceUsed: false,
    reportDate: policy.reportDate,
    quarterLabel: policy.quarterLabel,
    effectiveDate: policy.effectiveDate,
    publicTradingEndExclusive: policy.publicTradingEndExclusive,
    ticker: normalized(holding?.ticker) || policy.ticker,
    issuer: normalized(holding?.issuer) || policy.issuer,
    cusip: normalizedCusip(holding?.cusip),
    reasonEn:
      "This reported holding rolled into a private interest after quarter-end. Public trading ended before the 13F became actionable, so public-market valuation and copy execution are unavailable.",
    reasonZh:
      "该申报持仓在季度末后转为非公开权益。其公开交易在 13F 可执行前已经结束，因此无法进行公开市场估值或复制交易。",
    sources: [...policy.sources]
  };
}

/**
 * Classify a known non-public execution gap without changing the execution
 * date, substituting a successor, or creating a synthetic price. Callers
 * should use this only for a holding that is already unpriced at execution.
 */
export function knownNonPublicExecutionLimitation({
  guruId,
  reportDate,
  executionDate,
  holding
} = {}) {
  const policy = policyForHolding({ guruId, reportDate, holding });
  if (!policy) return null;
  return {
    code: policy.code,
    publicTradingStatus: "private_before_execution",
    reportDate: policy.reportDate,
    quarterLabel: policy.quarterLabel,
    executionDate: normalized(executionDate) || null,
    ticker: normalized(holding?.ticker) || policy.ticker,
    issuer: normalized(holding?.issuer) || policy.issuer,
    cusip: normalizedCusip(holding?.cusip),
    syntheticPriceUsed: false,
    reasonEn:
      "The reported security was no longer publicly tradable when the 13F filing became actionable; no public execution price exists.",
    reasonZh:
      "该申报证券在 13F 可执行时已不再公开交易，因此不存在公开市场执行价。"
  };
}

function limitationFromPosition(position) {
  const limitation = position?.executionLimitation;
  if (limitation?.code === "reported_security_private_before_execution") {
    return limitation;
  }
  if (position?.reason !== "reported_security_private_before_execution") {
    return null;
  }
  return {
    code: position.reason,
    publicTradingStatus: "private_before_execution",
    ticker: normalized(position?.ticker) || null,
    issuer: normalized(position?.issuer) || null,
    cusip: normalizedCusip(position?.cusip) || null,
    syntheticPriceUsed: false
  };
}

/**
 * Produce the compact, API-safe explanation used by strict failures and
 * separately labelled public-sleeve proxies. It deliberately contains no
 * provider price observations.
 */
export function summarizeManager13fReplicability({
  guruId,
  rebalances = [],
  minimumExecutionCoverage = 0.9
} = {}) {
  const coverageFloor = finiteFraction(minimumExecutionCoverage) ?? 0.9;
  const affectedQuarters = [];

  for (const rebalance of rebalances || []) {
    const holdings = (rebalance?.unpricedPositions || [])
      .map((position) => ({ position, limitation: limitationFromPosition(position) }))
      .filter(({ limitation }) => limitation)
      .map(({ position, limitation }) => ({
        code: limitation.code,
        quarterLabel: limitation.quarterLabel || null,
        ticker: limitation.ticker || normalized(position?.ticker) || null,
        issuer: limitation.issuer || normalized(position?.issuer) || null,
        cusip: limitation.cusip || normalizedCusip(position?.cusip) || null,
        reportedBookWeight: finiteFraction(
          position?.reportedBookWeight ?? position?.weight
        ),
        publicTradingStatus: "private_before_execution",
        syntheticPriceUsed: false
      }));
    if (!holdings.length) continue;
    const coveragePct = finiteFraction(rebalance?.coveragePct);
    affectedQuarters.push({
      reportDate: normalized(rebalance?.reportDate) || null,
      quarterLabel: holdings[0]?.quarterLabel || null,
      executionDate: normalized(rebalance?.executionDate) || null,
      coveragePct,
      minimumExecutionCoverage: coverageFloor,
      strictGateSatisfied: coveragePct != null && coveragePct >= coverageFloor,
      holdings
    });
  }

  if (!affectedQuarters.length) return null;
  const strictUnavailable = affectedQuarters.some((quarter) =>
    !quarter.strictGateSatisfied
  );
  return {
    status: strictUnavailable ? "strict_unavailable" : "limited",
    code: "reported_holding_private_before_execution",
    guruId: normalized(guruId) || null,
    minimumExecutionCoverage: coverageFloor,
    syntheticPriceUsed: false,
    proxyOnlyWhenSeparatelyLabelled: strictUnavailable,
    reasonEn:
      "The 2026 Q2 filing includes JHG, which was no longer publicly tradable when the filing became actionable. Without a public execution price, that quarter cannot satisfy the 90% strict replication gate. No synthetic price is used; any displayed curve is a separately labeled public-sleeve proxy.",
    reasonZh:
      "2026 年 Q2 申报包含 JHG，但该证券在申报可执行时已不再公开交易。由于不存在公开市场执行价，本季度无法满足 90% 严格复制门槛。系统不会虚构价格；如展示曲线，仅为单独标注的公开持仓代理。",
    affectedQuarters
  };
}

export function manager13fReplicabilityPolicies() {
  return privateBeforeExecutionPolicies.map((policy) => ({
    ...policy,
    cusips: [...policy.cusips],
    sources: [...policy.sources]
  }));
}
