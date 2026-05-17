import type { AnetDataset } from "./model";

export const anetDataset: AnetDataset = {
  latestReportingPeriod: "FY2026 Q1",
  marketData: {
    currentPrice: 141,
    priceDate: "2026-05-12",
    sharesForMarketCap: 1_255,
    marketCap: 176_955,
    source: "research_only offline fallback; backend daily price bars override this when API is online",
    sourceStatus: "research_only",
  },
  periods: [
    { id: "fy2025", label: "FY2025", fiscalYear: 2025, periodType: "annual", sourceStatus: "market_data_proxy", sourceId: "anet-static-fallback-fy2025", revenue: 13_100, operatingIncome: 1_680, operatingMargin: 0.128, netIncome: 1_800, dilutedEps: 8.65, dilutedShares: 208, operatingCashFlow: 5_380, capex: 620, freeCashFlow: 4_760, dividendsPaid: 0, buybacks: 2_000, dividendPerShare: 0, notes: "Static fallback; backend SQLite rows replace this when the API is online." },
    { id: "fy2026-q1", label: "FY2026 Q1", fiscalYear: 2026, fiscalQuarter: "Q1", periodType: "quarter", sourceStatus: "market_data_proxy", sourceId: "anet-static-fallback-fy2026-q1", revenue: 3_450, operatingIncome: 465, operatingMargin: 0.135, netIncome: 480, dilutedEps: 2.30, dilutedShares: 209, operatingCashFlow: 1_450, capex: 165, freeCashFlow: 1_285, dividendsPaid: 0, buybacks: 500, dividendPerShare: 0, notes: "Static fallback; backend SQLite rows replace this when the API is online." },
  ],
  operatingMetrics: [
    { periodId: "fy2026-q1", asOfDate: "2026-04-23", sourceStatus: "market_data_proxy", subscriptionRevenue: 1_180, subscriptionRevenueGrowth: 0.17, currentRpo: 2_850, currentRpoGrowth: 0.15, remainingPerformanceObligations: 3_850, netRetentionRate: 1.10, largeCustomerCount: 43, agenticAiArr: 520, agenticAiCustomers: 32, proPlusAdoptionRate: 0.55, cloudTitanRevenue: 1_180, cloudTitanGrowth: 0.17, aiNetworkingRevenue: 520, aiNetworkingGrowth: 0.45, campusRevenue: 420, campusGrowth: 0.08, highSpeedPortShipments: 1_180, highSpeedPortGrowth: 0.45, cloudCustomerConcentration: 0.43, backlog: 2_850, inventoryDays: 95, grossDollarVolume: 1_180, purchaseVolume: 520, crossBorderVolumeGrowth: 0.17, switchedTransactions: 1_180, switchedTransactionsGrowth: 0.45, processedTransactions: 1_180, cardsAccounts: 43, rebatesIncentives: 520, takeRate: 1_180 / 2_150, takeRateCommentary: "Cloud titan revenue / total revenue mix, not a payments take-rate.", valueAddedServicesCommentary: "EOS, CloudVision, routing software and automation are software attach markers.", regulatoryCommentary: "Export controls, China exposure and supply-chain/geopolitical limits matter more than classic software regulation.", competitionCommentary: "Cisco, Nvidia Spectrum-X, Broadcom merchant silicon, white-box and hyperscaler in-house designs are the key competitors.", capitalReturnCommentary: "ANET has no dividend; buybacks are judged as SBC/dilution offset versus FCF.", normalizedFcfCommentary: "FCF conversion is strong but working capital/inventory cycles can distort conversion." },
  ],
  segmentFinancials: [
    { periodId: "fy2026-q1", segment: "Cloud Titans / AI Data Center", taxonomy: "cloud_ai", revenue: 1_180, operatingIncome: 507, operatingMargin: 0.43, growth: 0.17, sourceStatus: "research_only" },
    { periodId: "fy2026-q1", segment: "AI Ethernet / High-Speed Switching", taxonomy: "ai_ethernet", revenue: 520, operatingIncome: 239, operatingMargin: 0.46, growth: 0.45, sourceStatus: "research_only" },
    { periodId: "fy2026-q1", segment: "Enterprise / Campus", taxonomy: "campus_enterprise", revenue: 420, operatingIncome: 143, operatingMargin: 0.34, growth: 0.08, sourceStatus: "research_only" },
  ],
};
