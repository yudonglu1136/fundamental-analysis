import type { BiopharmaResearchDataset } from "../biopharmaResearch/types";
import { bmyEarningsDataset } from "./data";

export const bmyResearchData: BiopharmaResearchDataset = {
  ticker: "BMY",
  name: "Bristol Myers Squibb",
  sector: "Large-cap biopharma / oncology / immunology / hematology",
  currency: "USD",
  currentPrice: 56.25,
  priceDate: "2026-05-07",
  sharesOutstanding: 2_040,
  marketCap: 114_750,
  enterpriseValue: 158_000,
  reportingCurrency: "USD",
  modelArchetype: "mature_pharma_transition",
  thesis:
    "BMY is an LOE-bridge story: the stock works if Growth Portfolio durability, Cobenfy/Breyanzi/Reblozyl/Camzyos execution and late-stage pipeline progress can offset Revlimid erosion and future Eliquis risk without forcing value-destructive BD.",
  companyStrategy:
    "Management is trying to rotate the revenue base toward Growth Portfolio assets, protect EPS through cost discipline, and use targeted external innovation to rebuild post-LOE growth.",
  variantView:
    "The key variant question is not whether the LOE wall exists, but whether the market is under-crediting the size and breadth of the growth portfolio plus pipeline while valuing BMY at a depressed transition multiple.",
  evidence: [
    { id: "bmy-q4-2025", sourceTitle: "BMY Q4/FY 2025 earnings release", sourceType: "official_press_release", date: "2026-02-05", url: "https://www.bms.com/assets/bms/us/en-us/pdf/investor-info/doc_financials/quarterly_reports/2025/BMY-Q4-2025-Earnings-Press-Release.pdf", extractedMetric: "FY 2025 revenue $48.2bn; Growth Portfolio $26.4bn", confidence: "high", usedInModel: true, notes: "Primary FY baseline." },
    { id: "bmy-q1-2026", sourceTitle: "BMY Q1 2026 earnings release / SEC exhibit", sourceType: "SEC_10Q", date: "2026-04-30", url: "https://www.sec.gov/Archives/edgar/data/14272/000001427226000008/a2026q1ex991.htm", extractedMetric: "Q1 2026 revenue $11.5bn; Growth Portfolio $6.2bn; non-GAAP EPS $1.80", confidence: "high", usedInModel: true, notes: "Latest reported quarter." },
    { id: "bmy-10k-2025", sourceTitle: "BMY 2025 Form 10-K", sourceType: "SEC_10K", date: "2026-02-13", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000014272&type=10-K&owner=exclude&count=10", extractedMetric: "Patent-cliff, product, legal and financial disclosures", confidence: "high", usedInModel: true, notes: "Risk and historical financial source." },
    { id: "bmy-pipeline", sourceTitle: "BMY pipeline", sourceType: "official_press_release", date: "2026-05-12", url: "https://www.bms.com/researchers-and-partners/in-the-pipeline.html", extractedMetric: "Cobenfy lifecycle, milvexian, iberdomide, mezigdomide, Breyanzi expansions", confidence: "medium", usedInModel: true, notes: "Pipeline source map." },
    { id: "bmy-cobenfy", sourceTitle: "Cobenfy US prescribing information", sourceType: "FDA_label", date: "2024-09-26", url: "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=216158", extractedMetric: "Approved schizophrenia indication", confidence: "high", usedInModel: true, notes: "Label / lifecycle anchor." },
    { id: "bmy-hengrui-2026", sourceTitle: "BMS-Hengrui strategic collaboration", sourceType: "official_press_release", date: "2026-05-12", url: "https://news.bms.com/news/details/2026/Bristol-Myers-Squibb-and-Hengrui-Pharma-Announce-Strategic-Collaboration-to-Develop-and-Commercialize-Innovative-Medicines-Across-Oncology-Hematology-and-Immunology/default.aspx", extractedMetric: "Multi-asset external innovation collaboration", confidence: "medium", usedInModel: false, notes: "Strategic direction; not in base valuation yet." },
    { id: "bmy-market", sourceTitle: "BMY market data snapshot", sourceType: "market_data", date: "2026-05-07", url: "https://stockanalysis.com/stocks/bmy/", extractedMetric: "Close $56.25; market cap and share count snapshot", confidence: "medium", usedInModel: true, notes: "Price anchor." },
    { id: "bmy-analysts", sourceTitle: "BMY analyst consensus snapshot", sourceType: "analyst_consensus", date: "2026-05-07", url: "https://stockanalysis.com/stocks/bmy/forecast/", extractedMetric: "Hold/moderate buy style consensus with target above spot", confidence: "medium", usedInModel: false, notes: "Analyst debate framing only." },
    { id: "bmy-research-assumptions", sourceTitle: "BMY research-only rNPV assumptions", sourceType: "research_assumption", date: "2026-05-12", url: "local://src/stocks/bmy/researchData.ts", extractedMetric: "Peak sales, POS, discount rates and pipeline rNPV inputs", confidence: "medium", usedInModel: true, notes: "Explicitly not official guidance." },
  ],
  financials: [
    { period: "FY 2025", revenue: 48_200, primaryGrowthMetricLabel: "Growth Portfolio", primaryGrowthMetric: 26_400, nonGaapEps: 6.35, cashAndInvestments: 7_000, netDebt: 43_000, sourceEvidenceIds: ["bmy-q4-2025", "bmy-10k-2025"] },
    { period: "Q1 2026", revenue: 11_500, primaryGrowthMetricLabel: "Growth Portfolio", primaryGrowthMetric: 6_200, nonGaapEps: 1.80, cashAndInvestments: 7_000, netDebt: 43_000, sourceEvidenceIds: ["bmy-q1-2026"] },
  ],
  products: [
    { name: "Eliquis", category: "Cardiovascular", revenue2025: 13_300, latestQuarterRevenue: 3_100, growth: "Large but approaching US IRA/LOE risk window.", role: "core_cash_flow", moat: "Scale, physician familiarity and anticoagulant category leadership.", pressure: "Future exclusivity and price erosion.", sourceEvidenceIds: ["bmy-q4-2025", "bmy-10k-2025"] },
    { name: "Revlimid", category: "Hematology legacy", revenue2025: 4_500, latestQuarterRevenue: 800, growth: "Declining after generic entry.", role: "declining_legacy", moat: "Legacy cash flow only.", pressure: "Ongoing generic erosion.", sourceEvidenceIds: ["bmy-q4-2025"] },
    { name: "Growth Portfolio", category: "Multi-product growth base", revenue2025: 26_400, latestQuarterRevenue: 6_200, growth: "Core offset to LOE pressure.", role: "growth_driver", moat: "Breadth across oncology, hematology, immunology and neuroscience.", pressure: "Execution risk and reimbursement/competition.", sourceEvidenceIds: ["bmy-q4-2025", "bmy-q1-2026"] },
    { name: "Cobenfy", category: "Neuroscience launch", latestQuarterRevenue: 120, growth: "Early launch; lifecycle optionality in adjunctive schizophrenia and Alzheimer's disease psychosis.", role: "launch_asset", moat: "First-in-class muscarinic mechanism.", pressure: "Commercial access, tolerability and payer adoption.", sourceEvidenceIds: ["bmy-q1-2026", "bmy-cobenfy"] },
    { name: "Breyanzi", category: "CD19 CAR-T", revenue2025: 1_000, latestQuarterRevenue: 300, growth: "Cell therapy scale and label expansion remain important.", role: "growth_driver", moat: "Clinical profile and broader lymphoma indications.", pressure: "Manufacturing logistics, bispecifics and competing CAR-T products.", sourceEvidenceIds: ["bmy-q4-2025", "bmy-pipeline"] },
  ],
  guidance: [
    { metric: "2026 revenue growth", low: -3, high: 0, unit: "percent", period: "FY 2026", status: "reaffirmed", commentary: "Model uses a low-single-digit decline frame while Growth Portfolio offsets legacy erosion.", sourceEvidenceIds: ["bmy-q1-2026"] },
    { metric: "2026 non-GAAP EPS", low: 6.60, high: 6.90, midpoint: 6.75, unit: "USD/share", period: "FY 2026", status: "reaffirmed", commentary: "EPS is the mature-pharma valuation anchor; pipeline value is layered separately.", sourceEvidenceIds: ["bmy-q1-2026"] },
  ],
  pipeline: [
    { assetName: "Cobenfy lifecycle", modality: "Small molecule", targetOrMechanism: "M1/M4 muscarinic agonism", indication: "Schizophrenia lifecycle and Alzheimer's disease psychosis", stage: "approved", expectedCatalyst: "Launch uptake and lifecycle data", strategicRole: "core", estimatedLaunchYear: 2026, estimatedPeakSales: 5_000, probabilityOfSuccess: 0.72, discountRate: 0.11, developmentCostRemaining: 800, economicsShare: 1.0, evidenceScore: 78, riskScore: 55, assumptionType: "research_only", sourceEvidenceIds: ["bmy-cobenfy", "bmy-research-assumptions"] },
    { assetName: "Milvexian", modality: "Small molecule", targetOrMechanism: "Factor XIa inhibition", indication: "Stroke prevention / atrial fibrillation optionality", stage: "phase_3", expectedCatalyst: "Phase 3 readouts", strategicRole: "long_dated_option", estimatedLaunchYear: 2028, estimatedPeakSales: 3_000, probabilityOfSuccess: 0.35, discountRate: 0.14, developmentCostRemaining: 1_000, economicsShare: 1.0, evidenceScore: 55, riskScore: 75, assumptionType: "research_only", sourceEvidenceIds: ["bmy-pipeline", "bmy-research-assumptions"] },
    { assetName: "Iberdomide / mezigdomide", modality: "CELMoD", targetOrMechanism: "Cereblon E3 ligase modulation", indication: "Multiple myeloma", stage: "phase_3", expectedCatalyst: "Registrational myeloma data", strategicRole: "near_adjacent", estimatedLaunchYear: 2027, estimatedPeakSales: 2_500, probabilityOfSuccess: 0.48, discountRate: 0.13, developmentCostRemaining: 900, economicsShare: 1.0, evidenceScore: 62, riskScore: 63, assumptionType: "research_only", sourceEvidenceIds: ["bmy-pipeline", "bmy-research-assumptions"] },
    { assetName: "Breyanzi expansions", modality: "Autologous CAR-T", targetOrMechanism: "CD19", indication: "Lymphoma and CLL/SLL expansion", stage: "approved", expectedCatalyst: "Earlier-line uptake and manufacturing execution", strategicRole: "near_adjacent", estimatedLaunchYear: 2026, estimatedPeakSales: 2_000, probabilityOfSuccess: 0.65, discountRate: 0.12, developmentCostRemaining: 500, economicsShare: 1.0, evidenceScore: 70, riskScore: 58, assumptionType: "research_only", sourceEvidenceIds: ["bmy-pipeline", "bmy-research-assumptions"] },
  ],
  strategyPriorities: [
    { title: "Bridge the LOE wall", summary: "Grow the Growth Portfolio fast enough to absorb Revlimid erosion and future Eliquis pressure.", timeHorizon: "near_term", evidenceIds: ["bmy-q4-2025", "bmy-q1-2026"] },
    { title: "Scale Cobenfy", summary: "Turn a differentiated neuroscience mechanism into a major launch while proving access and persistence.", timeHorizon: "medium_term", evidenceIds: ["bmy-cobenfy"] },
    { title: "External innovation", summary: "Use BD and collaborations, including Hengrui, to refill oncology/hematology/immunology pipeline breadth.", timeHorizon: "long_term", evidenceIds: ["bmy-hengrui-2026"] },
  ],
  analystDebates: [
    { debate: "Can Growth Portfolio offset LOE fast enough?", bullCase: "Growth assets are already more than half of revenue and are diversified.", bearCase: "Eliquis/Revlimid erosion can overwhelm growth and compress the multiple.", whatToWatch: "Quarterly Growth Portfolio growth versus legacy erosion.", evidenceIds: ["bmy-q1-2026"] },
    { debate: "Is Cobenfy a true mega-launch?", bullCase: "Novel mechanism and large unmet schizophrenia market create multi-billion potential.", bearCase: "Adoption, tolerability, payer access and primary-care psychiatry workflow may slow uptake.", whatToWatch: "Prescription growth, discontinuation and payer coverage.", evidenceIds: ["bmy-cobenfy"] },
    { debate: "Does pipeline deserve credit now?", bullCase: "Multiple late-stage shots reduce single-asset dependence.", bearCase: "Milvexian and myeloma programs still carry high binary risk.", whatToWatch: "Phase 3 readouts and FDA filing cadence.", evidenceIds: ["bmy-pipeline"] },
  ],
  analystSnapshot: { rating: "Consensus mixed-to-positive", priceTarget: 60, source: "StockAnalysis / public analyst target snapshot", sourceDate: "2026-05-07", summary: "Analyst debate remains balanced: inexpensive transition multiple versus patent-cliff uncertainty.", evidenceIds: ["bmy-analysts"] },
  catalysts: [
    { date: "2026", catalyst: "Growth Portfolio quarterly trajectory", impact: "high", thesisRelevance: "Core proof that the LOE bridge is working.", evidenceIds: ["bmy-q1-2026"] },
    { date: "2026-2027", catalyst: "Cobenfy launch and lifecycle updates", impact: "high", thesisRelevance: "Main re-rating asset outside oncology/hematology.", evidenceIds: ["bmy-cobenfy"] },
    { date: "2026-2028", catalyst: "Milvexian and CELMoD Phase 3 readouts", impact: "medium", thesisRelevance: "Determines whether pipeline rNPV becomes core value.", evidenceIds: ["bmy-pipeline"] },
  ],
  risks: [
    { risk: "Patent-cliff erosion exceeds Growth Portfolio growth.", probability: 4, severity: 5, detectability: 4, timeToMatter: "2026-2028", mitigation: "Track net growth portfolio contribution rather than total revenue alone.", killCriteria: "Two consecutive quarters where Growth Portfolio decelerates while legacy erosion worsens.", evidenceIds: ["bmy-10k-2025"] },
    { risk: "Cobenfy launch disappoints.", probability: 3, severity: 4, detectability: 3, timeToMatter: "2026-2027", mitigation: "Require prescription/access evidence before assigning mega-launch multiple.", killCriteria: "Weak access and flattening launch curve by late 2026.", evidenceIds: ["bmy-cobenfy"] },
    { risk: "Pipeline failures force expensive BD.", probability: 3, severity: 4, detectability: 2, timeToMatter: "2026-2029", mitigation: "Separate core EPS value from pipeline option value.", killCriteria: "Major late-stage failures plus debt-funded BD at unattractive returns.", evidenceIds: ["bmy-pipeline"] },
    { risk: "Balance sheet limits capital returns.", probability: 2, severity: 3, detectability: 4, timeToMatter: "2026-2028", mitigation: "Watch net debt, dividend coverage and acquisition appetite.", killCriteria: "Dividend coverage weakens while growth assets miss.", evidenceIds: ["bmy-10k-2025"] },
  ],
  valuationScenarios: [
    { scenario: "Bear", coreMetricLabel: "Normalized EPS", coreMetricValue: 5.90, coreMultiple: 7.5, pipelineHaircut: 0.25, platformOptionValue: 0, cashOrDebtAdjustment: 0, expectedDividends: 7.2, summary: "LOE pressure dominates, Cobenfy uptake is muted and pipeline receives little credit." },
    { scenario: "Base", coreMetricLabel: "Normalized EPS", coreMetricValue: 6.75, coreMultiple: 9.5, pipelineHaircut: 0.45, platformOptionValue: 1_000, cashOrDebtAdjustment: 0, expectedDividends: 7.2, summary: "Growth Portfolio offsets much of the erosion and pipeline gets partial credit." },
    { scenario: "Bull", coreMetricLabel: "Normalized EPS", coreMetricValue: 7.20, coreMultiple: 12.0, pipelineHaircut: 0.70, platformOptionValue: 3_000, cashOrDebtAdjustment: 0, expectedDividends: 7.2, summary: "Cobenfy and late-stage pipeline shift BMY from value trap to growth bridge." },
  ],
  crossChecks: [
    { label: "EV / sales", value: 158_000 / 48_200, format: "multiple", interpretation: "Low multiple reflects patent-cliff discount." },
    { label: "Growth Portfolio revenue share", value: 26_400 / 48_200, format: "percent", interpretation: "The growth base is already material." },
    { label: "Market cap", value: 114_750, format: "currency", interpretation: "Price anchor from market-data snapshot." },
  ],
  keyAssumptions: [
    { label: "Normalized EPS anchor", value: "$6.75", source: "research_only", evidenceIds: ["bmy-q1-2026", "bmy-research-assumptions"] },
    { label: "Base P/E multiple", value: "9.5x", source: "research_only", evidenceIds: ["bmy-research-assumptions"] },
    { label: "Pipeline POS / discount rates", value: "Asset-specific", source: "research_only", evidenceIds: ["bmy-research-assumptions"] },
  ],
  earnings: bmyEarningsDataset,
};
