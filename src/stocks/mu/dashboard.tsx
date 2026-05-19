import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, Cpu, DatabaseZap, Factory, Globe2, Layers3, ShieldAlert, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

function formatDecisionValue(indicator: ReturnType<typeof buildMuDashboardData>["cycleIndicatorRows"][number]) {
  if (typeof indicator.currentValue !== "number") return indicator.currentValue;
  if (indicator.unit === "percent") return pct(indicator.currentValue);
  if (indicator.unit === "multiple") return `${indicator.currentValue.toFixed(1)}x`;
  return indicator.currentValue.toFixed(0);
}

function signalToneClass(signal: ReturnType<typeof buildMuDashboardData>["cycleIndicatorRows"][number]["portfolioSignal"]) {
  if (signal === "constructive") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (signal === "caution") return "border-amber-200 bg-amber-50 text-amber-800";
  if (signal === "avoid") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function CycleDecisionSystemPanel({ dashboard }: { dashboard: ReturnType<typeof buildMuDashboardData> }) {
  const latestSignal = dashboard.cycleSignalRows[dashboard.cycleSignalRows.length - 1];
  const constructiveCount = dashboard.cycleIndicatorRows.filter((indicator) => indicator.portfolioSignal === "constructive").length;
  const cautionCount = dashboard.cycleIndicatorRows.filter((indicator) => indicator.portfolioSignal === "caution" || indicator.portfolioSignal === "avoid").length;

  return (
    <SectionCard
      title="MU Memory Cycle Decision System"
      description="A buy-side decision framework that turns HBM durability, DRAM/NAND pricing, capex supply response and FCF conversion into an investable cycle read."
      badge={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-blue-700">Cycle framework</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Research Verdict" value="Selective / cautious" note={dashboard.cycleConclusion.verdict} />
        <ScoreBlock label="Current Phase" value="Structural tightness" note={dashboard.cycleConclusion.currentCyclePhase} />
        <ScoreBlock label="Cycle Heat" value={latestSignal ? latestSignal.cycleHeatScore.toFixed(0) : "n/a"} note={`${latestSignal?.label ?? "Latest"} composite of pricing, HBM tightness and margins`} />
        <ScoreBlock label="Signal Balance" value={`${constructiveCount} / ${cautionCount}`} note="Constructive indicators vs caution/avoid indicators" />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">How to use the model</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.cycleConclusion.modelUse}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{dashboard.cycleConclusion.conclusion}</p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Cycle Phase Scorecard">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={dashboard.cyclePhaseRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="phase" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={78} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="score" name="Phase score" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Quarterly Cycle Signals">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={dashboard.cycleSignalRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 200]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cycleHeatScore" name="Cycle heat" stroke="#0f172a" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="hbmTightnessIndex" name="HBM tightness" stroke="#2563eb" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="pricingComposite" name="DRAM/NAND pricing" stroke="#059669" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="capexSupplyRiskIndex" name="Supply risk" stroke="#f97316" strokeWidth={2.2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Margin and FCF Guardrail">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboard.cycleSignalRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
              <Tooltip formatter={(value: number) => pct(value)} />
              <Legend />
              <Bar dataKey="grossMarginPct" name="Gross margin" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fcfMarginPct" name="FCF margin" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <div className="grid gap-3 sm:grid-cols-2">
          {dashboard.cycleIndicatorRows.map((indicator) => (
            <div key={indicator.id} className={`rounded-lg border p-4 ${signalToneClass(indicator.portfolioSignal)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal opacity-75">{indicator.category}</p>
                  <p className="mt-1 text-sm font-semibold">{indicator.label}</p>
                </div>
                <span className="rounded-full border border-current px-2 py-1 text-xs font-semibold uppercase">{indicator.portfolioSignal}</span>
              </div>
              <p className="mt-3 text-2xl font-semibold">{formatDecisionValue(indicator)}</p>
              <p className="mt-2 text-xs leading-5 opacity-80">{indicator.threshold}</p>
              <p className="mt-2 text-sm leading-6">{indicator.interpretation}</p>
            </div>
          ))}
        </div>
      </div>

      <DataTable
        headers={["Phase", "Status", "Score", "Evidence", "Watch item", "Investment implication"]}
        rows={dashboard.cyclePhaseRows.map((phase) => [
          phase.phase,
          phase.status,
          phase.score,
          phase.evidence,
          phase.watchItem,
          phase.investmentImplication,
        ])}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-rose-900">Kill criteria</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-900">
            {dashboard.cycleConclusion.killCriteria.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Monitoring plan</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {dashboard.cycleConclusion.monitoringPlan.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

function HistoricalValuationPanel({ rows }: { rows: ReturnType<typeof buildMuDashboardData>["historicalValuationRows"] }) {
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
      title="MU Historical Valuation Lab"
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

function EarningsCallPanel({ rows }: { rows: ReturnType<typeof buildMuDashboardData>["earningsCallRows"] }) {
  const [selectedId, setSelectedId] = useState(rows[rows.length - 1]?.id ?? "");
  const selected = rows.find((row) => row.id === selectedId) ?? rows[rows.length - 1] ?? null;

  return (
    <SectionCard
      title="MU Earnings Call Intelligence"
      description="MSFT-style earnings-call lens: management tone, analyst questions, estimate-changing variables and model read-throughs."
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
              <Line type="monotone" dataKey="hbmDemand" name="HBM demand" stroke="#2563eb" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="dramPricing" name="DRAM pricing" stroke="#0f172a" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="capexFcf" name="Capex / FCF" stroke="#f97316" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="supplyDiscipline" name="Supply discipline" stroke="#059669" strokeWidth={2.2} dot />
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

function MemoryCycleForecastPanel({ rows }: { rows: ReturnType<typeof buildMuDashboardData>["memoryCycleForecastRows"] }) {
  return (
    <SectionCard
      title="Five-Year Memory Cycle Forecast Model"
      description="Forward model for DRAM/NAND bit growth, HBM mix, capex intensity and normalized FCF. All forward years are forecast assumptions, not official guidance."
      badge={<span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">Forecast model</span>}
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Revenue and FCF by Cycle Year">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} width={72} />
              <Tooltip formatter={(value: number) => usdm(value)} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fcf" name="FCF" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="HBM Mix, Demand and Supply Risk">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => name === "HBM mix" ? pct(value) : value.toFixed(0)} />
              <Legend />
              <Line type="monotone" dataKey="hbmRevenueMix" name="HBM mix" stroke="#2563eb" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="demandIndex" name="Demand index" stroke="#059669" strokeWidth={2.2} dot />
              <Line type="monotone" dataKey="supplyRiskIndex" name="Supply risk" stroke="#f97316" strokeWidth={2.2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <DataTable
        headers={["Year", "Cycle phase", "Revenue", "GM", "FCF margin", "Capex intensity", "HBM mix", "Commentary"]}
        rows={rows.map((row) => [
          row.year,
          row.cyclePhase,
          usdm(row.revenue),
          pct(row.grossMargin),
          pct(row.fcfMargin),
          pct(row.capexIntensity),
          pct(row.hbmRevenueMix),
          row.commentary,
        ])}
      />
    </SectionCard>
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

        <Tabs.Content value="earnings-call" className="mt-6 space-y-6">
          <EarningsCallPanel rows={dashboard.earningsCallRows} />
        </Tabs.Content>

        <Tabs.Content value="memory-cycle" className="mt-6 space-y-6">
          <CycleDecisionSystemPanel dashboard={dashboard} />
          <SectionCard title="HBM, DRAM and NAND Cycle Signals" description="Research-only scorecard until HBM mix, pricing and qualification data are parsed from official sources.">
            <SignalChart rows={dashboard.operatingRows} />
          </SectionCard>
          <MemoryCycleForecastPanel rows={dashboard.memoryCycleForecastRows} />
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
          <HistoricalValuationPanel rows={dashboard.historicalValuationRows} />
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
