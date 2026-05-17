import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { BmyBackendValuationPanels } from "../bmy/backendPanels";
import { buildEarningsCallTrend } from "../earningsCall/engine";
import { buildBiopharmaDashboardData } from "./engine";
import type { BiopharmaDashboardData, BiopharmaResearchDataset } from "./types";

function usd(value: number) {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}m`;
}

function perShare(value: number) {
  return `$${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function table(headers: string[], rows: Array<Array<ReactNode>>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[30rem] whitespace-normal px-3 py-2 align-top text-slate-700">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function miniCard(label: string, value: string, detail?: string) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function Cockpit({ dashboard }: { dashboard: BiopharmaDashboardData }) {
  const { dataset, selectedValuation } = dashboard;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {miniCard("Current price", perShare(dataset.currentPrice), dataset.priceDate)}
        {miniCard("Base fair value", perShare(dashboard.valuationOutputs.find((item) => item.scenario === "Base")?.fairValue ?? selectedValuation.fairValue), dataset.modelArchetype.replace(/_/g, " "))}
        {miniCard("Scenario upside", pct(selectedValuation.upsideDownside), selectedValuation.scenario)}
        {miniCard("Pipeline rNPV", usd(dashboard.pipelineValuations.reduce((sum, item) => sum + Math.max(0, item.rnpv), 0)), "Research-only gross value before scenario haircut")}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{dataset.thesis}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{dataset.variantView}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{dataset.companyStrategy}</div>
      </div>
      {table(["Driver", "Signal", "Detail"], dashboard.topDrivers.map((item) => [item.label, item.signal, item.detail]))}
      {table(["Catalyst", "Timing", "Impact", "Thesis relevance"], dataset.catalysts.map((item) => [item.catalyst, item.date, item.impact, item.thesisRelevance]))}
    </div>
  );
}

function Fundamentals({ dataset }: { dataset: BiopharmaResearchDataset }) {
  return (
    <div className="space-y-5">
      {table(
        ["Period", "Revenue", "Primary growth metric", "Operating income", "Non-GAAP EPS", "Cash / investments", "Net debt"],
        dataset.financials.map((row) => [
          row.period,
          usd(row.revenue),
          `${row.primaryGrowthMetricLabel}: ${usd(row.primaryGrowthMetric)}`,
          row.operatingIncome === undefined ? "n.a." : usd(row.operatingIncome),
          row.nonGaapEps === undefined ? "n.a." : perShare(row.nonGaapEps),
          row.cashAndInvestments === undefined ? "n.a." : usd(row.cashAndInvestments),
          row.netDebt === undefined ? "n.a." : usd(row.netDebt),
        ]),
      )}
      {table(
        ["Product / franchise", "Category", "2025 revenue", "Latest quarter", "Role", "Moat", "Pressure"],
        dataset.products.map((item) => [
          item.name,
          item.category,
          item.revenue2025 === undefined ? "n.a." : usd(item.revenue2025),
          item.latestQuarterRevenue === undefined ? "n.a." : usd(item.latestQuarterRevenue),
          item.role,
          item.moat,
          item.pressure,
        ]),
      )}
    </div>
  );
}

function Pipeline({ dashboard }: { dashboard: BiopharmaDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        {miniCard("Pipeline score", dashboard.researchScores.pipeline.toFixed(0), "Evidence maturity weighted")}
        {miniCard("Fundamentals score", dashboard.researchScores.fundamentals.toFixed(0), "Growth concentration weighted")}
        {miniCard("Strategy score", dashboard.researchScores.strategy.toFixed(0), "Priorities less risk pressure")}
        {miniCard("Risk-adjusted score", dashboard.researchScores.riskAdjusted.toFixed(0), "Higher is cleaner")}
      </div>
      {table(
        ["Asset", "Stage", "Mechanism", "Indication", "Launch", "Peak sales", "POS", "Discount", "rNPV / share", "Role"],
        dashboard.pipelineValuations.map((asset) => [
          asset.assetName,
          asset.stage,
          asset.targetOrMechanism,
          asset.indication,
          asset.estimatedLaunchYear,
          usd(asset.estimatedPeakSales),
          pct(asset.probabilityOfSuccess),
          pct(asset.discountRate),
          perShare(asset.valuePerShare),
          `${asset.strategicRole} / ${asset.assumptionType}`,
        ]),
      )}
    </div>
  );
}

function StrategyGuidance({ dataset }: { dataset: BiopharmaResearchDataset }) {
  return (
    <div className="space-y-5">
      {table(
        ["Guidance item", "Period", "Range / midpoint", "Status", "Commentary"],
        dataset.guidance.map((item) => [
          item.metric,
          item.period,
          item.unit === "text" ? item.commentary : `${item.low ?? ""}${item.low !== undefined && item.high !== undefined ? " - " : ""}${item.high ?? item.midpoint ?? ""} ${item.unit}`,
          item.status,
          item.commentary,
        ]),
      )}
      {table(["Priority", "Horizon", "Summary"], dataset.strategyPriorities.map((item) => [item.title, item.timeHorizon, item.summary]))}
      {table(["Key assumption", "Value", "Source"], dataset.keyAssumptions.map((item) => [item.label, String(item.value), item.source]))}
    </div>
  );
}

function AnalystDebate({ dataset }: { dataset: BiopharmaResearchDataset }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
        <span className="font-semibold text-ink">{dataset.analystSnapshot.rating}</span>
        {dataset.analystSnapshot.priceTarget ? ` / consensus target ${perShare(dataset.analystSnapshot.priceTarget)}` : ""}
        <span className="block">{dataset.analystSnapshot.summary}</span>
      </div>
      {table(["Debate", "Bull case", "Bear case", "What to watch"], dataset.analystDebates.map((item) => [item.debate, item.bullCase, item.bearCase, item.whatToWatch]))}
    </div>
  );
}

function EarningsCalls({ dataset }: { dataset: BiopharmaResearchDataset }) {
  const trend = useMemo(() => buildEarningsCallTrend(dataset.earnings), [dataset.earnings]);
  const [selectedId, setSelectedId] = useState(trend.selectedQuarter.id);
  const selected = dataset.earnings.quarters.find((quarter) => quarter.id === selectedId) ?? trend.selectedQuarter;
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Eight-quarter call selector</p>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">{selected.label}</span>
        </div>
        <input
          aria-label="Select earnings call quarter"
          className="w-full accent-sky-600"
          type="range"
          min={0}
          max={dataset.earnings.quarters.length - 1}
          step={1}
          value={dataset.earnings.quarters.findIndex((quarter) => quarter.id === selected.id)}
          onChange={(event) => setSelectedId(dataset.earnings.quarters[Number(event.target.value)]?.id ?? selected.id)}
        />
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {dataset.earnings.quarters.map((quarter) => (
            <button
              key={quarter.id}
              type="button"
              onClick={() => setSelectedId(quarter.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium ${quarter.id === selected.id ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {quarter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{trend.overview.aiTrendSummary}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{selected.aiSummary}</div>
      </div>
      {table(["Topic", "Direction", "Latest", "8Q avg", "AI synthesis"], trend.topicTrendRows.map((row) => [row.label, row.direction, `${row.latestIntensity}/10`, row.eightQuarterAverage.toFixed(1), row.aiSynthesis]))}
      {table(["Current quarter question cluster"], selected.analystQuestions.map((question) => [question]))}
    </div>
  );
}

function Valuation({ dashboard }: { dashboard: BiopharmaDashboardData }) {
  return (
    <div className="space-y-5">
      {dashboard.dataset.ticker === "BMY" ? <BmyBackendValuationPanels /> : null}
      {table(
        ["Scenario", "Core / share", "Pipeline / share", "Option / share", "Cash-debt / share", "Fair value", "Upside", "Summary"],
        dashboard.valuationOutputs.map((item) => [
          item.scenario,
          perShare(item.coreValuePerShare),
          perShare(item.pipelineValuePerShare),
          perShare(item.platformOptionPerShare),
          perShare(item.cashOrDebtPerShare),
          perShare(item.fairValue),
          pct(item.upsideDownside),
          item.summary,
        ]),
      )}
      {table(["Cross-check", "Value", "Interpretation"], dashboard.dataset.crossChecks.map((item) => [item.label, item.format === "percent" ? pct(item.value) : item.format === "currency" ? usd(item.value) : item.value.toFixed(1), item.interpretation]))}
    </div>
  );
}

function RiskRedTeam({ dataset }: { dataset: BiopharmaResearchDataset }) {
  return table(
    ["Risk", "Probability", "Severity", "Detectability", "Timing", "Kill criteria", "Mitigation"],
    dataset.risks.map((item) => [item.risk, `${item.probability}/5`, `${item.severity}/5`, `${item.detectability}/5`, item.timeToMatter, item.killCriteria, item.mitigation]),
  );
}

function Evidence({ dataset }: { dataset: BiopharmaResearchDataset }) {
  return table(
    ["Source", "Type", "Date", "Metric", "Used", "Confidence"],
    dataset.evidence.map((item) => [
      <a className="text-sky-700 underline" href={item.url} target="_blank" rel="noreferrer">{item.sourceTitle}</a>,
      item.sourceType,
      item.date,
      item.extractedMetric,
      item.usedInModel ? "yes" : "no",
      item.confidence,
    ]),
  );
}

export function BiopharmaResearchDashboard({ module, scenario, dataSourceType }: StockDashboardProps) {
  const dataset = module.data as BiopharmaResearchDataset;
  const dashboard = useMemo(() => buildBiopharmaDashboardData(dataset, scenario), [dataset, scenario]);
  const summary = useMemo(() => module.calculateSummary(dataset), [dataset, module]);
  const [tab, setTab] = useState(dataset.ticker === "BMY" ? "valuation" : module.tabs[0]?.value ?? "cockpit");
  return (
    <div className="space-y-6">
      <SectionCard
        title={`${dataset.ticker} Research Cockpit`}
        description="Full buy-side module covering fundamentals, pipeline, strategy, guidance, analyst debate, earnings-call trends, valuation and red-team risks."
        badge={<DataQualityBadge badge={dataSourceType === "manual" ? "Assumption" : "Actual"} />}
      >
        <Cockpit dashboard={dashboard} />
        {dashboard.validationWarnings.length > 0 ? (
          <div className="mt-4 space-y-2">
            {dashboard.validationWarnings.map((warning) => (
              <div key={warning.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{warning.title}</span>
                <span className="ml-2">{warning.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((metric) => <MetricCard key={metric.key} metric={metric} currency="USD" />)}
      </div>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger key={item.value} value={item.value} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="cockpit" className="mt-6"><SectionCard title="Cockpit"><Cockpit dashboard={dashboard} /></SectionCard></Tabs.Content>
        <Tabs.Content value="fundamentals" className="mt-6"><SectionCard title="Fundamentals"><Fundamentals dataset={dataset} /></SectionCard></Tabs.Content>
        <Tabs.Content value="pipeline" className="mt-6"><SectionCard title="Pipeline rNPV"><Pipeline dashboard={dashboard} /></SectionCard></Tabs.Content>
        <Tabs.Content value="strategy" className="mt-6"><SectionCard title="Strategy & Guidance"><StrategyGuidance dataset={dataset} /></SectionCard></Tabs.Content>
        <Tabs.Content value="analysts" className="mt-6"><SectionCard title="Analyst Debate"><AnalystDebate dataset={dataset} /></SectionCard></Tabs.Content>
        <Tabs.Content value="earnings" className="mt-6"><SectionCard title="Earnings Calls"><EarningsCalls dataset={dataset} /></SectionCard></Tabs.Content>
        <Tabs.Content value="valuation" className="mt-6"><SectionCard title="Valuation"><Valuation dashboard={dashboard} /></SectionCard></Tabs.Content>
        <Tabs.Content value="risk" className="mt-6"><SectionCard title="Risk Red Team"><RiskRedTeam dataset={dataset} /></SectionCard></Tabs.Content>
        <Tabs.Content value="evidence" className="mt-6"><SectionCard title="Evidence"><Evidence dataset={dataset} /></SectionCard></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
