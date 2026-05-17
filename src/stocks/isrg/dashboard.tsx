import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockDashboardProps } from "../types";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { attachIsrgRuntimeContext, buildIsrgDashboardData, resolveIsrgDataset } from "./calculations";
import { CompetitionRiskPanel } from "./components/CompetitionRiskPanel";
import { DaVinci5ProductCycle } from "./components/DaVinci5ProductCycle";
import { DataBoundaryPanel } from "./components/DataBoundaryPanel";
import { ExecutiveSummary } from "./components/ExecutiveSummary";
import { HospitalCapexRoiPanel } from "./components/HospitalCapexRoiPanel";
import { InstalledBaseDashboard } from "./components/InstalledBaseDashboard";
import { ISRGFlywheel } from "./components/ISRGFlywheel";
import { OptionalityPanel } from "./components/OptionalityPanel";
import { ProcedureDashboard } from "./components/ProcedureDashboard";
import { RegulatorySafetyPanel } from "./components/RegulatorySafetyPanel";
import { RevenueQualityDashboard } from "./components/RevenueQualityDashboard";
import { TranscriptIntelligenceLab } from "./components/TranscriptIntelligenceLab";
import { ValuationLab } from "./components/ValuationLab";

export function IsrgDashboard({ module, scenario, period, dataSourceType }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const data = useMemo(
    () => attachIsrgRuntimeContext(resolveIsrgDataset(module.data), { periodId: period, dataSourceType }),
    [dataSourceType, module.data, period],
  );
  const summary = useMemo(() => module.calculateSummary(data), [data, module]);
  const dashboard = useMemo(() => buildIsrgDashboardData(data, period, scenario), [data, period, scenario]);
  const isApiMode = import.meta.env.VITE_ISRG_API_MODE !== "false";

  return (
    <div className="space-y-6">
      <SectionCard
        title="ISRG Surgical Robotics Cockpit"
        description="Buy-side research cockpit for installed base, procedure volume, utilization, recurring I&A pull-through, da Vinci 5 upgrade cycle, hospital capex ROI, FDA/product safety, competition, transcript intelligence, and valuation red-team risk."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summary.map((metric) => (
            <MetricCard key={metric.key} metric={metric} currency="USD" />
          ))}
        </div>
      </SectionCard>

      <Tabs.Root value={tab} onValueChange={setTab} className="space-y-6">
        <Tabs.List className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 data-[state=active]:bg-ink data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="executive" className="space-y-6">
          <ExecutiveSummary dashboard={dashboard} />
          <ISRGFlywheel dashboard={dashboard} />
          <ValuationLab dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="flywheel" className="space-y-6">
          <ISRGFlywheel dashboard={dashboard} />
          <RevenueQualityDashboard dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="procedures" className="space-y-6">
          <ProcedureDashboard dashboard={dashboard} />
          <TranscriptIntelligenceLab dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="installed-base" className="space-y-6">
          <InstalledBaseDashboard dashboard={dashboard} />
          <HospitalCapexRoiPanel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="revenue-quality" className="space-y-6">
          <RevenueQualityDashboard dashboard={dashboard} />
          <ISRGFlywheel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="product-cycle" className="space-y-6">
          <DaVinci5ProductCycle dashboard={dashboard} />
          <OptionalityPanel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="hospital-roi" className="space-y-6">
          <HospitalCapexRoiPanel dashboard={dashboard} />
          <InstalledBaseDashboard dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="regulatory" className="space-y-6">
          <RegulatorySafetyPanel dashboard={dashboard} />
          <CompetitionRiskPanel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="space-y-6">
          {isApiMode ? (
            <>
              <IsrgBackendHistoricalValuationPanel scenario={scenario} />
              <IsrgBacktestPanel />
            </>
          ) : null}
          <ValuationLab dashboard={dashboard} />
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={data}
            scenario={scenario}
            currency="USD"
          />
        </Tabs.Content>

        <Tabs.Content value="competition-risk" className="space-y-6">
          <CompetitionRiskPanel dashboard={dashboard} />
          <RegulatorySafetyPanel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="transcripts" className="space-y-6">
          <TranscriptIntelligenceLab dashboard={dashboard} />
          <DataBoundaryPanel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="sources" className="space-y-6">
          <DataBoundaryPanel dashboard={dashboard} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

type IsrgBackendEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | string | null;
  label: string;
  sourceType?: string | null;
};

type IsrgBackendRun = {
  id: string;
  reportingEventId: string;
  asOfDate: string;
  scenario: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y?: number | null;
  expectedShareholderCagr?: number | null;
  upsideDownside?: number | null;
  probabilityWeightedFairValue?: number | null;
  modelVersion?: string | null;
  methodOutputsJson?: Array<{ key?: string; label?: string; value?: number; format?: string; description?: string }>;
  warningsJson?: Array<{ id?: string; title?: string; detail?: string; severity?: string } | string>;
  dataSnapshotJson?: {
    valuationPeriodId?: string | null;
    financialPeriodId?: string | null;
    marketSnapshotId?: string | null;
    kpiSnapshotIds?: string[];
    financialSnapshotIds?: string[];
    segmentSnapshotIds?: string[];
    latestFinancialAsOfDate?: string | null;
    adapterWarnings?: string[];
    asOfPriceSource?: {
      priceDate?: string | null;
      currentPrice?: number | null;
      source?: string | null;
      sourceType?: string | null;
    } | null;
  };
};

type IsrgBackendHistoricalValuation = {
  event: IsrgBackendEvent;
  valuationRun: IsrgBackendRun | null;
};

type IsrgBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type IsrgBacktestCurvePoint = {
  date: string;
  spy: number;
  benchmark?: number;
  isrgBuyHold: number;
};

type IsrgBacktestResult = {
  id?: string;
  persisted?: boolean;
  status?: "completed" | "insufficient_data" | string;
  ticker?: string;
  benchmarkTicker?: string;
  startDate?: string;
  endDate?: string;
  priceBars?: Record<string, unknown>;
  metrics?: {
    isrgBuyHold?: IsrgBacktestMetricSet;
    spy?: IsrgBacktestMetricSet;
    benchmark?: IsrgBacktestMetricSet;
  };
  curve?: IsrgBacktestCurvePoint[];
  warnings?: string[];
};

function IsrgBackendHistoricalValuationPanel({ scenario }: { scenario: string }) {
  const [history, setHistory] = useState<IsrgBackendHistoricalValuation[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBackendPilot() {
      setStatus("loading");
      setError(null);
      try {
        const apiBase = import.meta.env.VITE_ISRG_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
        const query = `scenario=${encodeURIComponent(scenario)}&modelVersion=isrg_v1_backend_pilot`;
        const endpoints = [
          `${apiBase}/api/stocks/isrg/historical-valuations?${query}`,
          `${apiBase}/api/isrg/historical-valuations?${query}`,
        ];
        let payload: { historicalValuations?: IsrgBackendHistoricalValuation[] } | null = null;
        let lastError: string | null = null;
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, { signal: controller.signal });
            if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
            payload = (await response.json()) as { historicalValuations?: IsrgBackendHistoricalValuation[] };
            break;
          } catch (caught) {
            if (controller.signal.aborted) return;
            lastError = caught instanceof Error ? caught.message : String(caught);
          }
        }
        if (!payload) throw new Error(lastError ?? "ISRG historical valuation API unavailable");
        const rows = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setHistory(rows);
        setSelectedEventId((current) => current ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[rows.length - 1]?.event.id ?? null);
        setStatus("online");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setHistory([]);
        setStatus("offline");
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    loadBackendPilot();
    return () => controller.abort();
  }, [scenario]);

  const displayRows = history;
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const visibleOptions = useMemo(
    () => Array.from(new Set([8, 12, 16, 24, displayRows.length].filter((count) => count > 0 && count <= displayRows.length))),
    [displayRows.length],
  );
  const selected =
    displayRows.find((row) => row.event.id === selectedEventId) ??
    [...displayRows].reverse().find((row) => row.valuationRun) ??
    displayRows[displayRows.length - 1] ??
    null;
  const selectedRun = selected?.valuationRun ?? null;
  const selectedEvent = selected?.event ?? null;
  const savedRunCount = displayRows.filter((row) => row.valuationRun).length;
  const snapshot = selectedRun?.dataSnapshotJson;
  const methodRows = selectedRun?.methodOutputsJson ?? [];
  const warningRows = selectedRun?.warningsJson ?? [];
  const chartRows = visibleRows
    .map((row) => {
      const run = row.valuationRun;
      if (!run || run.currentPrice == null || run.fairValue == null) return null;
      const gapPct = run.upsideDownside ?? (run.currentPrice ? run.fairValue / run.currentPrice - 1 : null);
      return {
        period: shortPeriod(row.event),
        fiscalPeriod: row.event.fiscalPeriod ?? row.event.eventDate,
        eventLabel: row.event.label,
        price: Number(run.currentPrice.toFixed(2)),
        fairValue: Number(run.fairValue.toFixed(2)),
        gapPct,
      };
    })
    .filter((row): row is { period: string; fiscalPeriod: string; eventLabel: string; price: number; fairValue: number; gapPct: number | null } => Boolean(row));
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;

  return (
    <SectionCard
      title="Historical Reporting Event Valuation Runs"
      description="Persisted ISRG backend valuations by reporting event. This is the price-vs-model output layer for the surgical robotics cockpit, using only event-visible snapshots."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BackendStat label="Saved Runs" value={`${savedRunCount}`} detail={`${scenario} runs persisted by event`} />
        <BackendStat label="Reporting Events" value={`${displayRows.length || "n/a"}`} detail="Oldest to newest event history" />
        <BackendStat
          label="Selected Fair Value"
          value={selectedRun?.fairValue != null ? usd(selectedRun.fairValue) : "n/a"}
          detail={selectedEvent?.fiscalPeriod ?? selectedEvent?.eventDate ?? "No event selected"}
        />
        <BackendStat
          label="Selected Upside"
          value={selectedRun?.upsideDownside != null ? pct(selectedRun.upsideDownside) : "n/a"}
          detail="Fair value vs as-of price"
        />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Historical data service is temporarily unavailable. Static ISRG dashboard sections still render.
        </div>
      ) : null}

      {displayRows.length ? (
        <>
          <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the chart while the reporting-event selector remains scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleOptions.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === displayRows.length ? "All" : `${count}Q`}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-teal-700"
              type="range"
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={Math.min(visibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
              aria-label="Select visible reporting-event window"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <BackendStat
                label="Visible Window"
                value={`${visibleRows.length} events`}
                detail={`${visibleRows[0] ? shortPeriod(visibleRows[0].event) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? shortPeriod(visibleRows[visibleRows.length - 1].event) : "n/a"}`}
              />
              <BackendStat label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} detail="Fair value minus price, as a percent of price" />
              <BackendStat label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} detail="Average model discount / premium in visible window" />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {displayRows.map((row) => {
                const event = row.event;
                const run = row.valuationRun;
                const active = event.id === selectedEvent?.id;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={`w-64 rounded-md border p-4 text-left transition ${
                      active ? "border-teal-700 bg-teal-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <span className={`block text-xs font-medium ${active ? "text-slate-200" : "text-slate-500"}`}>{event.eventDate}</span>
                    <span className="mt-1 block text-sm font-semibold">{shortPeriod(event)}</span>
                    <span className={`mt-2 block text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{event.label}</span>
                    <span className={`mt-1 block text-xs capitalize ${active ? "text-slate-200" : "text-slate-500"}`}>{event.eventType.replace(/_/g, " ")}</span>
                    <span className={`mt-2 block text-xs ${active ? "text-slate-100" : "text-slate-600"}`}>
                      {run?.fairValue != null ? `${usd(run.fairValue)} FV / ${run.currentPrice != null ? usd(run.currentPrice) : "n/a"} price` : "No saved run"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedRun ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selectedEvent?.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BackendStat label="Event Date" value={selectedEvent?.eventDate ?? "n/a"} detail={selectedEvent?.eventType.replace(/_/g, " ") ?? "Reporting event"} />
                  <BackendStat label="As-of Price" value={selectedRun.currentPrice != null ? usd(selectedRun.currentPrice) : "n/a"} detail={snapshot?.asOfPriceSource?.priceDate ? `Daily price bar: ${snapshot.asOfPriceSource.priceDate}` : selectedRun.asOfDate} />
                  <BackendStat label="3Y Target" value={selectedRun.targetPrice3Y != null ? usd(selectedRun.targetPrice3Y) : "n/a"} detail="Persisted target price" />
                  <BackendStat label="3Y CAGR" value={selectedRun.expectedShareholderCagr != null ? pct(selectedRun.expectedShareholderCagr) : "n/a"} detail="Backend persisted CAGR" />
                </div>
                <BackendTable
                  title="Persisted Valuation Method Output"
                  columns={["Method", "Value", "Description"]}
                  rows={methodRows.map((method) => [
                    method.label ?? method.key ?? "Method",
                    typeof method.value === "number" ? (method.format === "percent" ? pct(method.value) : usd(method.value)) : "n/a",
                    method.description ?? "",
                  ])}
                />
                {warningRows.length ? (
                  <div className="mt-4 space-y-2">
                    {warningRows.map((warning, index) => {
                      const normalized = typeof warning === "string" ? { title: warning, severity: "warning", detail: "" } : warning;
                      return (
                        <div key={`${normalized.title ?? "warning"}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <p className="font-semibold">{normalized.title ?? "Backend warning"}</p>
                          {normalized.detail ? <p className="mt-1 leading-6">{normalized.detail}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <BackendChartPanel title="As-of Price vs ISRG Model Fair Value">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={78} />
                    <YAxis tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      formatter={(value: number, name: string) => (name === "Gap" ? pct(value) : usd(Number(value)))}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as { fiscalPeriod?: string; eventLabel?: string; gapPct?: number | null } | undefined;
                        return `${row?.eventLabel ?? label}${row?.fiscalPeriod ? ` (${row.fiscalPeriod})` : ""}${typeof row?.gapPct === "number" ? ` | Gap ${pct(row.gapPct)}` : ""}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                    <Bar dataKey="fairValue" fill="#175c62" name="Fair value" />
                  </BarChart>
                </ResponsiveContainer>
              </BackendChartPanel>
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No persisted valuation run is available for the selected ISRG event.
            </div>
          )}
        </>
      ) : status === "loading" ? (
        <div className="mt-5 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Loading ISRG historical valuation runs from the backend pilot.
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No persisted valuation runs are available for the selected ISRG backend scenario yet.
        </div>
      )}

      {selectedRun ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <BackendDetail title="Data Snapshot" rows={[
            ["Valuation period", snapshot?.valuationPeriodId ?? snapshot?.financialPeriodId ?? "n/a"],
            ["Market snapshot", snapshot?.marketSnapshotId ?? "n/a"],
            ["Price source", snapshot?.asOfPriceSource?.source ?? "market snapshot"],
            ["KPI snapshots", `${snapshot?.kpiSnapshotIds?.length ?? 0}`],
            ["Latest financial", snapshot?.latestFinancialAsOfDate ?? "n/a"],
          ]} />
          <BackendDetail title="Run Metadata" rows={[
            ["Run ID", selectedRun.id],
            ["Model version", selectedRun.modelVersion ?? "isrg_v1_backend_pilot"],
            ["Scenario", selectedRun.scenario],
            ["As-of date", selectedRun.asOfDate],
          ]} />
          <BackendDetail
            title="Adapter Guardrails"
            rows={(snapshot?.adapterWarnings ?? ["Existing ISRG valuation logic is called through the backend adapter."]).slice(0, 4).map((item, index) => [`${index + 1}`, item])}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}

function IsrgBacktestPanel() {
  const [startDate, setStartDate] = useState("2017-01-03");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IsrgBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_ISRG_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
      const endpoints = [`${apiBase}/api/stocks/isrg/backtests`, `${apiBase}/api/isrg/backtests`];
      let payload: IsrgBacktestResult | null = null;
      let lastError: string | null = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
          });
          if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
          payload = (await response.json()) as IsrgBacktestResult;
          break;
        } catch (caught) {
          lastError = caught instanceof Error ? caught.message : String(caught);
        }
      }
      if (!payload) throw new Error(lastError ?? "ISRG backtest API unavailable");
      setResult(payload);
      setStatus(payload.status === "insufficient_data" ? "error" : "done");
      setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : null);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [endDate, startDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows
      .filter((_, index) => index % step === 0 || index === rows.length - 1)
      .map((row) => ({
        ...row,
        stockReturn: (row.isrgBuyHold - 1) * 100,
        spyReturn: (row.spy - 1) * 100,
      }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="ISRG vs SPY Backtest"
      description="Select a date range and compare daily ISRG buy-and-hold performance against SPY from the backend price history."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-blue-50 text-blue-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "Needs data" : "Ready"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-ink">
          Start date
          <input className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-ink">
          End date
          <input className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={runBacktest}
          disabled={status === "running"}
          className="self-end rounded-md bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {status === "running" ? "Running..." : "Run backtest"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {error}
        </div>
      ) : null}

      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <BackendChartPanel title="ISRG vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="stockReturn" dot={false} stroke="#175c62" strokeWidth={2.5} name="ISRG" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </BackendChartPanel>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <BackendStat label="Stock CAGR" value={metrics.isrgBuyHold?.cagr != null ? pct(metrics.isrgBuyHold.cagr) : "n/a"} detail="ISRG buy-and-hold" />
              <BackendStat label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} detail="Benchmark" />
              <BackendStat label="Stock MDD" value={metrics.isrgBuyHold?.maxDrawdown != null ? pct(metrics.isrgBuyHold.maxDrawdown) : "n/a"} detail="Maximum drawdown" />
              <BackendStat label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} detail="Maximum drawdown" />
              <BackendStat label="Stock Sharpe" value={metrics.isrgBuyHold?.sharpe != null ? metrics.isrgBuyHold.sharpe.toFixed(2) : "n/a"} detail="Zero risk-free rate" />
              <BackendStat label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} detail="Zero risk-free rate" />
              <BackendStat label="Stock Vol" value={metrics.isrgBuyHold?.volatility != null ? pct(metrics.isrgBuyHold.volatility) : "n/a"} detail="Annualized daily vol" />
              <BackendStat label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} detail="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => (
            <div key={warning} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {warning}
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function shortPeriod(event: IsrgBackendEvent) {
  if (event.fiscalPeriod) return event.fiscalPeriod.replace("FY ", "FY").replace("Q", "Q");
  if (event.fiscalYear && event.fiscalQuarter) return `Q${event.fiscalQuarter} ${event.fiscalYear}`;
  return event.eventDate;
}

function BackendChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function BackendStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function BackendDetail({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={`${title}-${label}`} className="grid grid-cols-[8rem_1fr] gap-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="break-words text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BackendTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <div className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white">
            <tr>
              {columns.map((column) => (
                <th key={`${title}-${column}`} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={`${title}-row-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-row-${index}-${cellIndex}`} className="max-w-xl px-4 py-3 align-top text-slate-700">
                    {cell || "n/a"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
