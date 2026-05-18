import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BatteryCharging, Factory, RadioTower, Scale, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { cegValuationConfig } from "./config";
import { defaultCegValuationAssumptions } from "./assumptions";
import { calculateCegSummary, calculateCegValuation, resolveCegDataset } from "./calculations";

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(1)}` : "n/a";
}

function usdm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toLocaleString()}m` : "n/a";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="rounded-md border border-slate-200 bg-white p-2 text-slate-800 shadow-sm"><Icon className="h-4 w-4" /></span>
      <div>
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
    </div>
  );
}

export function CegDashboard({ module, scenario, onScenarioChange, onDataSourceChange }: StockDashboardProps) {
  const [activeTab, setActiveTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const dataset = resolveCegDataset(module.data);
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "CEG",
    defaultAssumptions: defaultCegValuationAssumptions,
    onDataSourceChange,
  });
  const valuation = useMemo(() => calculateCegValuation(dataset, valuationAssumptions, scenario), [dataset, valuationAssumptions, scenario]);
  const selected = valuation.fairValues.find((row) => row.scenario === scenario) ?? valuation.fairValues[1] ?? valuation.fairValues[0];
  const financialRows = dataset.periods.map((row) => ({
    label: row.label,
    revenue: row.periodType === "quarter" ? row.revenue * 4 : row.revenue,
    operatingMargin: (row.operatingMargin ?? row.operatingIncome / row.revenue) * 100,
    fcf: row.periodType === "quarter" ? (row.freeCashFlow ?? 0) * 4 : row.freeCashFlow ?? 0,
    eps: row.dilutedEps ?? 0,
  }));
  const operatingRows = dataset.operatingMetrics.map((row) => ({
    label: row.periodId.replace("fy", "FY ").replace("-q", " Q"),
    capacityFactor: (row.nuclearCapacityFactor ?? 0) * 100,
    powerPrice: row.realizedPowerPrice ?? 0,
    aiLoad: (row.commercialLoadGrowth ?? 0) * 100,
    grossMargin: row.grossMarginPerMwh ?? 0,
  }));
  const summary = calculateCegSummary(dataset);

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Power / Nuclear Scarcity</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">CEG · Constellation Energy</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Backend-ready CEG cockpit focused on nuclear fleet reliability, AI data-center power scarcity, merchant power-price exposure,
            PTC downside support, regulation, and normalized cash conversion.
          </p>
        </div>
        <div className="flex gap-2">
          {(["Bear", "Base", "Bull"] as const).map((item) => (
            <button key={item} type="button" onClick={() => onScenarioChange(item)} className={`h-9 border px-4 text-sm font-semibold ${scenario === item ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <Tabs.List className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {module.tabs.map((tab) => (
          <Tabs.Trigger key={tab.value} value={tab.value} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 data-[state=active]:border-slate-950 data-[state=active]:text-slate-950">
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="dashboard" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summary.map((metric) => <MetricCard key={metric.key} metric={metric} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="Investment Read">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard metric={{ key: "fairValue", label: "Selected Fair Value", value: selected?.fairValue ?? 0, format: "currency", description: valuation.recommendedFairValueReason ?? "", badge: "Derived" }} />
              <MetricCard metric={{ key: "upside", label: "Upside / Downside", value: selected?.upsideDownside ?? 0, format: "percent", description: "Versus current Nasdaq price anchor.", badge: "Derived" }} />
              <MetricCard metric={{ key: "confidence", label: "Reliability Score", value: valuation.overallIntegrityScore ?? 0, format: "number", description: "Penalizes source gaps and placeholder operating metrics.", badge: "Derived" }} />
            </div>
          </SectionCard>
          <SectionCard title="Source Guardrails">
            <ul className="space-y-2 text-sm text-slate-600">
              {dataset.sourceGaps.map((gap) => <li key={gap} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{gap}</li>)}
            </ul>
          </SectionCard>
        </div>
      </Tabs.Content>

      <Tabs.Content value="nuclear-fleet" className="space-y-6">
        <SectionCard title="Nuclear Fleet Reliability">
          <SectionTitle icon={RadioTower} title="Capacity Factor / Power Economics" subtitle="Research-only operational bridge until official fleet KPIs are fully parsed." />
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={operatingRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="capacityFactor" name="Capacity factor %" fill="#0f172a" />
                <Line yAxisId="right" type="monotone" dataKey="powerPrice" name="Realized price proxy" stroke="#2563eb" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="grossMargin" name="Gross margin / MWh proxy" stroke="#f59e0b" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </Tabs.Content>

      <Tabs.Content value="ai-power" className="space-y-6">
        <SectionCard title="AI Data-Center Power Demand">
          <SectionTitle icon={BatteryCharging} title="AI Load / Scarcity Debate" subtitle="Focus is contracted load, delivery risk, interconnection, and whether scarcity rent is already in the stock." />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={operatingRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="aiLoad" name="Commercial / AI load growth proxy %" stroke="#16a34a" fill="#bbf7d0" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {dataset.researchQuestions.slice(0, 2).map((item) => (
                <div key={item.key} className="border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-950">{item.question}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.currentView}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">{item.evidenceNeeded}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </Tabs.Content>

      <Tabs.Content value="financials" className="space-y-6">
        <SectionCard title="Financials / FCF">
          <SectionTitle icon={Factory} title="Revenue, Margin and Cash Conversion" subtitle="CEG reported FCF is volatile; underwriting should normalize collateral and growth capex." />
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financialRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => name === "Operating margin %" ? `${Number(value).toFixed(1)}%` : usdm(Number(value))} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#334155" />
                <Bar yAxisId="left" dataKey="fcf" name="FCF" fill="#22c55e" />
                <Line yAxisId="right" type="monotone" dataKey="operatingMargin" name="Operating margin %" stroke="#2563eb" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </Tabs.Content>

      <Tabs.Content value="valuation" className="space-y-6">
        <SectionCard title="Valuation Triangulation">
          <div className="mb-4 grid gap-4 md:grid-cols-4">
            {valuation.methodCards.slice(0, 4).map((card) => (
              <div key={card.key} className="border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{usd(card.value)}</p>
                <p className="mt-2 text-xs text-slate-500">{card.description}</p>
              </div>
            ))}
          </div>
          <InteractiveValuationDashboard ticker="CEG" config={cegValuationConfig} data={dataset} scenario={scenario} currency="USD" values={valuationAssumptions} onValuesChange={handleValuationValuesChange} />
        </SectionCard>
      </Tabs.Content>

      <Tabs.Content value="risk-red-team" className="space-y-6">
        <SectionCard title="Risk Red Team">
          <SectionTitle icon={Scale} title="What Can Break the CEG Thesis" subtitle="The main risk is paying a scarcity multiple for earnings that prove cyclical, regulated, or capex-heavy." />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {dataset.researchQuestions.slice(2).map((item) => (
              <div key={item.key} className="border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-950">{item.question}</p>
                <p className="mt-2 text-sm text-slate-600">{item.currentView}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">{item.evidenceNeeded}</p>
              </div>
            ))}
            <div className="border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-950">Key kill-switches</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>AI data-center demand stays conceptual rather than contracted at attractive price/duration.</li>
                <li>FERC/state regulation socializes benefits to consumers and caps nuclear scarcity rent.</li>
                <li>Power curve rolls over before CEG can lock durable economics.</li>
                <li>Calpine integration raises leverage/capex and dilutes the clean nuclear compounder story.</li>
              </ul>
            </div>
          </div>
        </SectionCard>
      </Tabs.Content>
    </Tabs.Root>
  );
}
