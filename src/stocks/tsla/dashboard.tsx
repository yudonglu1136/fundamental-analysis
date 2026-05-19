import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, BatteryCharging, Bot, Car, Factory, ShieldAlert, TrendingUp, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { defaultTslaValuationAssumptions } from "./assumptions";
import { buildTslaDashboardData } from "./calculations";
import { tslaValuationConfig } from "./config";
import type { TslaDataset } from "./model";

function usdm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`
    : "-";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(1)}` : "-";
}

function ScenarioButtons({ scenario, onScenarioChange }: Pick<StockDashboardProps, "scenario" | "onScenarioChange">) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["Bear", "Base", "Bull"] as const).map((item) => (
        <button
          key={item}
          className={`border px-5 py-2 text-sm font-semibold ${scenario === item ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-700"}`}
          onClick={() => onScenarioChange(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function InsightCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-blue-700">
        {icon}
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

function FinancialChart({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["financialRows"] }) {
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} width={72} />
          <Tooltip formatter={(value: number) => usdm(value)} />
          <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="operatingIncome" name="Operating income" fill="#0f172a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="freeCashFlow" name="Free cash flow" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MarginChart({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["financialRows"] }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={56} />
          <Tooltip formatter={(value: number) => pct(value)} />
          <Line type="monotone" dataKey="grossMargin" name="Gross margin" stroke="#2563eb" strokeWidth={2.2} dot />
          <Line type="monotone" dataKey="operatingMargin" name="Operating margin" stroke="#0f172a" strokeWidth={2.2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SignalChart({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["operatingRows"] }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={56} />
          <Tooltip formatter={(value: number) => pct(value)} />
          <Bar dataKey="autoDemandSignal" name="Auto demand" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="energyStorageSignal" name="Energy storage" fill="#059669" radius={[4, 4, 0, 0]} />
          <Bar dataKey="autonomyProgressSignal" name="Autonomy progress" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SourceGapList({ gaps }: { gaps: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="text-sm font-semibold text-ink">Source gaps</h3>
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
        {gaps.map((gap) => (
          <li key={gap}>- {gap}</li>
        ))}
      </ul>
    </div>
  );
}

function ValuationMethodTable({ valuation }: { valuation: ReturnType<typeof buildTslaDashboardData>["valuation"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Fair value</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {valuation.methodCards.map((method) => (
            <tr key={method.key}>
              <td className="px-3 py-2 font-medium text-ink">{method.label}</td>
              <td className="px-3 py-2">{usd(method.value)}</td>
              <td className="px-3 py-2">{method.sourceConfidence}</td>
              <td className="px-3 py-2">{method.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TslaDashboard({ module, scenario, onScenarioChange, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const data = module.data as TslaDataset;
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "TSLA",
    defaultAssumptions: defaultTslaValuationAssumptions,
    storageKey: "tsla-valuation-assumptions",
    onDataSourceChange,
  });
  const dashboard = useMemo(() => buildTslaDashboardData(data, scenario, valuationAssumptions), [data, scenario, valuationAssumptions]);

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="ontology-label">EV / Energy Storage / Autonomy</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-ink">TSLA · Tesla</h1>
            <p className="mt-3 max-w-5xl text-base leading-7 text-slate-600">
              Backend-ready Tesla cockpit focused on auto margin durability, energy storage scale, autonomy optionality, China competition and FCF support for the premium multiple.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <ScenarioButtons scenario={scenario} onScenarioChange={onScenarioChange} />
            <div className="flex items-center gap-2 text-xs uppercase tracking-normal text-slate-500">
              <DataQualityBadge badge={dataSourceType === "api" ? "Actual" : "Assumption"} />
              <span>Source mode: {dataSourceType}</span>
            </div>
          </div>
        </div>
      </section>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 border-b border-slate-200">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="px-4 py-3 text-sm font-semibold text-slate-500 data-[state=active]:border-b-2 data-[state=active]:border-ink data-[state=active]:text-ink"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="dashboard" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.summary.map((metric) => (
              <MetricCard key={metric.key} metric={metric} currency={module.currency} />
            ))}
          </div>
          <SectionCard title="Financial Snapshot" description="Reported SEC companyfacts data in USD millions. The model separates auto earnings, energy storage and autonomy option value.">
            <FinancialChart rows={dashboard.financialRows} />
          </SectionCard>
          <div className="grid gap-4 lg:grid-cols-3">
            <InsightCard icon={<Car className="h-5 w-5" />} title="Auto Margin">
              The core auto business must stabilize margins before a high earnings multiple is defensible.
            </InsightCard>
            <InsightCard icon={<BatteryCharging className="h-5 w-5" />} title="Energy Storage">
              Energy is modeled separately because it can compound differently from auto volumes and pricing.
            </InsightCard>
            <InsightCard icon={<Bot className="h-5 w-5" />} title="Autonomy">
              Autonomy is explicit probability-weighted option value, not a hidden boost to auto margins.
            </InsightCard>
          </div>
        </Tabs.Content>

        <Tabs.Content value="auto-ev-demand" className="mt-6 space-y-6">
          <SectionCard title="Auto / EV Demand" description="Research-only scorecard until deliveries, ASP and gross margin ex credits are parsed from official tables.">
            <SignalChart rows={dashboard.operatingRows} />
          </SectionCard>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.operatingMetrics.slice(-2).map((metric) => (
              <InsightCard key={metric.periodId} icon={<Car className="h-5 w-5" />} title={data.periods.find((period) => period.id === metric.periodId)?.label ?? metric.periodId}>
                <p>{metric.evCompetitionCommentary}</p>
                <p className="mt-2">{metric.chinaRiskCommentary}</p>
              </InsightCard>
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="energy-storage" className="mt-6 space-y-6">
          <SectionCard title="Energy Storage Growth" description="Energy storage needs separate tracking because consolidated revenue hides a very different demand cycle.">
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightCard icon={<Zap className="h-5 w-5" />} title="Bull Case">
                Storage deployments scale with grid scarcity, renewables penetration and data-center power needs, potentially supporting a higher sales multiple.
              </InsightCard>
              <InsightCard icon={<AlertTriangle className="h-5 w-5" />} title="Diligence Need">
                Segment revenue, gross margin, backlog and project concentration must be extracted before the energy SOTP deserves high confidence.
              </InsightCard>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="autonomy-software" className="mt-6 space-y-6">
          <SectionCard title="Autonomy / Software Optionality" description="The model makes autonomy optionality visible rather than embedding it in a full-company multiple.">
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightCard icon={<Bot className="h-5 w-5" />} title="What Must Become Measurable">
                Safety, regulatory approval, monetization, take-rate, fleet utilization and unit economics must bridge from narrative to auditable economics.
              </InsightCard>
              <InsightCard icon={<ShieldAlert className="h-5 w-5" />} title="Model Guardrail">
                Raising autonomy value should happen through option value and probability, not by also raising auto margin and core multiple without evidence.
              </InsightCard>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margins-fcf" className="mt-6 space-y-6">
          <SectionCard title="Margins and FCF" description="Premium valuation needs either auto-margin recovery, energy scale or autonomy monetization; FCF yield is the guardrail.">
            <div className="grid gap-5 xl:grid-cols-2">
              <MarginChart rows={dashboard.financialRows} />
              <FinancialChart rows={dashboard.financialRows} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <SectionCard title="TSLA Valuation Triangulation" description="Core auto earnings, energy SOTP, FCF yield, DCF and explicit autonomy optionality.">
            <ValuationMethodTable valuation={dashboard.valuation} />
          </SectionCard>
          <InteractiveValuationDashboard
            ticker="TSLA"
            config={tslaValuationConfig}
            data={data}
            scenario={scenario}
            currency={module.currency}
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="risk-red-team" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="Risks that should be disproved before underwriting Tesla as a durable premium compounder.">
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightCard icon={<Factory className="h-5 w-5" />} title="Auto Competition">
                Price cuts, China competition, model-cycle aging and regional mix can keep auto margins below the level implied by the multiple.
              </InsightCard>
              <InsightCard icon={<BatteryCharging className="h-5 w-5" />} title="Energy Execution">
                Storage can be valuable, but backlog, margin and project execution need official extraction before high-confidence underwriting.
              </InsightCard>
              <InsightCard icon={<Bot className="h-5 w-5" />} title="Autonomy Overcapitalization">
                The largest risk is paying for autonomy before measurable deployment economics arrive.
              </InsightCard>
              <SourceGapList gaps={data.sourceGaps} />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
