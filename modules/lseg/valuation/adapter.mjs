import { createServer } from "vite";
import { LSEG_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function penceToGbp(value) {
  if (value == null) return null;
  return value > 500 ? value / 100 : value;
}

function absoluteMarketValueToGbpMillions(value) {
  if (value == null) return null;
  return value > 1_000_000 ? value / 1_000_000 : value;
}

function labelFromPeriodId(periodId, sourceType) {
  const text = String(periodId ?? "")
    .replace(/_/g, " ")
    .replace(/\bsnapshot\b/gi, "")
    .replace(/\bfy(\d{4})\b/gi, "FY$1")
    .trim()
    .replace(/\b(q1|q2|q3|q4|h1|fy)\b/gi, (match) => match.toUpperCase());
  return `${text || String(periodId ?? "period")}${sourceType === "official_actual" ? "A" : " run-rate"}`;
}

function mapFinancialPeriod(row) {
  const raw = row.rawJson ?? {};
  const revenue = row.revenue ?? raw.totalIncomeExRecoveries ?? 0;
  const adjustedEbitda = row.adjustedEbitda ?? raw.adjustedEbitda ?? 0;
  const adjustedOperatingProfit = row.adjustedOperatingProfit ?? raw.adjustedOperatingProfit ?? adjustedEbitda * 0.75;
  const shares = row.dilutedShares ?? row.weightedAverageShares ?? raw.weightedAverageShares ?? 1;
  const adjustedProfitAttributable =
    row.adjustedNetIncome ??
    raw.adjustedProfitAttributable ??
    (row.adjustedEps != null ? row.adjustedEps * shares : null) ??
    adjustedOperatingProfit * 0.6;
  return {
    periodId: row.periodId,
    fiscalYear: row.fiscalYear,
    label: raw.valuationLabel ?? labelFromPeriodId(row.periodId, row.sourceType),
    sourceId: row.eventId ?? row.id,
    sourceType: row.sourceType ?? "forecast_assumption",
    reportingCurrency: "GBP",
    totalIncomeExRecoveries: revenue,
    recoveries: raw.recoveries ?? 0,
    totalIncomeInclRecoveries: raw.totalIncomeInclRecoveries ?? revenue,
    reportedGrowth: raw.reportedGrowth ?? 0,
    organicConstantCurrencyGrowth: raw.organicConstantCurrencyGrowth ?? raw.organicGrowth ?? 0,
    adjustedEbitda,
    adjustedEbitdaMargin: row.adjustedEbitdaMargin ?? adjustedEbitda / Math.max(revenue, 1),
    adjustedOperatingProfit,
    adjustedDepreciationAmortisation: raw.adjustedDepreciationAmortisation ?? Math.max(adjustedEbitda - adjustedOperatingProfit, revenue * 0.1),
    adjustedNetFinanceExpense: row.cashInterestExpense ?? raw.adjustedNetFinanceExpense ?? 0,
    adjustedTaxExpense: raw.adjustedTaxExpense ?? adjustedOperatingProfit * (row.taxRate ?? 0.24),
    adjustedEffectiveTaxRate: row.taxRate ?? raw.adjustedEffectiveTaxRate ?? 0.24,
    nonControllingInterest: row.minorityInterest ?? raw.nonControllingInterest ?? 0,
    adjustedProfitAttributable,
    adjustedEpsPence: row.adjustedEps != null ? row.adjustedEps * 100 : raw.adjustedEpsPence ?? 0,
    weightedAverageShares: row.weightedAverageShares ?? shares,
    equityFreeCashFlow: row.equityFreeCashFlow ?? raw.equityFreeCashFlow ?? adjustedEbitda * 0.5,
    equityFcfPerSharePence: raw.equityFcfPerSharePence ?? ((row.equityFreeCashFlow ?? adjustedEbitda * 0.5) / Math.max(shares, 1)) * 100,
    cashCapex: row.capex ?? raw.cashCapex ?? revenue * 0.1,
    capexIntensity: row.capexIntensity ?? raw.capexIntensity ?? 0.1,
    buybackSpend: row.buybackAmount ?? raw.buybackSpend ?? 0,
    totalDividendPerSharePence: row.dividendPerShare != null ? row.dividendPerShare * 100 : raw.totalDividendPerSharePence ?? 0,
    finalDividendPerSharePence: raw.finalDividendPerSharePence,
    netDebt: row.netDebt ?? raw.netDebt ?? 0,
    leaseLiabilities: raw.leaseLiabilities ?? 0,
    regulatoryOperationalAmounts: raw.regulatoryOperationalAmounts ?? 0,
    operatingNetDebt: raw.operatingNetDebt ?? row.netDebt ?? 0,
    leverage: raw.leverage ?? (row.netDebt ?? 0) / Math.max(adjustedEbitda, 1),
    pensionSurplusDeficit: raw.pensionSurplusDeficit ?? 0,
    notes: `Backend as-of row imported from ${row.sourceType}; raw record remains in SQLite.`,
  };
}

function definedObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value != null && Number.isFinite(value)));
}

function buildEventVisibleManagementGuidance(latest, snapshot) {
  const organicGrowth = latest.organicConstantCurrencyGrowth || latest.reportedGrowth || 0;
  const capexIntensity = latest.capexIntensity ?? 0.1;
  const taxRate = latest.adjustedEffectiveTaxRate ?? 0.24;
  const equityFreeCashFlowFloor = latest.equityFreeCashFlow ?? 0;
  const isRunRateAnchor = latest.sourceType !== "official_actual" || String(latest.periodId ?? "").includes("snapshot");
  const targetYear = isRunRateAnchor ? latest.fiscalYear : latest.fiscalYear + 1;
  return {
    year: targetYear,
    sourceId: `backend-event-visible-guidance-${latest.periodId}`,
    sourceType: "management_guidance",
    organicTotalIncomeGrowthLow: Math.max(organicGrowth - 0.01, 0),
    organicTotalIncomeGrowthHigh: organicGrowth ? organicGrowth + 0.01 : 0.07,
    constantCurrencyEbitdaMarginExpansionLowBps: 0,
    constantCurrencyEbitdaMarginExpansionHighBps: 100,
    capexIntensity,
    equityFreeCashFlowFloor,
    effectiveTaxRateLow: taxRate,
    effectiveTaxRateHigh: taxRate + 0.01,
    buybackPlan: latest.buybackSpend ?? 0,
    buybackCompletionBy: snapshot?.asOfDate ?? latest.periodId,
    mediumTermRevenueCommentary: `Backend historical guidance proxy derived from ${latest.periodId}; avoids importing future management guidance into older valuation runs.`,
    mediumTermMarginCommentary: "Uses event-visible run-rate/actual margin context only.",
    mediumTermCapexCommentary: `Capex intensity uses event-visible value of ${(capexIntensity * 100).toFixed(1)}%.`,
    fcfPerShareCommentary: `FCF floor uses event-visible equity FCF of GBP ${Math.round(equityFreeCashFlowFloor)}m, not the current FY2026 guidance floor.`,
  };
}

function isAnnualFinancialRow(row) {
  return row?.periodType === "annual" || /^fy\d{4}$/i.test(String(row?.periodId ?? ""));
}

function latestFullYearActualBefore(rows, row) {
  return rows
    .filter((candidate) =>
      candidate !== row &&
      candidate.sourceType === "official_actual" &&
      isAnnualFinancialRow(candidate) &&
      String(candidate.asOfDate ?? "") <= String(row.asOfDate ?? ""),
    )
    .sort((left, right) => String(right.asOfDate ?? "").localeCompare(String(left.asOfDate ?? "")))[0] ?? null;
}

function withCarriedForwardNonOperatingItems(row, allRows) {
  if (!row || row.sourceType === "official_actual" || isAnnualFinancialRow(row)) return row;
  const source = latestFullYearActualBefore(allRows, row);
  if (!source) return row;
  const raw = row.rawJson ?? {};
  const sourceRaw = source.rawJson ?? {};
  const carried = {};

  if (raw.leaseLiabilities == null && sourceRaw.leaseLiabilities != null) carried.leaseLiabilities = sourceRaw.leaseLiabilities;
  if (raw.pensionSurplusDeficit == null && sourceRaw.pensionSurplusDeficit != null) carried.pensionSurplusDeficit = sourceRaw.pensionSurplusDeficit;
  if (raw.regulatoryOperationalAmounts == null && sourceRaw.regulatoryOperationalAmounts != null) carried.regulatoryOperationalAmounts = sourceRaw.regulatoryOperationalAmounts;
  if (row.minorityInterest == null && source.minorityInterest != null) carried.minorityInterest = source.minorityInterest;
  if (row.cashInterestExpense == null && source.cashInterestExpense != null) carried.cashInterestExpense = source.cashInterestExpense;

  if (!Object.keys(carried).length) return row;

  return {
    ...row,
    cashInterestExpense: row.cashInterestExpense ?? carried.cashInterestExpense ?? null,
    minorityInterest: row.minorityInterest ?? carried.minorityInterest ?? null,
    rawJson: {
      ...raw,
      leaseLiabilities: carried.leaseLiabilities ?? raw.leaseLiabilities,
      pensionSurplusDeficit: carried.pensionSurplusDeficit ?? raw.pensionSurplusDeficit,
      regulatoryOperationalAmounts: carried.regulatoryOperationalAmounts ?? raw.regulatoryOperationalAmounts,
      carriedForwardItems: {
        sourcePeriodId: source.periodId,
        sourceFiscalYear: source.fiscalYear,
        ...carried,
        notes: "Partial-year / trading-update snapshot did not disclose all enterprise-to-equity bridge items; latest full-year actual values are carried forward without overriding disclosed net debt, share count or event-visible run-rate metrics.",
      },
    },
  };
}

function mapSegment(row, periodId) {
  const revenue = row.revenue ?? 0;
  const adjustedEbitda = row.adjustedEbitda ?? 0;
  return {
    periodId,
    segment: row.segment,
    reportedSegment: row.parentReportedSegment === "Markets" ? "Markets" : row.segment === "FTSE Russell / Index" ? "FTSE Russell" : row.segment,
    sourceId: row.eventId ?? row.id,
    sourceType: row.sourceType ?? "forecast_assumption",
    revenue,
    revenueDefinition: row.revenueDefinition === "markets_analytical_split" ? "analytical_revenue_split" : "total_income_ex_recoveries",
    adjustedEbitda,
    adjustedOperatingProfit: adjustedEbitda * 0.82,
    organicGrowth: row.rawJson?.organicGrowth ?? 0,
    reportedGrowth: row.rawJson?.reportedGrowth,
    margin: row.adjustedEbitdaMargin ?? adjustedEbitda / Math.max(revenue, 1),
    officialDisclosure: row.sourceType === "official_actual",
    splitRationale: row.notes ?? undefined,
    qualityRationale: row.notes ?? "Backend historical segment row.",
  };
}

function eventSemanticsSourceType(event) {
  if (!event?.eventType) return "market_snapshot";
  if (event.eventType === "fy_preliminary_results") return "fy_preliminary_results";
  if (event.eventType === "annual_report") return "annual_report";
  if (event.eventType === "h1_interim_results") return "h1_interim_results";
  if (event.eventType === "q1_trading_update") return "q1_trading_update";
  if (event.eventType === "q3_trading_update") return "q3_trading_update";
  if (event.eventType === "market_snapshot") return "market_snapshot";
  if (event.eventType === "transcript") return "transcript";
  return "guidance_update";
}

function buildValuationSemantics(dataset, snapshot, latestFinancial, latestMappedFinancial) {
  const audited = [...dataset.officialActuals]
    .filter((period) => period.sourceType === "official_actual" && /^fy\d{4}$/i.test(String(period.periodId ?? "")))
    .sort((left, right) => left.fiscalYear - right.fiscalYear)
    .at(-1) ?? dataset.officialActuals.at(-1);
  if (!audited || !latestMappedFinancial) return undefined;

  const isAnnualizedRunRate =
    latestFinancial?.periodType === "reporting_event_run_rate" ||
    latestMappedFinancial.sourceType !== "official_actual";
  const isSameYearForecastAnchor = isAnnualizedRunRate && latestMappedFinancial.fiscalYear === audited.fiscalYear + 1;
  const forecastStartYear = isAnnualizedRunRate ? latestMappedFinancial.fiscalYear : audited.fiscalYear + 1;
  const firstGrowthYear = forecastStartYear + (isAnnualizedRunRate && isSameYearForecastAnchor ? 1 : 0);
  const sourceConfidence = isAnnualizedRunRate ? "medium" : "high";
  const runRateLabel = `${latestMappedFinancial.label} annualized run-rate`;
  const carryForward = latestFinancial?.rawJson?.carriedForwardItems ?? null;
  const methodBase = {
    dcf: {
      valuationBase: isAnnualizedRunRate
        ? `${latestMappedFinancial.label} FY${forecastStartYear}E run-rate anchor, growth resumes from FY${firstGrowthYear}E`
        : `${audited.label} actual base, first forecast year is FY${forecastStartYear}E`,
      baseYear: audited.fiscalYear,
      forecastYear: forecastStartYear,
      sourceConfidence,
    },
    fcfYield: {
      valuationBase: isAnnualizedRunRate ? `Normalized FY${forecastStartYear}E equity FCF` : `${audited.label} equity FCF plus guidance floor`,
      baseYear: audited.fiscalYear,
      forecastYear: forecastStartYear,
      sourceConfidence,
    },
    sotp: {
      valuationBase: isAnnualizedRunRate ? `Run-rate SOTP using event-visible FY${forecastStartYear}E EBITDA` : `${audited.label} actual EBITDA SOTP`,
      baseYear: audited.fiscalYear,
      forecastYear: isAnnualizedRunRate ? forecastStartYear : audited.fiscalYear,
      sourceConfidence,
    },
    evEbitda: {
      valuationBase: isAnnualizedRunRate ? `FY${forecastStartYear}E / NTM EBITDA` : `FY${forecastStartYear}E EBITDA forecast from ${audited.label}`,
      baseYear: audited.fiscalYear,
      forecastYear: forecastStartYear,
      sourceConfidence,
    },
    pe: {
      valuationBase: isAnnualizedRunRate ? `FY${forecastStartYear}E EPS` : `FY${forecastStartYear}E EPS forecast from ${audited.label}`,
      baseYear: audited.fiscalYear,
      forecastYear: forecastStartYear,
      sourceConfidence,
    },
    platformMoat: {
      valuationBase: isAnnualizedRunRate ? `${runRateLabel} core valuation overlay` : `${audited.label} core valuation overlay`,
      baseYear: audited.fiscalYear,
      forecastYear: forecastStartYear,
      sourceConfidence,
    },
  };

  return {
    auditedActualBase: {
      periodId: audited.periodId,
      fiscalYear: audited.fiscalYear,
      label: audited.label,
      revenue: audited.totalIncomeExRecoveries,
      adjustedEbitda: audited.adjustedEbitda,
      equityFreeCashFlow: audited.equityFreeCashFlow,
      adjustedEpsPence: audited.adjustedEpsPence,
      dilutedShares: audited.weightedAverageShares,
      sourceType: audited.sourceType,
    },
    eventVisibleRunRate: isAnnualizedRunRate
      ? {
          periodId: latestMappedFinancial.periodId,
          fiscalYear: latestMappedFinancial.fiscalYear,
          label: latestMappedFinancial.label,
          revenue: latestMappedFinancial.totalIncomeExRecoveries,
          adjustedEbitda: latestMappedFinancial.adjustedEbitda,
          adjustedEbitdaMargin: latestMappedFinancial.adjustedEbitdaMargin,
          equityFreeCashFlow: latestMappedFinancial.equityFreeCashFlow,
          adjustedEpsPence: latestMappedFinancial.adjustedEpsPence,
          dilutedShares: latestMappedFinancial.weightedAverageShares,
          sourceType: latestMappedFinancial.sourceType,
        }
      : undefined,
    guidanceAnchor: dataset.managementGuidance?.[0]
      ? {
          sourceId: dataset.managementGuidance[0].sourceId,
          fiscalYear: dataset.managementGuidance[0].year,
          organicTotalIncomeGrowthLow: dataset.managementGuidance[0].organicTotalIncomeGrowthLow,
          organicTotalIncomeGrowthHigh: dataset.managementGuidance[0].organicTotalIncomeGrowthHigh,
          equityFreeCashFlowFloor: dataset.managementGuidance[0].equityFreeCashFlowFloor,
        }
      : undefined,
    forecastStartYear,
    firstGrowthYear,
    isAnnualizedRunRate,
    isSameYearForecastAnchor,
    dcfYearOneGrowthSuppressed: isAnnualizedRunRate && isSameYearForecastAnchor,
    sourceType: eventSemanticsSourceType(snapshot?.reportingEvent),
    methodBases: methodBase,
    balanceSheetCarryForward: carryForward
      ? {
          sourcePeriodId: carryForward.sourcePeriodId,
          sourceFiscalYear: carryForward.sourceFiscalYear,
          leaseLiabilities: carryForward.leaseLiabilities,
          pensionSurplusDeficit: carryForward.pensionSurplusDeficit,
          minorityInterest: carryForward.minorityInterest,
          cashInterestExpense: carryForward.cashInterestExpense,
          regulatoryOperationalAmounts: carryForward.regulatoryOperationalAmounts,
          notes: carryForward.notes,
        }
      : undefined,
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const sortedFinancials = [...(snapshot?.financialPeriods ?? [])].sort((left, right) => (
    (left.fiscalYear ?? 0) - (right.fiscalYear ?? 0) ||
    String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? ""))
  )).map((row, _, rows) => withCarriedForwardNonOperatingItems(row, rows));
  const latestFinancial = sortedFinancials[sortedFinancials.length - 1] ?? null;
  let latestMappedFinancial = null;
  if (sortedFinancials.length) {
    dataset.officialActuals = sortedFinancials.map(mapFinancialPeriod);
    latestMappedFinancial = dataset.officialActuals[dataset.officialActuals.length - 1];
    dataset.managementGuidance = [buildEventVisibleManagementGuidance(latestMappedFinancial, snapshot)];
  }
  if (latestFinancial) {
    const periodSegmentRows = (snapshot?.segmentFinancials ?? []).filter((row) => row.periodId === latestFinancial.periodId);
    const hasAnalyticalMarketsSplit = periodSegmentRows.some((row) => row.taxonomy === "analytical_split" && row.parentReportedSegment === "Markets");
    const segmentRows = hasAnalyticalMarketsSplit
      ? periodSegmentRows.filter((row) => !(row.segment === "Markets" && row.taxonomy === "reported_segment"))
      : periodSegmentRows;
    if (segmentRows.length) {
      dataset.segmentActuals = segmentRows.map((row) => mapSegment(row, latestFinancial.periodId));
    }
  }
  const market = snapshot?.marketSnapshot;
  if (market) {
    const currentPriceGbp = penceToGbp(market.currentPrice) ?? dataset.marketData.currentPriceGbp;
    const marketCapGbp = absoluteMarketValueToGbpMillions(market.marketCap) ?? currentPriceGbp * (market.sharesOutstanding ?? 0) / 1_000_000;
    const enterpriseValueGbp = absoluteMarketValueToGbpMillions(market.enterpriseValue) ?? marketCapGbp + (latestFinancial?.netDebt ?? 0);
    dataset.marketData = {
      ...dataset.marketData,
      sourceId: market.id,
      currentPriceGbp,
      priceDate: market.priceDate ?? market.asOfDate,
      marketCapGbp,
      enterpriseValueGbp,
      sharesOutstanding: market.sharesOutstanding ? market.sharesOutstanding / 1_000_000 : dataset.marketData.sharesOutstanding,
      dividendYield: latestFinancial?.dividendPerShare ? latestFinancial.dividendPerShare / Math.max(currentPriceGbp, 1) : dataset.marketData.dividendYield,
      fcfYield: latestFinancial?.equityFreeCashFlow ? latestFinancial.equityFreeCashFlow / Math.max(marketCapGbp, 1) : dataset.marketData.fcfYield,
      source: `Backend market snapshot ${market.id}`,
    };
  }
  dataset.latestReportingPeriod = latestFinancial?.periodId?.toUpperCase() ?? dataset.latestReportingPeriod;
  dataset.buildDate = snapshot?.asOfDate ?? dataset.buildDate;
  dataset.valuationSemantics = buildValuationSemantics(dataset, snapshot, latestFinancial, latestMappedFinancial);
  return dataset;
}

export function buildLsegBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = LSEG_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "LSEG.L",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "Phase 1 adapter maps SQLite financial, segment and market rows into the existing LSEG cockpit valuation engine.",
      "Historical segment rows before FY2025 may include explicitly marked backcast assumptions where LSEG did not disclose the same taxonomy.",
      "Q1/H1/Q3 historical valuation rows use event-visible run-rate assumptions rather than treating interim trading updates as full-year official actuals.",
      "No valuation formula is duplicated or intentionally changed in the backend pilot.",
    ],
  };
}

export async function runLsegBackendValuation(input) {
  const payload = buildLsegBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/lseg/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/lseg/data.ts");
    const backendDataset = buildDatasetFromSnapshot(dataModule.lsegMockData, payload.snapshot);
    const market = backendDataset.marketData;
    const latest = backendDataset.officialActuals[backendDataset.officialActuals.length - 1];
    const backendAssumptions = {
      ...definedObject({
      currentPrice: market.currentPriceGbp,
      dilutedShares: latest?.weightedAverageShares || market.sharesOutstanding,
      netDebt: latest?.netDebt,
      leaseLiabilities: latest?.leaseLiabilities,
      pensionSurplusDeficit: latest?.pensionSurplusDeficit ?? 0,
      taxRate: latest?.adjustedEffectiveTaxRate,
      capexIntensity: latest?.capexIntensity,
      dividendPerSharePence: latest?.totalDividendPerSharePence,
      buyback2026: latest?.buybackSpend ?? 0,
      buyback2027: 0,
      averageBuybackPrice2026: market.currentPriceGbp,
      averageBuybackPrice2027: market.currentPriceGbp,
      }),
      priceDate: market.priceDate,
      ...payload.assumptions,
    };
    const valuation = calculations.calculateLsegValuation(
      backendDataset,
      latest?.periodId ?? "fy2025",
      payload.scenario,
      backendAssumptions,
    );
    return {
      ...valuation,
      backendModelVersion: payload.modelVersion,
      backendSnapshot: {
        asOfDate: payload.asOfDate,
        reportingEventId: payload.reportingEventId,
        financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
        segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        valuationPeriodId: latest?.periodId ?? null,
        priceDate: market.priceDate,
        guidanceSourceId: backendDataset.managementGuidance?.[0]?.sourceId ?? null,
        guidanceFcfFloor: backendDataset.managementGuidance?.[0]?.equityFreeCashFlowFloor ?? null,
        assumptionDilutedShares: backendAssumptions.dilutedShares ?? null,
        financialWeightedAverageShares: latest?.weightedAverageShares ?? null,
        leaseLiabilities: backendAssumptions.leaseLiabilities ?? null,
        pensionSurplusDeficit: backendAssumptions.pensionSurplusDeficit ?? null,
        balanceSheetCarryForward: backendDataset.valuationSemantics?.balanceSheetCarryForward ?? null,
        valuationSemantics: backendDataset.valuationSemantics ?? null,
        marketSharesOutstanding: market.sharesOutstanding ?? null,
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `backend-adapter-gap-${index + 1}`,
          title: "Backend adapter gap",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
