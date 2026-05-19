import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, BatteryCharging, Bot, Car, Factory, ShieldAlert, TrendingUp, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

function ScoreBlock({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${cellIndex}`} className="px-3 py-2 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signalToneClass(signal: ReturnType<typeof buildTslaDashboardData>["deepDiveIndicators"][number]["portfolioSignal"]) {
  if (signal === "constructive") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (signal === "caution") return "border-amber-200 bg-amber-50 text-amber-800";
  if (signal === "avoid") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function robotaxiSignalClass(signal: ReturnType<typeof buildTslaDashboardData>["robotaxiMetrics"][number]["signal"]) {
  if (signal === "constructive") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (signal === "caution") return "border-amber-200 bg-amber-50 text-amber-800";
  if (signal === "avoid") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatRobotaxiMetric(metric: ReturnType<typeof buildTslaDashboardData>["robotaxiMetrics"][number]) {
  if (typeof metric.value !== "number") return metric.value;
  if (metric.unit === "million") return `${metric.value.toFixed(2)}m`;
  if (metric.unit === "percent") return pct(metric.value);
  if (metric.unit === "currency") return usd(metric.value);
  if (metric.unit === "count") return metric.value.toLocaleString();
  return metric.value.toFixed(0);
}

function TeslaDeepDivePanel({ dashboard }: { dashboard: ReturnType<typeof buildTslaDashboardData> }) {
  const latest = dashboard.quarterlyThesisRows[dashboard.quarterlyThesisRows.length - 1];
  const constructiveCount = dashboard.deepDiveIndicators.filter((indicator) => indicator.portfolioSignal === "constructive").length;
  const cautionCount = dashboard.deepDiveIndicators.filter((indicator) => indicator.portfolioSignal === "caution" || indicator.portfolioSignal === "avoid").length;

  return (
    <SectionCard
      title="TSLA Deep Dive Decision System"
      description="A buy-side research framework that separates Tesla into core auto, energy storage, FSD/robotaxi optionality, China risk, FCF guardrail and valuation evidence burden."
      badge={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-blue-700">Deep dive</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Verdict" value="Cautious / evidence-led" note={dashboard.deepDive.verdict} />
        <ScoreBlock label="Latest Thesis" value={latest?.label ?? "n/a"} note={latest?.conclusion ?? "No thesis row"} />
        <ScoreBlock label="Energy Evidence" value={latest?.storageGwh ? `${latest.storageGwh.toFixed(1)} GWh` : "n/a"} note="Latest storage deployment signal included in the framework" />
        <ScoreBlock label="Signal Balance" value={`${constructiveCount} / ${cautionCount}`} note="Constructive indicators vs caution/avoid indicators" />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">Research read-through</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.deepDive.currentRead}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.deepDive.variantView}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.deepDive.valuationDiscipline}</p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Driver Evidence Scorecard">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={dashboard.driverScoreRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="driver" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={88} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="score" name="Evidence score" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Quarterly Thesis Signal Trend">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={dashboard.quarterlyThesisRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="autoDemandScore" name="Auto demand" stroke="#0f172a" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="energyScaleScore" name="Energy scale" stroke="#059669" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="autonomyEvidenceScore" name="FSD evidence" stroke="#7c3aed" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="valuationRiskScore" name="Valuation risk" stroke="#f97316" strokeWidth={2.2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {dashboard.deepDiveIndicators.map((indicator) => (
          <div key={indicator.id} className={`rounded-lg border p-4 ${signalToneClass(indicator.portfolioSignal)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal opacity-75">{indicator.category}</p>
                <p className="mt-1 text-sm font-semibold">{indicator.label}</p>
              </div>
              <span className="rounded-full border border-current px-2 py-1 text-xs font-semibold uppercase">{indicator.portfolioSignal}</span>
            </div>
            <p className="mt-3 text-sm leading-6">{indicator.currentRead}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-normal opacity-75">Model action</p>
            <p className="mt-1 text-sm leading-6">{indicator.modelAction}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <ChartPanel title="FCF Guardrail and Operating Margin">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboard.quarterlyThesisRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
              <Tooltip formatter={(value: number) => pct(value)} />
              <Legend />
              <Bar dataKey="operatingMargin" name="Operating margin" fill="#0f172a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fcfMarginPct" name="FCF margin" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <DataTable
          headers={["Segment", "Bear", "Base", "Bull", "Evidence to upgrade"]}
          rows={dashboard.scenarioBridgeRows.map((row) => [
            row.segment,
            row.bear,
            row.base,
            row.bull,
            row.evidenceToUpgrade,
          ])}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-rose-900">Kill criteria</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-900">
            {dashboard.deepDive.killCriteria.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Monitoring plan</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {dashboard.deepDive.monitoringPlan.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

function RobotaxiSystemPanel({ dashboard }: { dashboard: ReturnType<typeof buildTslaDashboardData> }) {
  const constructiveCount = dashboard.robotaxiMetrics.filter((metric) => metric.signal === "constructive").length;
  const cautionCount = dashboard.robotaxiMetrics.filter((metric) => metric.signal === "caution" || metric.signal === "avoid").length;
  const baseCase = dashboard.robotaxiUnitEconomicsRows.find((row) => row.scenario === "Base");
  const evidenceComplete = dashboard.robotaxiEvidenceRows.filter((row) => row.status === "proven" || row.status === "emerging").length;

  return (
    <SectionCard
      title="Robotaxi System Analysis"
      description="A staged Robotaxi underwriting framework: FSD subscriptions, fleet scale, city rollout, safety/regulatory proof, paid-mile economics and valuation guardrails."
      badge={<span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase text-violet-700">Robotaxi option</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Verdict" value="Option value" note={dashboard.robotaxi.verdict} />
        <ScoreBlock label="Evidence Ladder" value={`${evidenceComplete}/${dashboard.robotaxiEvidenceRows.length}`} note="Proven/emerging steps versus full proof ladder" />
        <ScoreBlock label="Base Revenue Case" value={baseCase ? usdm(baseCase.impliedAnnualRevenue) : "n/a"} note="Proxy annual Robotaxi revenue, not company guidance" />
        <ScoreBlock label="Signal Balance" value={`${constructiveCount} / ${cautionCount}`} note="Constructive indicators vs caution/avoid indicators" />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">Current status</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.robotaxi.currentStatus}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.robotaxi.variantView}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.robotaxi.valuationGuardrail}</p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {dashboard.robotaxiMetrics.map((metric) => (
          <div key={metric.id} className={`rounded-lg border p-4 ${robotaxiSignalClass(metric.signal)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal opacity-75">{metric.category}</p>
                <p className="mt-1 text-sm font-semibold">{metric.label}</p>
              </div>
              <span className="rounded-full border border-current px-2 py-1 text-xs font-semibold uppercase">{metric.signal}</span>
            </div>
            <p className="mt-3 text-2xl font-semibold">{formatRobotaxiMetric(metric)}</p>
            <p className="mt-2 text-sm leading-6">{metric.interpretation}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-normal opacity-75">Model action</p>
            <p className="mt-1 text-sm leading-6">{metric.modelAction}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Robotaxi Unit Economics Scenarios">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={dashboard.robotaxiUnitEconomicsRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="scenario" />
              <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} width={72} />
              <Tooltip formatter={(value: number) => usdm(value)} />
              <Legend />
              <Bar dataKey="impliedAnnualRevenue" name="Annual revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="impliedEbitda" name="Implied EBITDA" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Revenue per Mile vs Operating Cost per Mile">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={dashboard.robotaxiUnitEconomicsRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="scenario" />
              <YAxis tickFormatter={(value) => `$${Number(value).toFixed(2)}`} />
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="revenuePerMile" name="Revenue / mile" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="operatingCostPerMile" name="Operating cost / mile" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="netRevenuePerMile" name="Net revenue / mile" fill="#0f172a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <DataTable
        headers={["Scenario", "Fleet", "Miles / Vehicle / Day", "Revenue / Mile", "Cost / Mile", "Utilization", "EBITDA Margin", "Read-through"]}
        rows={dashboard.robotaxiUnitEconomicsRows.map((row) => [
          row.scenario,
          row.fleetSize.toLocaleString(),
          row.paidMilesPerVehiclePerDay,
          `$${row.revenuePerMile.toFixed(2)}`,
          `$${row.operatingCostPerMile.toFixed(2)}`,
          pct(row.utilization),
          pct(row.ebitdaMargin),
          row.modelReadThrough,
        ])}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <DataTable
          headers={["City / Metro", "Status", "Launch Window", "Gating Factor", "Investment Read-through"]}
          rows={dashboard.robotaxiCityRows.map((row) => [
            row.metro,
            row.statusLabel,
            row.launchWindow,
            row.gatingFactor,
            row.investmentReadThrough,
          ])}
        />
        <DataTable
          headers={["Evidence Step", "Status", "Evidence", "Next Proof Point", "Valuation Impact"]}
          rows={dashboard.robotaxiEvidenceRows.map((row) => [
            row.step,
            row.status,
            row.evidence,
            row.nextProofPoint,
            row.valuationImpact,
          ])}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-rose-900">Robotaxi kill criteria</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-900">
            {dashboard.robotaxi.killCriteria.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Monitoring plan</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {dashboard.robotaxi.monitoringPlan.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

function HistoricalValuationPanel({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["historicalValuationRows"] }) {
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedId, setSelectedId] = useState(rows[rows.length - 1]?.id ?? "");
  const selected = rows.find((row) => row.id === selectedId) ?? rows[rows.length - 1] ?? null;
  const visibleRows = rows.slice(Math.max(0, rows.length - visibleCount));
  const latestGap = rows[rows.length - 1]?.gapPct ?? null;
  const averageVisibleGap = visibleRows.length
    ? visibleRows.reduce((sum, row) => sum + row.gapPct, 0) / visibleRows.length
    : null;

  return (
    <SectionCard
      title="TSLA Historical Valuation Lab"
      description="MSFT-style local research valuation history by reporting event. Grey bars are event-date prices; blue bars are event-specific fair values. Rows are not backend-persisted yet."
      badge={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-600">Local research</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={rows.length} note="Local event scenarios, oldest to newest" />
        <ScoreBlock label="Event Count" value={rows.length} note="Research snapshots awaiting SQLite persistence" />
        <ScoreBlock label="Selected Fair Value" value={selected ? usd(selected.fairValue) : "n/a"} note={selected?.fiscalPeriod ?? "No event selected"} />
        <ScoreBlock label="Selected Gap" value={selected ? pct(selected.gapPct) : "n/a"} note="Fair value vs as-of price" />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Visible history window</p>
            <p className="mt-1 text-xs text-slate-500">Chart is sorted oldest to newest. Use the controls to match the MSFT valuation window pattern.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[8, 12, 16, rows.length].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setVisibleCount(count)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
              >
                {count === rows.length ? "All" : `${count} events`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0]?.fiscalPeriod ?? "n/a"} to ${visibleRows[visibleRows.length - 1]?.fiscalPeriod ?? "n/a"}`} />
          <ScoreBlock label="Latest Gap" value={latestGap != null ? pct(latestGap) : "n/a"} note="Latest local research event" />
          <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average of visible rows" />
        </div>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelectedId(row.id)}
            className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm transition ${selected?.id === row.id ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
          >
            <span className="block text-xs font-semibold uppercase text-slate-500">{row.eventDate}</span>
            <span className="mt-1 block font-semibold">{row.fiscalPeriod}</span>
            <span className="mt-1 block text-xs text-slate-500">{row.method}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">{selected?.label ?? "Selected reporting event"}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ScoreBlock label="Event Date" value={selected?.eventDate ?? "n/a"} note={selected?.sourceStatus.replace(/_/g, " ") ?? "n/a"} />
            <ScoreBlock label="As-of Price" value={selected ? usd(selected.asOfPrice) : "n/a"} note="Nearest event-date market snapshot" />
            <ScoreBlock label="3Y Target" value={selected ? usd(selected.targetPrice3Y) : "n/a"} note="Event-specific target" />
            <ScoreBlock label="3Y CAGR" value={selected ? pct(selected.expectedShareholderCagr) : "n/a"} note="Modelled shareholder CAGR" />
          </div>
          <DataTable
            headers={["Method", "Value", "Description"]}
            rows={(selected?.methodOutputs ?? []).map((row) => [
              row.label,
              row.format === "percent" ? pct(row.value) : usd(row.value),
              row.description,
            ])}
          />
          {(selected?.warnings ?? []).map((warning) => (
            <div key={warning} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {warning}
            </div>
          ))}
        </div>

        <ChartPanel title="As-of Price vs Fair Value">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={visibleRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="fiscalPeriod" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
              <YAxis />
              <Tooltip
                formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload;
                  return `${label}${row?.eventDate ? ` | ${row.eventDate}` : ""}${typeof row?.gapPct === "number" ? ` | Gap ${pct(row.gapPct)}` : ""}`;
                }}
              />
              <Legend />
              <Bar dataKey="asOfPrice" fill="#94a3b8" name="As-of price" />
              <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </SectionCard>
  );
}

function EarningsCallPanel({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["earningsCallRows"] }) {
  const [selectedId, setSelectedId] = useState(rows[rows.length - 1]?.id ?? "");
  const selected = rows.find((row) => row.id === selectedId) ?? rows[rows.length - 1] ?? null;

  return (
    <SectionCard
      title="TSLA Earnings Call Intelligence"
      description="MSFT-style earnings-call lens: auto margin, energy storage, FSD/autonomy, China competition, capex and regulatory risk."
      badge={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-blue-700">Call analysis</span>}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelectedId(row.id)}
            className={`min-w-[160px] rounded-lg border px-3 py-2 text-left text-sm ${selected?.id === row.id ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700"}`}
          >
            <span className="block text-xs font-semibold uppercase text-slate-500">{row.callDate}</span>
            <span className="mt-1 block font-semibold">{row.quarter}</span>
            <span className="mt-1 block text-xs capitalize text-slate-500">{row.managementTone}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <ScoreBlock label="Market Focus" value={selected?.quarter ?? "n/a"} note={selected?.marketFocusSummary ?? "No call selected"} />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Reported facts</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {(selected?.reportedFacts ?? []).map((fact) => <li key={fact}>- {fact}</li>)}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Model read-through</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{selected?.modelReadThrough ?? "n/a"}</p>
          </div>
        </div>

        <ChartPanel title="Quarterly Focus Score Trend">
          <ResponsiveContainer width="100%" height={330}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="autoMargin" name="Auto margin" stroke="#0f172a" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="energyStorage" name="Energy storage" stroke="#059669" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="autonomyFsd" name="FSD / autonomy" stroke="#7c3aed" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="capexFcf" name="Capex / FCF" stroke="#f97316" strokeWidth={2.2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <DataTable
        headers={["Quarter", "Analyst focus", "Tone", "Key model action"]}
        rows={rows.map((row) => [
          row.quarter,
          row.analystFocus.join(" / "),
          row.managementTone,
          row.modelReadThrough,
        ])}
      />
    </SectionCard>
  );
}

function EnergyStorageHistoryPanel({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["energyStorageRows"] }) {
  const latestActual = [...rows].reverse().find((row) => !row.isForecast);
  const forward = rows.find((row) => row.isForecast);

  return (
    <SectionCard
      title="Energy Storage Deployments and Forward Curve"
      description="Historical annual storage deployments plus forward deployment assumptions. Forecast rows are research assumptions, not official guidance."
      badge={<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-700">Energy GWh</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Latest Actual" value={latestActual ? `${latestActual.storageGwh.toFixed(1)} GWh` : "n/a"} note={latestActual ? `FY${latestActual.year}` : "No actual row"} />
        <ScoreBlock label="Latest YoY" value={latestActual?.yoyGrowth != null ? pct(latestActual.yoyGrowth) : "n/a"} note="Deployment growth" />
        <ScoreBlock label="First Forecast" value={forward ? `${forward.storageGwh.toFixed(1)} GWh` : "n/a"} note={forward?.sourceStatus.replace(/_/g, " ") ?? "n/a"} />
        <ScoreBlock label="Forecast Caveat" value="Margins" note="Segment margin/backlog still need official extraction" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Annual Storage Deployments">
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)} GWh`} width={72} />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)} GWh`} />
              <Legend />
              <Bar dataKey="storageGwh" name="Storage deployments" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Storage Deployment YoY Growth">
          <ResponsiveContainer width="100%" height={330}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
              <Tooltip formatter={(value: number) => pct(value)} />
              <Legend />
              <Line type="monotone" dataKey="yoyGrowth" name="YoY growth" stroke="#2563eb" strokeWidth={2.2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
      <DataTable
        headers={["Year", "Deployments", "YoY", "Source", "Commentary"]}
        rows={rows.map((row) => [
          row.label,
          `${row.storageGwh.toFixed(1)} GWh`,
          row.yoyGrowth != null ? pct(row.yoyGrowth) : "n/a",
          `${row.sourceStatus.replace(/_/g, " ")}${row.isForecast ? " / forecast" : ""}`,
          row.commentary,
        ])}
      />
    </SectionCard>
  );
}

function FsdSubscriptionPanel({ rows }: { rows: ReturnType<typeof buildTslaDashboardData>["fsdProxyRows"] }) {
  const latest = rows[rows.length - 1];
  const latestActual = [...rows].reverse().find((row) => !row.isForecast);

  return (
    <SectionCard
      title="FSD Subscription Proxy and Revenue Mix"
      description="Tesla does not disclose FSD subscription revenue separately. This panel makes the proxy explicit so the software thesis can be debated and sensitized."
      badge={<span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase text-violet-700">Proxy model</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Latest Proxy" value={latestActual ? usdm(latestActual.fsdSubscriptionRevenue) : "n/a"} note={latestActual?.assumptionLabel ?? "No proxy row"} />
        <ScoreBlock label="Latest Share" value={latestActual ? pct(latestActual.fsdRevenueShare) : "n/a"} note="FSD proxy / revenue" />
        <ScoreBlock label="Forward Proxy" value={latest ? usdm(latest.fsdSubscriptionRevenue) : "n/a"} note={latest?.assumptionLabel ?? "n/a"} />
        <ScoreBlock label="Disclosure Status" value="Not disclosed" note="Treat as assumption until official segment data exists" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="FSD Subscription Revenue Proxy">
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} width={72} />
              <Tooltip formatter={(value: number) => usdm(value)} />
              <Legend />
              <Bar dataKey="fsdSubscriptionRevenue" name="FSD subscription proxy" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="FSD Proxy as Percent of Revenue">
          <ResponsiveContainer width="100%" height={330}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
              <Tooltip formatter={(value: number) => pct(value)} />
              <Legend />
              <Line type="monotone" dataKey="fsdRevenueShare" name="FSD proxy share" stroke="#7c3aed" strokeWidth={2.2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
      <DataTable
        headers={["Year", "FSD proxy", "Total revenue", "Revenue share", "Assumption", "Commentary"]}
        rows={rows.map((row) => [
          row.label,
          usdm(row.fsdSubscriptionRevenue),
          usdm(row.totalRevenue),
          pct(row.fsdRevenueShare),
          row.assumptionLabel,
          row.commentary,
        ])}
      />
    </SectionCard>
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
          <TeslaDeepDivePanel dashboard={dashboard} />
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

        <Tabs.Content value="earnings-call" className="mt-6 space-y-6">
          <EarningsCallPanel rows={dashboard.earningsCallRows} />
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
          <EnergyStorageHistoryPanel rows={dashboard.energyStorageRows} />
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
          <FsdSubscriptionPanel rows={dashboard.fsdProxyRows} />
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

        <Tabs.Content value="robotaxi-system" className="mt-6 space-y-6">
          <RobotaxiSystemPanel dashboard={dashboard} />
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
          <HistoricalValuationPanel rows={dashboard.historicalValuationRows} />
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
