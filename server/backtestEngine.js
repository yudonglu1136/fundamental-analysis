const dayMs = 24 * 60 * 60 * 1000;
const reconciliationTolerance = 1e-10;

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
}

function quarterLabel(reportDate) {
  const parsed = new Date(reportDate);
  if (Number.isNaN(parsed.getTime())) return reportDate || "Quarter";
  return `${parsed.getUTCFullYear()} Q${Math.floor(parsed.getUTCMonth() / 3) + 1}`;
}

export function adjustedClosePriceMap(points) {
  return new Map((points || [])
    .filter((point) => point?.date && finitePositive(point.adjustedClose) != null)
    .map((point) => [point.date, Number(point.adjustedClose)]));
}

export function nextTradingSessionAfter(tradingDates, publicTimestamp) {
  const publicDate = dateOnly(publicTimestamp);
  if (!publicDate) return null;
  return (tradingDates || [])
    .map((point) => typeof point === "string" ? point : point?.date)
    .find((date) => String(date || "") > publicDate) || null;
}

export function filingExecutionDecision(snapshot, tradingDates) {
  const acceptanceDateTime = snapshot?.acceptanceDateTime || snapshot?.filing?.acceptanceDateTime || "";
  const filingDate = snapshot?.filingDate || snapshot?.filing?.filingDate || "";
  const publicTimestamp = acceptanceDateTime || filingDate;
  const publicDate = dateOnly(publicTimestamp);
  const executionDate = nextTradingSessionAfter(tradingDates, publicTimestamp);
  const usedLegacyFilingDateFallback = !acceptanceDateTime && Boolean(filingDate);

  return {
    executionDate,
    publicTimestamp: publicTimestamp || null,
    publicDate: publicDate || null,
    acceptanceDateTime: acceptanceDateTime || null,
    executionTimestampSource: acceptanceDateTime
      ? "sec_acceptance_datetime"
      : usedLegacyFilingDateFallback
        ? "legacy_filing_date"
        : "missing",
    usedLegacyFilingDateFallback,
    policy: "first_trading_session_strictly_after_public_date_close",
    reason: executionDate
      ? null
      : publicDate
        ? "No later trading session is available in the requested price window."
        : "Neither SEC acceptance timestamp nor filing date is available."
  };
}

function normalizedWeights(rebalance) {
  const byTicker = new Map();
  for (const holding of rebalance?.weights || []) {
    const ticker = String(holding?.ticker || "").trim().toUpperCase();
    const weight = Number(holding?.weight);
    if (!ticker || !Number.isFinite(weight) || weight <= 0) continue;
    const current = byTicker.get(ticker);
    byTicker.set(ticker, current
      ? {
          ...current,
          value: Number(current.value || 0) + Number(holding.value || 0),
          weight: current.weight + weight
        }
      : { ...holding, ticker, weight });
  }
  return [...byTicker.values()];
}

function allocateAtClose(rebalance, portfolioValue, priceMaps) {
  const weights = normalizedWeights(rebalance);
  const weightSum = weights.reduce((sum, holding) => sum + holding.weight, 0);
  if (!weights.length || weightSum > 1 + reconciliationTolerance) {
    return {
      ok: false,
      failure: {
        code: weights.length ? "invalid_weight_sum" : "empty_rebalance",
        date: rebalance?.executionDate || null,
        weightSum
      }
    };
  }

  const missing = [];
  const positions = [];
  for (const holding of weights) {
    const startPrice = finitePositive(priceMaps.get(holding.ticker)?.get(rebalance.executionDate));
    if (startPrice == null) {
      missing.push({ ticker: holding.ticker, weight: holding.weight });
      continue;
    }
    const startValue = portfolioValue * holding.weight;
    positions.push({
      ticker: holding.ticker,
      issuer: holding.issuer,
      sector: holding.sector || null,
      industry: holding.industry || null,
      disclosedValue: holding.value,
      weight: holding.weight,
      startValue,
      startPrice,
      units: startValue / startPrice
    });
  }

  if (missing.length) {
    return {
      ok: false,
      failure: {
        code: "missing_execution_price",
        date: rebalance.executionDate,
        tickers: missing.map((row) => row.ticker),
        missingWeight: missing.reduce((sum, row) => sum + row.weight, 0)
      }
    };
  }

  const explicitCashWeight = Number(rebalance?.cashWeight);
  const cashWeight = Number.isFinite(explicitCashWeight)
    ? explicitCashWeight
    : Math.max(0, 1 - weightSum);
  if (cashWeight < -reconciliationTolerance || Math.abs(weightSum + cashWeight - 1) > reconciliationTolerance) {
    return {
      ok: false,
      failure: {
        code: "invalid_cash_weight",
        date: rebalance.executionDate,
        weightSum,
        cashWeight
      }
    };
  }

  return {
    ok: true,
    rebalance,
    positions,
    startPortfolioValue: portfolioValue,
    cashValue: portfolioValue * Math.max(0, cashWeight),
    cashWeight: Math.max(0, cashWeight),
    weightSum,
    startDate: rebalance.executionDate
  };
}

function markPositions(active, date, priceMaps) {
  const missing = [];
  const values = [];
  for (const position of active.positions) {
    const price = finitePositive(priceMaps.get(position.ticker)?.get(date));
    if (price == null) {
      missing.push({ ticker: position.ticker, weight: position.weight });
      continue;
    }
    values.push({ ...position, endPrice: price, endValue: position.units * price });
  }
  if (missing.length) {
    return {
      ok: false,
      failure: {
        code: "missing_active_price",
        date,
        tickers: missing.map((row) => row.ticker),
        missingWeight: missing.reduce((sum, row) => sum + row.weight, 0)
      }
    };
  }
  return {
    ok: true,
    values,
    portfolioValue: active.cashValue + values.reduce((sum, row) => sum + row.endValue, 0)
  };
}

function finishInterval(active, marked, endDate, benchmarkPrice, nextExecutionDate) {
  const startPortfolioValue = active.startPortfolioValue;
  const endPortfolioValue = marked.portfolioValue;
  const contributions = marked.values.map((position) => ({
    ticker: position.ticker,
    issuer: position.issuer,
    sector: position.sector,
    industry: position.industry,
    value: position.disclosedValue,
    weight: position.weight,
    endingWeight: endPortfolioValue > 0 ? position.endValue / endPortfolioValue : 0,
    startPrice: position.startPrice,
    endPrice: position.endPrice,
    returnPct: position.endPrice / position.startPrice - 1,
    contributionPct: (position.endValue - position.startValue) / startPortfolioValue
  }));
  const ranked = [...contributions].sort((left, right) => right.contributionPct - left.contributionPct);
  const aggregateByClassification = (field) => {
    const grouped = new Map();
    for (const contribution of contributions) {
      const label = contribution[field] || "Unclassified";
      const current = grouped.get(label) || {
        label,
        weight: 0,
        endingWeight: 0,
        contributionPct: 0,
        positions: 0
      };
      current.weight += contribution.weight;
      current.endingWeight += contribution.endingWeight;
      current.contributionPct += contribution.contributionPct;
      current.positions += 1;
      grouped.set(label, current);
    }
    return [...grouped.values()].sort((left, right) =>
      right.contributionPct - left.contributionPct || left.label.localeCompare(right.label)
    );
  };
  const sectorContributions = aggregateByClassification("sector");
  const industryContributions = aggregateByClassification("industry");
  const portfolioReturn = endPortfolioValue / startPortfolioValue - 1;
  const contributionReturn = contributions.reduce((sum, row) => sum + row.contributionPct, 0);
  const sectorContributionReturn = sectorContributions.reduce((sum, row) => sum + row.contributionPct, 0);
  const industryContributionReturn = industryContributions.reduce((sum, row) => sum + row.contributionPct, 0);
  const benchmarkReturn = benchmarkPrice / active.startBenchmarkPrice - 1;

  return {
    id: `${active.rebalance.reportDate || active.rebalance.filingDate}-${active.startDate}`,
    label: quarterLabel(active.rebalance.reportDate),
    reportDate: active.rebalance.reportDate,
    filingDate: active.rebalance.filingDate,
    acceptanceDateTime: active.rebalance.acceptanceDateTime || null,
    executionDate: active.startDate,
    executionTimestampSource: active.rebalance.executionTimestampSource || null,
    usedLegacyFilingDateFallback: Boolean(active.rebalance.usedLegacyFilingDateFallback),
    endDate,
    nextExecutionDate: nextExecutionDate || null,
    days: Math.max(0, Math.round((new Date(endDate).getTime() - new Date(active.startDate).getTime()) / dayMs)),
    coveragePct: active.rebalance.coveragePct,
    pricedPositions: active.rebalance.pricedPositions,
    selectedPositions: active.rebalance.selectedPositions,
    cashWeight: active.cashWeight,
    portfolioReturn,
    benchmarkReturn,
    coveredWeight: active.weightSum,
    contributionReturn,
    attributionReconciliation: contributionReturn - portfolioReturn,
    sectorContributionReturn,
    sectorAttributionReconciliation: sectorContributionReturn - portfolioReturn,
    industryContributionReturn,
    industryAttributionReconciliation: industryContributionReturn - portfolioReturn,
    contributions: ranked,
    sectorContributions,
    industryContributions,
    topContributors: ranked.slice(0, 8),
    topDetractors: ranked.slice(-8).reverse()
  };
}

function simulationFailure(failure, partial) {
  return {
    ok: false,
    status: "incomplete_price_coverage",
    failure: {
      ...failure,
      policy: "fail_closed_without_zero_return_or_forward_fill",
      lastCompleteDate: partial.equity.at(-1)?.date || null
    },
    ...partial
  };
}

/**
 * Simulate close-to-close holdings. Target weights are converted to units only
 * at disclosure events; between events, position weights drift with prices.
 * The same interval state produces both the daily equity curve and security
 * contributions, so attribution must reconcile to the headline return.
 */
export function simulateDriftedPortfolio({
  rebalances,
  tradingDates,
  priceMaps,
  benchmarkSymbol = "SPY",
  endDate = null
}) {
  const orderedRebalances = [...(rebalances || [])]
    .filter((rebalance) => rebalance?.executionDate)
    .sort((left, right) => String(left.executionDate).localeCompare(String(right.executionDate)));
  if (!orderedRebalances.length) {
    return simulationFailure({ code: "no_rebalances", date: null }, {
      equity: [], portfolioReturns: [], benchmarkReturns: [], coverage: [], quarterContributions: []
    });
  }
  const duplicateExecutionDate = orderedRebalances.find((rebalance, index) =>
    index > 0 && rebalance.executionDate === orderedRebalances[index - 1].executionDate
  )?.executionDate;
  if (duplicateExecutionDate) {
    return simulationFailure({
      code: "duplicate_execution_date",
      date: duplicateExecutionDate
    }, {
      equity: [], portfolioReturns: [], benchmarkReturns: [], coverage: [], quarterContributions: []
    });
  }

  const firstDate = orderedRebalances[0].executionDate;
  const dates = [...new Set((tradingDates || [])
    .map((point) => typeof point === "string" ? point : point?.date)
    .filter((date) => date && date >= firstDate && (!endDate || date <= endDate)))]
    .sort();
  const benchmarkMap = priceMaps.get(benchmarkSymbol);
  const firstBenchmarkPrice = finitePositive(benchmarkMap?.get(firstDate));
  if (!dates.length || firstBenchmarkPrice == null) {
    return simulationFailure({ code: "missing_benchmark_start_price", date: firstDate }, {
      equity: [], portfolioReturns: [], benchmarkReturns: [], coverage: [], quarterContributions: []
    });
  }

  let portfolioValue = 1;
  let benchmarkValue = 1;
  let priorBenchmarkPrice = firstBenchmarkPrice;
  let rebalanceIndex = 0;
  let active = allocateAtClose(orderedRebalances[0], portfolioValue, priceMaps);
  if (!active.ok) {
    return simulationFailure(active.failure, {
      equity: [], portfolioReturns: [], benchmarkReturns: [], coverage: [], quarterContributions: []
    });
  }
  active.startBenchmarkPrice = firstBenchmarkPrice;

  const equity = [{ date: firstDate, value: portfolioValue, benchmark: benchmarkValue }];
  const portfolioReturns = [];
  const benchmarkReturns = [];
  const coverage = [];
  const quarterContributions = [];

  for (const date of dates.slice(1)) {
    const benchmarkPrice = finitePositive(benchmarkMap?.get(date));
    if (benchmarkPrice == null) {
      return simulationFailure({ code: "missing_benchmark_price", date }, {
        equity, portfolioReturns, benchmarkReturns, coverage, quarterContributions
      });
    }
    const marked = markPositions(active, date, priceMaps);
    if (!marked.ok) {
      return simulationFailure(marked.failure, {
        equity, portfolioReturns, benchmarkReturns, coverage, quarterContributions
      });
    }

    const dailyPortfolioReturn = marked.portfolioValue / portfolioValue - 1;
    const dailyBenchmarkReturn = benchmarkPrice / priorBenchmarkPrice - 1;
    portfolioValue = marked.portfolioValue;
    benchmarkValue *= 1 + dailyBenchmarkReturn;
    priorBenchmarkPrice = benchmarkPrice;
    portfolioReturns.push(dailyPortfolioReturn);
    benchmarkReturns.push(dailyBenchmarkReturn);
    coverage.push(active.rebalance.coveragePct ?? active.weightSum);
    equity.push({ date, value: portfolioValue, benchmark: benchmarkValue });

    while (
      rebalanceIndex + 1 < orderedRebalances.length &&
      orderedRebalances[rebalanceIndex + 1].executionDate <= date
    ) {
      const nextRebalance = orderedRebalances[rebalanceIndex + 1];
      quarterContributions.push(
        finishInterval(active, marked, date, benchmarkPrice, nextRebalance.executionDate)
      );
      rebalanceIndex += 1;
      active = allocateAtClose(nextRebalance, portfolioValue, priceMaps);
      if (!active.ok) {
        return simulationFailure(active.failure, {
          equity, portfolioReturns, benchmarkReturns, coverage, quarterContributions
        });
      }
      active.startBenchmarkPrice = benchmarkPrice;
    }
  }

  const finalDate = equity.at(-1)?.date || firstDate;
  const finalBenchmarkPrice = finitePositive(benchmarkMap?.get(finalDate));
  const finalMarked = markPositions(active, finalDate, priceMaps);
  if (!finalMarked.ok || finalBenchmarkPrice == null) {
    return simulationFailure(finalMarked.failure || { code: "missing_benchmark_price", date: finalDate }, {
      equity, portfolioReturns, benchmarkReturns, coverage, quarterContributions
    });
  }
  quarterContributions.push(
    finishInterval(active, finalMarked, finalDate, finalBenchmarkPrice, null)
  );

  const headlineTotalReturn = equity.at(-1).value / equity[0].value - 1;
  const attributionTotalReturn = quarterContributions.reduce(
    (growth, quarter) => growth * (1 + quarter.portfolioReturn),
    1
  ) - 1;
  const reconciliationDifference = attributionTotalReturn - headlineTotalReturn;

  return {
    ok: Math.abs(reconciliationDifference) <= reconciliationTolerance &&
      quarterContributions.every((quarter) =>
        Math.abs(quarter.attributionReconciliation) <= reconciliationTolerance &&
        Math.abs(quarter.sectorAttributionReconciliation) <= reconciliationTolerance &&
        Math.abs(quarter.industryAttributionReconciliation) <= reconciliationTolerance
      ),
    status: "ready",
    equity,
    portfolioReturns,
    benchmarkReturns,
    coverage,
    quarterContributions,
    reconciliation: {
      headlineTotalReturn,
      attributionTotalReturn,
      difference: reconciliationDifference,
      tolerance: reconciliationTolerance
    }
  };
}
