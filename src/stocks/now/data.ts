import type { NowDataset } from "./model";

export const nowDataset: NowDataset = {
  latestReportingPeriod: "FY2026 Q1",
  marketData: {
    currentPrice: 95.15,
    priceDate: "2026-05-15",
    sharesForMarketCap: 1_030,
    marketCap: 98_004.5,
    source: "market_data_proxy split-adjusted fallback after ServiceNow 5-for-1 stock split; backend daily price bars override this when API is online",
    sourceStatus: "market_data_proxy",
  },
  periods: [
    { id: "fy2025", label: "FY2025", fiscalYear: 2025, periodType: "annual", sourceStatus: "market_data_proxy", sourceId: "now-static-fallback-fy2025", revenue: 13_100, operatingIncome: 1_680, operatingMargin: 0.128, netIncome: 1_800, dilutedEps: 1.73, dilutedShares: 1_040, operatingCashFlow: 5_380, capex: 620, freeCashFlow: 4_760, dividendsPaid: 0, buybacks: 2_000, dividendPerShare: 0, notes: "Static fallback; per-share fields are split-adjusted for the December 2025 5-for-1 stock split. Backend SQLite rows replace this when the API is online." },
    { id: "fy2026-q1", label: "FY2026 Q1", fiscalYear: 2026, fiscalQuarter: "Q1", periodType: "quarter", sourceStatus: "market_data_proxy", sourceId: "now-static-fallback-fy2026-q1", revenue: 3_450, operatingIncome: 465, operatingMargin: 0.135, netIncome: 480, dilutedEps: 0.46, dilutedShares: 1_045, operatingCashFlow: 1_450, capex: 165, freeCashFlow: 1_285, dividendsPaid: 0, buybacks: 500, dividendPerShare: 0, notes: "Static fallback; per-share fields are split-adjusted for the December 2025 5-for-1 stock split. Backend SQLite rows replace this when the API is online." },
  ],
  operatingMetrics: [
    { periodId: "fy2026-q1", asOfDate: "2026-04-23", sourceStatus: "market_data_proxy", subscriptionRevenue: 3_330, subscriptionRevenueGrowth: 0.21, currentRpo: 13_700, currentRpoGrowth: 0.19, remainingPerformanceObligations: 28_500, netRetentionRate: 1.21, largeCustomerCount: 2_580, agenticAiArr: 520, agenticAiCustomers: 1_300, proPlusAdoptionRate: 0.22, grossDollarVolume: 13_700, purchaseVolume: 28_500, crossBorderVolumeGrowth: 0.21, switchedTransactions: 2_580, switchedTransactionsGrowth: 0.21, processedTransactions: 1_300, cardsAccounts: 2_580, rebatesIncentives: 3_330, takeRate: 3_330 / 3_450, takeRateCommentary: "Subscription revenue / total revenue mix, not a payments take-rate.", valueAddedServicesCommentary: "Agentic AI, Pro Plus and workflow automation attach are the value-added mix tests.", regulatoryCommentary: "Primary risk is AI/data governance, procurement scrutiny and platform lock-in review.", competitionCommentary: "Salesforce, Microsoft, Atlassian, Workday, BMC and AI workflow tooling are the main comparison set.", capitalReturnCommentary: "NOW has no dividend; buybacks are judged as SBC/dilution offset versus FCF.", normalizedFcfCommentary: "FCF conversion is strong but must be normalized for billing cadence and SBC." },
  ],
  segmentFinancials: [
    { periodId: "fy2026-q1", segment: "Subscription Workflow Platform", taxonomy: "subscription_platform", revenue: 2_398, operatingIncome: 790, operatingMargin: 0.33, growth: 0.21, sourceStatus: "research_only" },
    { periodId: "fy2026-q1", segment: "AI Agents and Pro Plus", taxonomy: "agentic_ai", revenue: 130, operatingIncome: 33, operatingMargin: 0.25, growth: 1.05, sourceStatus: "research_only" },
    { periodId: "fy2026-q1", segment: "Professional Services and Other", taxonomy: "services_other", revenue: 120, operatingIncome: 2, operatingMargin: 0.02, growth: 0.06, sourceStatus: "research_only" },
  ],
};
