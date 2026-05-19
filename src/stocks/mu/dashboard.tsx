import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, Cpu, DatabaseZap, Factory, Globe2, Layers3, ShieldAlert, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { defaultMuValuationAssumptions } from "./assumptions";
import { buildMuDashboardData } from "./calculations";
import { muValuationConfig } from "./config";
import type { MuDataset } from "./model";

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

function FinancialChart({ rows }: { rows: ReturnType<typeof buildMuDashboardData>["financialRows"] }) {
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

function MarginChart({ rows }: { rows: ReturnType<typeof buildMuDashboardData>["financialRows"] }) {
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

function SignalChart({ rows }: { rows: ReturnType<typeof buildMuDashboardData>["operatingRows"] }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={56} />
          <Tooltip formatter={(value: number) => pct(value)} />
          <Bar dataKey="hbmDemandSignal" name="HBM demand" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="dramCycleSignal" name="DRAM cycle" fill="#64748b" radius={[4, 4, 0, 0]} />
          <Bar dataKey="nandCycleSignal" name="NAND cycle" fill="#14b8a6" radius={[4, 4, 0, 0]} />
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

function ValuationMethodTable({ valuation }: { valuation: ReturnType<typeof buildMuDashboardData>["valuation"] }) {
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

export function MuDashboard({ module, scenario, onScenarioChange, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const data = module.data as MuDataset;
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "MU",
    defaultAssumptions: defaultMuValuationAssumptions,
    storageKey: "mu-valuation-assumptions",
    onDataSourceChange,
  });
  const dashboard = useMemo(() => buildMuDashboardData(data, scenario, valuationAssumptions), [data, scenario, valuationAssumptions]);

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="ontology-label">Memory / HBM / AI Infrastructure</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-ink">MU · Micron Technology</h1>
            <p className="mt-3 max-w-5xl text-base leading-7 text-slate-600">
              Backend-ready MU cockpit focused on HBM durability, DRAM/NAND cycle position, China/export-control risk, capex intensity and normalized FCF conversion.
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
          <SectionCard title="Financial Cycle Snapshot" description="Reported data from SEC companyfacts, shown in USD millions. MU must be normalized because memory economics swing across the cycle.">
            <FinancialChart rows={dashboard.financialRows} />
          </SectionCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <InsightCard icon={<DatabaseZap className="h-5 w-5" />} title="HBM / AI Memory Thesis">
              HBM can structurally improve mix, but the model keeps the HBM uplift separate from normalized revenue and margin so the thesis is auditable.
            </InsightCard>
            <InsightCard icon={<ShieldAlert className="h-5 w-5" />} title="Cycle Discipline">
              MU is not valued on latest-quarter EPS alone. The cycle haircut and capex haircut test whether the upside survives DRAM/NAND normalization.
            </InsightCard>
          </div>
        </Tabs.Content>

        <Tabs.Content value="memory-cycle" className="mt-6 space-y-6">
          <SectionCard title="HBM, DRAM and NAND Cycle Signals" description="Research-only scorecard until HBM mix, pricing and qualification data are parsed from official sources.">
            <SignalChart rows={dashboard.operatingRows} />
          </SectionCard>
          <div className="grid gap-4 lg:grid-cols-3">
            {data.operatingMetrics.slice(-3).map((metric) => (
              <InsightCard key={metric.periodId} icon={<Cpu className="h-5 w-5" />} title={data.periods.find((period) => period.id === metric.periodId)?.label ?? metric.periodId}>
                <p>{metric.aiServerExposureCommentary}</p>
                <p className="mt-2">{metric.pricingCommentary}</p>
              </InsightCard>
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="hbm-ai" className="mt-6 space-y-6">
          <SectionCard title="HBM / AI Server Demand" description="The investment question is whether HBM mix is durable enough to support premium normalized margins after capacity catches up.">
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightCard icon={<TrendingUp className="h-5 w-5" />} title="What Supports the Bull Case">
                Qualification with leading AI accelerator customers, longer-duration HBM commitments, constrained supply and higher value per bit can raise through-cycle gross margin.
              </InsightCard>
              <InsightCard icon={<AlertTriangle className="h-5 w-5" />} title="What Breaks the Bull Case">
                The risk is that investors capitalize a super-cycle quarter while competitors add supply, pricing resets and capex remains elevated.
              </InsightCard>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margins-fcf" className="mt-6 space-y-6">
          <SectionCard title="Margins and FCF Conversion" description="Gross margin recovery is visible, but HBM/node capex determines how much of it reaches equity free cash flow.">
            <div className="grid gap-5 xl:grid-cols-2">
              <MarginChart rows={dashboard.financialRows} />
              <FinancialChart rows={dashboard.financialRows} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <SectionCard title="MU Valuation Triangulation" description="Normalized memory-cycle model using EV/Sales, EV/EBIT, FCF yield, P/E cross-check and DCF.">
            <ValuationMethodTable valuation={dashboard.valuation} />
          </SectionCard>
          <InteractiveValuationDashboard
            ticker="MU"
            config={muValuationConfig}
            data={data}
            scenario={scenario}
            currency={module.currency}
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="risk-red-team" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="Risks that should be disproved before underwriting MU as a secular AI-memory compounder.">
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightCard icon={<Factory className="h-5 w-5" />} title="Supply / Capex Risk">
                HBM supply expansion, node transitions and tool bottlenecks can consume FCF and pull forward peak-cycle capacity.
              </InsightCard>
              <InsightCard icon={<Globe2 className="h-5 w-5" />} title="China / Export-Control Risk">
                China restrictions can affect demand, customer inventory and supply-chain access, so the model exposes a separate haircut.
              </InsightCard>
              <InsightCard icon={<Layers3 className="h-5 w-5" />} title="Mix Durability Risk">
                If HBM mix is less durable or pricing resets faster than expected, normalized margins should fall below latest-quarter evidence.
              </InsightCard>
              <SourceGapList gaps={data.sourceGaps} />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
