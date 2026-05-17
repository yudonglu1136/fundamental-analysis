import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { SectionCard } from "../../components/shared/SectionCard";

const RTX_MODEL_VERSION = "rtx_v1_backend_pilot";

type RtxHistoricalValuationRun = {
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

type RtxHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | null;
  label?: string | null;
  title?: string | null;
  sourceType?: string | null;
};

type RtxHistoricalValuationItem = {
  event: RtxHistoricalValuationEvent;
  valuationRun: RtxHistoricalValuationRun | null;
};

type RtxHistoricalValuationResponse = {
  historicalValuations?: RtxHistoricalValuationItem[];
};

type RtxBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type RtxBacktestCurvePoint = {
  date: string;
  spy: number;
  benchmark?: number;
  rtxBuyHold: number;
  price?: number | null;
  benchmarkPrice?: number | null;
};

type RtxBacktestResult = {
  status?: string;
  ticker?: string;
  benchmarkTicker?: string;
  startDate?: string;
  endDate?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    rtxBuyHold?: RtxBacktestMetricSet;
    spy?: RtxBacktestMetricSet;
    benchmark?: RtxBacktestMetricSet;
  };
  curve?: RtxBacktestCurvePoint[];
  warnings?: string[];
};

function apiBaseUrl() {
  return import.meta.env.VITE_RTX_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
}

async function fetchJsonWithFallback<T>(paths: string[], init?: RequestInit): Promise<T> {
  const base = apiBaseUrl();
  const errors: string[] = [];
  for (const path of paths) {
    try {
      const response = await fetch(`${base}${path}`, init);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function eventLabel(event: RtxHistoricalValuationEvent, compact = false) {
  if (event.fiscalYear && event.fiscalQuarter) {
    return compact ? `CY${String(event.fiscalYear).slice(2)} Q${event.fiscalQuarter}` : `CY${event.fiscalYear} Q${event.fiscalQuarter}`;
  }
  return event.label ?? event.fiscalPeriod ?? event.eventDate;
}

function gapPct(run: RtxHistoricalValuationRun | null) {
  if (!run?.fairValue || !run.currentPrice) return null;
  return run.fairValue / run.currentPrice - 1;
}

export function RtxBackendValuationSections() {
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [historicalRows, setHistoricalRows] = useState<RtxHistoricalValuationItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      try {
        const query = `scenario=Base&modelVersion=${encodeURIComponent(RTX_MODEL_VERSION)}`;
        const payload = await fetchJsonWithFallback<RtxHistoricalValuationResponse>(
          [`/api/rtx/historical-valuations?${query}`, `/api/stocks/rtx/historical-valuations?${query}`],
          { signal: controller.signal },
        );
        const rows = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setHistoricalRows(rows);
        setSelectedEventId((current) => current ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[0]?.event.id ?? null);
        setHistoricalStatus("online");
      } catch (error) {
        if (controller.signal.aborted) return;
        setHistoricalRows([]);
        setHistoricalStatus("offline");
        setHistoricalError(error instanceof Error ? error.message : String(error));
      }
    }
    loadHistoricalValuations();
    return () => controller.abort();
  }, []);

  return (
    <>
      <RtxHistoricalValuationPanel
        status={historicalStatus}
        error={historicalError}
        rows={historicalRows}
        selectedEventId={selectedEventId}
        onSelectEvent={setSelectedEventId}
      />
      <RtxBacktestPanel />
    </>
  );
}

function RtxHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: RtxHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows;
  const [visibleCount, setVisibleCount] = useState(16);
  const normalizedVisibleCount = Math.min(visibleCount, Math.max(displayRows.length, 1));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - normalizedVisibleCount)),
    [displayRows, normalizedVisibleCount],
  );
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: eventLabel(row.event, true),
      eventDate: row.event.eventDate,
      fiscalPeriod: row.event.fiscalPeriod ?? eventLabel(row.event),
      price: row.valuationRun?.currentPrice ?? null,
      fairValue: row.valuationRun?.fairValue ?? null,
      gapPct: gapPct(row.valuationRun),
    }));
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;
  const warnings = selected?.valuationRun?.warningsJson ?? [];
  const windowOptions = [8, 12, 16, 24].filter((count) => count < displayRows.length);

  return (
    <SectionCard
      title="RTX Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event from the RTX SQLite backend. The static RTX dashboard remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={String(savedRuns)} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length ? String(displayRows.length) : "n/a"} note="CY2018 Q1 through latest imported quarter" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={gapPct(selected?.valuationRun ?? null) != null ? pct(gapPct(selected?.valuationRun ?? null) ?? 0) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static RTX dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">The chart reads oldest to newest from left to right.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...windowOptions, displayRows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${normalizedVisibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === displayRows.length ? "All" : `${count}Q`}
                  </button>
                ))}
              </div>
            </div>
            <input
              aria-label="RTX visible valuation window"
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={Math.min(normalizedVisibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? eventLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? eventLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average gap in the visible window" />
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
                  <span className="mt-1 block font-semibold">{eventLabel(row.event)}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event.sourceType ?? "source"}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.title ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior adjusted close" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Dividend bridge where modeled" />
                </div>
                {warnings.length ? (
                  <div className="mt-4 space-y-2">
                    {warnings.slice(0, 4).map((warning, index) => {
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

              <ChartPanel title="As-of Price vs Fair Value">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                      labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload;
                        const gap = point?.gapPct;
                        return `${point?.eventDate ?? label} | ${point?.fiscalPeriod ?? label}${typeof gap === "number" ? ` | Gap ${pct(gap)}` : ""}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                    <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading RTX historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}

function RtxBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RtxBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const payload = await fetchJsonWithFallback<RtxBacktestResult>(
        ["/api/rtx/backtests", "/api/stocks/rtx/backtests"],
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
        },
      );
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
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({
      ...row,
      spyReturn: (row.spy - 1) * 100,
      rtxReturn: (row.rtxBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="RTX vs SPY Backtest"
      description="Compare RTX buy-and-hold performance against SPY over a selected daily adjusted-price interval."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-blue-50 text-blue-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "API error" : "Ready"}
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
          <ChartPanel title="RTX vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="rtxReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="RTX" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="RTX CAGR" value={metrics.rtxBuyHold?.cagr != null ? pct(metrics.rtxBuyHold.cagr) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="RTX MDD" value={metrics.rtxBuyHold?.maxDrawdown != null ? pct(metrics.rtxBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="RTX Sharpe" value={metrics.rtxBuyHold?.sharpe != null ? metrics.rtxBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="RTX Vol" value={metrics.rtxBuyHold?.volatility != null ? pct(metrics.rtxBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
              <ScoreBlock label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} note="Annualized daily vol" />
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

function ScoreBlock({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
