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
  attachBaRuntimeContext,
  buildBaDashboardData,
  defaultBaValuationAssumptions,
  resolveBaDataset,
} from "./calculations";
import type { BaMarketFocusTheme, BaProgramStage, BaRiskLevel, BaValuationAssumptions } from "./model";

function loadSavedBaValuationAssumptions() {
  if (typeof window === "undefined") return defaultBaValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-BA.L");
  if (!saved) return defaultBaValuationAssumptions;
  try {
    return {
      ...defaultBaValuationAssumptions,
      ...(JSON.parse(saved) as Partial<BaValuationAssumptions>),
    };
  } catch {
    return defaultBaValuationAssumptions;
  }
}

function gbp(value: number) {
  return `£${value.toFixed(2)}`;
}

function gbpm(value: number) {
  return `£${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`;
}

function gbpb(value: number) {
  return `£${(value / 1_000).toFixed(1)}bn`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function multiple(value: number) {
  return `${value.toFixed(2)}x`;
}

export function BaDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const [programSegment, setProgramSegment] = useState("All");
  const [programStage, setProgramStage] = useState<BaProgramStage | "All">("All");
  const [programRisk, setProgramRisk] = useState<BaRiskLevel | "All">("All");
  const [selectedReportingQuarter, setSelectedReportingQuarter] = useState("2026-Q2");
  const [valuationAssumptions, setValuationAssumptions] = useState<BaValuationAssumptions>(
    loadSavedBaValuationAssumptions,
  );

  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveBaDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () =>
      attachBaRuntimeContext(moduleData, {
        periodId: resolvedPeriod,
        dataSourceType,
      }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const dashboard = useMemo(() => buildBaDashboardData(runtimeData, resolvedPeriod, scenario), [runtimeData, resolvedPeriod, scenario]);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as BaValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  const segmentChartRows = useMemo(
    () =>
      dashboard.segment.rows
        .filter((row) => row.segment !== "HQ" && row.segment !== "Intra-group")
        .map((row) => ({
          segment: row.segment,
          sales: row.sales,
          ebit: row.underlyingEbit ?? 0,
          margin: (row.underlyingEbitMargin ?? 0) * 100,
          backlog: row.orderBacklog ?? 0,
          quality: row.qualityScore,
        })),
    [dashboard.segment.rows],
  );

  const backlogTrendRows = dashboard.dataset.periods.map((row) => ({
    year: row.fiscalYear,
    backlog: row.orderBacklog,
    orderIntake: row.orderIntake,
    sales: row.sales,
    bookToBill: row.orderIntake / row.sales,
    coverage: row.orderBacklog / row.sales,
  }));

  const selectedPrograms = dashboard.programs.programs.filter((program) => {
    const segmentMatch = programSegment === "All" || program.segment === programSegment;
    const stageMatch = programStage === "All" || program.stage === programStage;
    const riskMatch = programRisk === "All" || program.executionRiskLabel === programRisk;
    return segmentMatch && stageMatch && riskMatch;
  });
  const selectedReportingEvent =
    dashboard.reportingEvents.events.find((event) => event.quarter === selectedReportingQuarter) ??
    dashboard.reportingEvents.latest;

  const focusThemes: BaMarketFocusTheme[] = [
    "Backlog & order intake",
    "Guidance",
    "Cash conversion",
    "Programme execution",
    "Defence budgets",
    "Space / electronics",
    "Capital returns",
  ];

  const valuationRows = [
    { method: "DCF", value: dashboard.valuationEngine.dcf.fairValuePerShare, weight: dashboard.valuationEngine.finalWeights.dcf },
    { method: "FCF Yield", value: dashboard.valuationEngine.fcfYieldFairValue, weight: dashboard.valuationEngine.finalWeights.fcfYield },
    { method: "EV / EBIT", value: dashboard.valuationEngine.evEbitFairValue, weight: dashboard.valuationEngine.finalWeights.evEbit },
    { method: "P/E", value: dashboard.valuationEngine.peFairValue, weight: dashboard.valuationEngine.finalWeights.pe },
    { method: "Backlog Layer", value: dashboard.valuationEngine.backlogAdjustedFairValue, weight: dashboard.valuationEngine.finalWeights.backlogDurability },
  ];
  const baApiMode = import.meta.env.VITE_BA_API_MODE === "true";
  const baApiBaseUrl =
    (import.meta.env.VITE_BA_API_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    "http://127.0.0.1:8787";
  const [apiStatus, setApiStatus] = useState<"loading" | "online" | "offline">("loading");
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiEvents, setApiEvents] = useState<any[]>([]);
  const [apiHistorical, setApiHistorical] = useState<any[]>([]);
  const [apiSnapshot, setApiSnapshot] = useState<any | null>(null);
  const [apiSelectedEventId, setApiSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setApiStatus("loading");
    setApiError(null);
    Promise.all([
      fetch(`${baApiBaseUrl}/api/stocks/ba/events`).then((response) => response.json()),
      fetch(`${baApiBaseUrl}/api/stocks/ba/historical-valuations?scenario=Base`).then((response) => response.json()),
    ])
      .then(([eventsResponse, historicalResponse]) => {
        if (cancelled) return;
        const events = eventsResponse.events ?? [];
        setApiEvents(events);
        setApiHistorical(historicalResponse.historicalValuations ?? []);
        setApiSelectedEventId((current) => current ?? events[0]?.id ?? historicalResponse.historicalValuations?.[0]?.event?.id ?? null);
        setApiStatus("online");
      })
      .catch((error) => {
        if (cancelled) return;
        setApiStatus("offline");
        setApiError(error instanceof Error ? error.message : "API load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [baApiBaseUrl]);

  useEffect(() => {
    if (!baApiMode || !apiSelectedEventId) return;
    let cancelled = false;
    fetch(`${baApiBaseUrl}/api/stocks/ba/snapshot?eventId=${encodeURIComponent(apiSelectedEventId)}`)
      .then((response) => response.json())
      .then((snapshot) => {
        if (!cancelled) setApiSnapshot(snapshot);
      })
      .catch(() => {
        if (!cancelled) setApiSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSelectedEventId, baApiBaseUrl, baApiMode]);

  const apiSelectedHistorical =
    apiHistorical.find((row) => row.event?.id === apiSelectedEventId) ??
    apiHistorical[0] ??
    null;
  const apiRun = apiSelectedHistorical?.valuationRun;
  const apiEvent = apiSelectedHistorical?.event ?? apiEvents.find((event) => event.id === apiSelectedEventId);
  const apiFinancial = apiSnapshot?.financialPeriods?.at?.(-1);
  const apiBacklog = apiSnapshot?.orderBacklogSnapshots?.at?.(-1);
  const apiIntake = apiSnapshot?.orderIntakeSnapshots?.at?.(-1);
  const apiGuidance = (apiSnapshot?.guidanceItems ?? []).slice(0, 6);
  const apiTranscript = apiSnapshot?.transcriptExtractions?.[0];

  return (
    <div className="space-y-6">
      <SectionCard
        title="BAE Systems Defense Research Cockpit"
        description={`Official actuals are anchored to FY2025 results and Annual Report 2025. The dashboard separates official data, guidance, forecast assumptions, research-only notes, and market data for BA.L.`}
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Actual" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Recommended Fair Value" value={gbp(dashboard.valuation.recommendedFairValue ?? 0)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs current price`} />
          <ScoreBlock label="Current Price" value={gbp(dashboard.dataset.marketData.currentPriceGbp)} note={`${dashboard.dataset.marketData.priceDate} IR snapshot`} />
          <ScoreBlock label="Backlog" value={gbpb(dashboard.backlog.totalBacklog)} note={`${multiple(dashboard.backlog.backlogCoverageYears)} FY2025 sales`} />
          <ScoreBlock label="Book-to-Bill" value={multiple(dashboard.backlog.bookToBill)} note="FY2025 order intake / sales" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <InsightPanel title="Investment Thesis" text="BAE is a cash-generative defence prime with record backlog, multi-domain exposure, and sovereign programme stickiness across air, maritime, electronic systems, land, munitions, cyber, and space." />
          <InsightPanel title="Key Debate" text="The central debate is whether elevated defence budgets convert into durable FCF/share compounding, or whether procurement delay, shipyard complexity, and working-capital timing absorb the headline demand." />
          <InsightPanel title="What Market May Miss" text="Backlog quality matters more than a simple defence-spending narrative: Air, Maritime, and Electronic Systems have different duration, margin, and execution-risk profiles." />
          <InsightPanel title="Main Risks" text={dashboard.risks.redTeamVerdict} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="GBP" />
        ))}
      </div>

      <SectionCard title="Data Boundary" description="Research-only programme and risk notes support interpretation and scenario design, but they do not flow directly into valuation unless mapped through explicit assumptions.">
        <div className="grid gap-4 lg:grid-cols-3">
          <BulletPanel title="Official Actuals" items={[
            "FY2025 sales, EBIT, EPS, FCF, order intake, backlog, order book, net debt, dividend, and segment financials.",
            "Segment sales, EBIT, cash flow, order intake, backlog, and order book are kept as official actuals where disclosed.",
          ]} />
          <BulletPanel title="Guidance & Assumptions" items={[
            "FY2026 sales, EBIT, EPS, FCF floor, tax, net finance costs, NCI, FX sensitivity, and segment guidance are management guidance.",
            "DCF WACC, terminal growth, multiples, and normalized FCF conversion are analyst forecast assumptions.",
          ]} />
          <BulletPanel title="Current Gaps" items={dashboard.dataStatus.missingFields} />
        </div>
      </SectionCard>

      {baApiMode ? (
        <BaApiModePanel
          status={apiStatus}
          events={apiEvents}
          selectedEventId={apiSelectedEventId}
          onSelectEvent={setApiSelectedEventId}
          selectedEvent={apiEvent}
          valuationRun={apiRun}
          snapshot={apiSnapshot}
          financial={apiFinancial}
          backlog={apiBacklog}
          intake={apiIntake}
          guidance={apiGuidance}
          transcript={apiTranscript}
        />
      ) : null}

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 data-[state=active]:bg-ink data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="executive" className="mt-6 space-y-6">
          <SectionCard title="Executive Snapshot" description="PM-level read-through across price, fair value, cash yield, backlog, and balance-sheet capacity.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Market Cap" value={gbpb(dashboard.dataset.marketData.marketCap)} note="Derived from price x FY2025 EPS shares" />
              <ScoreBlock label="FCF Yield" value={pct(dashboard.dataset.marketData.fcfYield)} note="FY2025 FCF / derived market cap" />
              <ScoreBlock label="Dividend Yield" value={pct(dashboard.dataset.marketData.dividendYield)} note="FY2025 DPS / current price" />
              <ScoreBlock label="Forward P/E" value={`${dashboard.dataset.marketData.forwardPe.toFixed(1)}x`} note="Market snapshot / FY2026 EPS guidance proxy" />
              <ScoreBlock label="Revenue CAGR" value={pct(valuationAssumptions.revenueCagr)} note={`${scenario} valuation assumption`} />
              <ScoreBlock label="EBIT Margin" value={pct(valuationAssumptions.operatingMargin)} note={`${scenario} valuation assumption`} />
              <ScoreBlock label="Net Debt / EBIT" value={multiple(dashboard.period.netDebtExLeases / dashboard.period.underlyingEbit)} note="FY2025 net debt ex leases / underlying EBIT" />
              <ScoreBlock label="Latest Period" value="FY2025A" note={dashboard.dataset.latestReportingPeriod} />
            </div>
          </SectionCard>

          <SectionCard title="Moat & Durability" description="BAE's moat is procurement stickiness, sovereign capability, technical complexity, installed base, and backlog visibility.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Moat Score" value={`${dashboard.moat.moatScore}`} note="0-100 research framework" />
              <ScoreBlock label="Durability" value={`${dashboard.moat.durabilityScore}`} note="Backlog + long-cycle demand" />
              <ScoreBlock label="Procurement Stickiness" value={`${dashboard.moat.procurementStickinessScore}`} note="Customer and programme lock-in" />
              <ScoreBlock label="Replacement Risk" value={`${dashboard.moat.programReplacementRisk}`} note="Lower is better" />
              <ScoreBlock label="Execution Risk" value={`${dashboard.moat.executionRisk}`} note="Higher means more risk" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-5">
              {dashboard.moat.drivers.map((driver) => (
                <MiniPanel key={driver.label} title={`${driver.label}: ${driver.score}`} text={driver.explanation} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment Intelligence" description="Each segment is evaluated on growth quality, margin, cash conversion, backlog coverage, and strategic role. GBPm unless noted.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Sales and Underlying EBIT by Segment">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => gbpm(value)} />
                    <Legend />
                    <Bar dataKey="sales" fill="#1f6f78" name="Sales" />
                    <Bar dataKey="ebit" fill="#a16207" name="Underlying EBIT" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Margin and Quality Score">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="margin" fill="#0f766e" name="Margin %" />
                    <Bar dataKey="quality" fill="#334155" name="Quality score" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Segment", "Sales", "EBIT", "Margin", "Order Intake", "Backlog", "Coverage", "Score", "Programs / Risks"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.segment.rows.filter((row) => row.segment !== "Intra-group").map((row) => (
                    <tr key={row.segment} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-semibold text-ink">{row.segment}</td>
                      <td className="px-3 py-3">{gbpm(row.sales)}</td>
                      <td className="px-3 py-3">{row.underlyingEbit == null ? "n/a" : gbpm(row.underlyingEbit)}</td>
                      <td className="px-3 py-3">{row.underlyingEbitMargin == null ? "n/a" : pct(row.underlyingEbitMargin)}</td>
                      <td className="px-3 py-3">{row.orderIntake == null ? "n/a" : gbpb(row.orderIntake)}</td>
                      <td className="px-3 py-3">{row.orderBacklog == null ? "n/a" : gbpb(row.orderBacklog)}</td>
                      <td className="px-3 py-3">{row.backlogCoverageYears == null ? "n/a" : multiple(row.backlogCoverageYears)}</td>
                      <td className="px-3 py-3">{row.qualityScore}</td>
                      <td className="px-3 py-3 text-slate-600">{row.keyPrograms.slice(0, 3).join(", ") || row.risks.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="backlog" className="mt-6 space-y-6">
          <SectionCard title="Backlog & Revenue Visibility" description="Backlog is the centre of the BAE module because it frames revenue duration, conversion risk, and scenario confidence.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Order Backlog" value={gbpb(dashboard.backlog.totalBacklog)} note={`${pct(dashboard.backlog.backlogGrowth)} YoY growth`} />
              <ScoreBlock label="Order Intake" value={gbpb(dashboard.backlog.orderIntake)} note={`${gbpb(dashboard.backlog.priorOrderIntake)} prior year`} />
              <ScoreBlock label="Book-to-Bill" value={multiple(dashboard.backlog.bookToBill)} note="Above 1 means orders exceed sales" />
              <ScoreBlock label="Coverage" value={multiple(dashboard.backlog.backlogCoverageYears)} note="Backlog / sales" />
              <ScoreBlock label="Visibility Score" value={`${dashboard.backlog.revenueVisibilityScore}`} note="Coverage + book-to-bill + growth" />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Backlog, Order Intake, and Sales">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={backlogTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => gbpb(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="backlog" stroke="#1f6f78" name="Backlog" strokeWidth={2} />
                    <Line type="monotone" dataKey="orderIntake" stroke="#a16207" name="Order Intake" strokeWidth={2} />
                    <Line type="monotone" dataKey="sales" stroke="#334155" name="Sales" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Backlog Contribution by Segment">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => gbpb(value)} />
                    <Bar dataKey="backlog" fill="#0f766e" name="Backlog" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <BulletPanel title="What Backlog Means" items={dashboard.backlog.qualityNotes} />
              <BulletPanel title="Backlog Risks" items={[
                "Delay can defer revenue without changing long-term programme economics.",
                "Cancellation risk is low for sovereign must-have programmes, but not zero.",
                "Large fixed-price work can protect revenue while compressing margin if costs rise.",
                "Customer advances can make annual cash conversion lumpy.",
              ]} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-4">
              {dashboard.backlog.majorContractWins.map((contract) => (
                <MiniPanel key={contract.program} title={contract.program} text={`${contract.value ? gbpb(contract.value) : "value n/a"} ${contract.currency}. ${contract.note}`} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="reporting-events" className="mt-6 space-y-6">
          <SectionCard
            title="Reporting Events And Market-Focus Trends"
            description="BAE does not follow a US-style quarterly earnings-call transcript cadence. This view organizes the last eight quarter windows using official results, AGM market updates, and trading updates, while keeping AI synthesis clearly marked as research-only."
            badge={<DataQualityBadge badge="Needs Review" />}
          >
            <div className="overflow-x-auto pb-3">
              <div className="flex min-w-max gap-3">
                {dashboard.reportingEvents.events.map((event) => (
                  <button
                    key={event.quarter}
                    type="button"
                    onClick={() => setSelectedReportingQuarter(event.quarter)}
                    className={`w-48 rounded-lg border p-3 text-left ${selectedReportingEvent.quarter === event.quarter ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide opacity-75">{event.quarter}</div>
                    <div className="mt-1 text-sm font-semibold">{event.title}</div>
                    <div className="mt-1 text-xs opacity-75">{event.eventDate}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <InsightPanel title={dashboard.reportingEvents.overview.title} text={dashboard.reportingEvents.overview.summary} />
              <BulletPanel title="Focus Shift" items={dashboard.reportingEvents.overview.focusShift} />
              <BulletPanel title="Current Market Focus" items={dashboard.reportingEvents.overview.marketAttentionNow} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Market-Focus Score Across The Last Eight Quarter Windows">
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={dashboard.reportingEvents.themeTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="quarter" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    {focusThemes.map((theme, index) => (
                      <Line
                        key={theme}
                        type="monotone"
                        dataKey={theme}
                        stroke={["#1f6f78", "#a16207", "#dc2626", "#334155", "#0f766e", "#7c3aed", "#64748b"][index]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">{selectedReportingEvent.quarter} | {selectedReportingEvent.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedReportingEvent.periodLabel} | {selectedReportingEvent.eventDate}</p>
                  </div>
                  <DataQualityBadge badge={selectedReportingEvent.sourceStatus === "official_actual" ? "Actual" : "Assumption"} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MiniPanel title="Disclosure Type" text={`${selectedReportingEvent.eventType.replace(/_/g, " ")}. Transcript status: ${selectedReportingEvent.transcriptStatus.replace(/_/g, " ")}.`} />
                  <MiniPanel title="Guidance" text={selectedReportingEvent.guidanceSummary} />
                  <MiniPanel title="Management Message" text={selectedReportingEvent.managementMessage} />
                  <MiniPanel title="AI Research Summary" text={selectedReportingEvent.aiSummary.summary} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {selectedReportingEvent.keyMetrics.map((metric) => (
                    <MiniPanel key={metric.label} title={`${metric.label} | ${metric.sourceStatus.replace(/_/g, " ")}`} text={metric.value} />
                  ))}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <BulletPanel title="Debate Questions" items={selectedReportingEvent.debateQuestions} />
                  <BulletPanel title="Watch Items" items={selectedReportingEvent.watchItems} />
                </div>
                <a
                  className="mt-4 inline-flex text-sm font-semibold text-teal-700"
                  href={dashboard.dataset.sourceMap[selectedReportingEvent.sourceId]?.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open official source
                </a>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Quarter", "Event", "Transcript", "Top Focus", "AI Read"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.reportingEvents.events.map((event) => {
                    const topFocus = [...event.marketFocus].sort((a, b) => b.intensity - a.intensity)[0];
                    return (
                      <tr key={event.quarter} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-3 font-semibold text-ink">{event.quarter}</td>
                        <td className="px-3 py-3">{event.title}</td>
                        <td className="px-3 py-3">{event.transcriptStatus.replace(/_/g, " ")}</td>
                        <td className="px-3 py-3">{topFocus ? `${topFocus.theme} (${topFocus.intensity})` : "n/a"}</td>
                        <td className="px-3 py-3 text-slate-600">{event.aiSummary.summary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="cycle" className="mt-6 space-y-6">
          <SectionCard title="Defense Cycle Scenario Lab" description="Macro and geopolitics are translated into explicit scenario assumptions. Qualitative drivers do not directly modify valuation.">
            <div className="grid gap-4 lg:grid-cols-3">
              {dashboard.defenseCycle.scenarios.map((item) => (
                <ScenarioPanel key={item.scenario} active={item.scenario === scenario} title={item.scenario} text={item.narrative} rows={[
                  ["Revenue CAGR", pct(item.revenueCagr)],
                  ["EBIT margin", pct(item.operatingMargin)],
                  ["WACC", pct(item.wacc)],
                  ["P/E", `${item.targetPe.toFixed(1)}x`],
                  ["FCF yield", pct(item.targetFcfYield)],
                ]} />
              ))}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-5">
              {dashboard.defenseCycle.policyDrivers.map((driver) => (
                <MiniPanel key={driver.driver} title={driver.driver} text={driver.scenarioMapping} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="programs" className="mt-6 space-y-6">
          <SectionCard title="Program Matrix" description="Programme notes are research-only. They help classify maturity, duration, margin attractiveness, geopolitical relevance, and execution risk.">
            <div className="mb-5 flex flex-wrap gap-3">
              <SelectControl label="Segment" value={programSegment} onChange={setProgramSegment} options={["All", ...dashboard.programs.filters.segments]} />
              <SelectControl label="Maturity" value={programStage} onChange={(value) => setProgramStage(value as BaProgramStage | "All")} options={["All", ...dashboard.programs.filters.stages]} />
              <SelectControl label="Risk" value={programRisk} onChange={(value) => setProgramRisk(value as BaRiskLevel | "All")} options={["All", ...dashboard.programs.filters.riskLevels]} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {selectedPrograms.map((program) => (
                <div key={program.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-ink">{program.name}</h3>
                      <p className="text-sm text-slate-500">{program.segment} | {program.geography} | {program.durationLabel}</p>
                    </div>
                    <DataQualityBadge badge="Assumption" />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                    <ScorePill label="Maturity" value={program.maturityScore} />
                    <ScorePill label="Margin" value={program.marginQualityScore} />
                    <ScorePill label="Growth" value={program.growthContributionScore} />
                    <ScorePill label="Risk" value={program.riskScore} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">{program.strategicRelevance}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Source: {dashboard.dataset.sourceMap[program.sourceId]?.title ?? program.sourceId}. Mapping: {program.valuationMapping}.</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <BaBacktestPanel apiBaseUrl={baApiBaseUrl} />
          <BaHistoricalValuationPanel
            status={apiStatus}
            error={apiError}
            rows={apiHistorical}
            selectedEventId={apiSelectedEventId}
            onSelectEvent={setApiSelectedEventId}
          />
          <SectionCard title="Valuation Triangulation" description="The blend is not a simple average: DCF 35%, FCF yield 25%, EV/EBIT 10%, P/E 10%, and backlog durability-adjusted core value 20%.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="DCF" value={gbp(dashboard.valuationEngine.dcf.fairValuePerShare)} note={`Terminal ${pct(dashboard.valuationEngine.dcf.terminalValueShareOfEv)} of EV`} />
              <ScoreBlock label="FCF Yield" value={gbp(dashboard.valuationEngine.fcfYieldFairValue)} note={`${gbpm(dashboard.valuationEngine.normalizedFcf)} normalized FCF`} />
              <ScoreBlock label="EV / EBIT" value={gbp(dashboard.valuationEngine.evEbitFairValue)} note={`${gbpm(dashboard.valuationEngine.forwardUnderlyingEbit)} forward EBIT`} />
              <ScoreBlock label="Blended Fair Value" value={gbp(dashboard.valuationEngine.blendedFairValue)} note={`${gbp(dashboard.valuationEngine.valuationRangeLow)}-${gbp(dashboard.valuationEngine.valuationRangeHigh)} range`} />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Method Fair Values and Weights">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={valuationRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#1f6f78" name="Fair value (£/share)" />
                    <Bar dataKey="weight" fill="#a16207" name="Weight" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <BulletPanel title="Valuation Logic" items={[
                "DCF uses unlevered FCF and deducts net debt and lease liabilities after enterprise value.",
                "FCF yield uses normalized equity FCF, not a single customer-advance-heavy year.",
                "Multiples are triangulation checks, not standalone decision rules.",
                "Backlog durability changes confidence and risk-adjusted core value within a capped layer.",
              ]} />
            </div>
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency={module.currency}
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="The risk module is intentionally adversarial: it asks what could break backlog conversion, margins, and FCF, not just what supports the bull case.">
            <div className="grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Risk Score" value={`${dashboard.risks.riskScore}`} note="Average weighted risk score" />
              <InsightPanel title="Red-Team Verdict" text={dashboard.risks.redTeamVerdict} />
              <BulletPanel title="Kill Criteria" items={dashboard.risks.killCriteria} />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Risk", "Score", "Probability", "Impact", "Affected Driver", "Mitigation"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.risks.rows.map((risk) => (
                    <tr key={risk.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-semibold text-ink">{risk.name}</td>
                      <td className="px-3 py-3">{risk.weightedScore} / {risk.severityLabel}</td>
                      <td className="px-3 py-3">{pct(risk.probability)}</td>
                      <td className="px-3 py-3">{pct(risk.impact)}</td>
                      <td className="px-3 py-3">{risk.affectedDriver}</td>
                      <td className="px-3 py-3 text-slate-600">{risk.mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-returns" className="mt-6 space-y-6">
          <BaCapitalReturnsBackendPanel apiBaseUrl={baApiBaseUrl} fallback={dashboard.dividend} />
          <SectionCard title="Dividend & Buyback Quality" description="BAE's shareholder return profile is assessed through dividend growth, payout, FCF coverage, buyback spend, and balance-sheet capacity.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Dividend / Share" value={`${dashboard.dividend.dividendPerSharePence.toFixed(1)}p`} note={`${pct(dashboard.dividend.dividendGrowth)} growth`} />
              <ScoreBlock label="Dividend Yield" value={pct(dashboard.dividend.dividendYield)} note="Against current price" />
              <ScoreBlock label="Earnings Payout" value={pct(dashboard.dividend.earningsPayout)} note="DPS / underlying EPS" />
              <ScoreBlock label="FCF Payout" value={pct(dashboard.dividend.fcfPayout)} note="Dividend cash / FCF" />
              <ScoreBlock label="Sustainability" value={`${dashboard.dividend.sustainabilityScore}`} note="Payout + FCF + leverage" />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Buyback Spend" value={gbpm(dashboard.dividend.buybackSpend)} note="FY2025 company disclosure" />
              <ScoreBlock label="Total Returns" value={gbpm(dashboard.dividend.totalShareholderReturns)} note="Dividends plus buybacks" />
              <BulletPanel title="Capital Return Notes" items={dashboard.dividend.notes} />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function baEventLabel(event: any, compact = false) {
  const period = event?.fiscalPeriod ?? event?.periodLabel ?? event?.label ?? event?.eventDate ?? "Event";
  if (compact) return String(period).replace("FY", "FY ");
  return String(period);
}

function BaCapitalReturnsBackendPanel({
  apiBaseUrl,
  fallback,
}: {
  apiBaseUrl: string;
  fallback: {
    dividendPerSharePence: number;
    fcfPayout: number;
    buybackSpend: number;
    totalShareholderReturns: number;
  };
}) {
  const [history, setHistory] = useState<any | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch(`${apiBaseUrl}/api/stocks/ba/capital-returns?years=8`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        setHistory(payload);
        setStatus("online");
        setMessage(null);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setStatus("offline");
        setMessage(error.message);
      });
    return () => controller.abort();
  }, [apiBaseUrl]);

  const rows = history?.rows ?? [];
  const forward = history?.forwardExpectation ?? null;
  const chartRows = history?.chartSeries ?? [];
  const latest = rows[rows.length - 1] ?? null;
  const warningText = history?.warnings?.map((warning: any) => `${warning.title}: ${warning.detail}`).join(" ") ?? null;
  const forecastLabel = forward?.fiscalYear ? `FY${forward.fiscalYear}E` : "Forward";

  return (
    <SectionCard
      title="Backend Dividend & Buyback History"
      description="Eight-year annual capital-return history from the BA.L backend. Dividends and buybacks are stacked into one capital-return bar and compared against annual FCF."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock
          label="Latest DPS"
          value={latest?.dividendPerSharePence != null ? `${Number(latest.dividendPerSharePence).toFixed(1)}p` : `${fallback.dividendPerSharePence.toFixed(1)}p`}
          note={latest ? `FY${latest.fiscalYear} backend row` : "Static dashboard fallback"}
        />
        <ScoreBlock
          label="Latest FCF"
          value={latest?.equityFreeCashFlow != null ? gbpm(Number(latest.equityFreeCashFlow)) : "n/a"}
          note="Equity free cash flow"
        />
        <ScoreBlock
          label="Latest Buyback"
          value={latest?.buybackAmount != null ? gbpm(Number(latest.buybackAmount)) : gbpm(fallback.buybackSpend)}
          note={latest ? `FY${latest.fiscalYear} backend row` : "Static dashboard fallback"}
        />
        <ScoreBlock
          label="Forward Capital Return"
          value={forward?.totalCapitalReturn != null ? gbpm(Number(forward.totalCapitalReturn)) : "n/a"}
          note={`${forecastLabel} hatched forecast bar`}
        />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Capital-return data service is temporarily unavailable. Static BA.L capital-return section remains available.
        </div>
      ) : null}

      {status === "online" && warningText ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {warningText}
        </div>
      ) : null}

      {chartRows.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <ChartPanel title="Capital Return Stack vs FCF">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartRows}>
                <defs>
                  <pattern id="baDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#ecfdf5" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#0f766e" strokeWidth="2" />
                  </pattern>
                  <pattern id="baBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#eff6ff" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="2" />
                  </pattern>
                  <pattern id="baFcfForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#fff7ed" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#f97316" strokeWidth="2" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `£${Number(value).toFixed(0)}m`} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const labelByKey: Record<string, string> = {
                      dividendCashCost: "Dividends",
                      buybackAmount: "Buybacks",
                      equityFreeCashFlow: "FCF",
                      dividendCashForecast: `${forecastLabel} dividends forecast`,
                      buybackForecast: `${forecastLabel} buyback forecast`,
                      equityFreeCashFlowForecast: `${forecastLabel} FCF forecast`,
                    };
                    return [gbpm(Number(value)), labelByKey[name] ?? name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return `${label}${row?.isForecast ? " | forecast assumption" : ""}${row?.dps != null ? ` | DPS ${Number(row.dps).toFixed(1)}p` : ""}${row?.fcfCoverage != null ? ` | FCF coverage ${multiple(Number(row.fcfCoverage))}` : ""}`;
                  }}
                />
                <Legend />
                <Bar dataKey="dividendCashCost" stackId="capitalReturn" fill="#0f766e" name="Dividends" />
                <Bar dataKey="buybackAmount" stackId="capitalReturn" fill="#2563eb" name="Buybacks" />
                <Bar dataKey="equityFreeCashFlow" fill="#f97316" name="FCF" />
                <Bar dataKey="dividendCashForecast" stackId="forecastCapitalReturn" fill="url(#baDividendForecastHatch)" stroke="#0f766e" strokeDasharray="4 3" name={`${forecastLabel} dividend forecast`} />
                <Bar dataKey="buybackForecast" stackId="forecastCapitalReturn" fill="url(#baBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name={`${forecastLabel} buyback forecast`} />
                <Bar dataKey="equityFreeCashFlowForecast" fill="url(#baFcfForecastHatch)" stroke="#f97316" strokeDasharray="4 3" name={`${forecastLabel} FCF forecast`} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Backend Source Notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Dividend cash cost is calculated from DPS and diluted shares. Buybacks use backend capital-allocation rows; years without explicit repurchase amounts are shown as GBP0m with sourceQuality=official_seed. The forward row is a forecast assumption and is excluded from 8Y cumulative totals.
            </p>
            <div className="mt-4 grid gap-3">
              <ScoreBlock label="Capital Return, 8Y" value={history?.summary?.cumulativeCapitalReturn != null ? gbpm(Number(history.summary.cumulativeCapitalReturn)) : "n/a"} note="Dividends plus buybacks" />
              <ScoreBlock label="FCF, 8Y" value={history?.summary?.cumulativeFcf != null ? gbpm(Number(history.summary.cumulativeFcf)) : "n/a"} note="Backend annual FCF series" />
              <ScoreBlock label="Forward Buyback" value={forward?.buybackAmount != null ? gbpm(Number(forward.buybackAmount)) : "n/a"} note={`${forecastLabel} forecast assumption`} />
              <ScoreBlock label="Latest FCF Coverage" value={latest?.fcfCoverage != null ? multiple(Number(latest.fcfCoverage)) : multiple(1 / Math.max(fallback.fcfPayout, 0.01))} note="FCF / dividends + buybacks" />
            </div>
          </div>

          <div className="xl:col-span-2">
            <ApiTable
              title="Capital Return Table"
              columns={["Fiscal Year", "DPS", "Dividends", "Buybacks", "Capital Return", "FCF", "FCF Coverage", "Source"]}
              rows={[...rows, ...(forward ? [forward] : [])].map((row: any) => [
                `FY${row.fiscalYear}${row.isForecast ? "E" : ""}`,
                row.dividendPerSharePence != null ? `${Number(row.dividendPerSharePence).toFixed(1)}p` : "n/a",
                row.dividendCashCost != null ? gbpm(Number(row.dividendCashCost)) : "n/a",
                row.buybackAmount != null ? gbpm(Number(row.buybackAmount)) : "n/a",
                row.totalCapitalReturn != null ? gbpm(Number(row.totalCapitalReturn)) : "n/a",
                row.equityFreeCashFlow != null ? gbpm(Number(row.equityFreeCashFlow)) : "n/a",
                row.fcfCoverage != null ? multiple(Number(row.fcfCoverage)) : "n/a",
                `${String(row.sourceQuality ?? row.sourceType).replace(/_/g, " ")}${row.isForecast ? " / hatched forecast" : ""}`,
              ])}
            />
          </div>
        </div>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading backend dividend and buyback history.</p>
      ) : null}
    </SectionCard>
  );
}

function BaHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: any[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = useMemo(
    () => [...rows].sort((left, right) => String(left.event?.eventDate ?? "").localeCompare(String(right.event?.eventDate ?? ""))),
    [rows],
  );
  const [visibleCount, setVisibleCount] = useState(999);
  const boundedVisibleCount = Math.min(Math.max(visibleCount, Math.min(4, displayRows.length || 4)), Math.max(4, displayRows.length || 4));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - boundedVisibleCount)),
    [boundedVisibleCount, displayRows],
  );
  const selected =
    displayRows.find((row) => row.event?.id === selectedEventId) ??
    [...displayRows].reverse().find((row) => row.valuationRun) ??
    displayRows[displayRows.length - 1] ??
    null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: baEventLabel(row.event, true),
      fiscalPeriod: row.event?.label ?? row.event?.fiscalPeriod ?? row.event?.eventDate,
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
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? selected?.valuationRun?.dataSnapshotJson?.methodBridge ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];
  const snapshot = selected?.valuationRun?.dataSnapshotJson ?? {};
  const rowUsage = snapshot.rowUsage ?? {};
  const rowUsageEntries = Object.entries(rowUsage) as Array<[string, Array<{ id?: string; asOfDate?: string; sourceType?: string }>]>;
  const rowUsageCount = rowUsageEntries.reduce((sum, [, usageRows]) => sum + (usageRows?.length ?? 0), 0);
  const rowUsageSourceCounts = rowUsageEntries.reduce<Record<string, number>>((counts, [, usageRows]) => {
    for (const usageRow of usageRows ?? []) {
      const sourceType = usageRow.sourceType ?? "missing";
      counts[sourceType] = (counts[sourceType] ?? 0) + 1;
    }
    return counts;
  }, {});
  const futureDatedUsageRows = rowUsageEntries.flatMap(([table, usageRows]) =>
    (usageRows ?? [])
      .filter((usageRow) => usageRow.asOfDate && selected?.event?.eventDate && String(usageRow.asOfDate) > String(selected.event.eventDate))
      .map((usageRow) => ({ table, ...usageRow })),
  );
  const asOfPriceSource = snapshot.asOfPriceSource ?? null;
  const selectedEventDate = selected?.event?.eventDate ?? snapshot.asOfDate ?? "n/a";
  const sourceQualityRows = [
    ["Event date", selectedEventDate, "All selected source rows must be dated on or before this event."],
    [
      "Daily price anchor",
      asOfPriceSource?.priceDate
        ? `${asOfPriceSource.priceDate} | ${asOfPriceSource.source ?? "market data"}`
        : "event market snapshot fallback",
      asOfPriceSource?.adjustedCloseFallback
        ? "Adjusted close was unavailable; backend warning should be visible."
        : "Nearest prior adjusted close where available; BA.L GBX is divided by 100 to GBP.",
    ],
    ["Event-visible row usage", `${rowUsageCount} rows`, rowUsageEntries.map(([table, usageRows]) => `${table}: ${usageRows?.length ?? 0}`).join("; ") || "No row usage metadata."],
    [
      "Source mix",
      Object.entries(rowUsageSourceCounts).map(([sourceType, count]) => `${sourceType}: ${count}`).join("; ") || "n/a",
      "Official actuals, forecast assumptions, and management guidance remain labeled in backend snapshots.",
    ],
    [
      "No-future-leakage check",
      futureDatedUsageRows.length === 0 ? "Passed in selected snapshot" : `${futureDatedUsageRows.length} future-dated rows`,
      futureDatedUsageRows.length === 0
        ? "No selected source row has asOfDate after the reporting event date."
        : futureDatedUsageRows.map((row) => `${row.table}/${row.id ?? "row"} dated ${row.asOfDate}`).join("; "),
    ],
    [
      "Interim / trading update treatment",
      snapshot.interimRunRateSnapshot ? "Run-rate snapshot" : snapshot.staleAnnualAnchor ? "Stale annual anchor flagged" : "Annual event snapshot",
      snapshot.staleAnnualAnchor
        ? "Backend marked this event as using a stale annual anchor."
        : "Trading and interim events should use event-visible run-rate rows instead of current annual assumptions.",
    ],
  ];

  return (
    <SectionCard
      title="BA.L Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event. Historical fair values are loaded from the unified backend and are not recomputed in the browser."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={`${savedRuns}`} note="Base runs persisted by event" />
        <ScoreBlock label="Reporting Events" value={`${displayRows.length || "n/a"}`} note="FY, H1, Q1/Q3 updates, and material events" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? gbp(Number(selected.valuationRun.fairValue)) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(Number(selected.valuationRun.upsideDownside)) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static BA.L dashboard sections still render.
        </div>
      ) : null}

      {displayRows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the chart while the reporting-event row remains scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { count: 8, label: "8Q" },
                  { count: 12, label: "12Q" },
                  { count: 16, label: "16Q" },
                  { count: 24, label: "24Q" },
                  { count: displayRows.length, label: "Full 8Y" },
                ].map(({ count, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${boundedVisibleCount === count ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, displayRows.length || 4)}
              max={Math.max(4, displayRows.length || 4)}
              value={boundedVisibleCount}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? baEventLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? baEventLabel(visibleRows[visibleRows.length - 1]?.event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium in visible window" />
            </div>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {displayRows.map((row) => {
              const active = row.event?.id === selected?.event?.id;
              return (
                <button
                  key={row.event?.id}
                  type="button"
                  onClick={() => onSelectEvent(row.event.id)}
                  className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event?.eventDate}</span>
                  <span className="mt-1 block font-semibold">{baEventLabel(row.event)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event?.label ?? row.event?.eventType}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{String(row.event?.eventType ?? "event").replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event?.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event?.eventDate ?? "n/a"} note={String(selected.event?.eventType ?? "event").replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? gbp(Number(selected.valuationRun.currentPrice)) : "n/a"} note="Daily adjusted close where available" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? gbp(Number(selected.valuationRun.targetPrice3Y)) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(Number(selected.valuationRun.expectedShareholderCagr)) : "n/a"} note="Backend shareholder return bridge" />
                </div>
                <ApiTable
                  title="Method Bridge"
                  columns={["Method", "Value", "Description"]}
                  rows={methodRows.map((row: any) => [
                    row.label ?? row.key ?? "Method",
                    typeof row.value === "number" ? gbp(row.value) : "n/a",
                    row.description ?? row.source ?? "",
                  ])}
                />
                {warnings.length ? (
                  <div className="mt-4 space-y-2">
                    {warnings.map((warning: any, index: number) => {
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
                      formatter={(value: number) => gbp(value)}
                      labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload;
                        return `${label}${point?.fiscalPeriod ? ` (${point.fiscalPeriod})` : ""}${typeof point?.gapPct === "number" ? ` | Gap ${pct(point.gapPct)}` : ""}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                    <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="xl:col-span-2">
                <ApiTable
                  title="Selected Run Source Quality"
                  columns={["Audit Field", "Value", "Operator Note"]}
                  rows={sourceQualityRows}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading BA.L historical valuation runs from the unified backend.</p>
      ) : null}
    </SectionCard>
  );
}

function BaBacktestPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "done" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/stocks/ba/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`BA.L backend returned ${response.status}`);
      const payload = await response.json();
      if (payload.status !== "completed") {
        throw new Error(payload.warnings?.join(" ") || payload.message || "BA.L backtest did not complete. Restart the unified API and re-run BA.L seed/validation.");
      }
      setResult(payload);
      setStatus("done");
      setError(null);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [apiBaseUrl, endDate, startDate]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetch(`${apiBaseUrl}/api/stocks/ba/backtests`)
      .then((response) => {
        if (!response.ok) throw new Error(`BA.L backend returned ${response.status}`);
        return response.json();
      })
      .then(async (payload) => {
        if (cancelled) return;
        const latest = (payload.backtests ?? []).find((row: any) => row.resultJson?.status === "completed");
        if (latest?.resultJson) {
          setResult(latest.resultJson);
          setStartDate(latest.resultJson.startDate ?? "2018-01-02");
          setEndDate(latest.resultJson.endDate ?? "2026-05-12");
          setStatus("done");
          return;
        }
        const response = await fetch(`${apiBaseUrl}/api/stocks/ba/backtests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" }),
        });
        if (!response.ok) throw new Error(`BA.L backend returned ${response.status}`);
        const next = await response.json();
        if (cancelled) return;
        if (next.status !== "completed") throw new Error(next.warnings?.join(" ") || next.message || "BA.L backtest did not complete.");
        setResult(next);
        setStatus("done");
      })
      .catch((caught) => {
        if (cancelled) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_: any, index: number) => index % step === 0 || index === rows.length - 1).map((row: any) => ({
      ...row,
      spyReturn: (row.spy - 1) * 100,
      baReturn: ((row.baBuyHold ?? row.stock) - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};
  const stockMetrics = metrics.baBuyHold ?? metrics.stock ?? {};
  const spyMetrics = metrics.spy ?? metrics.benchmark ?? {};

  return (
    <SectionCard
      title="BA.L vs SPY Backtest"
      description="Select a date range and compare daily BA.L buy-and-hold performance against SPY from backend adjusted price history."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-blue-50 text-blue-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "loading" ? "Loading" : status === "error" ? "Needs data" : "Ready"}
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
          disabled={status === "running" || status === "loading"}
          className="self-end rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {status === "running" ? "Running..." : status === "loading" ? "Loading..." : "Run backtest"}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        This simple panel uses adjusted daily prices and compares BA.L local-currency total return in GBX against SPY total return in USD. It is not an FX-hedged GBP investor return.
      </div>

      {error ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {error}
        </div>
      ) : null}

      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <ChartPanel title="BA.L vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="baReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="BA.L" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="BA.L CAGR" value={stockMetrics.cagr != null ? pct(Number(stockMetrics.cagr)) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={spyMetrics.cagr != null ? pct(Number(spyMetrics.cagr)) : "n/a"} note="Benchmark" />
              <ScoreBlock label="BA.L MDD" value={stockMetrics.maxDrawdown != null ? pct(Number(stockMetrics.maxDrawdown)) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={spyMetrics.maxDrawdown != null ? pct(Number(spyMetrics.maxDrawdown)) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="BA.L Sharpe" value={stockMetrics.sharpe != null ? Number(stockMetrics.sharpe).toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={spyMetrics.sharpe != null ? Number(spyMetrics.sharpe).toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="BA.L Vol" value={stockMetrics.volatility != null ? pct(Number(stockMetrics.volatility)) : "n/a"} note="Annualized daily vol" />
              <ScoreBlock label="SPY Vol" value={spyMetrics.volatility != null ? pct(Number(spyMetrics.volatility)) : "n/a"} note="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning: string) => (
            <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function BaApiModePanel({
  status,
  events,
  selectedEventId,
  onSelectEvent,
  selectedEvent,
  valuationRun,
  snapshot,
  financial,
  backlog,
  intake,
  guidance,
  transcript,
}: {
  status: string;
  events: any[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  selectedEvent: any;
  valuationRun: any;
  snapshot: any;
  financial: any;
  backlog: any;
  intake: any;
  guidance: any[];
  transcript: any;
}) {
  const methodBridge = valuationRun?.methodOutputsJson ?? valuationRun?.dataSnapshotJson?.methodBridge ?? [];
  const eventSegments = (snapshot?.segmentFinancials ?? []).filter((row: any) => row.eventId === selectedEventId).slice(0, 8);
  const rowUsage = valuationRun?.dataSnapshotJson?.rowUsage ?? {};
  return (
    <SectionCard
      title="Unified Backend API Mode"
      description="Feature-flagged BA.L backend view using only /api/stocks/ba canonical endpoints from the unified stock backend."
      badge={<DataQualityBadge badge={status === "online" ? "Actual" : "Needs Review"} />}
    >
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event.id)}
              className={`rounded-md border px-3 py-2 text-left text-xs font-medium ${
                event.id === selectedEventId ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <span className="block">{event.fiscalPeriod}</span>
              <span className="block font-normal opacity-80">{event.eventDate}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="API Status" value={status} note="VITE_BA_API_MODE=true" />
        <ScoreBlock label="Event Fair Value" value={valuationRun?.fairValue != null ? gbp(Number(valuationRun.fairValue)) : "N/A"} note={selectedEvent?.label ?? "No event selected"} />
        <ScoreBlock label="Event Current Price" value={valuationRun?.currentPrice != null ? gbp(Number(valuationRun.currentPrice)) : "N/A"} note={valuationRun?.currentPriceGbx != null ? `${Number(valuationRun.currentPriceGbx).toFixed(1)} GBX / 100` : "GBX to GBP audit"} />
        <ScoreBlock label="Upside / Downside" value={valuationRun?.upsideDownside != null ? pct(Number(valuationRun.upsideDownside)) : "N/A"} note={valuationRun?.scenario ?? "Base"} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ApiTable
          title="Method Bridge"
          columns={["Method", "Value", "Weight", "Source"]}
          rows={methodBridge.map((method: any) => [
            method.label ?? method.key,
            method.value != null ? gbp(Number(method.value)) : "N/A",
            method.weight != null ? pct(Number(method.weight)) : method.description?.match(/\d+%/)?.[0] ?? "N/A",
            method.source ?? method.description ?? "backend",
          ])}
        />
        <ApiTable
          title="Financial Snapshot"
          columns={["Field", "Value", "Audit"]}
          rows={[
            ["Sales", financial?.sales != null ? gbpm(Number(financial.sales)) : "N/A", financial?.runRateSnapshot ? "event-visible run-rate" : "annual actual"],
            ["Underlying EBIT", financial?.underlyingEbit != null ? gbpm(Number(financial.underlyingEbit)) : "N/A", financial?.sourceType ?? "N/A"],
            ["FCF", financial?.freeCashFlow != null ? gbpm(Number(financial.freeCashFlow)) : "N/A", "operating cash flow - capex"],
            ["Diluted Shares", financial?.dilutedShares != null ? `${Number(financial.dilutedShares).toFixed(0)}m` : "N/A", "event-visible share base"],
          ]}
        />
        <ApiTable
          title="Segment Snapshot"
          columns={["Segment", "Sales", "Margin", "Source"]}
          rows={eventSegments.map((row: any) => [
            row.segment,
            row.sales != null ? gbpm(Number(row.sales)) : "N/A",
            row.margin != null ? pct(Number(row.margin)) : "N/A",
            row.sourceType,
          ])}
        />
        <ApiTable
          title="Backlog / Order Snapshot"
          columns={["Metric", "Value", "Audit"]}
          rows={[
            ["Order Backlog", backlog?.totalBacklog != null ? gbpm(Number(backlog.totalBacklog)) : "N/A", "visibility metric, not revenue"],
            ["Backlog Coverage", backlog?.coverageYears != null ? multiple(Number(backlog.coverageYears)) : "N/A", backlog?.sourceType ?? "N/A"],
            ["Order Intake", intake?.totalOrderIntake != null ? gbpm(Number(intake.totalOrderIntake)) : "N/A", "bookings metric, not revenue"],
            ["Book-to-Bill", intake?.bookToBill != null ? multiple(Number(intake.bookToBill)) : "N/A", intake?.sourceType ?? "N/A"],
          ]}
        />
        <ApiTable
          title="Guidance Snapshot"
          columns={["Metric", "Value", "Valuation Impact"]}
          rows={guidance.map((row: any) => [
            row.metric,
            row.value != null ? String(row.value) : `${row.low ?? "N/A"} - ${row.high ?? "N/A"}`,
            row.valuationImpactAllowed ? "promoted" : "display / candidate",
          ])}
        />
        <ApiTable
          title="Transcript Summary"
          columns={["Topic", "Summary", "Model Ready"]}
          rows={transcript ? [[transcript.topic, transcript.summary, transcript.modelReady ? "true" : "false"]] : []}
        />
        <ApiTable
          title="Risk Triggers"
          columns={["Trigger", "Rows", "Use"]}
          rows={[
            ["Defense budget indicators", snapshot?.defenseBudgetIndicators?.length ?? 0, "scenario context only"],
            ["Contract awards", snapshot?.contractAwards?.length ?? 0, "backlog context, not revenue"],
            ["Program exposures", snapshot?.programExposures?.length ?? 0, "display-only unless promoted"],
          ]}
        />
        <ApiTable
          title="Source / Audit Trail"
          columns={["Audit Field", "Value", "Evidence"]}
          rows={[
            ["Reporting event", valuationRun?.reportingEventId ?? selectedEventId ?? "N/A", selectedEvent?.eventDate ?? "N/A"],
            ["Valuation period", valuationRun?.valuationPeriodId ?? "N/A", valuationRun?.fiscalPeriod ?? "N/A"],
            ["Market snapshot", valuationRun?.marketSnapshotId ?? "N/A", valuationRun?.dataSnapshotJson?.currencyNote ?? "GBX normalized to GBP"],
            ["Rows used", Object.values(rowUsage).flat().length, "all filtered by asOfDate <= eventDate"],
          ]}
        />
      </div>
    </SectionCard>
  );
}

function ApiTable({ title, columns, rows }: { title: string; columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="px-2 py-2">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="border-b border-slate-100 align-top">
                {row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`} className="px-2 py-2 text-slate-700">{cell}</td>)}
              </tr>
            )) : (
              <tr>
                <td className="px-2 py-3 text-slate-500" colSpan={columns.length}>No rows loaded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreBlock({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function InsightPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function MiniPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{text}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function ScenarioPanel({
  active,
  title,
  text,
  rows,
}: {
  active: boolean;
  title: string;
  text: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className={`rounded-lg border p-4 ${active ? "border-ink bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">{title}</h3>
        {active ? <DataQualityBadge badge="Assumption" /> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
      <div className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-ink">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        className="ml-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <div className="font-semibold text-ink">{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}
