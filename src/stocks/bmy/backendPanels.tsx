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

type BmyEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod?: string;
  fiscalQuarter?: string;
  fiscalYear?: number;
  eventType: string;
  label?: string;
};

type BmyValuationRun = {
  id: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y?: number | null;
  expectedShareholderCagr?: number | null;
  upsideDownside: number | null;
  methodOutputsJson?: Array<{ key?: string; label?: string; value?: number; format?: string; description?: string }>;
  warningsJson?: Array<string | { id?: string; title?: string; detail?: string; severity?: string }>;
};

type BmyHistoricalValuationItem = {
  event: BmyEvent;
  valuationRun: BmyValuationRun | null;
};

type BmyHistoricalValuationResponse = {
  historicalValuations?: BmyHistoricalValuationItem[];
};

type BacktestMetric = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type BmyBacktestResult = {
  status: string;
  warnings?: string[];
  curve?: Array<{ date: string; bmyBuyHold: number; spy: number; benchmark?: number }>;
  metrics?: {
    bmyBuyHold?: BacktestMetric;
    spy?: BacktestMetric;
    benchmark?: BacktestMetric;
  };
};

function apiBase() {
  return import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
}

async function fetchWithFallback(path: string, fallbackPath: string, init?: RequestInit) {
  const base = apiBase();
  const first = await fetch(`${base}${path}`, init);
  if (first.ok) return first;
  const second = await fetch(`${base}${fallbackPath}`, init);
  if (second.ok) return second;
  throw new Error(`BMY backend returned ${first.status}; fallback returned ${second.status}`);
}

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function eventLabel(event: BmyEvent, compact = false) {
  const quarter = event.fiscalQuarter ?? event.fiscalPeriod?.match(/Q[1-4]/)?.[0] ?? "";
  const year = event.fiscalYear ?? Number(event.fiscalPeriod?.match(/20\d{2}/)?.[0]);
  if (!quarter || !year) return event.fiscalPeriod ?? event.eventDate;
  return compact ? `FY${String(year).slice(2)} ${quarter}` : `FY${year} ${quarter}`;
}

function ScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function MiniTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
          <tr>{headers.map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100 align-top last:border-0">
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="max-w-md px-3 py-3 leading-6 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BmyHistoricalValuationPanel() {
  const [rows, setRows] = useState<BmyHistoricalValuationItem[]>([]);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetchWithFallback(
          "/api/bmy/historical-valuations?scenario=Base&modelVersion=bmy_v1_backend_pilot",
          "/api/stocks/bmy/historical-valuations?scenario=Base&modelVersion=bmy_v1_backend_pilot",
          { signal: controller.signal },
        );
        const payload = (await response.json()) as BmyHistoricalValuationResponse;
        const nextRows = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setRows(nextRows);
        setSelectedEventId((current) => current ?? [...nextRows].reverse().find((row) => row.valuationRun)?.event.id ?? nextRows[0]?.event.id ?? null);
        setStatus("online");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRows([]);
        setStatus("offline");
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    loadHistoricalValuations();
    return () => controller.abort();
  }, []);

  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const selected = rows.find((row) => row.event.id === selectedEventId) ?? [...rows].reverse().find((row) => row.valuationRun) ?? rows[0] ?? null;
  const maxVisible = Math.max(1, rows.length);
  const visibleRows = rows.slice(Math.max(0, rows.length - Math.min(visibleCount, maxVisible)));
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => {
      const price = row.valuationRun?.currentPrice ?? null;
      const fairValue = row.valuationRun?.fairValue ?? null;
      return {
        period: eventLabel(row.event, true),
        eventDate: row.event.eventDate,
        fiscalPeriod: row.event.fiscalPeriod ?? eventLabel(row.event),
        price,
        fairValue,
        gapPct: price && fairValue ? fairValue / price - 1 : row.valuationRun?.upsideDownside ?? null,
      };
    });
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;

  return (
    <SectionCard
      title="BMY Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by BMY reporting event from the unified SQLite backend."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={rows.length || "n/a"} note="FY2018 Q1 through latest imported quarter" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static BMY valuation remains available below.
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
                {[8, 12, 16, 24, rows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === rows.length ? "All" : `${count}Q`}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, maxVisible)}
              max={maxVisible}
              value={Math.min(visibleCount, maxVisible)}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? eventLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? eventLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium in visible window" />
            </div>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {rows.map((row) => {
              const active = row.event.id === selected?.event.id;
              return (
                <button
                  key={row.event.id}
                  type="button"
                  onClick={() => setSelectedEventId(row.event.id)}
                  className={`min-w-[160px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{eventLabel(row.event)}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold text-ink">{selected?.event.label ?? "Selected reporting event"}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ScoreBlock label="Event Date" value={selected?.event.eventDate ?? "n/a"} note={selected?.event.eventType.replace(/_/g, " ") ?? "n/a"} />
                <ScoreBlock label="As-of Price" value={selected?.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior adjusted close" />
                <ScoreBlock label="3Y Target" value={selected?.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                <ScoreBlock label="3Y CAGR" value={selected?.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Backend shareholder return bridge" />
              </div>
              <MiniTable
                headers={["Method", "Value", "Description"]}
                rows={(selected?.valuationRun?.methodOutputsJson ?? []).map((row) => [
                  row.label ?? row.key ?? "Method",
                  typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : usd(row.value)) : "n/a",
                  row.description ?? "",
                ])}
              />
              {(selected?.valuationRun?.warningsJson ?? []).length ? (
                <div className="mt-4 space-y-2">
                  {(selected?.valuationRun?.warningsJson ?? []).map((warning, index) => {
                    const normalized = typeof warning === "string" ? { title: warning, detail: "" } : warning;
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
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading BMY historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}

function BmyBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BmyBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const response = await fetchWithFallback(
        "/api/bmy/backtests",
        "/api/stocks/bmy/backtests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
        },
      );
      const payload = (await response.json()) as BmyBacktestResult;
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
      bmyReturn: (row.bmyBuyHold - 1) * 100,
      spyReturn: (row.spy - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="BMY vs SPY Backtest"
      description="Select a date range and compare daily BMY buy-and-hold performance against SPY from backend adjusted-price history."
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

      {error ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{error}</div> : null}

      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 font-semibold text-ink">BMY vs SPY Total Return</p>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="bmyReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="BMY" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="BMY CAGR" value={metrics.bmyBuyHold?.cagr != null ? pct(metrics.bmyBuyHold.cagr) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="BMY MDD" value={metrics.bmyBuyHold?.maxDrawdown != null ? pct(metrics.bmyBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="BMY Sharpe" value={metrics.bmyBuyHold?.sharpe != null ? metrics.bmyBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="BMY Vol" value={metrics.bmyBuyHold?.volatility != null ? pct(metrics.bmyBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
              <ScoreBlock label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} note="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>)}
        </div>
      ) : null}
    </SectionCard>
  );
}

export function BmyBackendValuationPanels() {
  return (
    <>
      <BmyHistoricalValuationPanel />
      <BmyBacktestPanel />
    </>
  );
}
