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

type ApiStatus = "loading" | "online" | "offline";

type GildReportingEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod?: string;
  fiscalYear?: number;
  fiscalQuarter?: string;
  eventType: string;
  label?: string;
  title?: string;
  periodLabel?: string;
};

type GildMethodOutput = {
  key?: string;
  label?: string;
  value?: number;
  format?: string;
  weight?: number;
  description?: string;
};

type GildBackendWarning = string | {
  title?: string;
  detail?: string;
  severity?: string;
};

type GildValuationRun = {
  id: string;
  asOfDate: string;
  reportingEventId: string;
  fiscalPeriod?: string;
  scenario: string;
  currentPrice?: number;
  fairValue?: number;
  targetPrice3Y?: number;
  expectedShareholderCagr?: number;
  upsideDownside?: number;
  methodOutputsJson?: GildMethodOutput[];
  warningsJson?: GildBackendWarning[];
  dataSnapshotJson?: {
    asOfPriceSource?: {
      priceDate?: string;
      source?: string;
      adjustedCloseUsed?: boolean;
      closeUsedAsFallback?: boolean;
    };
    methodWeights?: Record<string, number>;
  };
};

type GildHistoricalValuationItem = {
  event: GildReportingEvent;
  valuationRun: GildValuationRun | null;
};

type BacktestMetric = {
  cagr?: number;
  maxDrawdown?: number;
  sharpe?: number;
  volatility?: number;
};

type GildBacktestResult = {
  status: string;
  warnings?: string[];
  curve?: Array<{
    date: string;
    stock: number;
    gildBuyHold?: number;
    spy: number;
    benchmark?: number;
  }>;
  metrics?: {
    stock?: BacktestMetric;
    gildBuyHold?: BacktestMetric;
    spy?: BacktestMetric;
    benchmark?: BacktestMetric;
  };
  priceBars?: {
    GILD?: number;
    SPY?: number;
    overlap?: number;
    sources?: Record<string, string | null>;
  };
};

function apiBaseUrl() {
  return import.meta.env.VITE_GILD_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
}

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function eventLabel(event: GildReportingEvent, short = false) {
  const year = event.fiscalYear ?? event.eventDate.slice(0, 4);
  const fiscalPeriodParts = event.fiscalPeriod?.split(" ") ?? [];
  const quarter = event.fiscalQuarter ?? fiscalPeriodParts[fiscalPeriodParts.length - 1] ?? "";
  if (quarter === "Q4" || event.eventType.includes("fy")) return short ? `FY${String(year).slice(-2)}` : `FY ${year}`;
  return short ? `${String(year).slice(-2)} ${quarter}` : `FY ${year} ${quarter}`.trim();
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[30rem] whitespace-normal px-3 py-2 align-top text-slate-700">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-4 font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

export function GildHistoricalValuationPanel({ scenario }: { scenario: string }) {
  const [status, setStatus] = useState<ApiStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<GildHistoricalValuationItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl()}/api/stocks/gild/historical-valuations?scenario=${encodeURIComponent(scenario)}`);
        if (!response.ok) throw new Error(`GILD backend returned ${response.status}`);
        const payload = await response.json() as { historicalValuations?: GildHistoricalValuationItem[] };
        if (cancelled) return;
        const sortedRows = [...(payload.historicalValuations ?? [])].sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
        setRows(sortedRows);
        setSelectedEventId((current) => current ?? [...sortedRows].reverse().find((row) => row.valuationRun)?.event.id ?? sortedRows[sortedRows.length - 1]?.event.id ?? null);
        setStatus("online");
      } catch (caught) {
        if (cancelled) return;
        setRows([]);
        setStatus("offline");
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  const displayRows = rows;
  const boundedVisibleCount = Math.min(Math.max(4, visibleCount), Math.max(4, displayRows.length || 4));
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - boundedVisibleCount)), [boundedVisibleCount, displayRows]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[displayRows.length - 1] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: eventLabel(row.event, true),
      fiscalPeriod: row.event.label ?? row.event.fiscalPeriod ?? row.event.eventDate,
      price: row.valuationRun?.currentPrice ?? null,
      fairValue: row.valuationRun?.fairValue ?? null,
      gapPct: row.valuationRun?.upsideDownside ?? (
        row.valuationRun?.currentPrice && row.valuationRun?.fairValue
          ? row.valuationRun.fairValue / row.valuationRun.currentPrice - 1
          : null
      ),
    }));
  const gapRows = chartRows.filter((row) => row.gapPct != null);
  const latestGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const averageGap = gapRows.length ? gapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / gapRows.length : null;
  const methodRows: GildMethodOutput[] = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings: GildBackendWarning[] = selected?.valuationRun?.warningsJson ?? [];
  const asOfPriceSource = selected?.valuationRun?.dataSnapshotJson?.asOfPriceSource;
  const lastVisibleRow = visibleRows[visibleRows.length - 1] ?? null;

  return (
    <SectionCard
      title="GILD Backend Historical Valuations"
      description="Persisted reporting-event valuation runs from the unified stock backend. The chart is ordered oldest to newest and uses event-visible as-of prices."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns} note={`${scenario} runs persisted by event`} />
        <ScoreBlock label="Reporting Events" value={displayRows.length || "n/a"} note="Eight-year event history" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs as-of price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static GILD dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the chart while the reporting-event selector remains scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 16, 24, displayRows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${boundedVisibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === displayRows.length ? "All" : `${count}Q`}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={boundedVisibleCount}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? eventLabel(visibleRows[0].event, true) : "n/a"} to ${lastVisibleRow ? eventLabel(lastVisibleRow.event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestGap != null ? pct(latestGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <ScoreBlock label="Average Gap" value={averageGap != null ? pct(averageGap) : "n/a"} note="Average fair value gap in visible window" />
            </div>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {displayRows.map((row) => {
              const active = row.event.id === selected?.event.id;
              return (
                <button
                  key={row.event.id}
                  type="button"
                  onClick={() => setSelectedEventId(row.event.id)}
                  className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{eventLabel(row.event)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.valuationRun?.fairValue != null ? `Fair value ${usd(row.valuationRun.fairValue)}` : "No saved run"}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.title ?? selected.event.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note={asOfPriceSource?.priceDate ? `Daily market price ${asOfPriceSource.priceDate}` : "Market snapshot input"} />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Backend expected shareholder CAGR" />
                </div>
                <DataTable
                  headers={["Method", "Value", "Weight", "Description"]}
                  rows={methodRows.map((row) => [
                    row.label ?? row.key ?? "Method",
                    typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : usd(row.value)) : "n/a",
                    typeof row.weight === "number" ? pct(row.weight) : "n/a",
                    row.description ?? "",
                  ])}
                />
                {warnings.length ? (
                  <div className="mt-4 space-y-2">
                    {warnings.map((warning, index) => {
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

              <ChartPanel title="As-of Price vs Fair Value">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                      labelFormatter={(label, payload) => {
                        const gap = payload?.[0]?.payload?.gapPct;
                        const fiscal = payload?.[0]?.payload?.fiscalPeriod;
                        return `${label}${fiscal ? ` (${fiscal})` : ""}${typeof gap === "number" ? ` | Gap ${pct(gap)}` : ""}`;
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
        <p className="mt-5 text-sm text-slate-600">Loading GILD historical valuation runs from the unified backend.</p>
      ) : null}
    </SectionCard>
  );
}

export function GildBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GildBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/stocks/gild/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`GILD backend returned ${response.status}`);
      const payload = (await response.json()) as GildBacktestResult;
      setResult(payload);
      setStatus(payload.status === "completed" ? "done" : "error");
      setError(payload.status === "completed" ? null : (payload.warnings ?? []).join(" "));
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
      gildReturn: ((row.gildBuyHold ?? row.stock) - 1) * 100,
    }));
  }, [result]);
  const stockMetrics = result?.metrics?.stock ?? result?.metrics?.gildBuyHold;
  const spyMetrics = result?.metrics?.spy ?? result?.metrics?.benchmark;

  return (
    <SectionCard
      title="GILD vs SPY Backtest"
      description="Select a date range and compare daily GILD buy-and-hold performance against SPY from backend daily price history."
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
          <ChartPanel title="GILD vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="gildReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="GILD" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="Stock CAGR" value={stockMetrics?.cagr != null ? pct(stockMetrics.cagr) : "n/a"} note="GILD buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={spyMetrics?.cagr != null ? pct(spyMetrics.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="Stock MDD" value={stockMetrics?.maxDrawdown != null ? pct(stockMetrics.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={spyMetrics?.maxDrawdown != null ? pct(spyMetrics.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="Stock Sharpe" value={stockMetrics?.sharpe != null ? stockMetrics.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={spyMetrics?.sharpe != null ? spyMetrics.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="Stock Vol" value={stockMetrics?.volatility != null ? pct(stockMetrics.volatility) : "n/a"} note="Annualized daily vol" />
              <ScoreBlock label="SPY Vol" value={spyMetrics?.volatility != null ? pct(spyMetrics.volatility) : "n/a"} note="Annualized daily vol" />
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
