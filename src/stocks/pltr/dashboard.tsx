import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import {
  attachPltrRuntimeContext,
  buildPltrDashboardData,
  calculatePltrSummary,
  getDefaultPltrPeriod,
  resolvePltrDataset,
  resolvePltrEffectiveDataSourceType,
} from "./calculations";
import { defaultPltrValuationAssumptions } from "./assumptions";
import type { PltrValuationAssumptions } from "./model";
import { AIPAdoptionEngine } from "./components/AIPAdoptionEngine";
import { CustomerCohortEngine } from "./components/CustomerCohortEngine";
import { OntologyMoatEngine } from "./components/OntologyMoatEngine";
import { PLTRBusinessSegments } from "./components/PLTRBusinessSegments";
import { PLTRHistoricalValuationPanel } from "./components/PLTRHistoricalValuationPanel";
import { PLTROverview } from "./components/PLTROverview";
import { PMMemo } from "./components/PMMemo";
import { Q1DeepDive } from "./components/Q1DeepDive";
import { RedTeamRiskPanel } from "./components/RedTeamRiskPanel";
import { RuleOf40Engine } from "./components/RuleOf40Engine";
import { SBCDilutionTracker } from "./components/SBCDilutionTracker";
import { ScenarioLab } from "./components/ScenarioLab";
import { SubmoduleInsightLedger } from "./components/SubmoduleInsightLedger";
import { TranscriptIntelligenceLab } from "./components/TranscriptIntelligenceLab";
import { ValuationDashboard } from "./components/ValuationDashboard";
import { SourceNote } from "./components/PLTRPrimitives";

function loadSavedPltrValuationAssumptions() {
  if (typeof window === "undefined") return defaultPltrValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-PLTR");
  if (!saved) return defaultPltrValuationAssumptions;
  try {
    return {
      ...defaultPltrValuationAssumptions,
      ...(JSON.parse(saved) as Partial<PltrValuationAssumptions>),
    };
  } catch {
    return defaultPltrValuationAssumptions;
  }
}

export function PltrDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [valuationAssumptions, setValuationAssumptions] = useState<PltrValuationAssumptions>(
    loadSavedPltrValuationAssumptions,
  );
  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolvePltrDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () =>
      attachPltrRuntimeContext(moduleData, {
        periodId: resolvedPeriod || getDefaultPltrPeriod(moduleData),
        dataSourceType,
      }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const effectiveDataSourceType = resolvePltrEffectiveDataSourceType(runtimeData);
  const dashboard = useMemo(
    () => buildPltrDashboardData(runtimeData, resolvedPeriod, scenario, valuationAssumptions),
    [runtimeData, resolvedPeriod, scenario, valuationAssumptions],
  );
  const summary = useMemo(() => calculatePltrSummary(runtimeData), [runtimeData]);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as PltrValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Palantir Fundamental Research"
        description="A PLTR-specific research module focused on AIP monetization, ontology moat, government durability, commercial expansion, operating leverage, SBC dilution, and valuation controversy."
        badge={<DataQualityBadge badge={effectiveDataSourceType === "manual" ? "Assumption" : "Needs Review"} />}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <SourceNote>
            Data path: PLTR is registered through the stock module contract and uses module.data. Source refresh scripts write to data/local/pltr; transcript text is not hardcoded into source.
          </SourceNote>
          <SourceNote>
            Separation rule: actuals, guidance, forecast assumptions, research-only signals, and valuation outputs are kept in separate layers.
          </SourceNote>
          <SourceNote>
            Market-data warning: current price is a low-confidence local placeholder until the yfinance/local metric scripts are refreshed.
          </SourceNote>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="USD" />
        ))}
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

        <Tabs.Content value="overview" className="mt-6">
          <PLTROverview dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="key-insights" className="mt-6">
          <SubmoduleInsightLedger dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="q1-2026-deep-dive" className="mt-6">
          <Q1DeepDive dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="business-segments" className="mt-6">
          <PLTRBusinessSegments dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="aip-engine" className="mt-6">
          <AIPAdoptionEngine dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="ontology-moat" className="mt-6">
          <OntologyMoatEngine dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="customer-cohorts" className="mt-6">
          <CustomerCohortEngine dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="rule-of-40" className="mt-6">
          <RuleOf40Engine dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="sbc-dilution" className="mt-6">
          <SBCDilutionTracker dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <PLTRHistoricalValuationPanel dashboard={dashboard} values={valuationAssumptions} />
          <ValuationDashboard dashboard={dashboard} values={valuationAssumptions} onValuesChange={handleValuationValuesChange} />
          <InteractiveValuationDashboard
            ticker="PLTR"
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency="USD"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>
        <Tabs.Content value="scenario-lab" className="mt-6">
          <ScenarioLab dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="transcript-lab" className="mt-6">
          <TranscriptIntelligenceLab dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="risk-red-team" className="mt-6">
          <RedTeamRiskPanel dashboard={dashboard} />
        </Tabs.Content>
        <Tabs.Content value="pm-memo" className="mt-6">
          <PMMemo dashboard={dashboard} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
