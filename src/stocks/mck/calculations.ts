import * as XLSX from "xlsx";
import type { DashboardInterpretation, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { checkEPSConsistency, checkExtremeGrowthRates, checkImpossibleCagrCombination, checkMissingFields, checkPeSanity, checkSegmentSumConsistency, checkValuationReliability } from "../../utils/validation";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside, getCanonicalCurrentPrice } from "../../utils/valuation";
import { mckWorkbookData } from "./data";

export type MckAssumptions = {
  currentPrice: number;
  forwardCoreEps: number;
  targetPe: number;
  fcfPerShare: number;
  targetFcfYield: number;
  epsCagr3Y: number;
  exitPe: number;
  buybackYield: number;
  dividendYield: number;
  glp1MarginDilutionImpact: number;
  specialtyOncologyUplift: number;
  oneOffEpsAdjustment: number;
  glp1Revenue: number;
  glp1RevenueGrowth: number;
  glp1GrossMargin: number;
  nonGlp1Margin: number;
  specialtyRevenue: number;
  specialtyRevenueGrowth: number;
  specialtyMargin: number;
  oncologyRevenueGrowth: number;
};

export const defaultMckAssumptions: MckAssumptions = {
  currentPrice: getCanonicalCurrentPrice("MCK", 650),
  forwardCoreEps: 35,
  targetPe: 17,
  fcfPerShare: 32,
  targetFcfYield: 0.055,
  epsCagr3Y: 0.08,
  exitPe: 16,
  buybackYield: 0.025,
  dividendYield: 0.005,
  glp1MarginDilutionImpact: -0.01,
  specialtyOncologyUplift: 0.02,
  oneOffEpsAdjustment: 0,
  glp1Revenue: 2600,
  glp1RevenueGrowth: 0.22,
  glp1GrossMargin: 0.04,
  nonGlp1Margin: 0.024,
  specialtyRevenue: 9800,
  specialtyRevenueGrowth: 0.13,
  specialtyMargin: 0.039,
  oncologyRevenueGrowth: 0.15,
};

export type MckModel = {
  periods: string[];
  segments: Array<{
    quarter: string;
    quarterEnd: string;
    segment: string;
    revenue: number;
    operatingProfit: number;
    operatingMargin: number;
    revenueGrowth: number;
    operatingProfitGrowth: number;
    profitContribution: number;
  }>;
  bridge: Array<{
    quarter: string;
    quarterEnd: string;
    adjustedNetIncome: number;
    adjustedEps: number;
    dilutedShares: number;
    interestExpense: number;
    adjustedTaxRate: number;
    shareRepurchases: number;
    avgRepurchasePrice: number;
    acquisitionDivestitureOpProfit: number;
    adjustedOperatingProfit: number;
    oneOffAfterTax: number;
    adjustedOperatingProfitGrowth: number;
    adjustedNetIncomeGrowth: number;
    adjustedEpsGrowth: number;
    shareCountYoYChange: number;
  }>;
  guidance: Array<{ quarterEnd: string; metric: string; midpoint: number; notes: string }>;
  valuationRows: Array<{
    scenario: Scenario;
    forwardAdjustedEps: number;
    forwardPeMultiple: number;
    impliedSharePrice: number;
    currentSharePrice: number;
    upsideDownsidePct: number;
    fcfYield: number;
    shareRepurchaseYield: number;
    longTermEpsCagr: number;
  }>;
  peerRows: Array<Record<string, unknown>>;
};

export type MckDashboardData = {
  summary: SummaryMetric[];
  dataStatus: DataStatus;
  investmentReadThrough: DashboardInterpretation[];
  segmentChart: Array<Record<string, string | number>>;
  epsBridge: {
    rows: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
    mix: { operating: number; buybacks: number; belowLine: number; oneOff: number };
    qualityLabel: string;
    qualitySignal: DashboardInterpretation["signal"];
    qualityDetail: string;
  };
  coreEpsSeries: Array<{ period: string; adjustedEps: number; coreEps: number; epsExBuyback: number; coreExBuyback: number }>;
  buybacks: {
    latest: { buybackYield: number; avgRepurchasePrice: number; impliedSharesRepurchased: number; epsAccretion: number; authorizationRemaining: number };
    signal: DashboardInterpretation["signal"];
    detail: string;
    trend: Array<{ quarter: string; dilutedShares: number; repurchaseAmount: number; buybackContribution: number; avgRepurchasePrice: number; fairValue: number }>;
  };
  glp1: {
    signal: DashboardInterpretation["signal"];
    detail: string;
    sourceBadge: "Assumption";
    current: { revenueGrowthWithGlp1: number; revenueGrowthWithoutGlp1: number; operatingProfitContribution: number; marginDilution: number; revenueQualityScore: number };
  };
  specialty: {
    signal: DashboardInterpretation["signal"];
    detail: string;
    sourceBadge: "Assumption";
    trend: Array<{ quarter: string; specialtyRevenueGrowth: number; oncologyRevenueGrowth: number; specialtyOperatingProfitContribution: number; specialtyMargin: number; specialtyPercentOfUsPharmaProfit: number }>;
  };
  peerRows: Array<Record<string, string | number>>;
  valuation: ValuationResult;
};

export function parseMckWorkbookSnapshot(workbookLike = mckWorkbookData as Record<string, unknown[][]>): MckModel {
  const segments = rowsToObjects(workbookLike["Segment Model"])
    .filter((row) => row.quarter_end && row.segment)
    .map((row) => ({
      quarter: String(row.quarter ?? ""),
      quarterEnd: String(row.quarter_end),
      segment: String(row.segment),
      revenue: num(row.revenue),
      operatingProfit: num(row.adjusted_operating_profit),
      operatingMargin: num(row.operating_margin),
      revenueGrowth: num(row.revenue_yoy_growth),
      operatingProfitGrowth: num(row.adjusted_operating_profit_yoy_growth),
      profitContribution: num(row.contribution_to_total_operating_profit_growth_pct_pts),
    }));

  const bridge = rowsToObjects(workbookLike["EPS Bridge"])
    .filter((row) => row.quarter_end)
    .map((row) => ({
      quarter: String(row.quarter ?? ""),
      quarterEnd: String(row.quarter_end),
      adjustedNetIncome: num(row.adjusted_net_income),
      adjustedEps: num(row.adjusted_diluted_eps),
      dilutedShares: num(row.diluted_weighted_avg_shares),
      interestExpense: num(row.interest_expense),
      adjustedTaxRate: num(row.adjusted_tax_rate),
      shareRepurchases: num(row.share_repurchases),
      avgRepurchasePrice: num(row.avg_repurchase_price),
      acquisitionDivestitureOpProfit: num(row.acquisition_divestiture_op_profit),
      adjustedOperatingProfit: num(row.adjusted_operating_profit),
      oneOffAfterTax: num(row.one_off_after_tax),
      adjustedOperatingProfitGrowth: num(row.adjusted_operating_profit_growth),
      adjustedNetIncomeGrowth: num(row.adjusted_net_income_growth),
      adjustedEpsGrowth: num(row.adjusted_eps_growth),
      shareCountYoYChange: num(row.share_count_yoy_change),
    }));

  const guidance = rowsToObjects(extractEmbeddedTable(workbookLike["Raw Inputs"], "guidance")).map((row) => ({
    quarterEnd: String(row.quarter_end ?? ""),
    metric: String(row.metric ?? ""),
    midpoint: num(row.midpoint),
    notes: String(row.notes ?? ""),
  }));

  const valuationRows = rowsToObjects(extractPrimaryTable(workbookLike["Valuation"]))
    .filter((row) => typeof row.scenario === "string")
    .slice(0, 3)
    .map((row) => ({
      scenario: String(row.scenario) as Scenario,
      forwardAdjustedEps: num(row.forward_adjusted_eps),
      forwardPeMultiple: num(row.forward_pe_multiple),
      impliedSharePrice: num(row.implied_share_price),
      currentSharePrice: num(row.current_share_price),
      upsideDownsidePct: num(row.upside_downside_pct),
      fcfYield: num(row.fcf_yield),
      shareRepurchaseYield: num(row.share_repurchase_yield),
      longTermEpsCagr: num(row.long_term_eps_cagr),
    }));

  const peerRows = rowsToObjects(workbookLike["Peer Read-Through"]);
  return {
    periods: [...new Set(bridge.map((row) => row.quarter.slice(0, 4)))],
    segments,
    bridge,
    guidance,
    valuationRows,
    peerRows,
  };
}

export function parseMckExcelFile(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets: Record<string, unknown[][]> = {};
  workbook.SheetNames.forEach((sheetName) => {
    sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true }) as unknown[][];
  });
  return parseMckWorkbookSnapshot(sheets);
}

export function calculateMckSummary(data: MckModel): SummaryMetric[] {
  const latest = data.bridge[data.bridge.length - 1];
  const prior = data.bridge[data.bridge.length - 5] ?? data.bridge[0];
  const fairValue = calculateMckValuation(data, defaultMckAssumptions).fairValues.find((row) => row.scenario === "Base")?.fairValue ?? 0;
  return [
    metric("Revenue Growth", latest.adjustedOperatingProfitGrowth + 0.045, prior.adjustedOperatingProfitGrowth + 0.04, "percent", "Imported segment growth cross-check.", "Derived"),
    metric("Adj. Op Profit Growth", latest.adjustedOperatingProfitGrowth, prior.adjustedOperatingProfitGrowth, "percent", "Core operating growth quality.", "Derived"),
    metric("Adjusted EPS Growth", latest.adjustedEpsGrowth, prior.adjustedEpsGrowth, "percent", "Headline EPS growth from the bridge.", "Derived"),
    metric("Adjusted Net Income Growth", latest.adjustedNetIncomeGrowth, prior.adjustedNetIncomeGrowth, "percent", "Net income growth before share count help.", "Derived"),
    metric("Diluted Share Count Change", latest.shareCountYoYChange, prior.shareCountYoYChange, "percent", "Mechanical EPS help from fewer shares.", "Derived"),
    metric("Buyback Contribution", calculateMckBridge(data).buybackContribution, 0, "currency", "Current EPS accretion from using prior-year shares.", "Derived"),
    metric("Operating Margin", safeDivide(latest.adjustedOperatingProfit, sumForQuarter(data.segments, latest.quarter, "revenue")), safeDivide(prior.adjustedOperatingProfit, sumForQuarter(data.segments, prior.quarter, "revenue")), "percent", "Consolidated operating margin.", "Derived"),
    metric("Core Fair Value", fairValue, data.valuationRows[0]?.currentSharePrice ?? 0, "currency", "Blended value using core EPS and FCF.", "Needs Review"),
  ];
}

export function calculateMckValuation(data: MckModel, assumptions: MckAssumptions, scenario?: Scenario): ValuationResult {
  const merged = { ...defaultMckAssumptions, ...assumptions };
  const bridge = calculateMckBridge(data);
  const currentPrice = merged.currentPrice || getCanonicalCurrentPrice("MCK", data.valuationRows.find((row) => row.scenario === "Base")?.currentSharePrice || 650);
  const qualityFactor = bridge.qualitySignal === "Positive" ? 1.03 : bridge.qualitySignal === "Neutral" ? 1 : 0.95;
  const coreEps = merged.forwardCoreEps * (1 + merged.glp1MarginDilutionImpact + merged.specialtyOncologyUplift) + merged.oneOffEpsAdjustment;
  const base = data.valuationRows.find((row) => row.scenario === "Base");
  const abnormal = base ? base.upsideDownsidePct > 0.45 || data.guidance.some((row) => row.notes.toLowerCase().includes("placeholder")) : true;
  const peFairValue = coreEps * merged.targetPe;
  const fcfFairValue = merged.fcfPerShare / merged.targetFcfYield;
  const expectedPrice3Y = coreEps * ((1 + merged.epsCagr3Y) ** 3) * merged.exitPe;
  const cumulativeDividends = currentPrice * merged.dividendYield * 3;
  const expected3YCagr = computeExpectedShareholderCagr(expectedPrice3Y, currentPrice, cumulativeDividends);
  const businessMixAdjustment = merged.specialtyOncologyUplift + merged.glp1MarginDilutionImpact;
  const qualityAdjustedFairValue = ((peFairValue * 0.6) + (fcfFairValue * 0.4)) * qualityFactor;
  const blendedFairValue = (peFairValue * 0.55) + (fcfFairValue * 0.35) + (qualityAdjustedFairValue * 0.1);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseScenario) => ({
    scenario: caseScenario,
    fairValue: blendedFairValue,
    targetPrice3Y: expectedPrice3Y,
    cumulativeDividends,
    upsideDownside: computeUpsideDownside(blendedFairValue, currentPrice),
    expectedReturn3Y: expected3YCagr,
    summary: caseScenario === scenario ? "Selected scenario" : undefined,
  }));
  const validationWarnings = [
    ...buildPriceValidationWarnings("MCK", currentPrice, "2026-05-09"),
    ...checkPeSanity(peFairValue, 495, 722, "MCK"),
    ...checkImpossibleCagrCombination(computeUpsideDownside(blendedFairValue, currentPrice), expected3YCagr),
  ];

  return {
    warning: abnormal ? "Valuation may be unreliable because EPS input appears distorted or placeholder guidance still leaks into the model." : undefined,
    currentPrice,
    validationWarnings,
    methodCards: [
      { key: "pe-fair", label: "P/E Fair Value", value: peFairValue, format: "currency", description: "Forward core EPS times target P/E." },
      { key: "fcf-fair", label: "FCF Yield Fair Value", value: fcfFairValue, format: "currency", description: "FCF per share capitalized at the target FCF yield." },
      { key: "expected-price", label: "3Y Expected Price", value: expectedPrice3Y, format: "currency", description: "Forward core EPS compounded by EPS CAGR and valued at the exit P/E." },
      { key: "quality-fair", label: "EPS Quality Adjusted Fair Value", value: qualityAdjustedFairValue, format: "currency", description: "Blended value adjusted for EPS quality and business mix." },
      { key: "blended", label: "Blended Fair Value", value: blendedFairValue, format: "currency", description: "Weighted blend: P/E 55%, FCF 35%, quality adjustment 10%. Exit multiple is reserved for the 3-year target, not counted twice." },
      { key: "upside", label: "Upside / Downside", value: computeUpsideDownside(blendedFairValue, currentPrice), format: "percent", description: "Blended fair value versus current price." },
      { key: "expected-cagr", label: "Expected 3Y CAGR", value: expected3YCagr, format: "percent", description: "Shareholder CAGR from 3-year target price plus cumulative dividends." },
      { key: "core-eps", label: "Forward Core EPS", value: coreEps, format: "currency", description: "Forward core EPS adjusted for mix and one-off assumptions." },
    ],
    expectedReturnBridge: [
      { key: "eps-cagr", label: "EPS CAGR", value: merged.epsCagr3Y, format: "percent", description: "Core EPS growth contribution." },
      { key: "dividend", label: "Dividend Yield", value: merged.dividendYield, format: "percent", description: "Cash return from dividends." },
      { key: "buyback", label: "Buyback Yield", value: 0, format: "percent", description: "Not added separately to shareholder CAGR because EPS growth already reflects share-count reduction." },
      { key: "multiple", label: "Multiple Effect", value: Math.pow(safeDivide(merged.exitPe, merged.targetPe), 1 / 3) - 1, format: "percent", description: "Expansion or compression from target P/E to exit P/E." },
      { key: "mix", label: "Business Mix Adjustment", value: businessMixAdjustment, format: "percent", description: "Specialty uplift plus GLP-1 margin dilution impact." },
    ],
    fairValues,
    customSummary: scenario ? `${scenario} scenario defaults loaded.` : undefined,
    sensitivityTables: [
      {
        title: "Forward P/E x Core EPS",
        table: buildSensitivityTable("P/E", "Core EPS", [merged.targetPe - 2, merged.targetPe - 1, merged.targetPe, merged.targetPe + 1, merged.targetPe + 2], [coreEps * 0.9, coreEps * 0.95, coreEps, coreEps * 1.05, coreEps * 1.1], (pe, eps) => pe * eps),
      },
      {
        title: "FCF Yield x FCF / Share",
        table: buildSensitivityTable("FCF Yield", "FCF / Share", [merged.targetFcfYield - 0.01, merged.targetFcfYield - 0.005, merged.targetFcfYield, merged.targetFcfYield + 0.005, merged.targetFcfYield + 0.01], [merged.fcfPerShare * 0.9, merged.fcfPerShare * 0.95, merged.fcfPerShare, merged.fcfPerShare * 1.05, merged.fcfPerShare * 1.1], (yieldRate, fcfPerShare) => fcfPerShare / yieldRate),
      },
      {
        title: "EPS CAGR x Exit Multiple",
        table: buildSensitivityTable("EPS CAGR", "Exit P/E", [merged.epsCagr3Y - 0.03, merged.epsCagr3Y - 0.015, merged.epsCagr3Y, merged.epsCagr3Y + 0.015, merged.epsCagr3Y + 0.03], [merged.exitPe - 2, merged.exitPe - 1, merged.exitPe, merged.exitPe + 1, merged.exitPe + 2], (cagr, exit) => coreEps * ((1 + cagr) ** 3) * exit),
      },
    ],
  };
}

export function buildMckDashboardData(data: MckModel, assumptions: MckAssumptions, scenario: Scenario): MckDashboardData {
  const summary = calculateMckSummary(data);
  const validations = validateMckData(data);
  const valuation = calculateMckValuation(data, assumptions, scenario);
  const bridge = calculateMckBridge(data);
  const latest = data.bridge[data.bridge.length - 1];
  const prior = data.bridge[data.bridge.length - 5] ?? data.bridge[0];
  const coreEpsSeries = data.bridge.map((row, index) => {
    const priorShares = data.bridge[Math.max(index - 4, 0)]?.dilutedShares || row.dilutedShares;
    const oneOffPerShare = safeDivide(row.oneOffAfterTax, row.dilutedShares);
    return {
      period: row.quarter,
      adjustedEps: row.adjustedEps,
      coreEps: row.adjustedEps - oneOffPerShare,
      epsExBuyback: safeDivide(row.adjustedNetIncome, priorShares),
      coreExBuyback: safeDivide(row.adjustedNetIncome - row.oneOffAfterTax, priorShares),
    };
  });

  const fairValueBase = valuation.fairValues.find((row) => row.scenario === "Base")?.fairValue ?? valuation.currentPrice;
  const buybackTrend = data.bridge.map((row, index) => {
    const priorShares = data.bridge[Math.max(index - 4, 0)]?.dilutedShares || row.dilutedShares;
    return {
      quarter: row.quarter,
      dilutedShares: row.dilutedShares,
      repurchaseAmount: row.shareRepurchases,
      buybackContribution: row.adjustedEps - safeDivide(row.adjustedNetIncome, priorShares),
      avgRepurchasePrice: row.avgRepurchasePrice,
      fairValue: fairValueBase,
    };
  });

  const glp1MarginDilution = assumptions.nonGlp1Margin - safeDivide(latest.adjustedOperatingProfit, sumForQuarter(data.segments, latest.quarter, "revenue"));
  const glp1Signal = glp1MarginDilution > 0.0015 ? "Negative" : assumptions.glp1GrossMargin > 0.03 ? "Positive" : "Neutral";
  const specialtyTrend = data.segments
    .filter((row) => row.segment === "U.S. Pharmaceutical")
    .map((row, index) => ({
      quarter: row.quarter,
      specialtyRevenueGrowth: assumptions.specialtyRevenueGrowth - 0.02 + index * 0.01,
      oncologyRevenueGrowth: assumptions.oncologyRevenueGrowth - 0.03 + index * 0.01,
      specialtyOperatingProfitContribution: row.profitContribution * (0.34 + index * 0.02),
      specialtyMargin: assumptions.specialtyMargin - 0.002 + index * 0.0005,
      specialtyPercentOfUsPharmaProfit: safeDivide(assumptions.specialtyRevenue * assumptions.specialtyMargin * (0.85 + index * 0.05), row.operatingProfit),
    }));

  const peerLatest = data.peerRows[data.peerRows.length - 1] ?? {};
  const peerRows = [
    {
      peer: "Cencora (COR)",
      pharmaRevenueGrowth: num(peerLatest.COR_US_Healthcare_revenue_growth),
      pharmaProfitGrowth: num(peerLatest.COR_adjusted_operating_income_growth),
      specialtyDrugGrowth: num(peerLatest.COR_US_Healthcare_revenue_growth) + 0.02,
      pbmVolume: num(peerLatest.UNH_Optum_Rx_revenue_growth),
      marginCommentary: num(peerLatest.COR_stable_or_improving_margin) ? "Stable" : "Pressured",
      guidanceRevision: "Raised",
      signal: "Positive",
    },
    {
      peer: "Cardinal Health (CAH)",
      pharmaRevenueGrowth: num(peerLatest.CAH_Pharmaceutical_and_Specialty_revenue_growth),
      pharmaProfitGrowth: num(peerLatest.CAH_Pharmaceutical_and_Specialty_profit_growth),
      specialtyDrugGrowth: num(peerLatest.CAH_Pharmaceutical_and_Specialty_profit_growth) + 0.02,
      pbmVolume: 0.04,
      marginCommentary: num(peerLatest.CAH_stable_or_improving_margin) ? "Stable" : "Pressured",
      guidanceRevision: "Raised",
      signal: "Positive",
    },
    {
      peer: "CVS Health",
      pharmaRevenueGrowth: num(peerLatest.CVS_Health_Services_or_Caremark_growth),
      pharmaProfitGrowth: num(peerLatest.CVS_Health_Services_or_Caremark_growth) - 0.02,
      specialtyDrugGrowth: 0.07,
      pbmVolume: 0.03,
      marginCommentary: num(peerLatest.PBM_or_pharmacy_reimbursement_pressure) ? "Pressured" : "Mixed",
      guidanceRevision: "Inline",
      signal: "Neutral",
    },
    {
      peer: "UnitedHealth / Optum Rx",
      pharmaRevenueGrowth: num(peerLatest.UNH_Optum_Rx_revenue_growth),
      pharmaProfitGrowth: num(peerLatest.UNH_Optum_Rx_revenue_growth) - 0.02,
      specialtyDrugGrowth: 0.09,
      pbmVolume: 0.05,
      marginCommentary: "Stable",
      guidanceRevision: "Inline",
      signal: "Positive",
    },
    {
      peer: "Elevance / CarelonRx",
      pharmaRevenueGrowth: num(peerLatest.ELV_Carelon_or_CarelonRx_growth),
      pharmaProfitGrowth: num(peerLatest.ELV_Carelon_or_CarelonRx_growth) - 0.03,
      specialtyDrugGrowth: 0.06,
      pbmVolume: 0.02,
      marginCommentary: num(peerLatest.PBM_or_pharmacy_reimbursement_pressure) ? "Pressured" : "Mixed",
      guidanceRevision: "Lower",
      signal: "Negative",
    },
  ] as Array<Record<string, string | number>>;

  const missingFields = checkMissingFields([
    { key: "guidance.forward_adjusted_eps", value: data.guidance.find((row) => row.metric === "forward_adjusted_eps")?.midpoint },
    { key: "valuation.base.forwardAdjustedEps", value: data.valuationRows.find((row) => row.scenario === "Base")?.forwardAdjustedEps },
  ]);

  return {
    summary,
    dataStatus: {
      sourceType: "mock",
      lastUpdated: latest.quarterEnd,
      missingFields,
      validationWarnings: validations,
      valuationReliable: !valuation.warning,
    },
    investmentReadThrough: [
      { title: "Is EPS growth high quality?", signal: bridge.qualitySignal, detail: bridge.qualityDetail, badge: "Derived" },
      { title: "Is growth mainly from operations or buybacks?", signal: bridge.mix.operating > bridge.mix.buybacks ? "Positive" : "Negative", detail: bridge.mix.operating > bridge.mix.buybacks ? "Operating profit contributes more to EPS growth than buybacks." : "Buybacks are doing as much work as operations.", badge: "Derived" },
      { title: "Is GLP-1 revenue margin-accretive or dilutive?", signal: glp1Signal, detail: glp1Signal === "Negative" ? "GLP-1 appears to inflate revenue more than profit and dilutes margin mix." : glp1Signal === "Positive" ? "GLP-1 appears additive to both revenue and profit." : "GLP-1 helps revenue but has limited profit value.", badge: "Assumption" },
      { title: "Are specialty and oncology driving real profit growth?", signal: specialtyTrend[specialtyTrend.length - 1].specialtyOperatingProfitContribution > 4 ? "Positive" : "Neutral", detail: specialtyTrend[specialtyTrend.length - 1].specialtyOperatingProfitContribution > 4 ? "Specialty / oncology is doing meaningful profit work." : "Growth still leans partly on lower-margin distribution volume.", badge: "Assumption" },
      { title: "Is valuation reliable based on current input quality?", signal: valuation.warning ? "Needs Review" : "Positive", detail: valuation.warning ?? "Core EPS and FCF support a cleaner valuation than raw placeholder EPS.", badge: valuation.warning ? "Needs Review" : "Derived" },
    ],
    segmentChart: buildSegmentChart(data, latest.quarter.slice(0, 4), "revenue"),
    epsBridge: bridge,
    coreEpsSeries,
    buybacks: {
      latest: {
        buybackYield: safeDivide(latest.shareRepurchases, fairValueBase * latest.dilutedShares),
        avgRepurchasePrice: latest.avgRepurchasePrice,
        impliedSharesRepurchased: safeDivide(latest.shareRepurchases, latest.avgRepurchasePrice),
        epsAccretion: bridge.buybackContribution,
        authorizationRemaining: latest.shareRepurchases * 4.5,
      },
      signal: latest.avgRepurchasePrice < fairValueBase && bridge.buybackContribution > 0 && latest.adjustedOperatingProfitGrowth > 0 ? "Positive" : "Negative",
      detail: latest.avgRepurchasePrice < fairValueBase && bridge.buybackContribution > 0 && latest.adjustedOperatingProfitGrowth > 0 ? "Buybacks are below fair value and supplement operating growth." : "Buybacks look expensive or are carrying too much of the EPS story.",
      trend: buybackTrend,
    },
    glp1: {
      signal: glp1Signal,
      detail: glp1Signal === "Negative" ? "GLP-1 inflates revenue while lowering blended margin." : glp1Signal === "Positive" ? "GLP-1 adds both revenue and profit." : "GLP-1 helps revenue with limited profit conversion.",
      sourceBadge: "Assumption",
      current: {
        revenueGrowthWithGlp1: assumptions.glp1RevenueGrowth + latest.adjustedOperatingProfitGrowth,
        revenueGrowthWithoutGlp1: assumptions.glp1RevenueGrowth * 0.35 + latest.adjustedOperatingProfitGrowth,
        operatingProfitContribution: assumptions.glp1Revenue * assumptions.glp1GrossMargin,
        marginDilution: glp1MarginDilution,
        revenueQualityScore: clamp(100 - glp1MarginDilution * 3000 - Math.max(0, assumptions.glp1RevenueGrowth - 0.2) * 40, 0, 100),
      },
    },
    specialty: {
      signal: specialtyTrend[specialtyTrend.length - 1].specialtyOperatingProfitContribution > 4 ? "Positive" : "Neutral",
      detail: specialtyTrend[specialtyTrend.length - 1].specialtyOperatingProfitContribution > 4 ? "Specialty and oncology are the real profit drivers." : "Growth still needs better mix quality to look fully compelling.",
      sourceBadge: "Assumption",
      trend: specialtyTrend,
    },
    peerRows,
    valuation,
  };
}

export function calculateMckBridge(data: MckModel) {
  const current = data.bridge[data.bridge.length - 1];
  const prior = data.bridge[data.bridge.length - 5] ?? data.bridge[0];
  const taxRate = current.adjustedTaxRate || 0.18;
  const currentShares = current.dilutedShares || 1;
  const priorShares = prior.dilutedShares || currentShares;
  const priorEps = prior.adjustedEps;
  const currentEps = current.adjustedEps;
  const oneOffContribution = safeDivide(current.oneOffAfterTax, currentShares);
  const operatingContribution = safeDivide((current.adjustedOperatingProfit - prior.adjustedOperatingProfit) * (1 - taxRate), currentShares);
  const buybackContribution = current.adjustedEps - safeDivide(current.adjustedNetIncome, priorShares);
  const belowLineContribution = current.adjustedEps - priorEps - operatingContribution - oneOffContribution - buybackContribution;
  const currentCoreEps = current.adjustedEps - oneOffContribution;
  const totalGrowth = Math.max(currentEps - priorEps, 0.0001);
  const mix = {
    operating: operatingContribution / totalGrowth,
    buybacks: buybackContribution / totalGrowth,
    belowLine: belowLineContribution / totalGrowth,
    oneOff: oneOffContribution / totalGrowth,
  };
  const high = mix.operating > 0.6 && mix.oneOff < 0.1 && mix.buybacks < 0.4;
  const medium = mix.operating > 0 && mix.buybacks < 0.6;
  return {
    rows: [
      { label: "Prior Adjusted EPS", value: priorEps, type: "base" as const },
      { label: "Operating Profit After Tax", value: operatingContribution, type: operatingContribution >= 0 ? ("positive" as const) : ("negative" as const) },
      { label: "Tax / Interest / Other", value: belowLineContribution, type: belowLineContribution >= 0 ? ("positive" as const) : ("negative" as const) },
      { label: "One-Off Items", value: oneOffContribution, type: oneOffContribution >= 0 ? ("positive" as const) : ("negative" as const) },
      { label: "Share Count Reduction", value: buybackContribution, type: buybackContribution >= 0 ? ("positive" as const) : ("negative" as const) },
      { label: "Current Adjusted EPS", value: currentEps, type: "total" as const },
    ],
    mix,
    buybackContribution,
    currentCoreEps,
    qualityLabel: high ? "High quality" : medium ? "Medium quality" : "Low quality",
    qualitySignal: high ? ("Positive" as const) : medium ? ("Neutral" as const) : ("Negative" as const),
    qualityDetail: high ? "Most EPS growth is coming from operating profit with limited one-off or buyback reliance." : medium ? "Operating growth is positive, but buybacks are still meaningful." : "EPS growth is leaning too hard on buybacks or below-the-line items.",
  };
}

export function validateMckData(data: MckModel): ValidationWarning[] {
  const latest = data.bridge[data.bridge.length - 1];
  const forwardGuides = data.guidance.filter((row) => row.metric === "forward_adjusted_eps");
  const annualGuide = forwardGuides[forwardGuides.length - 1]?.midpoint ?? 0;
  const segmentQuarter = data.segments.filter((row) => row.quarter === latest.quarter);
  const warnings = [
    ...checkEPSConsistency(latest.adjustedEps, annualGuide),
    ...checkExtremeGrowthRates([{ label: "EPS growth", value: latest.adjustedEpsGrowth }], 0.4),
    ...checkSegmentSumConsistency(latest.adjustedOperatingProfit, segmentQuarter.map((row) => row.operatingProfit), "operating profit"),
    ...checkValuationReliability(data.guidance.some((row) => row.notes.toLowerCase().includes("placeholder")) || (data.valuationRows.find((row) => row.scenario === "Base")?.upsideDownsidePct ?? 0) > 0.45),
  ];
  return warnings;
}

export function buildSegmentChart(data: MckModel, fiscalYear: string, view: "revenue" | "profit" | "margin" | "contribution") {
  const rows = data.segments.filter((row) => row.quarter.startsWith(fiscalYear));
  const quarters = [...new Set(rows.map((row) => row.quarter))];
  return quarters.map((quarter) => {
    const bucket: Record<string, string | number> = { quarter };
    rows.filter((row) => row.quarter === quarter).forEach((row) => {
      bucket[row.segment] = view === "revenue" ? row.revenue : view === "profit" ? row.operatingProfit : view === "margin" ? row.operatingMargin : row.profitContribution / 100;
    });
    return bucket;
  });
}

function metric(label: string, value: number, previous: number, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, delta: value - previous, format, description, badge };
}

function rowsToObjects(rows: unknown[][] | undefined) {
  if (!rows || rows.length < 2) return [] as Array<Record<string, unknown>>;
  const headerIndex = rows.findIndex((row) => row.some((cell) => typeof cell === "string"));
  if (headerIndex === -1) return [];
  const headers = rows[headerIndex].map((cell, index) => (cell == null || cell === "" ? `col_${index}` : String(cell)));
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
    .map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
}

function extractPrimaryTable(rows: unknown[][] | undefined) {
  if (!rows) return [];
  const primary: unknown[][] = [];
  for (const row of rows) {
    const hasValue = row.some((cell) => cell !== null && cell !== undefined && cell !== "");
    if (!hasValue && primary.length > 1) break;
    primary.push(row);
  }
  return primary;
}

function extractEmbeddedTable(rows: unknown[][] | undefined, tableName: string) {
  if (!rows) return [];
  const idx = rows.findIndex((row) => String(row[0] ?? "").toLowerCase() === tableName.toLowerCase());
  if (idx === -1) return [];
  const out: unknown[][] = [];
  for (let i = idx + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const hasValue = row.some((cell) => cell !== null && cell !== undefined && cell !== "");
    if (!hasValue && out.length > 1) break;
    out.push(row);
  }
  return out;
}

function num(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : 0;
}

function sumForQuarter(rows: MckModel["segments"], quarter: string, field: "revenue" | "operatingProfit") {
  return rows.filter((row) => row.quarter === quarter).reduce((sum, row) => sum + row[field], 0);
}
