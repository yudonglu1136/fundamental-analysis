import { GILD_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

const TICKER = "GILD";

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function sum(rows, pick) {
  return rows.reduce((total, row) => total + finite(pick(row), 0), 0);
}

function latestByAsOf(rows = []) {
  return [...rows].sort((left, right) => String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? ""))).at(-1) ?? null;
}

function latestByAsset(rows = [], eventDate) {
  const map = new Map();
  for (const row of rows) {
    if (String(row.asOfDate) > String(eventDate)) continue;
    const raw = parseJson(row.rawJson, {});
    if (raw.retiredDate && String(raw.retiredDate) <= String(eventDate)) continue;
    if (Number(row.valuationImpactAllowed) !== 1 || Number(row.modelReady) !== 1) continue;
    const current = map.get(row.assetName);
    if (!current || String(row.asOfDate) > String(current.asOfDate)) map.set(row.assetName, row);
  }
  return [...map.values()];
}

function eventRows(rows = [], eventId) {
  return rows.filter((row) => row.eventId === eventId);
}

function fiscalYearOf(row) {
  const explicit = finite(row?.fiscalYear, NaN);
  if (Number.isFinite(explicit)) return explicit;
  const text = `${row?.periodId ?? ""} ${row?.eventId ?? ""} ${row?.fiscalPeriod ?? ""}`;
  const match = text.match(/fy(\d{4})/i);
  return match ? Number(match[1]) : NaN;
}

function fiscalQuarterOf(row) {
  if (row?.fiscalQuarter) return String(row.fiscalQuarter).toUpperCase();
  const text = `${row?.periodId ?? ""} ${row?.eventId ?? ""} ${row?.fiscalPeriod ?? ""}`;
  const match = text.match(/q([1-4])/i);
  return match ? `Q${match[1]}` : "";
}

function quarterNumber(row) {
  const quarter = fiscalQuarterOf(row);
  return quarter ? Number(quarter.replace("Q", "")) : NaN;
}

function isAnnualRow(row) {
  return row?.periodType === "annual" || (quarterNumber(row) === 4 && /^fy\d{4}$/i.test(String(row?.periodId ?? "")));
}

function sumField(rows, field) {
  const values = rows.map((row) => finite(row?.[field], NaN)).filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function annualizedMetric({ rows, current, field, preferCurrent = false }) {
  if (preferCurrent) return finite(current?.[field], null);
  const currentValue = finite(current?.[field], null);
  if (currentValue == null || isAnnualRow(current)) return currentValue;
  const year = fiscalYearOf(current);
  const quarter = quarterNumber(current);
  if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter >= 4) return currentValue;

  const sameScopeRows = rows.filter((row) => row?.ticker === current?.ticker || !row?.ticker || !current?.ticker);
  const priorAnnual = sameScopeRows.find((row) => fiscalYearOf(row) === year - 1 && isAnnualRow(row));
  const currentYtdRows = sameScopeRows.filter((row) => fiscalYearOf(row) === year && !isAnnualRow(row) && quarterNumber(row) >= 1 && quarterNumber(row) <= quarter);
  const priorYtdRows = sameScopeRows.filter((row) => fiscalYearOf(row) === year - 1 && !isAnnualRow(row) && quarterNumber(row) >= 1 && quarterNumber(row) <= quarter);
  const currentYtd = sumField(currentYtdRows, field);
  const priorYtd = sumField(priorYtdRows, field);
  const priorAnnualValue = finite(priorAnnual?.[field], null);
  if (priorAnnualValue != null && currentYtd != null && priorYtd != null && currentYtdRows.length >= quarter && priorYtdRows.length >= quarter) {
    return priorAnnualValue + currentYtd - priorYtd;
  }
  if (currentYtd != null && currentYtdRows.length > 0) return currentYtd * (4 / Math.min(quarter, currentYtdRows.length));
  return currentValue * 4;
}

function sourceRowsForAnnualizedMetric(rows, current) {
  if (!current || isAnnualRow(current)) return current ? [current] : [];
  const year = fiscalYearOf(current);
  const quarter = quarterNumber(current);
  if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter >= 4) return current ? [current] : [];
  const priorAnnual = rows.find((row) => fiscalYearOf(row) === year - 1 && isAnnualRow(row));
  const currentYtdRows = rows.filter((row) => fiscalYearOf(row) === year && !isAnnualRow(row) && quarterNumber(row) >= 1 && quarterNumber(row) <= quarter);
  const priorYtdRows = rows.filter((row) => fiscalYearOf(row) === year - 1 && !isAnnualRow(row) && quarterNumber(row) >= 1 && quarterNumber(row) <= quarter);
  return [...new Map([priorAnnual, ...currentYtdRows, ...priorYtdRows].filter(Boolean).map((row) => [row.id, row])).values()];
}

function buildValuationFinancial(financial, allFinancialRows = []) {
  if (!financial) return { financial: {}, sourceRows: [], basis: "missing_financial" };
  if (isAnnualRow(financial)) {
    return {
      financial,
      sourceRows: [financial],
      basis: "reported_annual",
      note: "Annual reporting event uses the reported annual financial period.",
    };
  }
  const rows = allFinancialRows.filter((row) => row.id === financial.id || String(row.asOfDate ?? "") <= String(financial.asOfDate ?? "9999-12-31"));
  const annualizedFields = [
    "revenue",
    "productSales",
    "grossProfit",
    "operatingIncome",
    "researchAndDevelopment",
    "sgAndA",
    "netIncome",
  ];
  const next = { ...financial };
  for (const field of annualizedFields) {
    const value = annualizedMetric({ rows, current: financial, field });
    if (value != null) next[field] = value;
  }
  const shares = Math.max(1, finite(financial.dilutedShares, 1));
  if (finite(next.netIncome, null) != null) next.gaapDilutedEps = finite(next.netIncome, 0) / shares;
  next.grossMargin = finite(next.revenue, 0) ? finite(next.grossProfit, 0) / finite(next.revenue, 1) : financial.grossMargin;
  next.operatingMargin = finite(next.revenue, 0) ? finite(next.operatingIncome, 0) / finite(next.revenue, 1) : financial.operatingMargin;
  next.rdAsPctSales = finite(next.revenue, 0) && finite(next.researchAndDevelopment, null) != null ? finite(next.researchAndDevelopment, 0) / finite(next.revenue, 1) : financial.rdAsPctSales;
  next.sgaAsPctSales = finite(next.revenue, 0) && finite(next.sgAndA, null) != null ? finite(next.sgAndA, 0) / finite(next.revenue, 1) : financial.sgaAsPctSales;
  next.fcfConversion = finite(next.netIncome, 0) ? finite(next.normalizedFreeCashFlow, 0) / Math.max(finite(next.netIncome, 1), 1) : financial.fcfConversion;
  const sourceRows = sourceRowsForAnnualizedMetric(rows, financial);
  const usedPriorAnnual = sourceRows.some((row) => isAnnualRow(row) && fiscalYearOf(row) === fiscalYearOf(financial) - 1);
  return {
    financial: next,
    sourceRows,
    basis: usedPriorAnnual ? "event_visible_ltm" : "event_visible_ytd_annualized",
    note: usedPriorAnnual
      ? "Quarterly valuation uses prior annual plus event-visible current YTD less prior-year YTD for revenue/EBIT scale."
      : "Quarterly valuation annualizes event-visible YTD rows because a prior annual anchor is outside the imported window.",
  };
}

function buildValuationFranchises(allFranchises = [], currentFranchises = [], financial, eventDate) {
  if (!currentFranchises.length || isAnnualRow(financial)) {
    return { franchises: currentFranchises, sourceRows: currentFranchises, basis: isAnnualRow(financial) ? "reported_annual" : "current_event" };
  }
  const year = fiscalYearOf(financial);
  const quarter = quarterNumber(financial);
  if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter >= 4) {
    return { franchises: currentFranchises, sourceRows: currentFranchises, basis: "current_event" };
  }
  const eventVisibleRows = allFranchises.filter((row) => String(row.asOfDate ?? "") <= String(eventDate ?? "9999-12-31"));
  const sourceRows = [];
  const franchises = currentFranchises.map((current) => {
    const rows = eventVisibleRows.filter((row) => row.franchise === current.franchise);
    const priorAnnual = rows.find((row) => fiscalYearOf(row) === year - 1 && isAnnualRow(row));
    const currentYtdRows = rows.filter((row) => fiscalYearOf(row) === year && !isAnnualRow(row) && quarterNumber(row) >= 1 && quarterNumber(row) <= quarter);
    const priorYtdRows = rows.filter((row) => fiscalYearOf(row) === year - 1 && !isAnnualRow(row) && quarterNumber(row) >= 1 && quarterNumber(row) <= quarter);
    const franchiseSourceRows = sourceRowsForAnnualizedMetric(rows, current);
    sourceRows.push(...franchiseSourceRows);
    const revenue = annualizedMetric({ rows, current, field: "revenue" });
    const normalizedRevenue = annualizedMetric({ rows, current, field: "normalizedRevenue" });
    return {
      ...current,
      revenue: revenue ?? current.revenue,
      normalizedRevenue: normalizedRevenue ?? current.normalizedRevenue,
      operatingMarginProxy: current.operatingMarginProxy,
      notes: `${current.notes ?? ""} Valuation input is ${priorAnnual && currentYtdRows.length >= quarter && priorYtdRows.length >= quarter ? "event-visible LTM" : "event-visible YTD annualized"} to avoid single-quarter SOTP scale distortion.`.trim(),
    };
  });
  return {
    franchises,
    sourceRows: [...new Map(sourceRows.filter(Boolean).map((row) => [row.id, row])).values()],
    basis: sourceRows.some((row) => isAnnualRow(row) && fiscalYearOf(row) === year - 1) ? "event_visible_ltm" : "event_visible_ytd_annualized",
  };
}

function methodWeights(assumptions) {
  const raw = assumptions.methodWeights ?? Object.fromEntries(GILD_BACKEND_MODEL_VERSION.valuationMethods.map((method) => [method.key, method.weight]));
  const total = Object.values(raw).reduce((acc, value) => acc + finite(value, 0), 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, finite(value, 0) / total]));
}

function dcfFairValue(financial, assumptions) {
  const fcf = Math.max(1, finite(financial.normalizedFreeCashFlow, financial.freeCashFlow));
  const shares = Math.max(1, finite(financial.dilutedShares, 1_250));
  const netDebt = finite(financial.netDebt, 0);
  const wacc = finite(assumptions.wacc, 0.085);
  const terminalGrowth = Math.min(finite(assumptions.terminalGrowth, 0.015), wacc - 0.015);
  const growthYears = Math.max(3, Math.round(finite(assumptions.dcfGrowthYears, 5)));
  const blendedGrowth = Math.max(-0.04, Math.min(0.06, finite(assumptions.hivGrowth, 0.02) * 0.55 + finite(assumptions.oncologyGrowth, 0.07) * 0.2 + terminalGrowth * 0.25));
  let pv = 0;
  let forecast = fcf;
  for (let year = 1; year <= growthYears; year += 1) {
    forecast *= 1 + blendedGrowth;
    pv += forecast / (1 + wacc) ** year;
  }
  const terminal = (forecast * (1 + terminalGrowth)) / Math.max(wacc - terminalGrowth, 0.02);
  const enterpriseValue = pv + terminal / (1 + wacc) ** growthYears;
  return (enterpriseValue - netDebt) / shares;
}

function fcfYieldFairValue(financial, market, assumptions) {
  const shares = Math.max(1, finite(financial.dilutedShares, market?.sharesOutstanding ?? 1_250));
  const fcfPerShare = finite(financial.normalizedFreeCashFlow, financial.freeCashFlow) / shares;
  const targetYield = Math.max(0.04, finite(assumptions.targetFcfYield, 0.065));
  const shareholderYieldCredit = finite(assumptions.shareholderYieldCredit, 0.35);
  const shareholderYield = finite(market?.shareholderYield, finite(market?.dividendYield, 0) + finite(market?.buybackYield, 0));
  return fcfPerShare / targetYield + shareholderYield * 100 * shareholderYieldCredit;
}

function franchiseSotp(franchises, financial, assumptions) {
  const shares = Math.max(1, finite(financial.dilutedShares, 1_250));
  const netDebt = finite(financial.netDebt, 0);
  const multiples = {
    "HIV base franchise": 12.5 + finite(assumptions.hivGrowth, 0.02) * 70,
    "HIV long-acting lifecycle": finite(assumptions.longActingOptionMultiple, 3),
    "HCV residual cash flow": 4,
    "Oncology / cell therapy": 9 + finite(assumptions.oncologyGrowth, 0.07) * 25,
    "Veklury normalization": 3,
    "Other / inflammation / liver disease": 7,
  };
  const components = franchises.map((row) => {
    const revenue = finite(row.normalizedRevenue, row.revenue);
    const margin = finite(row.operatingMarginProxy, 0.35);
    const multiple = multiples[row.franchise] ?? 7;
    const enterpriseValue = revenue * margin * multiple;
    return {
      key: `franchise-${String(row.franchise).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: row.franchise,
      revenue: row.revenue,
      normalizedRevenue: revenue,
      margin,
      multiple,
      enterpriseValue,
      valuePerShare: enterpriseValue / shares,
      valuationTreatment: row.valuationTreatment,
    };
  });
  const launchedEnterpriseValue = sum(components, (row) => row.enterpriseValue);
  const fairValue = (launchedEnterpriseValue - netDebt) / shares;
  return {
    fairValue,
    components: [
      ...components,
      {
        key: "net-debt-adjustment",
        label: "Net debt / cash adjustment",
        enterpriseValue: -netDebt,
        valuePerShare: -netDebt / shares,
      },
      {
        key: "pipeline-rnpv-carveout",
        label: "Pipeline rNPV",
        enterpriseValue: 0,
        valuePerShare: 0,
        valuationTreatment: "Pipeline optionality is carved out and weighted through the separate rNPV overlay to avoid hidden double counting.",
      },
    ],
  };
}

function pipelineRnpv(assets, eventDate, shares) {
  const eventYear = Number(String(eventDate).slice(0, 4));
  return assets.map((asset) => {
    const peakSales = finite(asset.peakSalesOrEconomicsEstimate, 0);
    const margin = finite(asset.margin, 0.35);
    const probability = finite(asset.probabilityOfSuccess, 0);
    const discountRate = finite(asset.discountRate, 0.12);
    const launchYear = Math.max(eventYear, Math.round(finite(asset.launchYear, eventYear + 4)));
    const yearsToLaunch = Math.max(0, launchYear - eventYear);
    const steadyStateValue = peakSales * margin * 4.5;
    const probabilityAdjustedValue = steadyStateValue * probability;
    const discountedValue = probabilityAdjustedValue / (1 + discountRate) ** yearsToLaunch;
    return {
      assetId: asset.id,
      assetName: asset.assetName,
      indication: asset.indication,
      phase: asset.phase,
      probabilityOfSuccess: probability,
      peakSalesOrEconomicsEstimate: peakSales,
      launchYear,
      margin,
      discountRate,
      rnpv: discountedValue,
      valuePerShare: discountedValue / shares,
      sourceType: asset.sourceType,
      asOfDate: asset.asOfDate,
    };
  });
}

function evEbitFairValue(financial, assumptions) {
  const shares = Math.max(1, finite(financial.dilutedShares, 1_250));
  const ebit = Math.max(1, finite(financial.operatingIncome, 0));
  const multiple = finite(assumptions.ebitMultiple, 12.5);
  return (ebit * multiple - finite(financial.netDebt, 0)) / shares;
}

function peFairValue(financial, assumptions) {
  const eps = finite(financial.adjustedDilutedEps, finite(financial.gaapDilutedEps, 0));
  return eps * finite(assumptions.peMultiple, 13.5);
}

function dividendSupportFairValue(financial, assumptions) {
  const annualDividend = financial.fiscalQuarter === "Q4"
    ? finite(financial.dividendPerShare, 0)
    : finite(financial.dividendPerShare, 0) * 4;
  return annualDividend / Math.max(0.025, finite(assumptions.dividendRequiredYield, 0.035));
}

export function buildGildBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = GILD_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: TICKER,
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "GILD adapter uses a mature-biopharma stack: FCF DCF, FCF/shareholder yield, launched-franchise SOTP, probability-adjusted pipeline rNPV, EV/EBIT, P/E cross-check and dividend-support overlay.",
      "Veklury revenue is separated and normalized before it enters base revenue or franchise SOTP.",
      "HCV is modeled as a declining residual stream and is never treated as recurring growth.",
      "Pipeline, patent/LOE and transcript rows remain date-gated to the selected reporting event.",
      "Dividend support is weighted at 5% and disclosed as an income support overlay to avoid double-counting core FCF valuation.",
    ],
  };
}

export async function runGildBackendValuation(input) {
  const payload = buildGildBackendValuationPayload(input);
  const eventId = payload.snapshot?.reportingEvent?.id;
  const eventDate = payload.snapshot?.reportingEvent?.eventDate ?? payload.asOfDate;
  const financial =
    eventRows(payload.snapshot?.financialPeriods ?? [], eventId)[0] ??
    latestByAsOf(payload.snapshot?.financialPeriods ?? []);
  const market = payload.snapshot?.marketSnapshot;
  const franchises = eventRows(payload.snapshot?.franchiseFinancials ?? [], eventId);
  const products = eventRows(payload.snapshot?.productFinancials ?? [], eventId);
  const patents = eventRows(payload.snapshot?.patentExclusivityEvents ?? [], eventId);
  const pipelineAssets = latestByAsset(payload.snapshot?.pipelineAssets ?? [], eventDate);
  const guidanceSource = (payload.snapshot?.guidanceItems ?? []).find((row) => Number(row.valuationImpactAllowed) === 1) ?? null;
  const valuationFinancialPayload = buildValuationFinancial(financial, payload.snapshot?.financialPeriods ?? []);
  const valuationFinancial = valuationFinancialPayload.financial;
  const valuationFranchisePayload = buildValuationFranchises(payload.snapshot?.franchiseFinancials ?? [], franchises, financial, eventDate);
  const valuationFranchises = valuationFranchisePayload.franchises;
  const shares = Math.max(1, finite(valuationFinancial?.dilutedShares, market?.sharesOutstanding ?? 1_250));
  const weights = methodWeights(payload.assumptions);

  const pipelineComponents = pipelineRnpv(pipelineAssets, eventDate, shares);
  const pipelineValuePerShare = sum(pipelineComponents, (row) => row.valuePerShare);
  const dcfValue = dcfFairValue(valuationFinancial, payload.assumptions);
  const fcfYieldValue = fcfYieldFairValue(valuationFinancial, market, payload.assumptions);
  const sotp = franchiseSotp(valuationFranchises, valuationFinancial, payload.assumptions);
  const evEbitValue = evEbitFairValue(valuationFinancial, payload.assumptions);
  const peValue = peFairValue(valuationFinancial, payload.assumptions);
  const dividendValue = dividendSupportFairValue(financial, payload.assumptions);
  const methodMap = {
    fcff_dcf: dcfValue,
    fcf_shareholder_yield: fcfYieldValue,
    franchise_sotp: sotp.fairValue,
    pipeline_rnpv: pipelineValuePerShare,
    ev_ebit_ebitda: evEbitValue,
    pe_cross_check: peValue,
    dividend_support: dividendValue,
  };
  const blendedFairValue = Object.entries(weights).reduce((total, [key, weight]) => total + finite(methodMap[key], 0) * weight, 0);
  const currentPrice = finite(market?.currentPrice, financial?.currentPrice);
  const targetPrice3Y = blendedFairValue * 1.09 + (financial.fiscalQuarter === "Q4" ? finite(financial.dividendPerShare, 0) : finite(financial.dividendPerShare, 0) * 4) * 3;
  const expectedShareholderCagr = currentPrice > 0 ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : null;
  const pipelineContributionRatio = blendedFairValue > 0 ? Math.abs(pipelineValuePerShare * weights.pipeline_rnpv) / blendedFairValue : 0;
  const warnings = [
    ...payload.adapterWarnings.map((detail, index) => ({
      id: `gild-backend-adapter-note-${index + 1}`,
      title: "GILD backend adapter note",
      detail,
      severity: index === 4 ? "medium" : "low",
    })),
    ...(pipelineContributionRatio > 0.25 ? [{
      id: "gild-pipeline-rnpv-dominance",
      title: "Pipeline rNPV contribution is high",
      detail: `Pipeline contributes ${(pipelineContributionRatio * 100).toFixed(1)}% of blended fair value after method weighting.`,
      severity: "medium",
    }] : []),
  ];
  const latestPatent = patents.sort((left, right) => String(right.asOfDate).localeCompare(String(left.asOfDate)))[0] ?? null;
  const latestPipeline = pipelineAssets.sort((left, right) => String(right.asOfDate).localeCompare(String(left.asOfDate)))[0] ?? null;
  const sourceRowIds = {
    financialPeriodIds: financial ? [financial.id] : [],
    ltmFinancialPeriodIds: valuationFinancialPayload.sourceRows.map((row) => row.id),
    marketSnapshotIds: market ? [market.id] : [],
    dailyPriceBarIds: payload.snapshot?.dailyPriceBar?.id ? [payload.snapshot.dailyPriceBar.id] : [],
    productFinancialIds: products.map((row) => row.id),
    franchiseFinancialIds: franchises.map((row) => row.id),
    ltmFranchiseFinancialIds: valuationFranchisePayload.sourceRows.map((row) => row.id),
    patentExclusivityEventIds: patents.map((row) => row.id),
    pipelineAssetIds: pipelineAssets.map((row) => row.id),
    guidanceItemIds: guidanceSource ? [guidanceSource.id] : [],
    cashDebtSnapshotIds: eventRows(payload.snapshot?.cashDebtSnapshots ?? [], eventId).map((row) => row.id),
    dividendBuybackSnapshotIds: eventRows(payload.snapshot?.dividendBuybackSnapshots ?? [], eventId).map((row) => row.id),
    vekluryNormalizationSnapshotIds: eventRows(payload.snapshot?.vekluryNormalizationSnapshots ?? [], eventId).map((row) => row.id),
  };
  const backendSnapshot = {
    asOfDate: payload.asOfDate,
    reportingEventId: payload.reportingEventId,
    fiscalPeriod: payload.snapshot?.reportingEvent?.fiscalPeriod ?? null,
    scenario: payload.scenario,
    modelVersion: payload.modelVersion,
    assumptionSetId: payload.snapshot?.assumptionSet?.id ?? null,
    valuationPeriodId: financial?.periodId ?? null,
    valuationPeriodRowId: financial?.id ?? null,
    valuationPeriodType: financial?.periodType ?? null,
    marketSnapshotId: market?.id ?? null,
    asOfPriceSource: payload.snapshot?.asOfPriceSource ?? null,
    guidanceSourceId: guidanceSource?.id ?? null,
    pipelineAssumptionSetId: latestPipeline?.id ?? null,
    patentAssumptionSetId: latestPatent?.id ?? null,
    dilutedSharesUsed: shares,
    currentPrice,
    valuationFinancialBasis: {
      basis: valuationFinancialPayload.basis,
      note: valuationFinancialPayload.note,
      sourcePeriodId: financial?.periodId ?? null,
      sourceRevenue: financial?.revenue ?? null,
      annualizedRevenueUsed: valuationFinancial?.revenue ?? null,
      sourceOperatingIncome: financial?.operatingIncome ?? null,
      annualizedOperatingIncomeUsed: valuationFinancial?.operatingIncome ?? null,
      normalizedFreeCashFlowUsed: valuationFinancial?.normalizedFreeCashFlow ?? null,
      sourceRowIds: valuationFinancialPayload.sourceRows.map((row) => row.id),
    },
    valuationFranchiseBasis: {
      basis: valuationFranchisePayload.basis,
      sourceRowIds: valuationFranchisePayload.sourceRows.map((row) => row.id),
    },
    methodWeights: weights,
    sourceRowIds,
    dataLayerPolicy: {
      noFutureData: "Snapshot service filters rows to asOfDate/eventDate <= selected event date; adapter uses eventId-specific financial/product/franchise/cash/debt/dividend/Veklury rows.",
      transcriptPolicy: "transcript_commentary rows are display-only and not valuation inputs",
      guidancePolicy: "guidance candidates require valuationImpactAllowed=true before use",
      researchOnlyPolicy: "research_only peer data is metadata-only and not direct valuation input",
    },
    productRevenueReconciliation: {
      groupRevenue: financial?.revenue ?? null,
      productRevenue: sum(products, (row) => row.revenue),
      franchiseRevenue: sum(franchises, (row) => row.revenue),
    },
    launchedFranchiseVsPipeline: {
      launchedFranchiseSotpPerShare: sotp.fairValue,
      pipelineRnpvPerShare: pipelineValuePerShare,
      pipelineCarvedOutOfSotp: true,
    },
    franchiseScores: {
      hivDurabilityScore: valuationFranchises.find((row) => row.franchise === "HIV base franchise")?.durabilityScore ?? null,
      patentCliffScore: patents.length ? Math.max(0, 100 - sum(patents, (row) => row.exposedRevenue) / Math.max(valuationFinancial?.revenue ?? 1, 1) * 100) : null,
      oncologyOptionalityScore: valuationFranchises.find((row) => row.franchise === "Oncology / cell therapy")?.durabilityScore ?? null,
    },
  };

  return {
    ticker: TICKER,
    scenario: payload.scenario,
    modelVersion: payload.modelVersion,
    currentPrice,
    recommendedFairValue: blendedFairValue,
    blendedFairValue,
    targetPrice3Y,
    expectedReturn3Y: expectedShareholderCagr,
    upsideDownside: currentPrice > 0 ? blendedFairValue / currentPrice - 1 : null,
    probabilityWeightedFairValue: blendedFairValue,
    methodCards: [
      { key: "fcff_dcf", label: "FCFF / FCF DCF", value: dcfValue, format: "currency", weight: weights.fcff_dcf, description: "Event-visible normalized FCF DCF with Veklury normalized separately." },
      { key: "fcf_shareholder_yield", label: "FCF Yield / Shareholder Yield", value: fcfYieldValue, format: "currency", weight: weights.fcf_shareholder_yield, description: "Normalized FCF yield plus partial shareholder-yield credit." },
      { key: "franchise_sotp", label: "Franchise SOTP", value: sotp.fairValue, format: "currency", weight: weights.franchise_sotp, description: "Launched HIV, HCV, oncology, Veklury and other franchises less net debt." },
      { key: "pipeline_rnpv", label: "Pipeline rNPV Overlay", value: pipelineValuePerShare, format: "currency", weight: weights.pipeline_rnpv, description: "Probability-adjusted and date-gated pipeline optionality." },
      { key: "ev_ebit_ebitda", label: "EV/EBIT or EV/EBITDA", value: evEbitValue, format: "currency", weight: weights.ev_ebit_ebitda, description: "Mature biopharma multiple cross-check on event-visible EBIT." },
      { key: "pe_cross_check", label: "P/E Cross-check", value: peValue, format: "currency", weight: weights.pe_cross_check, description: "P/E is only a small cross-check, not the model core." },
      { key: "dividend_support", label: "Dividend Durability / Income Support", value: dividendValue, format: "currency", weight: weights.dividend_support, description: "Dividend support overlay weighted at 5% to avoid double-counting FCF." },
    ],
    sensitivityTables: [
      {
        title: "GILD Mature Biopharma Method Bridge",
        table: Object.entries(methodMap).map(([key, value]) => [key, Number(value.toFixed(2)), Number((weights[key] ?? 0).toFixed(2))]),
      },
      {
        title: "Franchise SOTP Components",
        table: sotp.components.map((row) => [row.label, Number(finite(row.valuePerShare, 0).toFixed(2)), row.valuationTreatment ?? ""]),
      },
      {
        title: "Pipeline rNPV Components",
        table: pipelineComponents.map((row) => [row.assetName, row.phase, Number(row.probabilityOfSuccess.toFixed(2)), row.launchYear, Number(row.valuePerShare.toFixed(2))]),
      },
    ],
    validationWarnings: warnings,
    backendSnapshot,
    pipelineComponents,
  };
}
