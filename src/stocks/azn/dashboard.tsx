import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { AZNInvestmentSnapshot } from "./components/AZNInvestmentSnapshot";
import { AznApiHistoricalValuationPanel, AznBacktestPanel } from "./components/AznApiHistoricalValuationPanel";
import { ChinaExposurePanel } from "./components/ChinaExposurePanel";
import { CVRMEnginePanel } from "./components/CVRMEnginePanel";
import { DrugDurabilityMatrix } from "./components/DrugDurabilityMatrix";
import { EarningsCallIntelligencePanel } from "./components/EarningsCallIntelligencePanel";
import { FinancialQualityPanel } from "./components/FinancialQualityPanel";
import { OncologyEnginePanel } from "./components/OncologyEnginePanel";
import { PatentCliffMonitor } from "./components/PatentCliffMonitor";
import { PipelineIntelligenceLab } from "./components/PipelineIntelligenceLab";
import { RareDiseaseEnginePanel } from "./components/RareDiseaseEnginePanel";
import { RiskRadarPanel } from "./components/RiskRadarPanel";
import { SourceEvidencePanel } from "./components/SourceEvidencePanel";
import { TherapyAreaDashboard } from "./components/TherapyAreaDashboard";
import { ValuationTriangulationPanel } from "./components/ValuationTriangulationPanel";
import {
  attachAznRuntimeContext,
  buildAznDashboardData,
  defaultAznValuationAssumptions,
  resolveAznDataset,
  resolveAznEffectiveDataSourceType,
} from "./calculations";
import type { AznValuationAssumptions } from "./types";

function loadSavedAznValuationAssumptions() {
  if (typeof window === "undefined") return defaultAznValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-AZN");
  if (!saved) return defaultAznValuationAssumptions;
  try {
    return {
      ...defaultAznValuationAssumptions,
      ...(JSON.parse(saved) as Partial<AznValuationAssumptions>),
    };
  } catch {
    return defaultAznValuationAssumptions;
  }
}

export function AznDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [valuationAssumptions, setValuationAssumptions] = useState<AznValuationAssumptions>(loadSavedAznValuationAssumptions);
  const apiBaseUrl = import.meta.env.VITE_AZN_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveAznDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () => attachAznRuntimeContext(moduleData, { periodId: resolvedPeriod, dataSourceType }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const effectiveDataSourceType = resolveAznEffectiveDataSourceType(runtimeData);
  const valuationOverrides = dataSourceType === "manual" ? valuationAssumptions : undefined;
  const dashboard = useMemo(
    () => buildAznDashboardData(moduleData, resolvedPeriod, scenario, valuationOverrides),
    [moduleData, resolvedPeriod, scenario, valuationOverrides],
  );
  const summary = useMemo(() => module.calculateSummary(runtimeData), [runtimeData, module]);
  const dataSourceSupportText = useMemo(() => {
    if (dataSourceType === "manual") {
      return "AZN is using the official/public baseline dataset plus manual valuation-assumption overrides. Manual mode does not overwrite reported financial, pipeline, patent, or market-data evidence.";
    }
    if (dataSourceType !== "mock") {
      return `Requested source "${dataSourceType}" is not wired for AZN yet. The module falls back to its curated official/public baseline and keeps source warnings visible.`;
    }
    return "AZN currently runs on a curated official/public baseline: AstraZeneca result PDFs, pipeline/patent supplements, public market snapshots, and clearly tagged research-only estimates.";
  }, [dataSourceType]);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as AznValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="AZN Research Cockpit"
        description={`AstraZeneca is modeled as a pharma portfolio: current therapy-area cash flows, blockbuster durability, patent cliffs, pipeline rNPV, oncology, rare disease, CVRM, China, financial quality, and valuation triangulation.`}
        badge={<DataQualityBadge badge={effectiveDataSourceType === "manual" ? "Assumption" : "Actual"} />}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InsightPanel title="Data Layer" text={dataSourceSupportText} />
          <InsightPanel
            title="Unit Discipline"
            text={`London AZN is quoted in GBX and normalized to £${dashboard.dataset.marketData.londonPriceGbp.toFixed(2)}. US valuation is shown for the current NYSE ordinary-share listing; former ADR equivalents are audit-only.`}
          />
        </div>
        {dashboard.dataStatus.validationWarnings.length > 0 ? (
          <div className="mt-4 space-y-2">
            {dashboard.dataStatus.validationWarnings.map((warning) => (
              <div key={warning.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{warning.title}</span>
                <span className="ml-2">{warning.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((metric) => <MetricCard key={metric.key} metric={metric} currency="GBP" />)}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <SectionCard title="Investment Snapshot" description="Current price, fair value, quality, risk, patent-cliff pressure, pipeline score, and immediate read-throughs.">
            <AZNInvestmentSnapshot dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Earnings Call Intelligence" description="Eight-quarter official results-event tracker with AI summary of market focus migration. Display-only, not a valuation input.">
            <EarningsCallIntelligencePanel dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Thesis Board" description="The short-form PM debate: what must go right, what breaks, and where the market may be looking too bluntly.">
            <ThesisBoard dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Segment Overview" description="Therapy-area revenue mix, growth and key drugs from the reported data layer.">
            <TherapyAreaDashboard dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Patent Cliff Monitor" description="LOE timing, revenue at risk and cliff-adjusted revenue scenarios by region.">
            <PatentCliffMonitor dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Pipeline Intelligence" description="Probability-adjusted pipeline value, catalyst calendar, phase funnel and research-only asset assumptions.">
            <PipelineIntelligenceLab dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Valuation Summary" description="DCF, SOTP, pipeline rNPV and peer-multiple triangulation with GBP / USD / historical ADR audit trail.">
            <ValuationTriangulationPanel dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Risk Radar" description="Patent, clinical, pricing, China, FX, M&A/licensing and competition risk triggers.">
            <RiskRadarPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="therapy" className="mt-6">
          <SectionCard title="Business Segment / Therapy Area Dashboard" description="AZN is underwritten by disease-area structure, not just consolidated sales growth.">
            <TherapyAreaDashboard dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="durability" className="mt-6">
          <SectionCard title="Blockbuster Drug Durability Matrix" description="Sortable, explainable scoring across leadership, patent protection, lifecycle expansion, competitive moat, pricing power and geography.">
            <DrugDurabilityMatrix dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="patent" className="mt-6">
          <SectionCard title="Patent Cliff / LOE Risk Monitor" description="Timeline and revenue-at-risk monitor for Farxiga, Lynparza, Tagrisso, Brilinta, Symbicort, Soliris, Ultomiris and Fasenra.">
            <PatentCliffMonitor dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="pipeline" className="mt-6">
          <SectionCard title="Pipeline Intelligence Lab" description="Official phase/catalyst facts stay separate from research-only peak-sales, POS and rNPV estimates.">
            <PipelineIntelligenceLab dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="earnings-call" className="mt-6">
          <SectionCard title="Earnings Call Intelligence" description="Past eight quarters of AZN result-call material, with scrollable quarter selection and AI synthesis of changing market concerns.">
            <EarningsCallIntelligencePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="oncology" className="mt-6">
          <SectionCard title="Oncology Engine" description="Oncology is the core compounding engine: revenue bridge, franchise drivers, collaboration economics, pipeline optionality and risk heatmap.">
            <OncologyEnginePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="rare-cvrm" className="mt-6 space-y-6">
          <SectionCard title="Rare Disease / Alexion Engine" description="Complement biology, Soliris-to-Ultomiris transition, orphan durability and reimbursement risk.">
            <RareDiseaseEnginePanel dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="CVRM / Farxiga Engine" description="Farxiga trajectory, cardiorenal indications, GLP-1 adjacency and LOE-adjusted scenario work.">
            <CVRMEnginePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="china-financials" className="mt-6 space-y-6">
          <SectionCard title="China / Emerging Markets Engine" description="China is modeled as growth plus policy risk: VBP, NRDL, hospital channel, local competition and scenario work.">
            <ChinaExposurePanel dashboard={dashboard} />
          </SectionCard>
          <SectionCard title="Financial Quality Engine" description="Reported IFRS, core/adjusted metrics, cash conversion, dividend safety and R&D productivity are visibly separated.">
            <FinancialQualityPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <AznBacktestPanel apiBaseUrl={apiBaseUrl} />
          <SectionCard title="Backend Valuation Lab" description="Database-backed historical valuation visualization by AZN reporting event, with price/fair-value trend, method bridge, sensitivity heatmap and audit trail.">
            <AznApiHistoricalValuationPanel apiBaseUrl={apiBaseUrl} scenario={scenario} />
          </SectionCard>
          <SectionCard title="Valuation Triangulation" description="AZN cannot be reduced to one P/E: DCF, SOTP, pipeline rNPV and multiples answer different underwriting questions.">
            <ValuationTriangulationPanel dashboard={dashboard} />
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency="GBP"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="evidence" className="mt-6">
          <SectionCard title="Source Evidence / Audit Trail" description="Every core data layer keeps source quality, URL, period, confidence, valuation eligibility and research-only flags visible.">
            <SourceEvidencePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function ThesisBoard({ dashboard }: { dashboard: ReturnType<typeof buildAznDashboardData> }) {
  const board = dashboard.thesisBoard;
  const rows = [
    { title: "Bull Case", text: board.bullCase, tone: "text-emerald-700" },
    { title: "Base Case", text: board.baseCase, tone: "text-slate-700" },
    { title: "Bear Case", text: board.bearCase, tone: "text-rose-700" },
    { title: "Key Debate", text: board.keyDebate, tone: "text-sky-700" },
    { title: "Variant Perception", text: board.variantPerception, tone: "text-indigo-700" },
    { title: "What Market May Be Missing", text: board.whatMarketMayBeMissing, tone: "text-amber-700" },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.title} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className={`text-sm font-semibold ${row.tone}`}>{row.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{row.text}</p>
        </div>
      ))}
    </div>
  );
}

function InsightPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
