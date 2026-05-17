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
  attachLegnRuntimeContext,
  buildLegnDashboardData,
  defaultLegnValuationAssumptions,
  resolveLegnDataset,
  resolveLegnEffectiveDataSourceType,
} from "./calculations";
import type { LegnValuationAssumptions } from "./types";
import {
  CarvyktiCommercialPanel,
  ClinicalEvidencePanel,
  CockpitPanel,
  CollaborationEconomicsPanel,
  EarningsCallPanel,
  EvidencePanel,
  LabelExpansionPanel,
  ManufacturingAccessPanel,
  PipelineRnpvPanel,
  RiskRedTeamPanel,
  SolidTumorCartPanel,
  ValuationPanel,
} from "./components/LegnPanels";
import { LegnMiniCard, LegnTable, formatPct, formatUsdPerAds } from "./components/LegnUi";
import { fetchLegnBackendBundle, isLegnApiModeEnabled, type LegnBackendBundle } from "./apiBackend";

type LegnHistoricalValuationRun = {
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

type LegnHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  label?: string | null;
  title?: string | null;
};

type LegnHistoricalValuationItem = {
  event: LegnHistoricalValuationEvent;
  valuationRun: LegnHistoricalValuationRun | null;
};

type LegnHistoricalValuationResponse = {
  historicalValuations?: LegnHistoricalValuationItem[];
};

type LegnBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type LegnBacktestCurvePoint = {
  date: string;
  legnBuyHold: number;
  stock?: number;
  spy: number;
  benchmark?: number;
};

type LegnBacktestResult = {
  status?: string;
  ticker?: string;
  benchmarkTicker?: string;
  startDate?: string;
  endDate?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    legnBuyHold?: LegnBacktestMetricSet;
    spy?: LegnBacktestMetricSet;
    benchmark?: LegnBacktestMetricSet;
  };
  curve?: LegnBacktestCurvePoint[];
  warnings?: string[];
};

function loadSavedLegnValuationAssumptions() {
  if (typeof window === "undefined") return defaultLegnValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-LEGN");
  if (!saved) return defaultLegnValuationAssumptions;
  try {
    return {
      ...defaultLegnValuationAssumptions,
      ...(JSON.parse(saved) as Partial<LegnValuationAssumptions>),
    };
  } catch {
    return defaultLegnValuationAssumptions;
  }
}

function getLegnBackendApiBase() {
  return import.meta.env.VITE_LEGN_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
}

function compactPeriodLabel(event: LegnHistoricalValuationEvent) {
  return event.fiscalPeriod ?? event.label ?? event.fiscalQuarter ?? event.eventDate;
}

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

export function LegnDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "cockpit");
  const [backendBundle, setBackendBundle] = useState<LegnBackendBundle | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [historicalValuations, setHistoricalValuations] = useState<LegnHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);
  const [valuationAssumptions, setValuationAssumptions] = useState<LegnValuationAssumptions>(loadSavedLegnValuationAssumptions);
  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveLegnDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () => attachLegnRuntimeContext(moduleData, { periodId: resolvedPeriod, dataSourceType }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const valuationOverrides = dataSourceType === "manual" ? valuationAssumptions : undefined;
  const dashboard = useMemo(
    () => buildLegnDashboardData(moduleData, resolvedPeriod, scenario, valuationOverrides),
    [moduleData, resolvedPeriod, scenario, valuationOverrides],
  );
  const summary = useMemo(() => module.calculateSummary(runtimeData), [runtimeData, module]);
  const effectiveDataSourceType = resolveLegnEffectiveDataSourceType(runtimeData);
  const apiModeEnabled = isLegnApiModeEnabled();

  useEffect(() => {
    if (!apiModeEnabled) return;
    let cancelled = false;
    fetchLegnBackendBundle()
      .then((bundle) => {
        if (!cancelled) {
          setBackendBundle(bundle);
          setBackendError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) setBackendError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [apiModeEnabled]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      try {
        const response = await fetch(
          `${getLegnBackendApiBase()}/api/stocks/legn/historical-valuations?scenario=Base`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`LEGN backend returned ${response.status}`);
        const payload = (await response.json()) as LegnHistoricalValuationResponse;
        const rows = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setHistoricalValuations(rows);
        setSelectedHistoricalEventId((current) => current ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[0]?.event.id ?? null);
        setHistoricalStatus("online");
      } catch (error) {
        if (controller.signal.aborted) return;
        setHistoricalValuations([]);
        setHistoricalStatus("offline");
        setHistoricalError(error instanceof Error ? error.message : String(error));
      }
    }
    loadHistoricalValuations();
    return () => controller.abort();
  }, []);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as LegnValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="LEGN Research Cockpit"
        description="Legend Biotech is modeled as a CARVYKTI commercialization and stage-gated biotech NAV story: gross NTS first, collaboration economics second, pipeline/platform option value last."
        badge={<DataQualityBadge badge={effectiveDataSourceType === "manual" ? "Assumption" : "Actual"} />}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            CARVYKTI net trade sales are kept separate from Legend reported revenue. Q1 2026 $597m is flagged as preliminary and never treated as reported revenue.
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            The primary valuation is a biotech NAV stack. Terminal-growth DCF is intentionally excluded; EV/NTS and EV/rNPV are shown only as cross-checks.
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

      {apiModeEnabled ? (
        <SectionCard
          title="Backend API Mode"
          description="Feature-flagged unified backend view using /api/stocks/legn/events, /snapshot and /historical-valuations."
          badge={<DataQualityBadge badge={backendError ? "Needs Review" : "Actual"} />}
        >
          {backendError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{backendError}</div>
          ) : backendBundle ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Reporting events</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{backendBundle.events.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Historical valuations</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{backendBundle.historicalValuations.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Loaded at</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{backendBundle.loadedAt}</p>
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {backendBundle.events.map((event) => {
                  const row = event as { id?: string; label?: string; eventDate?: string; fiscalPeriod?: string };
                  return (
                    <div key={row.id ?? row.eventDate} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <div className="font-semibold text-ink">{row.label ?? row.fiscalPeriod ?? row.id}</div>
                      <div className="text-xs text-slate-500">{row.eventDate}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Loading LEGN backend snapshot...</div>
          )}
        </SectionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((metric) => <MetricCard key={metric.key} metric={metric} currency="USD" />)}
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
          <SectionCard title="Cockpit" description="Thesis, fair value range, top drivers, risks and catalysts in one page.">
            <CockpitPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="carvykti" className="mt-6">
          <SectionCard title="CARVYKTI Commercial Engine" description="Gross net trade sales, US/OUS split, site expansion, patient funnel and demand-versus-capacity.">
            <CarvyktiCommercialPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="collaboration" className="mt-6">
          <SectionCard title="Collaboration Economics" description="CARVYKTI NTS to Legend revenue, profit contribution, cost burden and Janssen advance recoupment.">
            <CollaborationEconomicsPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="earnings-call" className="mt-6">
          <SectionCard title="Earnings Call" description="Eight-quarter call intelligence with scrollable quarter selection and AI synthesis of changing market focus.">
            <EarningsCallPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="clinical" className="mt-6">
          <SectionCard title="Clinical Evidence Lab" description="CARTITUDE evidence matrix, clinical moat score and FDA safety-label frame.">
            <ClinicalEvidencePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="label" className="mt-6">
          <SectionCard title="Label Expansion Lab" description="CARTITUDE-5/6/10 frontline and regimen-optimization value with double-count guardrail.">
            <LabelExpansionPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="solid-tumor" className="mt-6">
          <SectionCard title="Solid Tumor CAR-T Lab" description="LB1908, LB2102 and GCC remain high-discount option value only.">
            <SolidTumorCartPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="pipeline" className="mt-6">
          <SectionCard title="Pipeline rNPV" description="Asset-level rNPV with research-only peak sales, POS and stage discount rates visible.">
            <PipelineRnpvPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="manufacturing" className="mt-6">
          <SectionCard title="Manufacturing & Access" description="Dose capacity, OOS, success rate, treatment-center throughput and capacity-constrained revenue.">
            <ManufacturingAccessPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <LegnHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <LegnBacktestPanel />
          <SectionCard title="Valuation" description="LEGN biotech NAV stack with sensitivity table and market-implied assumptions.">
            <ValuationPanel dashboard={dashboard} />
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency="USD"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="risk" className="mt-6">
          <SectionCard title="Risk Red Team" description="Risk heatmap, kill criteria and thesis-monitoring triggers.">
            <RiskRedTeamPanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="evidence" className="mt-6">
          <SectionCard title="Evidence" description="Source map with official, transcript, clinical, market-data and research-only flags.">
            <EvidencePanel dashboard={dashboard} />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function LegnHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: LegnHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows.some((row) => ["quarterly_results", "commercial_update"].includes(row.event.eventType))
    ? rows.filter((row) => ["quarterly_results", "commercial_update"].includes(row.event.eventType))
    : rows;
  const [visibleCount, setVisibleCount] = useState(16);
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: compactPeriodLabel(row.event).replace(" preliminary", " prelim"),
      fiscalPeriod: compactPeriodLabel(row.event),
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
      title="LEGN Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event. Static dashboard valuation remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <LegnMiniCard label="Saved Runs" value={String(savedRuns)} subtext="Base runs persisted by event" badge="Actual" />
        <LegnMiniCard label="Reporting Events" value={String(displayRows.length || "n/a")} subtext="Quarterly and commercial events" badge="Actual" />
        <LegnMiniCard label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? formatUsdPerAds(selected.valuationRun.fairValue) : "n/a"} subtext="Backend persisted value" badge="Derived" />
        <LegnMiniCard label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? formatPct(selected.valuationRun.upsideDownside) : "n/a"} subtext="Fair value vs event price" badge="Derived" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static LEGN dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the chart while the event row remains scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 16, 24, displayRows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === displayRows.length ? "All" : `${count}Q`}
                  </button>
                ))}
              </div>
            </div>
            <input
              aria-label="Visible history window"
              className="mt-4 h-2 w-full accent-sky-600"
              type="range"
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={Math.min(visibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <LegnMiniCard label="Visible Window" value={`${visibleRows.length} events`} subtext={`${visibleRows[0] ? compactPeriodLabel(visibleRows[0].event) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? compactPeriodLabel(visibleRows[visibleRows.length - 1].event) : "n/a"}`} badge="Actual" />
              <LegnMiniCard label="Latest Gap" value={latestVisibleGap != null ? formatPct(latestVisibleGap) : "n/a"} subtext="Fair value gap in latest visible event" badge="Derived" />
              <LegnMiniCard label="Average Gap" value={averageVisibleGap != null ? formatPct(averageVisibleGap) : "n/a"} subtext="Average model discount / premium" badge="Derived" />
            </div>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-4">
            {displayRows.map((row) => {
              const active = row.event.id === selected?.event.id;
              return (
                <button
                  key={row.event.id}
                  type="button"
                  onClick={() => onSelectEvent(row.event.id)}
                  className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-sky-500 bg-sky-50 text-sky-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{compactPeriodLabel(row.event)}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-10 border-t border-slate-100 pt-8">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.title ?? selected.event.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <LegnMiniCard label="Event Date" value={selected.event.eventDate} subtext={selected.event.eventType.replace(/_/g, " ")} badge="Actual" />
                  <LegnMiniCard label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} subtext="Daily market-data anchor where available" badge="Actual" />
                  <LegnMiniCard label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} subtext="Persisted target price" badge="Derived" />
                  <LegnMiniCard label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? formatPct(selected.valuationRun.expectedShareholderCagr) : "n/a"} subtext="Backend persisted return" badge="Derived" />
                </div>
                <LegnTable
                  headers={["Method", "Value", "Description"]}
                  rows={methodRows.map((row) => [
                    row.label ?? row.key ?? "Method",
                    typeof row.value === "number" ? (row.format === "percent" ? formatPct(row.value) : usd(row.value)) : "n/a",
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

              <div className="mt-6">
                <ChartPanel title="As-of Price vs Fair Value">
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={chartRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number, name: string) => name === "Gap" ? formatPct(value) : usd(value)}
                        labelFormatter={(label, payload) => {
                          const gap = payload?.[0]?.payload?.gapPct;
                          const fiscal = payload?.[0]?.payload?.fiscalPeriod;
                          return `${label}${fiscal ? ` (${fiscal})` : ""}${typeof gap === "number" ? ` | Gap ${formatPct(gap)}` : ""}`;
                        }}
                      />
                      <Legend />
                      <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                      <Bar dataKey="fairValue" fill="#0284c7" name="Fair value" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </div>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading LEGN historical valuation runs from the unified backend.</p>
      ) : null}
    </SectionCard>
  );
}

function LegnBacktestPanel() {
  const [startDate, setStartDate] = useState("2021-06-01");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LegnBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const response = await fetch(`${getLegnBackendApiBase()}/api/stocks/legn/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`LEGN backend returned ${response.status}`);
      const payload = (await response.json()) as LegnBacktestResult;
      setResult(payload);
      setStatus(payload.status === "insufficient_data" ? "error" : "done");
      setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : null);
    } catch (caught) {
      setStatus("error");
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message === "Failed to fetch" ? "Historical data is temporarily unavailable." : message);
    }
  }, [endDate, startDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({
      ...row,
      stockReturn: ((row.legnBuyHold ?? row.stock ?? 1) - 1) * 100,
      spyReturn: (row.spy - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};
  const stockMetrics = metrics.legnBuyHold ?? {};

  return (
    <SectionCard
      title="LEGN vs SPY Backtest"
      description="Select a date range and compare daily LEGN buy-and-hold performance against SPY from backend price history."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-sky-50 text-sky-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
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
          className="self-end rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
          <ChartPanel title="LEGN vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="stockReturn" dot={false} stroke="#0284c7" strokeWidth={2.5} name="LEGN" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <LegnMiniCard label="Stock CAGR" value={stockMetrics.cagr != null ? formatPct(stockMetrics.cagr) : "n/a"} subtext="LEGN buy-and-hold" badge="Derived" />
              <LegnMiniCard label="SPY CAGR" value={metrics.spy?.cagr != null ? formatPct(metrics.spy.cagr) : "n/a"} subtext="Benchmark" badge="Derived" />
              <LegnMiniCard label="Stock MDD" value={stockMetrics.maxDrawdown != null ? formatPct(stockMetrics.maxDrawdown) : "n/a"} subtext="Maximum drawdown" badge="Derived" />
              <LegnMiniCard label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? formatPct(metrics.spy.maxDrawdown) : "n/a"} subtext="Maximum drawdown" badge="Derived" />
              <LegnMiniCard label="Stock Sharpe" value={stockMetrics.sharpe != null ? stockMetrics.sharpe.toFixed(2) : "n/a"} subtext="Zero risk-free rate" badge="Derived" />
              <LegnMiniCard label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} subtext="Zero risk-free rate" badge="Derived" />
              <LegnMiniCard label="Stock Vol" value={stockMetrics.volatility != null ? formatPct(stockMetrics.volatility) : "n/a"} subtext="Annualized daily vol" badge="Derived" />
              <LegnMiniCard label="SPY Vol" value={metrics.spy?.volatility != null ? formatPct(metrics.spy.volatility) : "n/a"} subtext="Annualized daily vol" badge="Derived" />
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

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
