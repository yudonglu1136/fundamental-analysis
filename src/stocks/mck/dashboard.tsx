import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import {
  attachMckRuntimeContext,
  buildMckDashboardData,
  defaultMckAssumptions,
  resolveMckDataset,
  type MckResearchAssumptions,
} from "./calculations";
import { BiopharmaServicesEngine } from "./components/BiopharmaServicesEngine";
import { BusinessSegmentDashboard } from "./components/BusinessSegmentDashboard";
import { BuybackEngine } from "./components/BuybackEngine";
import { CapitalAllocationPanel } from "./components/CapitalAllocationPanel";
import { EarningsCallIntelligence } from "./components/EarningsCallIntelligence";
import { MarginBridgePanel } from "./components/MarginBridgePanel";
import { MckCapitalReturnsBackendPanel } from "./components/MckCapitalReturnsBackendPanel";
import { MiniMetric, money, pct, SignalPill } from "./components/MckPrimitives";
import { PeerComparisonPanel } from "./components/PeerComparisonPanel";
import { PharmaceuticalDistributionEngine } from "./components/PharmaceuticalDistributionEngine";
import { PrescriptionTechnologyEngine } from "./components/PrescriptionTechnologyEngine";
import { ResearchMemoPanel } from "./components/ResearchMemoPanel";
import { RiskDashboard } from "./components/RiskDashboard";
import { ScenarioLab } from "./components/ScenarioLab";
import { SpecialtyOncologyEngine } from "./components/SpecialtyOncologyEngine";
import { ValuationDashboard } from "./components/ValuationDashboard";
import { WorkingCapitalDashboard } from "./components/WorkingCapitalDashboard";

function loadSavedMckAssumptions() {
  if (typeof window === "undefined") return defaultMckAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-MCK");
  if (!saved) return defaultMckAssumptions;
  try {
    return { ...defaultMckAssumptions, ...(JSON.parse(saved) as Partial<MckResearchAssumptions>) };
  } catch {
    return defaultMckAssumptions;
  }
}

function ratingFromMos(marginOfSafety: number) {
  if (marginOfSafety >= 0.15) return "Attractive";
  if (marginOfSafety >= 0) return "Watch";
  if (marginOfSafety > -0.15) return "Expensive";
  return "Avoid";
}

type MckBackendReportingEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod: string;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  eventType: string;
  label: string;
  title?: string | null;
  sourceType?: string;
};

type MckBackendMethodOutput = {
  key?: string;
  label?: string;
  value?: number;
  format?: string;
  description?: string;
};

type MckBackendWarning = {
  id?: string;
  title?: string;
  severity?: string;
  detail?: string;
};

type MckBackendValuationRun = {
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
  methodOutputsJson: MckBackendMethodOutput[];
  warningsJson: MckBackendWarning[];
  dataSnapshotJson: {
    valuationPeriodId?: string;
    valuationPeriodType?: string;
    priceDate?: string;
    financialPeriodCount?: number;
    segmentFinancialCount?: number;
    backendFcfPolicy?: string;
    guidanceItemCount?: number;
    transcriptExtractionCount?: number;
    adapterWarnings?: string[];
    sourcePolicy?: {
      guidanceAutoPromotion?: string;
      transcriptValuationImpact?: string;
    };
    asOfPriceSource?: {
      priceDate?: string;
      currentPrice?: number;
      close?: number;
      source?: string;
      sourceType?: string;
      adjustedCloseAvailable?: boolean;
    } | null;
  };
};

type MckBackendHistoricalValuation = {
  event: MckBackendReportingEvent;
  valuationRun: MckBackendValuationRun | null;
};

type MckBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type MckBacktestCurvePoint = {
  date: string;
  spy: number;
  benchmark?: number;
  mckBuyHold: number;
};

type MckBacktestResult = {
  status?: string;
  startDate?: string;
  endDate?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    mckBuyHold?: MckBacktestMetricSet;
    spy?: MckBacktestMetricSet;
  };
  curve?: MckBacktestCurvePoint[];
  warnings?: string[];
};

export function MckDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [assumptions, setAssumptions] = useState<MckResearchAssumptions>(loadSavedMckAssumptions);
  const [historicalValuations, setHistoricalValuations] = useState<MckBackendHistoricalValuation[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);
  const moduleData = useMemo(() => resolveMckDataset(module.data), [module.data]);
  const runtimeData = useMemo(() => attachMckRuntimeContext(moduleData, { periodId: period }), [moduleData, period]);
  const dashboard = useMemo(() => buildMckDashboardData(runtimeData, assumptions, scenario), [assumptions, runtimeData, scenario]);
  const rating = ratingFromMos(dashboard.valuation.marginOfSafety);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setAssumptions(next as MckResearchAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      try {
        const apiBase = import.meta.env.VITE_MCK_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
        const response = await fetch(
          `${apiBase}/api/mck/historical-valuations?scenario=Base&modelVersion=mck_v1_backend_pilot`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`MCK backend returned ${response.status}`);
        const payload = (await response.json()) as { historicalValuations?: MckBackendHistoricalValuation[] };
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

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="bg-ink px-6 py-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-100">MCK / McKesson</p>
              <h1 className="mt-1 text-3xl font-semibold">Healthcare Distribution Compounder Workbench</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">
                Built for MCK's low-margin, high-turnover, specialty/oncology, Rx technology, working-capital and buyback-driven business model.
              </p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-200">Investment rating</p>
              <p className="mt-1 text-2xl font-semibold">{rating}</p>
              <p className="text-sm text-slate-200">Base FV {money(dashboard.valuation.blendedFairValue, 0)}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-4 xl:grid-cols-8">
          <MiniMetric label="Price" value={money(assumptions.currentPrice, 2)} subtext={moduleData.market.priceDate} badge="Actual" />
          <MiniMetric label="Market cap" value={`$${(moduleData.market.marketCap / 1000).toFixed(1)}B`} badge="Actual" />
          <MiniMetric label="Forward P/E" value={`${moduleData.market.forwardPe.toFixed(1)}x`} badge="Derived" />
          <MiniMetric label="FCF yield" value={pct(moduleData.market.fcfYield)} badge="Derived" />
          <MiniMetric label="Dividend yield" value={pct(moduleData.market.dividendYield)} badge="Actual" />
          <MiniMetric label="Buyback yield" value={pct(dashboard.buyback.buybackYield)} badge="Derived" />
          <MiniMetric label="Net debt / EBITDA" value={`${moduleData.market.netDebtToEbitda.toFixed(1)}x`} badge="Placeholder" />
          <MiniMetric label="52w high / low" value={`${money(moduleData.market.fiftyTwoWeekHigh, 0)} / ${money(moduleData.market.fiftyTwoWeekLow, 0)}`} badge="Actual" />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((metric) => (
          <MetricCard key={metric.key} metric={metric} currency="USD" />
        ))}
      </div>

      <SectionCard
        title="Data Layer Status"
        description={`Active source selector: ${dataSourceType}. Official FY2026/FY2025 releases are actuals; market, peer, share-count and transcript gaps stay visible.`}
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Needs Review" : "Placeholder"} />}
      >
        <div className="grid gap-4 md:grid-cols-4">
          <MiniMetric label="Missing fields" value={dashboard.dataStatus.missingFields.length} subtext={dashboard.dataStatus.missingFields.join(", ") || "None"} />
          <MiniMetric label="Warnings" value={dashboard.dataStatus.validationWarnings.length} subtext="High-severity warnings are shown in validation and valuation panels" />
          <MiniMetric label="Last official update" value={dashboard.dataStatus.lastUpdated} />
          <MiniMetric label="Valuation reliable" value={dashboard.dataStatus.valuationReliable ? "Reviewable" : "Needs source refresh"} />
        </div>
      </SectionCard>

      <SectionCard title="Investment Thesis Snapshot" description="Five underwriting claims with evidence, metric, and risk flag.">
        <div className="grid gap-4 lg:grid-cols-5">
          {dashboard.thesis.map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink">{item.title}</p>
                <SignalPill signal={item.signal} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.evidence}</p>
              <p className="mt-3 text-sm font-semibold text-ink">{item.metric}</p>
              <p className="mt-1 text-xs leading-5 text-rose-700">{item.riskFlag}</p>
            </div>
          ))}
        </div>
      </SectionCard>

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

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <BusinessSegmentDashboard data={dashboard.segmentEconomics} />
          <SpecialtyOncologyEngine dashboard={dashboard} />
          <ResearchMemoPanel dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <BusinessSegmentDashboard data={dashboard.segmentEconomics} />
          <PharmaceuticalDistributionEngine data={dashboard.distributionEconomics} />
          <SpecialtyOncologyEngine dashboard={dashboard} />
          <PrescriptionTechnologyEngine dashboard={dashboard} />
          <BiopharmaServicesEngine dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="fcf-buyback" className="mt-6 space-y-6">
          <WorkingCapitalDashboard data={dashboard.workingCapital} />
          <MckCapitalReturnsBackendPanel fallback={dashboard.capitalAllocation} />
          <CapitalAllocationPanel dashboard={dashboard} />
          <BuybackEngine data={dashboard.buyback} />
        </Tabs.Content>

        <Tabs.Content value="margin" className="mt-6 space-y-6">
          <MarginBridgePanel data={dashboard.marginBridge} />
          <PharmaceuticalDistributionEngine data={dashboard.distributionEconomics} />
        </Tabs.Content>

        <Tabs.Content value="peers" className="mt-6">
          <PeerComparisonPanel peers={dashboard.peers} />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <MckHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <MckBacktestPanel />
          <ValuationDashboard valuation={dashboard.valuation} />
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency="USD"
            values={assumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="scenario-lab" className="mt-6">
          <ScenarioLab scenarios={dashboard.scenarios} />
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6">
          <RiskDashboard risks={dashboard.risks} />
        </Tabs.Content>

        <Tabs.Content value="earnings-call" className="mt-6">
          <EarningsCallIntelligence dashboard={dashboard} />
        </Tabs.Content>

        <Tabs.Content value="memo" className="mt-6">
          <ResearchMemoPanel dashboard={dashboard} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function fiscalPeriodLabel(event: MckBackendReportingEvent, compact = false) {
  const match = event.fiscalPeriod?.match(/FY(\d{4})\s+Q([1-4])/i);
  if (!match) return event.fiscalPeriod ?? event.eventDate;
  return compact ? `FY${match[1].slice(2)} Q${match[2]}` : `FY${match[1]} Q${match[2]}`;
}

function MckHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: MckBackendHistoricalValuation[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(8);
  const displayRows = rows;
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: fiscalPeriodLabel(row.event, true),
      fiscalPeriod: row.event.fiscalPeriod,
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
  const averageVisibleGap = visibleGapRows.length ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length : null;
  const run = selected?.valuationRun ?? null;
  const methodRows = run?.methodOutputsJson ?? [];
  const warnings = run?.warningsJson ?? [];
  const snapshot = run?.dataSnapshotJson ?? {};
  const priceSource = snapshot.asOfPriceSource ?? null;
  const adapterWarnings = snapshot.adapterWarnings ?? [];
  const sourceQualityRows = [
    ["Event date", selected?.event.eventDate ?? snapshot.priceDate ?? "n/a", "Historical rows are evaluated as of the reporting event date."],
    [
      "Daily price anchor",
      priceSource?.priceDate ? `${priceSource.priceDate} | ${priceSource.source ?? "market data"}` : "market snapshot fallback",
      priceSource?.adjustedCloseAvailable === false
        ? `Unadjusted close source (${priceSource.sourceType ?? "unknown source type"}); dividend-adjustment gap remains visible.`
        : "Adjusted price source is available where backend vendor data supports it.",
    ],
    [
      "Snapshot rows",
      `${snapshot.financialPeriodCount ?? 0} financial / ${snapshot.segmentFinancialCount ?? 0} segment / ${snapshot.guidanceItemCount ?? 0} guidance / ${snapshot.transcriptExtractionCount ?? 0} transcript`,
      "Counts come from the persisted backend snapshot selected for this event.",
    ],
    [
      "Valuation period",
      `${snapshot.valuationPeriodId ?? "n/a"} | ${snapshot.valuationPeriodType ?? "n/a"}`,
      snapshot.backendFcfPolicy ?? "No FCF policy metadata was supplied.",
    ],
    [
      "Guidance policy",
      snapshot.sourcePolicy?.guidanceAutoPromotion ?? "n/a",
      "Guidance is not promoted into valuation unless reviewed assumptions explicitly allow it.",
    ],
    [
      "Transcript policy",
      snapshot.sourcePolicy?.transcriptValuationImpact ?? "n/a",
      "Transcript commentary remains research-only unless promoted through a reviewed assumption path.",
    ],
    [
      "Backend coverage",
      `${savedRuns}/${displayRows.length} events with Base runs`,
      displayRows.length >= 32
        ? "Quarterly-event target met."
        : "Short of the 32-quarter ideal; current backend coverage is a curated event set and should not be described as full eight-year quarterly coverage.",
    ],
  ];

  return (
    <SectionCard
      title="MCK Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event from the MCK SQLite backend pilot. Static dashboard data remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-5">
        <ScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <ScoreBlock label="Reporting Events" value={displayRows.length || "n/a"} note="Last eight imported quarters" />
        <ScoreBlock label="Selected Fair Value" value={run?.fairValue != null ? money(run.fairValue, 0) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={run?.upsideDownside != null ? pct(run.upsideDownside) : "n/a"} note="Fair value vs event price" />
        <ScoreBlock label="Selected Price" value={run?.currentPrice != null ? money(run.currentPrice, 1) : "n/a"} note={run?.dataSnapshotJson?.priceDate ?? "Event as-of price"} />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static MCK dashboard sections still render.
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
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
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
              value={Math.min(visibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? fiscalPeriodLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? fiscalPeriodLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium in visible window" />
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
                  <span className="mt-1 block font-semibold">{fiscalPeriodLabel(row.event, true)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.label ?? selected.event.title ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={run?.currentPrice != null ? money(run.currentPrice, 1) : "n/a"} note="Daily market data where available" />
                  <ScoreBlock label="3Y Target" value={run?.targetPrice3Y != null ? money(run.targetPrice3Y, 0) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={run?.expectedShareholderCagr != null ? pct(run.expectedShareholderCagr) : "n/a"} note="Backend scenario output" />
                </div>
                <DataTable
                  headers={["Method", "Value", "Description"]}
                  rows={methodRows.map((row) => [
                    row.label ?? row.key ?? "Method",
                    typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : money(row.value, 0)) : "n/a",
                    row.description ?? "",
                  ])}
                />
                {warnings.length ? (
                  <div className="mt-4 space-y-2">
                    {warnings.map((warning, index) => (
                      <div key={`${warning.title ?? "warning"}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">{warning.title ?? "Backend warning"}</p>
                        {warning.detail ? <p className="mt-1 leading-6">{warning.detail}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {adapterWarnings.length ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    <p className="font-semibold text-ink">Backend Adapter Notes</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {adapterWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
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
                      formatter={(value: number, name: string) => name === "Gap" ? pct(value) : money(value, 1)}
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
              <div className="xl:col-span-2">
                <DataTable
                  headers={["Audit Field", "Value", "Operator Note"]}
                  rows={sourceQualityRows}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading MCK historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function MckBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-01");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MckBacktestResult | null>(null);
  const autoRunStarted = useRef(false);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_MCK_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
      const requestBody = JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" });
      const endpoints = [`${apiBase}/api/stocks/mck/backtests`, `${apiBase}/api/mck/backtests`];
      let payload: MckBacktestResult | null = null;
      let lastError: Error | null = null;

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          });
          if (!response.ok) throw new Error(`MCK backend returned ${response.status} for ${endpoint}`);
          payload = (await response.json()) as MckBacktestResult;
          if (Array.isArray(payload.curve) && payload.curve.length > 1) break;
          lastError = new Error("MCK backend returned a stub backtest without a performance curve. Restart npm run api:dev so the unified backend loads the MCK backtest service.");
        } catch (caught) {
          lastError = caught instanceof Error ? caught : new Error(String(caught));
        }
      }

      if (!payload || (!Array.isArray(payload.curve) && payload.status !== "insufficient_data")) {
        throw lastError ?? new Error("MCK backend did not return a usable backtest result.");
      }
      if (payload.status !== "insufficient_data" && (!Array.isArray(payload.curve) || payload.curve.length < 2)) {
        throw lastError ?? new Error("MCK backend did not return enough curve points for charting.");
      }

      setResult(payload);
      setStatus(payload.status === "insufficient_data" ? "error" : "done");
      setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : null);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [endDate, startDate]);

  useEffect(() => {
    if (autoRunStarted.current) return;
    autoRunStarted.current = true;
    runBacktest();
  }, [runBacktest]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({
      ...row,
      spyReturn: (row.spy - 1) * 100,
      mckReturn: (row.mckBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="MCK vs SPY Backtest"
      description="Select a date range and compare daily MCK buy-and-hold performance against SPY from backend price history."
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
          <ChartPanel title="MCK vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="mckReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="MCK" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="MCK CAGR" value={metrics.mckBuyHold?.cagr != null ? pct(metrics.mckBuyHold.cagr) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="MCK MDD" value={metrics.mckBuyHold?.maxDrawdown != null ? pct(metrics.mckBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="MCK Sharpe" value={metrics.mckBuyHold?.sharpe != null ? metrics.mckBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="MCK Vol" value={metrics.mckBuyHold?.volatility != null ? pct(metrics.mckBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
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

function ScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
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

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
