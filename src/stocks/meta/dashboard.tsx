import { useCallback, useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, CheckCircle2, Database, Gauge, ShieldAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { formatValue } from "../../utils/formatting";
import type { Scenario, StockDashboardProps, ValidationWarning } from "../types";
import {
  defaultMetaValuationAssumptions,
  getMetaScenarioDefaults,
  matchMetaScenario,
  type MetaAssumptions,
} from "./assumptions";
import { buildMetaDashboardData } from "./calculations";
import { MetaAssumptionsPanel } from "./components/MetaAssumptionsPanel";
import { MetaSignalBadge } from "./components/MetaSignalBadge";

type MetaHistoricalValuationRun = {
  id: string;
  asOfDate: string;
  reportingEventId: string;
  scenario: string;
  modelVersion: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y: number | null;
  expectedShareholderCagr: number | null;
  upsideDownside: number | null;
  methodOutputsJson?: Array<{ key?: string; label?: string; value?: number; format?: string; description?: string }>;
  sensitivityTablesJson?: unknown[];
  warningsJson?: Array<string | { id?: string; title?: string; detail?: string; severity?: string }>;
  dataSnapshotJson?: Record<string, unknown>;
};

type MetaHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod?: string;
  fiscalQuarter?: string;
  fiscalYear?: number;
  eventType: string;
  label?: string;
  periodLabel?: string;
  title?: string;
};

type MetaHistoricalValuationItem = {
  event: MetaHistoricalValuationEvent;
  valuationRun: MetaHistoricalValuationRun | null;
};

type MetaHistoricalValuationResponse = {
  historicalValuations?: MetaHistoricalValuationItem[];
};

type MetaBacktestResult = {
  status?: string;
  warnings?: string[];
  curve?: Array<{ date: string; spy: number; benchmark?: number; metaBuyHold: number }>;
  metrics?: {
    metaBuyHold?: { cagr?: number; maxDrawdown?: number; sharpe?: number; volatility?: number };
    stock?: { cagr?: number; maxDrawdown?: number; sharpe?: number; volatility?: number };
    spy?: { cagr?: number; maxDrawdown?: number; sharpe?: number; volatility?: number };
    benchmark?: { cagr?: number; maxDrawdown?: number; sharpe?: number; volatility?: number };
  };
};

function loadSavedMetaValuationAssumptions() {
  if (typeof window === "undefined") return defaultMetaValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-META");
  if (!saved) return defaultMetaValuationAssumptions;
  try {
    return { ...defaultMetaValuationAssumptions, ...(JSON.parse(saved) as Partial<MetaAssumptions>) };
  } catch {
    return defaultMetaValuationAssumptions;
  }
}

function usd(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "n/a" : `$${value.toFixed(value >= 100 ? 0 : 1)}`;
}

function pct(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function calendarQuarterCoveredLabel(event: MetaHistoricalValuationEvent, compact = false) {
  if (event.fiscalPeriod) return compact ? event.fiscalPeriod.replace(" FY", " ") : event.fiscalPeriod;
  if (event.fiscalQuarter && event.fiscalYear) return compact ? `${event.fiscalQuarter} ${event.fiscalYear}` : `${event.fiscalQuarter} FY${event.fiscalYear}`;
  return event.periodLabel ?? event.eventDate;
}

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
}

function DriverCards({
  items,
}: {
  items: Array<{ label: string; value: number; format: "currency" | "percent" | "number" | "multiple"; detail: string; badge: "Actual" | "Assumption" | "Derived" | "Placeholder" | "Needs Review" }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <DataQualityBadge badge={item.badge} />
          </div>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatValue(item.value, item.format, "USD")}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function WarningRows({ warnings }: { warnings: ValidationWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
        <CheckCircle2 className="h-5 w-5" />
        <p className="text-sm font-medium">No validation warnings are active.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {warnings.map((warning) => (
        <div key={warning.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">{warning.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{warning.detail}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${warning.severity === "high" ? "bg-rose-50 text-rose-700" : warning.severity === "medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
              {warning.severity}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="text-slate-700">
              {row.map((value, cellIndex) => (
                <td key={`${value}-${cellIndex}`} className="px-4 py-3">
                  {typeof value === "number" ? value.toFixed(Math.abs(value) < 2 ? 2 : 1) : value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BackendScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function MetaHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: MetaHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows;
  const [visibleCount, setVisibleCount] = useState(16);
  const normalizedVisibleCount = Math.min(Math.max(visibleCount, 1), Math.max(displayRows.length, 1));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - normalizedVisibleCount)),
    [displayRows, normalizedVisibleCount],
  );
  const selected =
    displayRows.find((row) => row.event.id === selectedEventId)
    ?? [...displayRows].reverse().find((row) => row.valuationRun)
    ?? displayRows[0]
    ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => {
      const price = row.valuationRun?.currentPrice ?? null;
      const fairValue = row.valuationRun?.fairValue ?? null;
      return {
        period: calendarQuarterCoveredLabel(row.event, true),
        eventDate: row.event.eventDate,
        fiscalPeriod: row.event.periodLabel ?? row.event.fiscalPeriod ?? row.event.fiscalQuarter ?? row.event.eventDate,
        price,
        fairValue,
        gapPct: price && fairValue ? fairValue / price - 1 : null,
      };
    });
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];
  const windowOptions = [
    { label: "8Q", value: 8 },
    { label: "12Q", value: 12 },
    { label: "16Q", value: 16 },
    { label: "24Q", value: 24 },
    { label: "All", value: Math.max(displayRows.length, 1) },
  ];

  return (
    <SectionCard
      title="META Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by quarterly reporting event from the META SQLite backend. The static META cockpit remains available if the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <BackendScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <BackendScoreBlock label="Quarter Events" value={displayRows.length || "n/a"} note="Eight-year quarterly coverage" />
        <BackendScoreBlock label="Selected Fair Value" value={usd(selected?.valuationRun?.fairValue)} note="Backend persisted value" />
        <BackendScoreBlock label="Selected Upside" value={selected?.valuationRun?.currentPrice && selected?.valuationRun?.fairValue ? pct(selected.valuationRun.fairValue / selected.valuationRun.currentPrice - 1) : "n/a"} note="Fair value versus event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static META dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the selector to focus the chart while the event row remains scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {windowOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setVisibleCount(option.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${normalizedVisibleCount === Math.min(option.value, Math.max(displayRows.length, 1)) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={Math.min(normalizedVisibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <BackendScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? calendarQuarterCoveredLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? calendarQuarterCoveredLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <BackendScoreBlock label="Latest Gap" value={pct(latestVisibleGap)} note="Fair value less price, as a percent of price" />
              <BackendScoreBlock label="Average Gap" value={pct(averageVisibleGap)} note="Average model discount or premium in visible window" />
            </div>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {displayRows.map((row) => {
              const active = row.event.id === selected?.event.id;
              return (
                <button
                  key={row.event.id}
                  type="button"
                  onClick={() => onSelectEvent(row.event.id)}
                  className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{calendarQuarterCoveredLabel(row.event)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event.periodLabel ?? row.event.fiscalPeriod ?? row.event.fiscalQuarter ?? row.event.eventType}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.label ?? selected.event.title ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BackendScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <BackendScoreBlock label="As-of Price" value={usd(selected.valuationRun?.currentPrice)} note="Market snapshot input" />
                  <BackendScoreBlock label="3Y Target" value={usd(selected.valuationRun?.targetPrice3Y)} note="Persisted target price" />
                  <BackendScoreBlock label="3Y CAGR" value={pct(selected.valuationRun?.expectedShareholderCagr)} note="Backend shareholder CAGR" />
                </div>
                <div className="mt-5">
                  <DataTable
                    columns={["Method", "Value", "Description"]}
                    rows={methodRows.map((row) => [
                      row.label ?? row.key ?? "Method",
                      typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : usd(row.value)) : "n/a",
                      row.description ?? "",
                    ])}
                  />
                </div>
                {warnings.length ? (
                  <div className="mt-4 space-y-2">
                    {warnings.map((warning, index) => {
                      const normalized = typeof warning === "string" ? { title: warning, detail: "", severity: "warning" } : warning;
                      return (
                        <div key={`${normalized.title ?? "warning"}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <p className="font-semibold">{normalized.title ?? "Backend warning"}</p>
                          {normalized.detail ? <p className="mt-1 leading-6">{normalized.detail}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="mb-3 font-semibold text-ink">As-of Price vs Fair Value</p>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                      labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload;
                        return `${point?.eventDate ?? ""} ${label}${point?.fiscalPeriod ? ` (${point.fiscalPeriod})` : ""}${typeof point?.gapPct === "number" ? ` | Gap ${pct(point.gapPct)}` : ""}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                    <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading META historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}

function MetaBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MetaBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    const base = apiBaseUrl();
    const paths = [`${base}/api/meta/backtests`, `${base}/api/stocks/meta/backtests`];
    let lastError: unknown = null;
    for (const path of paths) {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
        });
        if (!response.ok) throw new Error(`META backend returned ${response.status}`);
        const payload = (await response.json()) as MetaBacktestResult;
        setResult(payload);
        setStatus(payload.status === "insufficient_data" ? "error" : "done");
        setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : null);
        return;
      } catch (caught) {
        lastError = caught;
      }
    }
    setStatus("error");
    setError(lastError instanceof Error ? lastError.message : String(lastError));
  }, [endDate, startDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({
      ...row,
      spyReturn: (row.spy - 1) * 100,
      metaReturn: (row.metaBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};
  const metaMetrics = metrics.metaBuyHold ?? metrics.stock;

  return (
    <SectionCard
      title="META vs SPY Backtest"
      description="Select a date range and compare daily META buy-and-hold performance against SPY from the backend price history."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-blue-50 text-blue-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "Needs data" : "Ready"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-ink">
          Start date
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-ink">
          End date
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={runBacktest}
          disabled={status === "running"}
          className="self-end rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {status === "running" ? "Running..." : "Run backtest"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {error}
        </div>
      ) : null}

      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 font-semibold text-ink">META vs SPY Total Return</p>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="metaReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="META" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <BackendScoreBlock label="META CAGR" value={pct(metaMetrics?.cagr)} note="Buy-and-hold" />
              <BackendScoreBlock label="SPY CAGR" value={pct(metrics.spy?.cagr)} note="Benchmark" />
              <BackendScoreBlock label="META MDD" value={pct(metaMetrics?.maxDrawdown)} note="Maximum drawdown" />
              <BackendScoreBlock label="SPY MDD" value={pct(metrics.spy?.maxDrawdown)} note="Maximum drawdown" />
              <BackendScoreBlock label="META Sharpe" value={metaMetrics?.sharpe != null ? metaMetrics.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <BackendScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <BackendScoreBlock label="META Vol" value={pct(metaMetrics?.volatility)} note="Annualized daily vol" />
              <BackendScoreBlock label="SPY Vol" value={pct(metrics.spy?.volatility)} note="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => (
            <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

export function MetaDashboard({ module, scenario, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const [valuationAssumptions, setValuationAssumptions] = useState<MetaAssumptions>(loadSavedMetaValuationAssumptions);
  const [selectedEarningsCallId, setSelectedEarningsCallId] = useState<string | undefined>(undefined);
  const [historicalValuations, setHistoricalValuations] = useState<MetaHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);
  const selectedPeriod = period || module.getDefaultPeriod();
  const dashboard = useMemo(
    () => buildMetaDashboardData(module.data, selectedPeriod, scenario, valuationAssumptions),
    [module.data, selectedPeriod, scenario, valuationAssumptions],
  );
  const activeScenario = matchMetaScenario(valuationAssumptions);
  const selectedEarningsCall =
    dashboard.earningsCalls.quarters.find((quarter) => quarter.id === selectedEarningsCallId)
    ?? dashboard.earningsCalls.latestQuarter;

  useEffect(() => {
    let cancelled = false;
    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      const base = apiBaseUrl();
      const paths = [
        `${base}/api/meta/historical-valuations?scenario=Base&modelVersion=meta_v1_backend_pilot`,
        `${base}/api/stocks/meta/historical-valuations?scenario=Base&modelVersion=meta_v1_backend_pilot`,
      ];
      let lastError: unknown = null;
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`META backend returned ${response.status}`);
          const payload = (await response.json()) as MetaHistoricalValuationResponse;
          const rows = [...(payload.historicalValuations ?? [])].sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
          if (cancelled) return;
          setHistoricalValuations(rows);
          setSelectedHistoricalEventId((current) => current ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[rows.length - 1]?.event.id ?? null);
          setHistoricalStatus("online");
          return;
        } catch (error) {
          lastError = error;
        }
      }
      if (cancelled) return;
      setHistoricalValuations([]);
      setHistoricalStatus("offline");
      setHistoricalError(lastError instanceof Error ? lastError.message : String(lastError));
    }
    loadHistoricalValuations();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions((current) => ({ ...current, ...(next as Partial<MetaAssumptions>) }));
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  const forecastSeries = dashboard.forecast.map((row) => ({
    year: row.year,
    revenue: row.revenue,
    fcf: row.unleveredFreeCashFlow,
    capexIntensity: row.capexIntensity * 100,
    aiRoic: row.aiRoic * 100,
    margin: row.operatingMargin * 100,
  }));

  const scenarioBars = dashboard.valuation.fairValues.map((row) => ({
    scenario: row.scenario,
    fairValue: row.fairValue,
    upside: row.upsideDownside * 100,
    expectedReturn: row.expectedReturn3Y * 100,
  }));

  const valuationCards = [
    { label: "DCF", value: dashboard.valuation.dcfValue ?? 0, format: "currency" as const, detail: "FCFF after total capex and Reality Labs losses.", badge: "Derived" as const },
    { label: "FCF Yield", value: dashboard.valuation.fcfFairValue ?? 0, format: "currency" as const, detail: "Normalized FCF/share capitalized by target yield.", badge: "Derived" as const },
    { label: "P/E", value: dashboard.valuation.peFairValue ?? 0, format: "currency" as const, detail: "Normalized EPS after share-count effects.", badge: "Derived" as const },
    { label: "SOTP", value: dashboard.valuation.sotpFairValue ?? 0, format: "currency" as const, detail: "FoA EBIT value plus RL option value and net cash.", badge: "Derived" as const },
  ];
  const marketImpliedCards = [
    { label: "Current FCF Yield", value: dashboard.marketImplied.currentFcfYieldOnYearThree, format: "percent" as const, detail: "Current market cap against year-three forecast FCFF.", badge: "Derived" as const },
    { label: "Current Forward P/E", value: dashboard.marketImplied.currentForwardPe, format: "multiple" as const, detail: "Current price divided by forward EPS.", badge: "Derived" as const },
    { label: "Implied Revenue CAGR", value: dashboard.marketImplied.impliedRevenueCagr2027To2030 ?? 0, format: "percent" as const, detail: "2027-30 revenue CAGR needed for blended fair value to equal price.", badge: "Derived" as const },
    { label: "Implied AI ROIC Spread", value: dashboard.marketImplied.impliedAiRoicSpread, format: "percent" as const, detail: "Market-implied AI ROIC less selected WACC.", badge: "Derived" as const },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="META Research Cockpit" description={module.description} badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Actual" : "Needs Review"} />}>
        <div className="grid gap-4 lg:grid-cols-4">
          {dashboard.executiveReadThrough.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{item.title}</p>
                <MetaSignalBadge signal={item.signal} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((item) => (
          <MetricCard key={item.key} metric={item} currency="USD" />
        ))}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-lg border border-white/80 bg-white/80 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger key={item.value} value={item.value} className="rounded-md px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="executive" className="mt-6 space-y-6">
          <SectionCard title="Official Actuals">
            <DataTable
              columns={["Period", "Revenue", "Operating Income", "FCF", "CapEx", "Diluted EPS", "Shares"]}
              rows={dashboard.dataset.periods.map((row) => [
                row.label,
                row.revenue,
                row.operatingIncome,
                row.freeCashFlow,
                row.capitalExpendituresInclFinanceLeases,
                row.normalizedDilutedEps,
                row.dilutedShares,
              ])}
            />
          </SectionCard>
          <SectionCard title="Forecast Path">
            {dashboard.forecast[0]?.revenueBridge && (
              <div className="mb-5">
                <DataTable
                  columns={["2026 Revenue Bridge", "USD bn"]}
                  rows={[
                    ["Q1 actual", dashboard.forecast[0].revenueBridge.q1Actual],
                    ["Q2 guide midpoint", dashboard.forecast[0].revenueBridge.q2GuidanceMidpoint],
                    ["H2 implied", dashboard.forecast[0].revenueBridge.h2Implied],
                    ["H2 quarterly average", dashboard.forecast[0].revenueBridge.h2ImpliedQuarterlyAverage],
                    ["H2 avg vs Q2 midpoint", `${(dashboard.forecast[0].revenueBridge.h2SequentialStepUpVsQ2 * 100).toFixed(1)}%`],
                  ]}
                />
              </div>
            )}
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} />
                  <Line type="monotone" dataKey="fcf" stroke="#059669" strokeWidth={3} />
                  <Line type="monotone" dataKey="margin" stroke="#7c3aed" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ad-economics" className="mt-6 space-y-6">
          <SectionCard title="Ad Revenue Bridge">
            <DriverCards
              items={[
                { label: "Q1 Impressions Growth", value: dashboard.adEconomics.latestActual.adImpressionsGrowth, format: "percent", detail: "Official Q1 2026 ad impression growth.", badge: "Actual" },
                { label: "Q1 Price / Ad Growth", value: dashboard.adEconomics.latestActual.averagePricePerAdGrowth, format: "percent", detail: "Official Q1 2026 average price per ad growth.", badge: "Actual" },
                { label: "Forecast Ad Bridge", value: ((1 + dashboard.assumptions.adImpressionCagr) * (1 + dashboard.assumptions.pricePerAdCagr)) - 1, format: "percent", detail: "Model ad growth from impressions x price.", badge: "Assumption" },
                { label: "Bridge Gap", value: dashboard.adEconomics.reconciliationGap, format: "percent", detail: "Difference between official ad growth and impression x price bridge.", badge: "Derived" },
              ]}
            />
            <div className="mt-5">
              <DataTable
                columns={["Bridge Item", "USD bn"]}
                rows={dashboard.adEconomics.revenueBridge.map((row) => [row.label, row.value])}
              />
            </div>
            <div className="mt-5">
              <DataTable
                columns={["Year", "Base Ads", "Impressions", "Price", "AI", "Regulatory", "Residual", "Forecast Ads"]}
                rows={dashboard.forecast.map((row) => [
                  row.year,
                  row.adDriverAttribution?.baseAdvertisingRevenue ?? 0,
                  row.adDriverAttribution?.impressionContribution ?? 0,
                  row.adDriverAttribution?.priceContribution ?? 0,
                  row.adDriverAttribution?.aiMonetizationContribution ?? 0,
                  row.adDriverAttribution?.regulatoryHaircut ?? 0,
                  row.adDriverAttribution?.mixFxResidual ?? 0,
                  row.adDriverAttribution?.forecastAdvertisingRevenue ?? 0,
                ])}
              />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ai-infra" className="mt-6 space-y-6">
          <SectionCard title="AI Infrastructure And Payback">
            <DriverCards
              items={[
                { label: "2026 CapEx Midpoint", value: dashboard.aiCapex.capexGuidanceMidpoint, format: "currency", detail: "Midpoint of official FY2026 capex guidance.", badge: "Assumption" },
                { label: "CapEx Step-Up", value: dashboard.aiCapex.capexStepUpVs2025, format: "currency", detail: "Increase versus FY2025 capex.", badge: "Derived" },
                { label: "Year-5 AI ROIC", value: dashboard.aiCapex.yearFiveAiRoic, format: "percent", detail: "AI incremental after-tax profit divided by cumulative AI growth capex.", badge: "Derived" },
                { label: "AI ROIC Spread", value: dashboard.aiCapex.yearFiveAiRoicSpread, format: "percent", detail: "Year-five AI ROIC less selected WACC.", badge: "Derived" },
              ]}
            />
            <div className="mt-5">
              <DataTable
                columns={["Year", "CapEx", "CapEx / Revenue", "AI Growth CapEx", "AI ROIC", "Payback"]}
                rows={dashboard.aiCapex.capexToRevenueBridge.map((row) => [
                  row.year,
                  row.capex,
                  `${(row.capexIntensity * 100).toFixed(1)}%`,
                  row.aiGrowthCapex,
                  `${(row.aiRoic * 100).toFixed(1)}%`,
                  row.paybackYears,
                ])}
              />
            </div>
            <div className="mt-5 h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="capexIntensity" stroke="#dc2626" strokeWidth={3} />
                  <Line type="monotone" dataKey="aiRoic" stroke="#059669" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="product-cycle" className="mt-6 space-y-6">
          <SectionCard title="Product And Monetization Signals">
            <DataTable
              columns={["Product", "Metric", "Value", "Driver", "Treatment", "Confidence"]}
              rows={dashboard.productSignals.map((row) => [
                row.product,
                row.metric,
                row.value ?? "n/a",
                row.valuationMapping,
                row.lineage.valuationTreatment,
                row.lineage.confidence,
              ])}
            />
          </SectionCard>
          <SectionCard title="Signal Driver Map">
            <DataTable
              columns={["Signal", "Product", "Valuation Driver", "Treatment", "Confidence"]}
              rows={dashboard.adEconomics.productDriverMap.map((row) => [
                row.signal,
                row.product,
                row.valuationDriver,
                row.treatment,
                row.confidence,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="earnings-calls" className="mt-6 space-y-6">
          <SectionCard title="Eight-Quarter Earnings Call Overview">
            <DriverCards
              items={[
                { label: "Calls Covered", value: dashboard.earningsCalls.quarters.length, format: "number", detail: "Structured transcript intelligence across the latest eight quarters.", badge: "Derived" },
                { label: "AI Monetization Trend", value: dashboard.earningsCalls.focusTrendRows.find((row) => row.theme === "AI monetization")?.change ?? 0, format: "number", detail: "Change in focus intensity from first four calls to latest four calls.", badge: "Derived" },
                { label: "CapEx Concern Trend", value: dashboard.earningsCalls.focusTrendRows.find((row) => row.theme === "AI capex concern")?.change ?? 0, format: "number", detail: "Rising intensity means investors are pressing harder on AI infrastructure payback.", badge: "Derived" },
                { label: "Latest Quarter", value: Number(selectedEarningsCall?.fiscalYear ?? 0), format: "number", detail: selectedEarningsCall?.headline ?? "Select a call.", badge: "Derived" },
              ]}
            />
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-ink">AI synthesis</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{dashboard.earningsCalls.aiOverview}</p>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {dashboard.earningsCalls.trendSummary.map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Quarter Selector">
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-2">
                {dashboard.earningsCalls.quarterOptions.map((option) => {
                  const isSelected = option.value === selectedEarningsCall?.id;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedEarningsCallId(option.value)}
                      className={`rounded-md border px-4 py-2 text-sm font-medium transition ${isSelected ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedEarningsCall && (
              <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">{selectedEarningsCall.label} earnings call</p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">{selectedEarningsCall.headline}</h3>
                    </div>
                    <DataQualityBadge badge={selectedEarningsCall.sourceCoverage === "official_transcript_cached" ? "Actual" : "Needs Review"} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">{selectedEarningsCall.aiSynthesis}</p>
                  <div className="mt-4">
                    <DataTable
                      columns={["Field", "Detail"]}
                      rows={[
                        ["Call date", selectedEarningsCall.callDate],
                        ["Management tone", selectedEarningsCall.managementTone],
                        ["Source coverage", selectedEarningsCall.sourceCoverage],
                        ["Lineage", `${selectedEarningsCall.lineage.sourceType} / ${selectedEarningsCall.lineage.confidence}`],
                        ["Model implication", selectedEarningsCall.modelImplications[0] ?? "n/a"],
                      ]}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <DataTable
                    columns={["Market Focus", "Topic"]}
                    rows={selectedEarningsCall.marketFocus.map((item, index) => [`#${index + 1}`, item])}
                  />
                  <DataTable
                    columns={["Analyst Question Theme", "Topic"]}
                    rows={selectedEarningsCall.analystQuestionThemes.map((item, index) => [`#${index + 1}`, item])}
                  />
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Market Focus Trend">
            <DataTable
              columns={["Theme", "First 4 Calls", "Latest 4 Calls", "Change", "Direction", "Interpretation"]}
              rows={dashboard.earningsCalls.focusTrendRows.map((row) => [
                row.theme,
                row.firstHalfAverage,
                row.secondHalfAverage,
                row.change,
                row.direction,
                row.interpretation,
              ])}
            />
          </SectionCard>

          <SectionCard title="Focus Timeline">
            <DataTable
              columns={["Quarter", "Primary Focus", "Secondary Focus", "Tone"]}
              rows={dashboard.earningsCalls.marketFocusTimeline.map((row) => [
                row.quarter,
                row.primaryFocus,
                row.secondaryFocus,
                row.tone,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="market-implied" className="mt-6 space-y-6">
          <SectionCard title="Market-Implied Expectations">
            <DriverCards items={marketImpliedCards} />
            <div className="mt-5">
              <DataTable
                columns={["Question", "Implied Answer"]}
                rows={[
                  ["Market verdict", dashboard.marketImplied.verdict],
                  ["Implied terminal growth", dashboard.marketImplied.impliedTerminalGrowth == null ? "n/a" : `${(dashboard.marketImplied.impliedTerminalGrowth * 100).toFixed(1)}%`],
                  ["Implied FoA margin", dashboard.marketImplied.impliedFoaOperatingMargin == null ? "n/a" : `${(dashboard.marketImplied.impliedFoaOperatingMargin * 100).toFixed(1)}%`],
                  ["Forward EV / EBIT", `${dashboard.marketImplied.currentForwardEvEbit.toFixed(1)}x`],
                  ["Current EV", dashboard.marketImplied.currentEnterpriseValue],
                ]}
              />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="reality-labs" className="mt-6 space-y-6">
          <SectionCard title="Reality Labs Drag And Option Value">
            <DriverCards
              items={[
                { label: "Annual Loss", value: dashboard.assumptions.realityLabsAnnualLoss, format: "currency", detail: "Selected annual loss assumption.", badge: "Assumption" },
                { label: "Revenue Growth", value: dashboard.assumptions.realityLabsRevenueGrowth, format: "percent", detail: "Selected Reality Labs revenue growth assumption.", badge: "Assumption" },
                { label: "Option Value", value: dashboard.assumptions.realityLabsOptionValue, format: "currency", detail: "SOTP-only call option value.", badge: "Assumption" },
                { label: "Q1 Revenue", value: dashboard.dataset.realityLabs.find((row) => row.periodId === "q1_2026")?.revenue ?? 0, format: "currency", detail: "Official Q1 2026 Reality Labs revenue.", badge: "Actual" },
              ]}
            />
            <div className="mt-5">
              <DataTable
                columns={["Year", "RL Revenue", "RL Operating Income", "SOTP Treatment"]}
                rows={dashboard.forecast.map((row) => [
                  row.year,
                  row.realityLabsRevenue,
                  row.realityLabsOperatingIncome,
                  "loss in consolidated valuation; option only in SOTP",
                ])}
              />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <MetaHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <MetaBacktestPanel />
          <SectionCard title="Valuation Triangulation">
            <DriverCards items={valuationCards} />
            <div className="mt-5">
              <DataTable
                columns={["Blend Component", "USD/share", "Note"]}
                rows={dashboard.valuationAttribution.bridge.map((row) => [
                  row.label,
                  row.value,
                  row.note,
                ])}
              />
            </div>
            <div className="mt-5 h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="scenario" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="fairValue" radius={[6, 6, 0, 0]}>
                    {scenarioBars.map((entry) => (
                      <Cell key={entry.scenario} fill={entry.scenario === "Bear" ? "#dc2626" : entry.scenario === "Base" ? "#2563eb" : "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={module.data}
            scenario={scenario}
            currency="USD"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
          <MetaAssumptionsPanel
            values={valuationAssumptions}
            activeScenario={activeScenario}
            categories={["Ad Economics", "CapEx / ROIC", "Reality Labs", "Blend"]}
            title="META Underwriting Assumptions"
            description="Scenario driver controls for the META cockpit."
            onChange={(key, value) => handleValuationValuesChange({ ...valuationAssumptions, [key]: value })}
            onReset={(target) => {
              if (target === "Consensus") {
                handleValuationValuesChange(defaultMetaValuationAssumptions);
                return;
              }
              handleValuationValuesChange(getMetaScenarioDefaults(target as Scenario));
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="risk-red-team" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" badge={<ShieldAlert className="h-5 w-5 text-rose-500" />}>
            <DriverCards
              items={[
                { label: "Risk Score", value: dashboard.risks.riskScore, format: "number", detail: dashboard.risks.redTeamVerdict, badge: "Derived" },
                { label: "Top Risk Weight", value: dashboard.risks.rows[0]?.weightedScore ?? 0, format: "number", detail: dashboard.risks.rows[0]?.name ?? "No risk rows.", badge: "Derived" },
                { label: "Risk Haircut", value: dashboard.risks.valuationHaircutPct, format: "percent", detail: "Probability-weighted red-team valuation haircut diagnostic.", badge: "Derived" },
                { label: "Solved Breakpoints", value: dashboard.thesisBreakpoints.filter((row) => row.breakValue != null).length, format: "number", detail: "Drivers that can be solved to current price.", badge: "Derived" },
              ]}
            />
            <div className="mt-5">
              <DataTable
                columns={["Risk", "Severity", "Linked Assumption", "Haircut", "Trigger"]}
                rows={dashboard.risks.rows.map((row) => [
                  row.name,
                  row.severityLabel,
                  row.linkedAssumption ?? "n/a",
                  `${(row.valuationHaircutPct * 100).toFixed(1)}%`,
                  row.monitoringTrigger,
                ])}
              />
            </div>
          </SectionCard>
          <SectionCard title="Thesis Breakpoints">
            <DataTable
              columns={["Driver", "Break Direction", "Base", "Break Value", "Severity", "Question"]}
              rows={dashboard.thesisBreakpoints.map((row) => [
                row.driver,
                row.direction,
                row.units === "percent" ? `${(row.baseValue * 100).toFixed(1)}%` : row.baseValue,
                row.breakValue == null ? "not solved" : row.units === "percent" ? `${(row.breakValue * 100).toFixed(1)}%` : row.breakValue,
                row.severity,
                row.thesisQuestion,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="validation" className="mt-6 space-y-6">
          <SectionCard title="Model Validation" badge={<AlertTriangle className="h-5 w-5 text-amber-500" />}>
            <DriverCards
              items={[
                { label: "Integrity Score", value: dashboard.integrity.overallIntegrityScore, format: "number", detail: "Weighted score for lineage, assumptions, isolation, and market-implied diagnostics.", badge: "Derived" },
                { label: "Lineage Score", value: dashboard.integrity.dataLineageScore, format: "number", detail: "Row-level DataLineage coverage.", badge: "Derived" },
                { label: "Assumption Score", value: dashboard.integrity.assumptionQualityScore, format: "number", detail: "Valuation assumptions with metadata coverage.", badge: "Derived" },
                { label: "Isolation Score", value: dashboard.integrity.valuationIsolationScore, format: "number", detail: "AI/product/RL double-count protection.", badge: "Derived" },
              ]}
            />
            <div className="mt-5">
              <WarningRows warnings={dashboard.validationWarnings} />
            </div>
          </SectionCard>
          <SectionCard title="Lineage Audit" badge={<Database className="h-5 w-5 text-blue-500" />}>
            <DataTable
              columns={["Area", "Coverage", "Manual Seeds", "Low Confidence", "Notes"]}
              rows={dashboard.integrity.lineageAudit.map((row) => [
                row.area,
                `${(row.coverage * 100).toFixed(0)}%`,
                row.manualSeedCount,
                row.lowConfidenceCount,
                row.notes,
              ])}
            />
          </SectionCard>
          <SectionCard title="Source Layering" badge={<Database className="h-5 w-5 text-blue-500" />}>
            <DataTable
              columns={["Source Layer", "Count"]}
              rows={Object.entries(dashboard.sourceStatusCounts).map(([status, count]) => [status, count])}
            />
          </SectionCard>
          <SectionCard title="Validation Checklist" badge={<Gauge className="h-5 w-5 text-slate-500" />}>
            <DataTable
              columns={["Check", "Status"]}
              rows={[
                ["FoA + Reality Labs revenue reconcile to group revenue", "active"],
                ["FoA + Reality Labs operating income reconcile to group operating income", "active"],
                ["FCF equals CFO less capex including finance leases", "active"],
                ["Ad growth bridge ties to impressions x price", "active"],
                ["AI uplift not added as a second fair-value layer", "active"],
                ["Product-cycle signals mapped to named drivers before valuation", "active"],
                ["Market-implied expectations reverse-engineered from current price", "active"],
                ["Thesis breakpoints solve downside driver thresholds", "active"],
                ["DataLineage and assumption metadata coverage audited", "active"],
                ["SBC/buyback affects share count, not a separate fair-value add", "active"],
                ["Reality Labs option value isolated to SOTP", "active"],
              ]}
            />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
