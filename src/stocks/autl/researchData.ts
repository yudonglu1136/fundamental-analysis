import type { BiopharmaResearchDataset } from "../biopharmaResearch/types";
import { autlEarningsDataset } from "./data";

export const autlResearchData: BiopharmaResearchDataset = {
  ticker: "AUTL",
  name: "Autolus Therapeutics",
  sector: "Commercial-stage cell therapy / AUCATZYL / obe-cel platform",
  currency: "USD",
  currentPrice: 1.61,
  priceDate: "2026-05-07",
  sharesOutstanding: 266,
  marketCap: 428,
  enterpriseValue: 128,
  reportingCurrency: "USD",
  modelArchetype: "commercial_stage_biotech_nav",
  thesis:
    "AUTL is a launch-execution and cash-runway biotech: the stock works if AUCATZYL grows from a first-year niche adult ALL launch into a gross-margin-positive franchise while obe-cel expands into pediatric ALL and autoimmune indications without requiring dilutive financing.",
  companyStrategy:
    "Management is prioritizing AUCATZYL top-line growth, manufacturing gross-margin improvement, UK/EU access, and compact pivotal studies in pediatric ALL and autoimmune disease.",
  variantView:
    "The market is pricing AUTL as a subscale launch with financing risk; the variant case is that AUCATZYL safety/manufacturing reliability plus 2026 gross-margin inflection can keep the company funded to the next data cycle.",
  evidence: [
    { id: "autl-q4-2025", sourceTitle: "AUTL Q4/FY 2025 earnings release", sourceType: "official_press_release", date: "2026-03-27", url: "https://autolus.gcs-web.com/news-releases/news-release-details/autolus-therapeutics-reports-fourth-quarter-and-full-year-2025/", extractedMetric: "Q4 2025 AUCATZYL revenue $23.3m; FY 2025 $74.3m; cash and securities $300.7m", confidence: "high", usedInModel: true, notes: "Primary FY baseline." },
    { id: "autl-prelim-2026", sourceTitle: "AUTL preliminary FY 2025 update", sourceType: "official_press_release", date: "2026-01-12", url: "https://autolus.gcs-web.com/news-releases/news-release-details/autolus-therapeutics-announces-preliminary-unaudited-fourth/", extractedMetric: "Preliminary FY 2025 AUCATZYL revenue about $75m; more than 60 centers; 2026 guide $120-135m", confidence: "high", usedInModel: true, notes: "Preliminary launch and center data." },
    { id: "autl-20f-2025", sourceTitle: "AUTL 2025 Form 20-F", sourceType: "SEC_20F", date: "2026-03-27", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001730463&type=20-F&owner=exclude&count=10", extractedMetric: "Financial statements, risk factors and ADS/share disclosures", confidence: "high", usedInModel: true, notes: "Annual filing source map." },
    { id: "autl-aucatzyl-label", sourceTitle: "AUCATZYL US prescribing information", sourceType: "FDA_label", date: "2024-11-08", url: "https://www.fda.gov/vaccines-blood-biologics/cellular-gene-therapy-products/aucatzyl", extractedMetric: "Adult r/r B-ALL indication and CAR-T safety warnings", confidence: "high", usedInModel: true, notes: "Regulatory and safety source." },
    { id: "autl-rocca", sourceTitle: "ROCCA real-world AUCATZYL data summary", sourceType: "conference_abstract", date: "2025-12-08", url: "https://autolus.gcs-web.com/news-releases/news-release-details/autolus-therapeutics-reports-fourth-quarter-and-full-year-2025/", extractedMetric: "Real-world data covering about 60% of US commercial patients; favorable safety profile", confidence: "medium", usedInModel: true, notes: "Adoption and safety support." },
    { id: "autl-pipeline", sourceTitle: "AUTL pipeline and 2026 news flow", sourceType: "official_press_release", date: "2026-03-27", url: "https://autolus.gcs-web.com/news-releases/news-release-details/autolus-therapeutics-reports-fourth-quarter-and-full-year-2025/", extractedMetric: "CATULUS, LUMINA, BOBCAT, CARLYSLE and ALARIC milestones", confidence: "high", usedInModel: true, notes: "Pipeline calendar." },
    { id: "autl-market", sourceTitle: "AUTL market data snapshot", sourceType: "market_data", date: "2026-05-07", url: "https://stockanalysis.com/stocks/autl/", extractedMetric: "Close $1.61; market cap and share count snapshot", confidence: "medium", usedInModel: true, notes: "Price anchor." },
    { id: "autl-analysts", sourceTitle: "AUTL analyst consensus snapshot", sourceType: "analyst_consensus", date: "2026-05-07", url: "https://stockanalysis.com/stocks/autl/forecast/", extractedMetric: "High target dispersion typical of commercial-stage biotech", confidence: "medium", usedInModel: false, notes: "Analyst debate framing only." },
    { id: "autl-research-assumptions", sourceTitle: "AUTL research-only launch NAV and rNPV assumptions", sourceType: "research_assumption", date: "2026-05-12", url: "local://src/stocks/autl/researchData.ts", extractedMetric: "AUCATZYL NAV, peak sales, POS, discount rates and burn assumptions", confidence: "medium", usedInModel: true, notes: "Explicitly not official guidance." },
  ],
  financials: [
    { period: "FY 2025", revenue: 75, primaryGrowthMetricLabel: "AUCATZYL net product revenue", primaryGrowthMetric: 74.3, operatingIncome: -287.5, cashAndInvestments: 300.7, netDebt: -300.7, sourceEvidenceIds: ["autl-q4-2025"] },
    { period: "Q4 2025", revenue: 24.3, primaryGrowthMetricLabel: "AUCATZYL net product revenue", primaryGrowthMetric: 23.3, operatingIncome: -72.5, cashAndInvestments: 300.7, netDebt: -300.7, sourceEvidenceIds: ["autl-q4-2025"] },
  ],
  products: [
    { name: "AUCATZYL", category: "Autologous CD19 CAR-T", revenue2025: 74.3, latestQuarterRevenue: 23.3, growth: "First-year launch; 2026 guide implies material growth.", role: "launch_asset", moat: "Favorable safety profile, adult ALL focus, reliable delivery and expanding treatment centers.", pressure: "Small eligible population, CAR-T logistics, competition and reimbursement.", sourceEvidenceIds: ["autl-q4-2025", "autl-aucatzyl-label"] },
    { name: "Obe-cel pediatric ALL", category: "Lifecycle expansion", latestQuarterRevenue: 0, growth: "CATULUS pivotal Phase 2 enrolling.", role: "option_asset", moat: "Same platform as approved product.", pressure: "Clinical execution and pediatric center adoption.", sourceEvidenceIds: ["autl-pipeline"] },
    { name: "Obe-cel autoimmune", category: "Autoimmune CAR-T", latestQuarterRevenue: 0, growth: "LUMINA and CARLYSLE test lupus and autoimmune durability.", role: "option_asset", moat: "Potential treatment-free remission if efficacy is durable.", pressure: "Early field, safety, durability and competition from other CD19 CAR-T programs.", sourceEvidenceIds: ["autl-pipeline"] },
    { name: "BOBCAT", category: "Progressive MS", latestQuarterRevenue: 0, growth: "Initial Phase 1 data expected by year-end 2026.", role: "option_asset", moat: "High unmet need and mechanistic optionality.", pressure: "Very early clinical risk and regulatory uncertainty.", sourceEvidenceIds: ["autl-pipeline"] },
  ],
  guidance: [
    { metric: "2026 AUCATZYL net product revenue", low: 120, high: 135, midpoint: 127.5, unit: "USDm", period: "FY 2026", status: "reaffirmed", commentary: "Core launch-curve anchor.", sourceEvidenceIds: ["autl-q4-2025"] },
    { metric: "Gross margin inflection", unit: "text", period: "FY 2026", status: "issued", commentary: "Management expects a shift to positive gross margin in 2026 as utilization improves.", sourceEvidenceIds: ["autl-q4-2025"] },
    { metric: "Cash runway", unit: "text", period: "Into Q4 2027", status: "issued", commentary: "Runway depends on AUCATZYL revenue and operating plans.", sourceEvidenceIds: ["autl-q4-2025"] },
  ],
  pipeline: [
    { assetName: "AUCATZYL adult ALL", modality: "Autologous CAR-T", targetOrMechanism: "CD19", indication: "Adult r/r B-ALL", stage: "approved", expectedCatalyst: "US center growth, UK launch and positive gross margin", strategicRole: "core", estimatedLaunchYear: 2026, estimatedPeakSales: 450, probabilityOfSuccess: 0.78, discountRate: 0.14, developmentCostRemaining: 120, economicsShare: 1.0, evidenceScore: 78, riskScore: 55, assumptionType: "research_only", sourceEvidenceIds: ["autl-q4-2025", "autl-research-assumptions"] },
    { assetName: "CATULUS", modality: "Autologous CAR-T", targetOrMechanism: "CD19", indication: "Pediatric r/r B-ALL", stage: "phase_2", expectedCatalyst: "Pediatric Phase 2 data by year-end 2027", strategicRole: "near_adjacent", estimatedLaunchYear: 2029, estimatedPeakSales: 220, probabilityOfSuccess: 0.42, discountRate: 0.18, developmentCostRemaining: 90, economicsShare: 1.0, evidenceScore: 55, riskScore: 65, assumptionType: "research_only", sourceEvidenceIds: ["autl-pipeline", "autl-research-assumptions"] },
    { assetName: "LUMINA / CARLYSLE", modality: "Autologous CAR-T", targetOrMechanism: "CD19", indication: "Lupus nephritis / severe lupus", stage: "phase_2", expectedCatalyst: "Longer-term CARLYSLE and LUMINA data", strategicRole: "long_dated_option", estimatedLaunchYear: 2030, estimatedPeakSales: 700, probabilityOfSuccess: 0.22, discountRate: 0.26, developmentCostRemaining: 160, economicsShare: 1.0, evidenceScore: 44, riskScore: 78, assumptionType: "research_only", sourceEvidenceIds: ["autl-pipeline", "autl-research-assumptions"] },
    { assetName: "BOBCAT", modality: "Autologous CAR-T", targetOrMechanism: "CD19", indication: "Progressive multiple sclerosis", stage: "phase_1", expectedCatalyst: "Initial Phase 1 data by year-end 2026", strategicRole: "platform_option", estimatedLaunchYear: 2031, estimatedPeakSales: 600, probabilityOfSuccess: 0.12, discountRate: 0.30, developmentCostRemaining: 130, economicsShare: 1.0, evidenceScore: 30, riskScore: 86, assumptionType: "research_only", sourceEvidenceIds: ["autl-pipeline", "autl-research-assumptions"] },
    { assetName: "ALARIC / AUTO8", modality: "Dual-target CAR-T", targetOrMechanism: "BCMA/CD19", indication: "AL amyloidosis", stage: "phase_1", expectedCatalyst: "Initial clinical experience by year-end 2026", strategicRole: "platform_option", estimatedLaunchYear: 2031, estimatedPeakSales: 300, probabilityOfSuccess: 0.15, discountRate: 0.28, developmentCostRemaining: 80, economicsShare: 1.0, evidenceScore: 28, riskScore: 82, assumptionType: "research_only", sourceEvidenceIds: ["autl-pipeline", "autl-research-assumptions"] },
  ],
  strategyPriorities: [
    { title: "Scale AUCATZYL revenue", summary: "Move from first-year launch to a repeatable center-based commercial model with US growth and UK launch contribution.", timeHorizon: "near_term", evidenceIds: ["autl-q4-2025"] },
    { title: "Turn gross margin positive", summary: "Higher patient volume should improve manufacturing utilization and reduce cost-of-sales burden.", timeHorizon: "near_term", evidenceIds: ["autl-q4-2025"] },
    { title: "Expand obe-cel beyond adult ALL", summary: "Pediatric ALL and autoimmune readouts can convert platform optionality into rNPV.", timeHorizon: "medium_term", evidenceIds: ["autl-pipeline"] },
  ],
  analystDebates: [
    { debate: "Can AUCATZYL reach guidance without margin damage?", bullCase: "2025 launch beat, broad center access and real-world safety support adoption.", bearCase: "Adult ALL is small and CAR-T logistics can cap throughput.", whatToWatch: "Quarterly revenue, center count, gross margin and cancelled orders.", evidenceIds: ["autl-q4-2025"] },
    { debate: "Is cash runway enough?", bullCase: "Runway into Q4 2027 gives two years of data and launch execution.", bearCase: "Losses and R&D expansion can force dilution if revenue or margin slips.", whatToWatch: "Cash burn, gross margin, financing terms and trial cadence.", evidenceIds: ["autl-q4-2025"] },
    { debate: "Is autoimmune CAR-T real value or story stock optionality?", bullCase: "Early lupus data and CD19 biology could unlock larger markets.", bearCase: "Early data, safety and durability risk make it speculative.", whatToWatch: "CARLYSLE/LUMINA durability, steroid-free remission and safety.", evidenceIds: ["autl-pipeline"] },
  ],
  analystSnapshot: { rating: "High dispersion biotech consensus", priceTarget: 4.50, source: "Public analyst target snapshots", sourceDate: "2026-05-07", summary: "Analyst targets are wide because valuation is dominated by launch execution, cash runway and early pipeline option value.", evidenceIds: ["autl-analysts"] },
  catalysts: [
    { date: "2026 quarterly", catalyst: "AUCATZYL revenue versus $120-135m guide", impact: "high", thesisRelevance: "Core launch validation.", evidenceIds: ["autl-q4-2025"] },
    { date: "2026", catalyst: "Positive gross margin inflection", impact: "high", thesisRelevance: "Determines whether the launch can fund the platform.", evidenceIds: ["autl-q4-2025"] },
    { date: "Year-end 2026", catalyst: "BOBCAT, CARLYSLE and ALARIC clinical updates", impact: "medium", thesisRelevance: "Converts speculative platform value into evidence-weighted rNPV.", evidenceIds: ["autl-pipeline"] },
    { date: "Year-end 2027", catalyst: "CATULUS pediatric Phase 2 data", impact: "medium", thesisRelevance: "Closest label-expansion path beyond adult ALL.", evidenceIds: ["autl-pipeline"] },
  ],
  risks: [
    { risk: "AUCATZYL demand is smaller than expected.", probability: 3, severity: 5, detectability: 4, timeToMatter: "2026", mitigation: "Track revenue per activated center and repeat site utilization.", killCriteria: "Revenue falls materially below guidance pace for two quarters.", evidenceIds: ["autl-q4-2025"] },
    { risk: "Manufacturing cost prevents gross-margin inflection.", probability: 3, severity: 4, detectability: 3, timeToMatter: "2026", mitigation: "Require positive gross margin evidence before raising terminal launch NAV.", killCriteria: "Gross margin remains deeply negative despite higher revenue.", evidenceIds: ["autl-q4-2025"] },
    { risk: "Cash runway shortens and dilution resets upside.", probability: 3, severity: 5, detectability: 4, timeToMatter: "2026-2027", mitigation: "Deduct expected burn in valuation and monitor financing windows.", killCriteria: "Equity raise below intrinsic NAV or runway falls below 12 months.", evidenceIds: ["autl-q4-2025"] },
    { risk: "CAR-T safety or logistics limit broader use.", probability: 2, severity: 4, detectability: 3, timeToMatter: "2026-2028", mitigation: "Keep autoimmune/platform projects high-discount option value.", killCriteria: "High-grade CRS/ICANS or manufacturing failures rise in real world.", evidenceIds: ["autl-aucatzyl-label", "autl-rocca"] },
    { risk: "Autoimmune data fail to replicate early promise.", probability: 4, severity: 3, detectability: 2, timeToMatter: "2026-2028", mitigation: "Do not underwrite autoimmune as core value.", killCriteria: "No durable drug-free remission signal or unacceptable toxicity.", evidenceIds: ["autl-pipeline"] },
  ],
  valuationScenarios: [
    { scenario: "Bear", coreMetricLabel: "AUCATZYL launch NAV", coreValue: 260, pipelineHaircut: 0.20, platformOptionValue: 20, cashOrDebtAdjustment: -150, summary: "Guidance miss, negative gross margin persists and equity dilution risk dominates." },
    { scenario: "Base", coreMetricLabel: "AUCATZYL launch NAV", coreValue: 520, pipelineHaircut: 0.45, platformOptionValue: 80, cashOrDebtAdjustment: 0, summary: "AUCATZYL reaches guidance, gross margin turns positive and pipeline optionality receives partial credit." },
    { scenario: "Bull", coreMetricLabel: "AUCATZYL launch NAV", coreValue: 900, pipelineHaircut: 0.70, platformOptionValue: 180, cashOrDebtAdjustment: 100, summary: "Launch scales above guide, cash runway extends and autoimmune/pediatric data validate platform value." },
  ],
  crossChecks: [
    { label: "EV / 2026 guide midpoint", value: 128 / 127.5, format: "multiple", interpretation: "Low EV/sales reflects launch risk and burn." },
    { label: "Cash / market cap", value: 300.7 / 428, format: "percent", interpretation: "Cash is a large part of the equity story but burn matters." },
    { label: "AUCATZYL FY 2025 revenue", value: 74.3, format: "currency", interpretation: "The first commercial year establishes launch baseline." },
  ],
  keyAssumptions: [
    { label: "AUCATZYL 2026 guide midpoint", value: "$127.5m", source: "official", evidenceIds: ["autl-q4-2025"] },
    { label: "Base AUCATZYL launch NAV", value: "$520m", source: "research_only", evidenceIds: ["autl-research-assumptions"] },
    { label: "Autoimmune/platform POS", value: "12-22%", source: "research_only", evidenceIds: ["autl-research-assumptions"] },
  ],
  earnings: autlEarningsDataset,
};
