import type { Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildValidationWarning } from "../../utils/validation";
import { aaplDataset } from "./data";
import { aaplScenarioPresets, defaultAaplValuationAssumptions } from "./assumptions";
import type {
  AaplDataset,
  AaplFinancialPeriod,
  AaplGeographicFinancial,
  AaplProductFinancial,
  AaplValuationAssumptions,
} from "./model";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function latestPeriod(data: AaplDataset) {
  return [...data.periods].sort((left, right) => {
    const leftDate = left.asOfDate ?? left.periodEndDate ?? String(left.fiscalYear);
    const rightDate = right.asOfDate ?? right.periodEndDate ?? String(right.fiscalYear);
    return leftDate.localeCompare(rightDate);
  })[data.periods.length - 1];
}

function annualizePeriod(period: AaplFinancialPeriod) {
  const multiplier = period.periodType === "quarter" ? 4 : 1;
  return {
    revenue: period.revenue * multiplier,
    grossProfit: (period.grossProfit ?? period.revenue * (period.grossMargin ?? 0.45)) * multiplier,
    operatingIncome: period.operatingIncome * multiplier,
    netIncome: (period.netIncome ?? period.operatingIncome * 0.82) * multiplier,
    operatingCashFlow: (period.operatingCashFlow ?? period.revenue * 0.30) * multiplier,
    capex: (period.capex ?? period.revenue * 0.035) * multiplier,
    freeCashFlow: (period.freeCashFlow ?? period.revenue * 0.265) * multiplier,
    dividendsPaid: (period.dividendsPaid ?? period.revenue * 0.035) * multiplier,
    buybacks: (period.buybacks ?? period.revenue * 0.20) * multiplier,
  };
}

function latestProduct(data: AaplDataset, category: string): AaplProductFinancial | undefined {
  const sorted = [...data.productFinancials]
    .filter((row) => row.productCategory === category && finite(row.revenue))
    .sort((left, right) => (left.asOfDate ?? "").localeCompare(right.asOfDate ?? ""));
  return sorted[sorted.length - 1];
}

function productRowsForPeriod(data: AaplDataset, periodId: string) {
  return data.productFinancials.filter((row) => row.periodId === periodId);
}

function geographyRowsForPeriod(data: AaplDataset, periodId: string) {
  return data.geographicFinancials.filter((row) => row.periodId === periodId);
}

function growthFromRows(rows: Array<AaplProductFinancial | AaplGeographicFinancial>, key: string) {
  const matching = rows.filter((row) => ("productCategory" in row ? row.productCategory : row.geography) === key && finite(row.growth));
  return matching[matching.length - 1]?.growth ?? null;
}

function inferServicesMix(data: AaplDataset, revenue: number) {
  const services = latestProduct(data, "Services")?.revenue;
  return services && revenue ? clamp(services / revenue, 0.12, 0.38) : 0.26;
}

function methodCard(key: string, label: string, value: number, description: string) {
  return { key, label, value, format: "currency" as const, description };
}

export function getAaplPeriods() {
  return aaplDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultAaplPeriod() {
  return aaplDataset.periods[aaplDataset.periods.length - 1]?.id ?? "q2-fy26";
}

export function calculateAaplSummary(data: unknown): SummaryMetric[] {
  const dataset = (data as AaplDataset) ?? aaplDataset;
  const period = latestPeriod(dataset);
  const annualized = annualizePeriod(period);
  const productRows = productRowsForPeriod(dataset, period.id);
  const geoRows = geographyRowsForPeriod(dataset, period.id);
  const servicesRevenue = productRows.find((row) => row.productCategory === "Services")?.revenue ?? annualized.revenue * inferServicesMix(dataset, annualized.revenue);
  const iphoneRevenue = productRows.find((row) => row.productCategory === "iPhone")?.revenue ?? annualized.revenue * 0.49;
  const greaterChina = geoRows.find((row) => row.geography === "Greater China")?.revenue ?? annualized.revenue * 0.17;
  const fcf = annualized.freeCashFlow;
  return [
    {
      key: "revenue",
      label: "Annualized Revenue",
      value: annualized.revenue,
      format: "currency",
      description: "Latest period revenue annualized for valuation context.",
      badge: period.sourceStatus === "official_actual" ? "Actual" : "Placeholder",
    },
    {
      key: "servicesMix",
      label: "Services Mix",
      value: servicesRevenue / annualized.revenue,
      format: "percent",
      description: "Services revenue as a share of total revenue.",
      badge: "Derived",
    },
    {
      key: "iphoneMix",
      label: "iPhone Mix",
      value: iphoneRevenue / annualized.revenue,
      format: "percent",
      description: "iPhone revenue as a share of total revenue.",
      badge: "Derived",
    },
    {
      key: "chinaMix",
      label: "Greater China Mix",
      value: greaterChina / annualized.revenue,
      format: "percent",
      description: "Greater China revenue exposure.",
      badge: "Derived",
    },
    {
      key: "fcfMargin",
      label: "FCF Margin",
      value: fcf / annualized.revenue,
      format: "percent",
      description: "Free cash flow conversion after capex.",
      badge: "Derived",
    },
  ];
}

export function calculateAaplValuation(
  data: unknown,
  assumptionOverrides: Partial<AaplValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = (data as AaplDataset) ?? aaplDataset;
  const period = latestPeriod(dataset);
  const annualized = annualizePeriod(period);
  const preset = aaplScenarioPresets[scenario] ?? aaplScenarioPresets.Base;
  const assumptions: AaplValuationAssumptions = {
    ...defaultAaplValuationAssumptions,
    ...preset,
    ...assumptionOverrides,
  };

  const revenue = annualized.revenue;
  const latestProducts = productRowsForPeriod(dataset, period.id);
  const latestGeos = geographyRowsForPeriod(dataset, period.id);
  const servicesRevenue =
    latestProducts.find((row) => row.productCategory === "Services")?.revenue ??
    revenue * inferServicesMix(dataset, revenue);
  const iphoneRevenue =
    latestProducts.find((row) => row.productCategory === "iPhone")?.revenue ??
    revenue * 0.49;
  const otherProductsRevenue = Math.max(revenue - servicesRevenue - iphoneRevenue, 0);
  const greaterChinaRevenue =
    latestGeos.find((row) => row.geography === "Greater China")?.revenue ??
    revenue * 0.17;

  const servicesMix = clamp(servicesRevenue / revenue, 0.10, 0.40);
  const iphoneMix = clamp(iphoneRevenue / revenue, 0.25, 0.70);
  const chinaMix = clamp(greaterChinaRevenue / revenue, 0.05, 0.35);
  const productGm = assumptions.productsGrossMargin;
  const servicesGm = assumptions.servicesGrossMargin;
  const mixAdjustedGrossMargin =
    servicesMix * servicesGm + (1 - servicesMix) * productGm;
  const operatingMargin = clamp(
    assumptions.operatingMargin + (mixAdjustedGrossMargin - 0.465) * 0.32,
    0.22,
    0.42,
  );
  const normalizedRevenueGrowth =
    iphoneMix * assumptions.iPhoneGrowth +
    servicesMix * assumptions.servicesGrowth +
    Math.max(1 - iphoneMix - servicesMix, 0) * assumptions.otherProductsGrowth;
  const normalizedRevenue = revenue * (1 + normalizedRevenueGrowth);
  const normalizedFcf = normalizedRevenue * assumptions.normalizedFcfMargin;
  const netIncome = normalizedRevenue * operatingMargin * 0.84;
  const eps = netIncome / assumptions.dilutedShares;
  const ebit = normalizedRevenue * operatingMargin;
  const netCashPerShare = assumptions.netCashDebt / assumptions.dilutedShares;
  const regulationHaircut = normalizedRevenue * servicesMix * assumptions.servicesRegulatoryHaircut;
  const chinaHaircut = normalizedRevenue * chinaMix * assumptions.chinaRiskHaircut;
  const riskHaircutPerShare = (regulationHaircut + chinaHaircut) / assumptions.dilutedShares;

  const explicitFcf = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    const fadeGrowth = normalizedRevenueGrowth * (1 - index * 0.12);
    return normalizedFcf * (1 + Math.max(fadeGrowth, -0.04)) ** year;
  });
  const discountRate = scenario === "Bear" ? 0.095 : scenario === "Bull" ? 0.078 : 0.085;
  const terminalFcf = explicitFcf[explicitFcf.length - 1] * (1 + clamp(normalizedRevenueGrowth * 0.45, 0.01, 0.045));
  const terminalValue = terminalFcf / assumptions.targetFcfYield;
  const dcfEquity =
    explicitFcf.reduce((sum, fcf, index) => sum + fcf / (1 + discountRate) ** (index + 1), 0) +
    terminalValue / (1 + discountRate) ** 5 +
    assumptions.netCashDebt -
    regulationHaircut * 6 -
    chinaHaircut * 4;
  const dcfValue = dcfEquity / assumptions.dilutedShares + assumptions.aiOptionalityPerShare * 0.55;

  const fcfFairValue = normalizedFcf / assumptions.targetFcfYield / assumptions.dilutedShares + netCashPerShare - riskHaircutPerShare;
  const peFairValue = eps * assumptions.targetPe + netCashPerShare * 0.35 - riskHaircutPerShare;
  const evEbitFairValue = (ebit * assumptions.targetEvEbit + assumptions.netCashDebt) / assumptions.dilutedShares - riskHaircutPerShare;
  const productsValue = (iphoneRevenue + otherProductsRevenue) * assumptions.productsSalesMultiple;
  const servicesValue = servicesRevenue * assumptions.servicesSalesMultiple * (1 - assumptions.servicesRegulatoryHaircut);
  const sotpFairValue =
    (productsValue + servicesValue + assumptions.netCashDebt) / assumptions.dilutedShares -
    chinaHaircut / assumptions.dilutedShares +
    assumptions.aiOptionalityPerShare;

  const methodValues = [dcfValue, fcfFairValue, peFairValue, evEbitFairValue, sotpFairValue].filter(finite);
  const blendedFairValue = Math.max(0, average(methodValues));
  const probabilityWeightedFairValue =
    scenario === "Base"
      ? average([
          calculateAaplValuation(dataset, { ...assumptionOverrides, ...aaplScenarioPresets.Bear }, "Bear").recommendedFairValue ?? 0,
          blendedFairValue * 2,
          calculateAaplValuation(dataset, { ...assumptionOverrides, ...aaplScenarioPresets.Bull }, "Bull").recommendedFairValue ?? 0,
        ])
      : undefined;
  const currentPrice = assumptions.currentPrice;
  const cumulativeDividends = currentPrice * assumptions.dividendYield * 3;
  const targetPrice3Y =
    blendedFairValue *
    (1 + clamp(normalizedRevenueGrowth + assumptions.buybackYield * 0.55, -0.02, 0.13)) ** 3;
  const expectedReturn3Y = currentPrice ? (targetPrice3Y + cumulativeDividends) / currentPrice - 1 : 0;
  const expectedShareholderCagr = currentPrice ? ((targetPrice3Y + cumulativeDividends) / currentPrice) ** (1 / 3) - 1 : 0;
  const upsideDownside = currentPrice ? blendedFairValue / currentPrice - 1 : 0;
  const dispersion =
    methodValues.length > 1
      ? Math.max(...methodValues) / Math.max(Math.min(...methodValues), 1) - 1
      : 0;

  const validationWarnings: ValidationWarning[] = [];
  if (period.sourceStatus !== "official_actual") {
    validationWarnings.push(buildValidationWarning(
      "aapl-static-fallback",
      "Static fallback active",
      "The frontend is using static fallback data. Backend historical valuation runs use SQLite as-of snapshots when the API is online.",
      "medium",
    ));
  }
  if (!latestProducts.length) {
    validationWarnings.push(buildValidationWarning(
      "aapl-product-mix-missing",
      "Product mix missing",
      "Product revenue detail is unavailable for the selected period, so the valuation engine falls back to normalized mix assumptions.",
      "medium",
    ));
  }

  return {
    currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings,
    fairValues: [
      {
        scenario,
        fairValue: blendedFairValue,
        upsideDownside,
        expectedReturn3Y,
        targetPrice3Y,
        cumulativeDividends,
        summary:
          scenario === "Bear"
            ? "Weak iPhone cycle, Services regulation, China deterioration, and multiple compression."
            : scenario === "Bull"
              ? "AI-driven upgrade cycle, Services resilience, China stabilization, and buyback compounding."
              : "Modest iPhone replacement demand, Services mix-up, stable margins, and continued buybacks.",
      },
    ],
    methodCards: [
      methodCard("dcf", "DCF / FCFF", dcfValue, "Five-year FCFF with explicit Services regulation and China haircuts."),
      methodCard("fcfYield", "FCF Yield", fcfFairValue, "Normalized FCF capitalized at target equity FCF yield."),
      methodCard("pe", "P/E", peFairValue, "Normalized EPS multiple with partial net cash recognition."),
      methodCard("evEbit", "EV / EBIT", evEbitFairValue, "Operating EBIT multiple plus net cash."),
      methodCard("sotp", "SOTP", sotpFairValue, "Products ecosystem, Services, net cash, and AI optionality value bridge."),
    ],
    expectedReturnBridge: [
      { key: "normalizedGrowth", label: "Normalized Revenue Growth", value: normalizedRevenueGrowth, format: "percent" },
      { key: "operatingMargin", label: "Operating Margin", value: operatingMargin, format: "percent" },
      { key: "servicesMix", label: "Services Mix", value: servicesMix, format: "percent" },
      { key: "chinaMix", label: "Greater China Mix", value: chinaMix, format: "percent" },
      { key: "buybackYield", label: "Buyback Yield", value: assumptions.buybackYield, format: "percent" },
      { key: "expectedCagr", label: "3Y Shareholder CAGR", value: expectedShareholderCagr, format: "percent" },
    ],
    sensitivityTables: [
      {
        title: "Services Regulation vs FCF Yield",
        table: [
          ["Reg / Yield", "3.2%", "3.8%", "5.2%"],
          ["2.5%", Math.round(normalizedFcf / 0.032 / assumptions.dilutedShares), Math.round(normalizedFcf / 0.038 / assumptions.dilutedShares), Math.round(normalizedFcf / 0.052 / assumptions.dilutedShares)],
          ["5.0%", Math.round((normalizedFcf / 0.032 - normalizedRevenue * servicesMix * 0.05 * 6) / assumptions.dilutedShares), Math.round((normalizedFcf / 0.038 - normalizedRevenue * servicesMix * 0.05 * 6) / assumptions.dilutedShares), Math.round((normalizedFcf / 0.052 - normalizedRevenue * servicesMix * 0.05 * 6) / assumptions.dilutedShares)],
          ["11.0%", Math.round((normalizedFcf / 0.032 - normalizedRevenue * servicesMix * 0.11 * 6) / assumptions.dilutedShares), Math.round((normalizedFcf / 0.038 - normalizedRevenue * servicesMix * 0.11 * 6) / assumptions.dilutedShares), Math.round((normalizedFcf / 0.052 - normalizedRevenue * servicesMix * 0.11 * 6) / assumptions.dilutedShares)],
        ],
      },
      {
        title: "iPhone Growth / Services Growth",
        table: [
          ["iPhone / Services", "4.5%", "9.0%", "13.0%"],
          ["-3.0%", -0.03, normalizedRevenueGrowth, assumptions.servicesGrowth],
          ["1.0%", assumptions.iPhoneGrowth, blendedFairValue, targetPrice3Y],
          ["5.5%", 0.055, blendedFairValue + assumptions.aiOptionalityPerShare, targetPrice3Y + assumptions.aiOptionalityPerShare],
        ],
      },
    ],
    dcfValue,
    fcfFairValue,
    peFairValue,
    sotpFairValue,
    blendedFairValue,
    recommendedFairValue: blendedFairValue,
    recommendedFairValueMethod: "Equal-weight Apple valuation triangulation",
    recommendedFairValueReason:
      "AAPL is underwritten as a mature cash-compounder where Services mix, iPhone replacement cadence, China risk, regulation, and buybacks jointly drive value.",
    probabilityWeightedFairValue,
    targetPrice3Y,
    expectedReturn3Y,
    upsideDownside,
    methodDispersion: dispersion,
    dataQualityScore: period.sourceStatus === "official_actual" ? 0.86 : 0.45,
    recommendedValuationConfidence: period.sourceStatus === "official_actual" ? 0.78 : 0.48,
  };
}

export function resolveAaplDataset(data: unknown): AaplDataset {
  return (data as AaplDataset) ?? aaplDataset;
}

export function buildAaplDashboardData(data: AaplDataset, scenario: Scenario, assumptions: Partial<AaplValuationAssumptions>) {
  const valuation = calculateAaplValuation(data, assumptions, scenario);
  const period = latestPeriod(data);
  const productRows = productRowsForPeriod(data, period.id);
  const geoRows = geographyRowsForPeriod(data, period.id);
  return {
    dataset: data,
    period,
    valuation,
    productRows,
    geoRows,
    metrics: calculateAaplSummary(data),
    productGrowth: {
      iphone: growthFromRows(data.productFinancials, "iPhone"),
      services: growthFromRows(data.productFinancials, "Services"),
      china: growthFromRows(data.geographicFinancials, "Greater China"),
    },
  };
}
