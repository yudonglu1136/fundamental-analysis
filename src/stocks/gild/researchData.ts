import type { BiopharmaResearchDataset } from "../biopharmaResearch/types";
import { gildEarningsDataset } from "./data";

export const gildResearchData: BiopharmaResearchDataset = {
  ticker: "GILD",
  name: "Gilead Sciences",
  sector: "Large-cap biopharma / HIV / oncology / liver disease",
  currency: "USD",
  currentPrice: 134.06,
  priceDate: "2026-05-07",
  sharesOutstanding: 1_240,
  marketCap: 166_234,
  enterpriseValue: 168_000,
  reportingCurrency: "USD",
  modelArchetype: "cash_flow_plus_pipeline",
  thesis:
    "GILD is a durable HIV cash-flow compounder with a prevention franchise option: the stock works if Biktarvy remains resilient, Yeztugo/lenacapavir expands the prevention market, and oncology/cell-therapy BD converts into credible non-HIV growth.",
  companyStrategy:
    "Management is using HIV cash flows to fund long-acting prevention, oncology expansion, liver disease, cell therapy and external innovation while maintaining shareholder returns.",
  variantView:
    "The market debate has moved from whether HIV is durable to whether GILD can turn prevention and BD into enough growth to justify a premium multiple despite IPRD noise and weak cell therapy.",
  evidence: [
    { id: "gild-q4-2025", sourceTitle: "GILD Q4/FY 2025 earnings release", sourceType: "official_press_release", date: "2026-02-11", url: "https://www.gilead.com/news/news-details/2026/gilead-sciences-announces-fourth-quarter-and-full-year-2025-financial-results", extractedMetric: "FY 2025 revenue $29.4bn; Biktarvy $14.3bn", confidence: "high", usedInModel: true, notes: "FY baseline." },
    { id: "gild-q1-2026", sourceTitle: "GILD Q1 2026 earnings release", sourceType: "official_press_release", date: "2026-05-07", url: "https://investors.gilead.com/news/news-details/2026/Gilead-Sciences-Announces-First-Quarter-Financial-Results/default.aspx", extractedMetric: "Q1 2026 product sales $6.9bn; Biktarvy $3.4bn; cash $8.6bn", confidence: "high", usedInModel: true, notes: "Latest reported quarter." },
    { id: "gild-10k-2025", sourceTitle: "GILD 2025 Form 10-K", sourceType: "SEC_10K", date: "2026-02-21", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000882095&type=10-K&owner=exclude&count=10", extractedMetric: "HIV, oncology, cell therapy, legal and tax disclosures", confidence: "high", usedInModel: true, notes: "Risk and historical financial source." },
    { id: "gild-pipeline", sourceTitle: "GILD pipeline", sourceType: "official_press_release", date: "2026-05-12", url: "https://www.gilead.com/science-and-medicine/pipeline", extractedMetric: "Lenacapavir, oncology, liver disease and cell therapy pipeline", confidence: "medium", usedInModel: true, notes: "Pipeline source map." },
    { id: "gild-yeztugo", sourceTitle: "Yeztugo FDA approval", sourceType: "FDA_label", date: "2025-06-18", url: "https://www.gilead.com/news/news-details/2025/us-fda-approves-gileads-yeztugo-lenacapavir-the-first-and-only-twice-yearly-hiv-prevention-option", extractedMetric: "Twice-yearly lenacapavir prevention approval", confidence: "high", usedInModel: true, notes: "Prevention launch anchor." },
    { id: "gild-arcellx", sourceTitle: "Gilead / Arcellx transaction", sourceType: "official_press_release", date: "2026-04-01", url: "https://www.gilead.com/news/news-details/2026/gilead-sciences-and-arcellx-announce-definitive-agreement-under-which-gilead-to-acquire-arcellx", extractedMetric: "Anito-cel / BCMA cell therapy strategic transaction", confidence: "medium", usedInModel: true, notes: "Cell therapy pipeline reset." },
    { id: "gild-market", sourceTitle: "GILD market data snapshot", sourceType: "market_data", date: "2026-05-07", url: "https://www.marketwatch.com/data-news/gilead-sciences-inc-stock-underperforms-thursday-when-compared-to-competitors-ddb7548a-4c3d9196104d", extractedMetric: "Close $134.06", confidence: "medium", usedInModel: true, notes: "Price anchor." },
    { id: "gild-analysts", sourceTitle: "GILD analyst consensus snapshot", sourceType: "analyst_consensus", date: "2026-05-07", url: "https://stockanalysis.com/stocks/gild/forecast/", extractedMetric: "Analyst targets above spot with debate around HIV and BD", confidence: "medium", usedInModel: false, notes: "Analyst debate framing only." },
    { id: "gild-research-assumptions", sourceTitle: "GILD research-only rNPV assumptions", sourceType: "research_assumption", date: "2026-05-12", url: "local://src/stocks/gild/researchData.ts", extractedMetric: "Peak sales, POS, discount rates and normalized EPS inputs", confidence: "medium", usedInModel: true, notes: "Explicitly not official guidance." },
  ],
  financials: [
    { period: "FY 2025", revenue: 29_400, primaryGrowthMetricLabel: "Biktarvy", primaryGrowthMetric: 14_300, nonGaapEps: 7.80, cashAndInvestments: 10_600, netDebt: 1_800, sourceEvidenceIds: ["gild-q4-2025", "gild-10k-2025"] },
    { period: "Q1 2026", revenue: 6_950, primaryGrowthMetricLabel: "Biktarvy", primaryGrowthMetric: 3_400, nonGaapEps: -4.30, cashAndInvestments: 8_600, netDebt: 2_500, sourceEvidenceIds: ["gild-q1-2026"] },
  ],
  products: [
    { name: "Biktarvy", category: "HIV treatment", revenue2025: 14_300, latestQuarterRevenue: 3_400, growth: "Durable anchor with high share in HIV treatment.", role: "core_cash_flow", moat: "Efficacy, tolerability, physician familiarity and switching inertia.", pressure: "Long-term HIV competition and pricing scrutiny.", sourceEvidenceIds: ["gild-q4-2025", "gild-q1-2026"] },
    { name: "Yeztugo / lenacapavir prevention", category: "HIV prevention launch", latestQuarterRevenue: 25, growth: "Early launch; prevention market expansion option.", role: "launch_asset", moat: "Twice-yearly dosing and prevention adherence advantage.", pressure: "Access, public-health infrastructure and injection logistics.", sourceEvidenceIds: ["gild-yeztugo", "gild-q1-2026"] },
    { name: "Trodelvy", category: "Oncology ADC", revenue2025: 1_300, latestQuarterRevenue: 350, growth: "Still strategically important but execution has been uneven.", role: "growth_driver", moat: "Established ADC in breast cancer; lifecycle work continues.", pressure: "Competitive ADC landscape and indication-specific setbacks.", sourceEvidenceIds: ["gild-q4-2025"] },
    { name: "Yescarta / Tecartus", category: "Cell therapy", revenue2025: 1_800, latestQuarterRevenue: 390, growth: "Competitive pressure persists.", role: "growth_driver", moat: "Established CAR-T infrastructure and real-world use.", pressure: "Bispecifics, new CAR-T competitors and manufacturing economics.", sourceEvidenceIds: ["gild-q1-2026"] },
    { name: "Livdelzi", category: "Liver disease launch", latestQuarterRevenue: 80, growth: "Diversification product in PBC.", role: "launch_asset", moat: "Specialist liver footprint.", pressure: "Launch scale and payer access.", sourceEvidenceIds: ["gild-q4-2025"] },
  ],
  guidance: [
    { metric: "2026 product sales", low: 29_500, high: 30_100, midpoint: 29_800, unit: "USDm", period: "FY 2026", status: "reaffirmed", commentary: "Product sales guidance anchors the model; acquired IPRD can distort GAAP/non-GAAP EPS.", sourceEvidenceIds: ["gild-q1-2026"] },
    { metric: "Normalized EPS power", midpoint: 8.70, unit: "USD/share", period: "FY 2026 run-rate", status: "research_assumption", commentary: "Research-normalized EPS excludes large one-time acquired IPRD charges for valuation purposes.", sourceEvidenceIds: ["gild-q1-2026", "gild-research-assumptions"] },
  ],
  pipeline: [
    { assetName: "Yeztugo / lenacapavir prevention", modality: "Long-acting antiviral", targetOrMechanism: "Capsid inhibitor", indication: "HIV PrEP / prevention", stage: "approved", expectedCatalyst: "US launch execution and global access expansion", strategicRole: "core", estimatedLaunchYear: 2026, estimatedPeakSales: 6_000, probabilityOfSuccess: 0.78, discountRate: 0.10, developmentCostRemaining: 900, economicsShare: 1.0, evidenceScore: 82, riskScore: 48, assumptionType: "research_only", sourceEvidenceIds: ["gild-yeztugo", "gild-research-assumptions"] },
    { assetName: "Anito-cel", modality: "Autologous CAR-T", targetOrMechanism: "BCMA", indication: "Multiple myeloma", stage: "phase_2", partner: "Arcellx", expectedCatalyst: "Regulatory path and competitive data versus BCMA options", strategicRole: "near_adjacent", estimatedLaunchYear: 2027, estimatedPeakSales: 2_500, probabilityOfSuccess: 0.50, discountRate: 0.16, developmentCostRemaining: 1_000, economicsShare: 1.0, evidenceScore: 64, riskScore: 65, assumptionType: "research_only", sourceEvidenceIds: ["gild-arcellx", "gild-research-assumptions"] },
    { assetName: "Trodelvy lifecycle", modality: "ADC", targetOrMechanism: "TROP2", indication: "Breast cancer and other solid tumors", stage: "approved", expectedCatalyst: "Lifecycle data and competitive positioning", strategicRole: "near_adjacent", estimatedLaunchYear: 2026, estimatedPeakSales: 2_200, probabilityOfSuccess: 0.55, discountRate: 0.13, developmentCostRemaining: 700, economicsShare: 1.0, evidenceScore: 58, riskScore: 68, assumptionType: "research_only", sourceEvidenceIds: ["gild-q4-2025", "gild-research-assumptions"] },
    { assetName: "Livdelzi lifecycle", modality: "Small molecule", targetOrMechanism: "PPAR-delta agonist", indication: "PBC and liver disease expansion", stage: "approved", expectedCatalyst: "Launch uptake and label expansion", strategicRole: "defensive_lifecycle", estimatedLaunchYear: 2026, estimatedPeakSales: 1_200, probabilityOfSuccess: 0.60, discountRate: 0.12, developmentCostRemaining: 350, economicsShare: 1.0, evidenceScore: 60, riskScore: 50, assumptionType: "research_only", sourceEvidenceIds: ["gild-pipeline", "gild-research-assumptions"] },
  ],
  strategyPriorities: [
    { title: "Defend HIV treatment cash flows", summary: "Keep Biktarvy durable while prevention expands the addressable HIV franchise.", timeHorizon: "near_term", evidenceIds: ["gild-q1-2026"] },
    { title: "Turn prevention into a new growth leg", summary: "Yeztugo must convert clinical and dosing differentiation into real-world uptake and access.", timeHorizon: "medium_term", evidenceIds: ["gild-yeztugo"] },
    { title: "Rebuild oncology through BD", summary: "Arcellx, Tubulis and other deals are intended to repair confidence in oncology/cell therapy growth.", timeHorizon: "long_term", evidenceIds: ["gild-arcellx"] },
  ],
  analystDebates: [
    { debate: "Is HIV durability enough?", bullCase: "Biktarvy remains a large, durable cash engine and Yeztugo expands prevention.", bearCase: "HIV concentration keeps valuation capped if oncology does not improve.", whatToWatch: "Biktarvy growth, Descovy dynamics and Yeztugo uptake.", evidenceIds: ["gild-q1-2026", "gild-yeztugo"] },
    { debate: "Is acquired IPRD noise or real capital-allocation risk?", bullCase: "Charges reflect strategic pipeline build and should be normalized out.", bearCase: "Repeated large charges signal expensive external innovation dependency.", whatToWatch: "Deal cadence, clinical progress and return on BD spend.", evidenceIds: ["gild-q1-2026", "gild-arcellx"] },
    { debate: "Can oncology/cell therapy stop diluting the story?", bullCase: "Anito-cel and ADC/liver assets rebuild non-HIV growth.", bearCase: "Cell therapy remains structurally pressured by competition and logistics.", whatToWatch: "Anito-cel regulatory updates and cell therapy sales trend.", evidenceIds: ["gild-arcellx"] },
  ],
  analystSnapshot: { rating: "Positive but valuation-sensitive", priceTarget: 148, source: "Public analyst target snapshots", sourceDate: "2026-05-07", summary: "Analysts are increasingly constructive but debate how much of the Yeztugo and BD upside is already capitalized.", evidenceIds: ["gild-analysts"] },
  catalysts: [
    { date: "2026", catalyst: "Yeztugo launch metrics", impact: "high", thesisRelevance: "Primary proof point for prevention option value.", evidenceIds: ["gild-yeztugo"] },
    { date: "2026", catalyst: "BD integration and IPRD normalization", impact: "medium", thesisRelevance: "Determines whether investors look through EPS volatility.", evidenceIds: ["gild-q1-2026"] },
    { date: "2026-2027", catalyst: "Anito-cel regulatory progress", impact: "medium", thesisRelevance: "Potential cell therapy reset.", evidenceIds: ["gild-arcellx"] },
  ],
  risks: [
    { risk: "HIV concentration remains too high.", probability: 3, severity: 4, detectability: 4, timeToMatter: "2026-2030", mitigation: "Require prevention uptake and non-HIV growth proof.", killCriteria: "HIV decelerates while Yeztugo remains niche.", evidenceIds: ["gild-10k-2025"] },
    { risk: "Yeztugo access and adoption disappoint.", probability: 3, severity: 4, detectability: 3, timeToMatter: "2026-2028", mitigation: "Track start forms, payer coverage and persistence.", killCriteria: "Launch fails to broaden prevention market by 2027.", evidenceIds: ["gild-yeztugo"] },
    { risk: "Oncology and cell therapy continue to underperform.", probability: 3, severity: 3, detectability: 4, timeToMatter: "2026-2029", mitigation: "Keep oncology rNPV separate from core HIV value.", killCriteria: "Anito-cel delays plus Trodelvy/cell therapy revenue declines.", evidenceIds: ["gild-arcellx"] },
    { risk: "BD spend destroys value.", probability: 2, severity: 4, detectability: 2, timeToMatter: "2026-2030", mitigation: "Normalize one-time IPRD but audit cumulative deal returns.", killCriteria: "Repeated large charges without asset progress.", evidenceIds: ["gild-q1-2026"] },
  ],
  valuationScenarios: [
    { scenario: "Bear", coreMetricLabel: "Normalized EPS", coreMetricValue: 7.60, coreMultiple: 12.0, pipelineHaircut: 0.25, platformOptionValue: 0, cashOrDebtAdjustment: -2_500, expectedDividends: 9.0, summary: "HIV is stable but prevention and oncology fail to earn incremental credit." },
    { scenario: "Base", coreMetricLabel: "Normalized EPS", coreMetricValue: 8.70, coreMultiple: 15.0, pipelineHaircut: 0.45, platformOptionValue: 4_000, cashOrDebtAdjustment: -2_500, expectedDividends: 9.0, summary: "HIV durability plus partial Yeztugo and pipeline credit justify a premium-to-transition multiple." },
    { scenario: "Bull", coreMetricLabel: "Normalized EPS", coreMetricValue: 9.50, coreMultiple: 18.0, pipelineHaircut: 0.70, platformOptionValue: 8_000, cashOrDebtAdjustment: -2_500, expectedDividends: 9.0, summary: "Yeztugo becomes a major prevention franchise and BD improves oncology growth." },
  ],
  crossChecks: [
    { label: "EV / sales", value: 168_000 / 29_400, format: "multiple", interpretation: "Premium to patent-cliff pharma reflects HIV durability and prevention option value." },
    { label: "Biktarvy revenue share", value: 14_300 / 29_400, format: "percent", interpretation: "High concentration is both quality and risk." },
    { label: "Market cap", value: 166_234, format: "currency", interpretation: "Price anchor from market-data snapshot." },
  ],
  keyAssumptions: [
    { label: "Normalized EPS anchor", value: "$8.70", source: "research_only", evidenceIds: ["gild-q1-2026", "gild-research-assumptions"] },
    { label: "Base P/E multiple", value: "15.0x", source: "research_only", evidenceIds: ["gild-research-assumptions"] },
    { label: "Yeztugo peak sales", value: "$6.0bn", source: "research_only", evidenceIds: ["gild-yeztugo", "gild-research-assumptions"] },
  ],
  earnings: gildEarningsDataset,
};
