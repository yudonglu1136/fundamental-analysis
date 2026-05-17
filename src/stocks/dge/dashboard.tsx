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
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import {
  attachDgeRuntimeContext,
  buildDgeDashboardData,
  defaultDgeValuationAssumptions,
  resolveDgeDataset,
  resolveDgeEffectiveDataSourceType,
} from "./calculations";
import type { DgeValuationAssumptions } from "./types";
import {
  BrandPortfolioPanel,
  CashFlowPanel,
  CockpitPanel,
  EvidencePanel,
  LacInventoryLab,
  MarginSavingsPanel,
  PriceMixVolumePanel,
  RegionalQualityPanel,
  RiskRedTeamPanel,
  UsDemandLab,
  ValuationPanel,
} from "./components/Panels";

type DgeHistoricalValuationRun = {
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

type DgeHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  label?: string | null;
  sourceType?: string | null;
};

type DgeHistoricalValuationItem = {
  event: DgeHistoricalValuationEvent;
  valuationRun: DgeHistoricalValuationRun | null;
};

type DgeHistoricalValuationResponse = {
  historicalValuations?: DgeHistoricalValuationItem[];
};

type DgeBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type DgeBacktestCurvePoint = {
  date: string;
  dgeBuyHold: number;
  stock?: number;
  spy: number;
  benchmark?: number;
};

type DgeBacktestResult = {
  id?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  metrics?: {
    dgeBuyHold?: DgeBacktestMetricSet;
    stock?: DgeBacktestMetricSet;
    spy?: DgeBacktestMetricSet;
    benchmark?: DgeBacktestMetricSet;
  };
  curve?: DgeBacktestCurvePoint[];
  warnings?: string[];
  priceBars?: Record<string, number | string | Record<string, string | null>>;
};

function loadSavedDgeValuationAssumptions() {
  if (typeof window === "undefined") return defaultDgeValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-DGE.L");
  if (!saved) return defaultDgeValuationAssumptions;
  try {
    return {
      ...defaultDgeValuationAssumptions,
      ...(JSON.parse(saved) as Partial<DgeValuationAssumptions>),
    };
  } catch {
    return defaultDgeValuationAssumptions;
  }
}

function gbp(value: number) {
  return `£${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function dgeApiBase() {
  return import.meta.env.VITE_DGE_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
}

function dgeEventLabel(event: DgeHistoricalValuationEvent, compact = false) {
  const label = event.fiscalPeriod ?? event.label ?? event.id;
  if (!compact) return label;
  return label
    .replace("FY 20", "FY")
    .replace("H1 FY 20", "H1 FY")
    .replace("Q1 FY 20", "Q1 FY")
    .replace("Q3 FY 20", "Q3 FY");
}

function DgeStat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function UnusedDgeHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: DgeHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(16);
  const visibleRows = rows.slice(Math.max(0, rows.length - visibleCount));
  const selected = rows.find((row) => row.event.id === selectedEventId) ?? [...rows].reverse().find((row) => row.valuationRun) ?? rows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows.map((row) => ({
    period: dgeEventLabel(row.event, true),
    price: row.valuationRun?.currentPrice ?? null,
    fairValue: row.valuationRun?.fairValue ?? null,
    gapPct: row.valuationRun?.upsideDownside ?? (
      row.valuationRun?.currentPrice && row.valuationRun?.fairValue
        ? row.valuationRun.fairValue / row.valuationRun.currentPrice - 1
        : null
    ),
  }));

  return (
    <SectionCard
      title="DGE Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event from the DGE backend pilot."
      badge={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-600">{status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <DgeStat label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <DgeStat label="Events" value={rows.length || "n/a"} note="Reporting events returned" />
        <DgeStat label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? gbp(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <DgeStat label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>
      {status === "offline" ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Historical data service is temporarily unavailable.</div> : null}
      {rows.length ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Visible history window</p>
            <div className="flex flex-wrap gap-2">
              {[8, 12, 16, 24, rows.length].map((count) => (
                <button key={count} type="button" onClick={() => setVisibleCount(count)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
                  {count === rows.length ? "All" : `${count}Q`}
                </button>
              ))}
            </div>
            <input className="h-2 w-full accent-blue-600" type="range" min={Math.min(4, rows.length)} max={Math.max(4, rows.length)} value={Math.min(visibleCount, Math.max(4, rows.length))} onChange={(event) => setVisibleCount(Number(event.target.value))} />
          </div>
          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {rows.map((row) => (
              <button key={row.event.id} type="button" onClick={() => onSelectEvent(row.event.id)} className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm ${row.event.id === selected?.event.id ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700"}`}>
                <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                <span className="mt-1 block font-semibold">{dgeEventLabel(row.event, true)}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                <YAxis />
                <Tooltip formatter={(value: number, name: string) => name === "Gap" ? pct(value) : gbp(value)} labelFormatter={(label, payload) => `${label}${typeof payload?.[0]?.payload?.gapPct === "number" ? ` | Gap ${pct(payload[0].payload.gapPct)}` : ""}`} />
                <Legend />
                <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}

function UnusedDgeBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<DgeBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const response = await fetch(`${dgeApiBase()}/api/stocks/dge/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
      });
      if (!response.ok) throw new Error(`DGE backend returned ${response.status}`);
      const payload = (await response.json()) as DgeBacktestResult;
      setResult(payload);
      setStatus(payload.status === "insufficient_data" ? "error" : "done");
      setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : null);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [endDate, startDate]);

  const curve = (result?.curve ?? []).map((row) => ({
    ...row,
    dgeReturn: ((row.dgeBuyHold ?? row.stock ?? 1) - 1) * 100,
    spyReturn: (row.spy - 1) * 100,
  }));
  const stockMetrics = result?.metrics?.dgeBuyHold ?? result?.metrics?.stock;

  return (
    <SectionCard title="DGE vs SPY Backtest" description="Select a date range and compare daily DGE buy-and-hold performance against SPY.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-ink">Start date<input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="text-sm font-semibold text-ink">End date<input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <button type="button" onClick={runBacktest} disabled={status === "running"} className="self-end rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{status === "running" ? "Running..." : "Run backtest"}</button>
      </div>
      {error ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div> : null}
      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="dgeReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="DGE" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DgeStat label="DGE CAGR" value={stockMetrics?.cagr != null ? pct(stockMetrics.cagr) : "n/a"} note="Buy-and-hold" />
            <DgeStat label="SPY CAGR" value={result?.metrics?.spy?.cagr != null ? pct(result.metrics.spy.cagr) : "n/a"} note="Benchmark" />
            <DgeStat label="DGE MDD" value={stockMetrics?.maxDrawdown != null ? pct(stockMetrics.maxDrawdown) : "n/a"} note="Maximum drawdown" />
            <DgeStat label="SPY MDD" value={result?.metrics?.spy?.maxDrawdown != null ? pct(result.metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

export function DgeDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "cockpit");
  const [valuationAssumptions, setValuationAssumptions] = useState<DgeValuationAssumptions>(loadSavedDgeValuationAssumptions);
  const [historicalValuations, setHistoricalValuations] = useState<DgeHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedDgeEventId, setSelectedDgeEventId] = useState<string | null>(null);
  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveDgeDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () => attachDgeRuntimeContext(moduleData, { periodId: resolvedPeriod, dataSourceType }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const effectiveDataSourceType = resolveDgeEffectiveDataSourceType(runtimeData);
  const valuationOverrides = dataSourceType === "manual" ? valuationAssumptions : undefined;
  const dashboard = useMemo(
    () => buildDgeDashboardData(moduleData, resolvedPeriod, scenario, valuationOverrides),
    [moduleData, resolvedPeriod, scenario, valuationOverrides],
  );
  const summary = useMemo(() => module.calculateSummary(runtimeData), [runtimeData, module]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      try {
        const response = await fetch(`${dgeApiBase()}/api/stocks/dge/historical-valuations?scenario=Base&modelVersion=dge_v1_backend_pilot`);
        if (!response.ok) throw new Error(`DGE backend returned ${response.status}`);
        const payload = (await response.json()) as DgeHistoricalValuationResponse;
        if (cancelled) return;
        const rows = (payload.historicalValuations ?? []).slice().sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
        setHistoricalValuations(rows);
        setSelectedDgeEventId((current) => current ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[rows.length - 1]?.event.id ?? null);
        setHistoricalStatus("online");
      } catch (caught) {
        if (cancelled) return;
        setHistoricalValuations([]);
        setHistoricalStatus("offline");
        setHistoricalError(caught instanceof Error ? caught.message : String(caught));
      }
    }

    loadHistoricalValuations();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as DgeValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="DGE.L Research Cockpit"
        description="Diageo is modeled as a beverage demand-cycle and channel-inventory turnaround, with US Spirits, LAC inventory, brand portfolio, FCF and dividend credibility separated."
        badge={<DataQualityBadge badge={effectiveDataSourceType === "manual" ? "Assumption" : "Actual"} />}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Data Boundary</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Official reported data, guidance and market prices stay separate from research-only inventory and valuation assumptions.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Unit Discipline</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              DGE.L is quoted in GBX and normalized to £{dashboard.dataset.marketData.londonPriceGbp.toFixed(2)}. DEO ADR equivalent uses four ordinary shares.
            </p>
          </div>
        </div>
        {dashboard.dataStatus.validationWarnings.length > 0 ? (
          <div className="mt-4 space-y-2">
            {dashboard.dataStatus.validationWarnings.map((warning) => (
              <div key={warning.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{warning.title}</span>
                <span className="ml-2">{warning.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((metric) => <MetricCard key={metric.key} metric={metric} currency="GBP" />)}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="cockpit" className="mt-6">
          <SectionCard title="Cockpit" description="Thesis, price, valuation, upside/downside, catalysts and the evidence needed to buy DGE.L now.">
            <CockpitPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="us-demand" className="mt-6">
          <SectionCard title="US Demand Lab" description="US Spirits demand is decomposed into shipments, depletions, consumption, category pressure and share risk.">
            <UsDemandLab dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="lac-inventory" className="mt-6">
          <SectionCard title="LAC Inventory Lab" description="LAC reported growth is normalized for low base, restocking and World Cup pull-forward.">
            <LacInventoryLab dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="regional-quality" className="mt-6">
          <SectionCard title="Regional Quality" description="Each region is scored on volume, price/mix, shipment quality, inventory distortion, FX and sustainability.">
            <RegionalQualityPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="brand-portfolio" className="mt-6">
          <SectionCard title="Brand Portfolio" description="Guinness, tequila, whisky, vodka, rum, liqueurs and local priority brands are separated by moat and affordability gap.">
            <BrandPortfolioPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="price-mix-volume" className="mt-6">
          <SectionCard title="Price / Mix / Volume Bridge" description="Revenue quality is split into organic growth, volume, price/mix, FX, disposals and inventory distortion.">
            <PriceMixVolumePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margin-savings" className="mt-6">
          <SectionCard title="Margin & Savings" description="Accelerate savings, tariff drag, A&P efficiency, COGS/mix and sustainable margin scenarios.">
            <MarginSavingsPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="cash-flow" className="mt-6">
          <SectionCard title="Cash Flow & Deleveraging" description="FCF, capex, working capital, dividend, disposals, net debt and leverage path.">
            <CashFlowPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <SectionCard title="Valuation" description="Normalized FCF yield, EV/EBIT, EV/EBITDA, P/E, dividend floor, implied market assumptions and sensitivities.">
            <ValuationPanel dashboard={dashboard} />
          </SectionCard>
          <DgeHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedDgeEventId}
            onSelectEvent={setSelectedDgeEventId}
          />
          <DgeBacktestPanel />
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency="GBP"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="risk-red-team" className="mt-6">
          <SectionCard title="Risk Red Team" description="Adversarial risk register and kill criteria for US demand, LAC inventory, tequila, premiumisation, FX, tariffs, leverage and execution.">
            <RiskRedTeamPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="evidence" className="mt-6">
          <SectionCard title="Evidence" description="Every key number and research-only assumption is mapped to source evidence.">
            <EvidencePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function DgeHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: DgeHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(16);
  const displayRows = rows;
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = displayRows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: dgeEventLabel(row.event, true),
      fiscalPeriod: dgeEventLabel(row.event),
      sourceType: row.event.sourceType ?? "unknown",
      price: row.valuationRun?.currentPrice ?? null,
      fairValue: row.valuationRun?.fairValue ?? null,
      gapPct: row.valuationRun?.upsideDownside ?? (
        row.valuationRun?.currentPrice && row.valuationRun?.fairValue
          ? row.valuationRun.fairValue / row.valuationRun.currentPrice - 1
          : null
      ),
    }));
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];

  return (
    <SectionCard
      title="DGE Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by Diageo reporting event, including FY/H1 actuals, trading updates, and clearly marked proxy historical rows."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <DgeScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <DgeScoreBlock label="Reporting Events" value={displayRows.length || "n/a"} note="FY/H1/trading update slots" />
        <DgeScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? gbp(selected.valuationRun.fairValue) : "n/a"} note="GBP per ordinary share" />
        <DgeScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static DGE dashboard sections still render.
        </div>
      ) : null}

      {displayRows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">The event slots are reporting events, not a claim that Diageo reports full quarterly financial statements.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 16, 24, displayRows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === displayRows.length ? "All" : `${count}E`}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={Math.min(visibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <DgeScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? dgeEventLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? dgeEventLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <DgeScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price" />
              <DgeScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average visible discount / premium" />
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
                  className={`min-w-[180px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{dgeEventLabel(row.event)}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event.sourceType === "official_actual" ? "Official actual" : "Research proxy"}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.label ?? dgeEventLabel(selected.event)}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DgeScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <DgeScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? gbp(selected.valuationRun.currentPrice) : "n/a"} note="DGE.L GBp bar converted to GBP" />
                  <DgeScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? gbp(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <DgeScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Backend persisted expected return" />
                </div>
                <DgeDataTable
                  headers={["Method", "Value", "Description"]}
                  rows={methodRows.map((row) => [
                    row.label ?? row.key ?? "Method",
                    typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : gbp(row.value)) : "n/a",
                    row.description ?? "",
                  ])}
                />
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

              <DgeChartPanel title="As-of Price vs Fair Value">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis tickFormatter={(value: number) => `£${value.toFixed(0)}`} />
                    <Tooltip
                      formatter={(value: number, name: string) => name === "Gap" ? pct(value) : gbp(value)}
                      labelFormatter={(label, payload) => {
                        const gap = payload?.[0]?.payload?.gapPct;
                        const fiscal = payload?.[0]?.payload?.fiscalPeriod;
                        const sourceType = payload?.[0]?.payload?.sourceType;
                        return `${label}${fiscal ? ` (${fiscal})` : ""}${typeof gap === "number" ? ` | Gap ${pct(gap)}` : ""}${sourceType ? ` | ${sourceType}` : ""}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                    <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
                  </BarChart>
                </ResponsiveContainer>
              </DgeChartPanel>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading DGE historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function DgeBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-13");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DgeBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const response = await fetch(`${dgeApiBase()}/api/stocks/dge/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`DGE backend returned ${response.status}`);
      const payload = (await response.json()) as DgeBacktestResult;
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
      dgeReturn: (row.dgeBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="DGE.L vs SPY Backtest"
      description="Simple date-range comparison of indexed DGE.L local-price performance against SPY. This is not an FX-hedged USD return series."
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
          <DgeChartPanel title="DGE.L vs SPY Indexed Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="dgeReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="DGE.L" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </DgeChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DgeScoreBlock label="DGE.L CAGR" value={metrics.dgeBuyHold?.cagr != null ? pct(metrics.dgeBuyHold.cagr) : "n/a"} note="Local-price buy-and-hold" />
              <DgeScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="USD benchmark" />
              <DgeScoreBlock label="DGE.L MDD" value={metrics.dgeBuyHold?.maxDrawdown != null ? pct(metrics.dgeBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <DgeScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <DgeScoreBlock label="DGE.L Sharpe" value={metrics.dgeBuyHold?.sharpe != null ? metrics.dgeBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <DgeScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <DgeScoreBlock label="DGE.L Vol" value={metrics.dgeBuyHold?.volatility != null ? pct(metrics.dgeBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
              <DgeScoreBlock label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} note="Annualized daily vol" />
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

function DgeScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function DgeChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

function DgeDataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
          <tr>
            {headers.map((heading) => (
              <th key={heading} className="px-3 py-2">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100 align-top last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="max-w-md px-3 py-3 leading-6 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
