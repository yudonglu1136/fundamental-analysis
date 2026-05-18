import { useEffect, useMemo, useState, type ReactNode } from "react";
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

type CegHistoricalValuationRun = {
  id: string;
  asOfDate: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y: number | null;
  expectedShareholderCagr: number | null;
  upsideDownside: number | null;
  methodOutputsJson?: Array<{ key?: string; label?: string; value?: number; format?: string; description?: string }>;
  warningsJson?: Array<{ id?: string; title?: string; detail?: string; severity?: string } | string>;
};

type CegHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  label?: string | null;
};

type CegHistoricalValuationItem = {
  event: CegHistoricalValuationEvent;
  valuationRun: CegHistoricalValuationRun | null;
};

type CegHistoricalValuationResponse = {
  historicalValuations?: CegHistoricalValuationItem[];
};

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(1)}` : "n/a";
}

function usdm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toLocaleString()}m` : "n/a";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function numberFmt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "n/a";
}

function chartTickInterval(length: number) {
  return length > 24 ? 3 : length > 16 ? 2 : length > 10 ? 1 : 0;
}

async function fetchJsonWithFallback<T>(paths: string[], init?: RequestInit): Promise<T> {
  const apiBase = import.meta.env.VITE_CEG_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const headers = new Headers(init?.headers);
      if (!headers.has("authorization") && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(apiBase)) {
        headers.set("authorization", "Bearer local-dev-token");
      }
      const response = await fetch(`${apiBase}${path}`, { ...init, headers });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
        <CegHistoricalValuationPanel />
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

function CegHistoricalValuationPanel() {
  const [rows, setRows] = useState<CegHistoricalValuationItem[]>([]);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const [windowStart, setWindowStart] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadHistoricalValuations() {
      setStatus("loading");
      setMessage(null);
      try {
        const payload = await fetchJsonWithFallback<CegHistoricalValuationResponse>([
          "/api/ceg/historical-valuations?scenario=Base&modelVersion=ceg_v1_backend_pilot",
          "/api/stocks/ceg/historical-valuations?scenario=Base&modelVersion=ceg_v1_backend_pilot",
        ]);
        const sorted = [...(payload.historicalValuations ?? [])].sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
        if (cancelled) return;
        setRows(sorted);
        setSelectedEventId((current) => current ?? [...sorted].reverse().find((row) => row.valuationRun)?.event.id ?? sorted[sorted.length - 1]?.event.id ?? null);
        setVisibleCount((current) => Math.min(Math.max(current, 8), Math.max(sorted.length, 8)));
        setWindowStart(Math.max(0, sorted.length - 16));
        setStatus("online");
      } catch (error) {
        if (cancelled) return;
        setRows([]);
        setStatus("offline");
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
    loadHistoricalValuations();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayRows = rows;
  const maxStart = Math.max(0, displayRows.length - visibleCount);
  const effectiveWindowStart = Math.min(windowStart, maxStart);
  const visibleRows = displayRows.slice(effectiveWindowStart, effectiveWindowStart + visibleCount);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0];
  const chartRows = visibleRows
    .filter((row) => row.valuationRun)
    .map((row) => ({
      label: row.event.fiscalPeriod ?? row.event.eventDate,
      eventDate: row.event.eventDate,
      fiscalPeriod: row.event.fiscalPeriod ?? "n/a",
      price: row.valuationRun?.currentPrice ?? 0,
      fairValue: row.valuationRun?.fairValue ?? 0,
      gap: row.valuationRun?.upsideDownside ?? null,
    }));
  const latestWithRun = [...displayRows].reverse().find((row) => row.valuationRun);
  const visibleGaps = visibleRows.map((row) => row.valuationRun?.upsideDownside).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageGap = visibleGaps.length ? visibleGaps.reduce((sum, value) => sum + value, 0) / visibleGaps.length : null;
  const savedRunCount = displayRows.filter((row) => row.valuationRun).length;

  function setWindow(count: number) {
    const next = Math.min(count, Math.max(displayRows.length, 1));
    setVisibleCount(next);
    setWindowStart(Math.max(0, displayRows.length - next));
  }

  return (
    <SectionCard
      title="CEG Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by Constellation reporting event. Each run uses data visible as of the event date and the nearest prior daily CEG price bar."
      badge={<span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}</span>}
    >
      {status === "offline" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Historical valuation service is temporarily unavailable. {message ? `Backend response: ${message}` : "Static CEG valuation sections still render."}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={numberFmt(savedRunCount)} note="Base valuation rows" />
        <ScoreBlock label="Quarter Events" value={numberFmt(displayRows.length)} note="Reporting events" />
        <ScoreBlock label="Selected Fair Value" value={usd(selected?.valuationRun?.fairValue)} note={selected?.event.fiscalPeriod ?? "Select an event"} />
        <ScoreBlock label="Selected Upside / Downside" value={pct(selected?.valuationRun?.upsideDownside)} note={selected?.event.eventDate ?? "n/a"} />
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Visible window</p>
          <div className="flex flex-wrap gap-2">
            {[8, 12, 16, displayRows.length].map((count) => (
              <button
                key={count}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${visibleCount === count || (count === displayRows.length && visibleCount >= displayRows.length) ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                type="button"
                onClick={() => setWindow(count)}
              >
                {count === displayRows.length ? "All" : `${count}Q`}
              </button>
            ))}
          </div>
        </div>
        <input
          className="mt-3 w-full accent-slate-900"
          type="range"
          min={0}
          max={maxStart}
          value={effectiveWindowStart}
          onChange={(event) => setWindowStart(Number(event.target.value))}
        />
      </div>
      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
        {displayRows.map((row) => {
          const selectedEvent = row.event.id === selected?.event.id;
          return (
            <button
              key={row.event.id}
              className={`min-w-36 rounded-lg border px-3 py-2 text-left text-xs ${selectedEvent ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}
              type="button"
              onClick={() => setSelectedEventId(row.event.id)}
            >
              <span className="block font-semibold">{row.event.fiscalPeriod ?? row.event.eventDate}</span>
              <span className="mt-1 block">{row.valuationRun ? `${usd(row.valuationRun.fairValue)} FV` : "No saved run"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <ChartPanel title="Oldest to Newest Event Valuations">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" interval={chartTickInterval(chartRows.length)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value: number) => `$${value.toFixed(0)}`} />
              <Tooltip
                formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload as { eventDate?: string; fiscalPeriod?: string; price?: number; fairValue?: number; gap?: number | null } | undefined;
                  return row ? `${row.eventDate} / ${row.fiscalPeriod} / price ${usd(row.price)} / fair value ${usd(row.fairValue)} / gap ${pct(row.gap)}` : String(label);
                }}
              />
              <Legend />
              <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
              <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <div className="space-y-4">
          <ScoreBlock label="Visible Window" value={`${visibleRows.length}Q`} note={`${visibleRows[0]?.event.fiscalPeriod ?? "n/a"} to ${visibleRows[visibleRows.length - 1]?.event.fiscalPeriod ?? "n/a"}`} />
          <ScoreBlock label="Latest Gap" value={pct(latestWithRun?.valuationRun?.upsideDownside)} note={latestWithRun?.event.fiscalPeriod ?? "n/a"} />
          <ScoreBlock label="Average Gap" value={pct(averageGap)} note="Visible saved runs" />
          <DataTable
            headers={["Method", "Value", "Description"]}
            rows={(selected?.valuationRun?.methodOutputsJson ?? []).map((method) => [
              method.label ?? method.key ?? "Method",
              typeof method.value === "number" ? usd(method.value) : "n/a",
              method.description ?? "",
            ])}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function ScoreBlock({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-700">{cell}</td>)}</tr>
          )) : (
            <tr>
              <td className="px-3 py-3 text-slate-500" colSpan={headers.length}>No rows available.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
