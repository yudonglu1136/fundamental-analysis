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
import { AlertTriangle, BrainCircuit, CalendarDays, CloudCog, DollarSign, MessageSquareText, ShieldAlert, TrendingUp } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { WaterfallChart } from "../../components/shared/WaterfallChart";
import {
  attachMsftRuntimeContext,
  buildMsftDashboardData,
  defaultMsftValuationAssumptions,
  resolveMsftDataset,
} from "./calculations";
import { msftFocusLabels } from "./engines/earningsCallEngine";
import type { MsftValuationAssumptions } from "./model";

type MsftHistoricalValuationRun = {
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

type MsftHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  periodLabel?: string | null;
  title?: string | null;
};

type MsftHistoricalValuationItem = {
  event: MsftHistoricalValuationEvent;
  valuationRun: MsftHistoricalValuationRun | null;
};

type MsftHistoricalValuationResponse = {
  historicalValuations?: MsftHistoricalValuationItem[];
};

type MsftCapitalReturnRow = {
  fiscalYear: number;
  periodId?: string | null;
  asOfDate?: string | null;
  sourceType: string;
  sourceQuality: string;
  revenue?: number | null;
  equityFreeCashFlow: number | null;
  dilutedShares: number | null;
  dividendPerShare: number | null;
  dividendPerShareCents: number | null;
  dividendCashCost: number | null;
  buybackAmount: number | null;
  totalCapitalReturn: number | null;
  fcfCoverage: number | null;
  payoutRatioOfFcf: number | null;
  isForecast: boolean;
};

type MsftCapitalReturnHistory = {
  ticker: "MSFT";
  currency: "USD";
  unit: "USDm";
  years: number;
  rows: MsftCapitalReturnRow[];
  forwardExpectation: MsftCapitalReturnRow | null;
  summary: {
    latestFiscalYear: number | null;
    latestDividendPerShareCents: number | null;
    latestDividendCashCost: number | null;
    latestBuybackAmount: number | null;
    latestTotalCapitalReturn: number | null;
    latestEquityFreeCashFlow: number | null;
    latestFcfCoverage: number | null;
    cumulativeDividendCash: number;
    cumulativeBuybacks: number;
    cumulativeFcf: number;
    cumulativeCapitalReturn: number;
    forwardFiscalYear: number | null;
    forwardDividendPerShareCents: number | null;
    forwardDividendCashCost: number | null;
    forwardBuybackAmount: number | null;
    forwardTotalCapitalReturn: number | null;
    forwardEquityFreeCashFlow: number | null;
    forwardFcfCoverage: number | null;
  };
  warnings?: Array<{ id?: string; title: string; detail: string; severity?: string }>;
};

type MsftBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type MsftBacktestCurvePoint = {
  date: string;
  model: number;
  spy: number;
  benchmark?: number;
  msftBuyHold: number;
  exposure: number;
  price?: number | null;
  fairValue?: number | null;
  gapPct?: number | null;
};

type MsftBacktestResult = {
  status?: string;
  startDate?: string;
  endDate?: string;
  signalRule?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    model?: MsftBacktestMetricSet;
    spy?: MsftBacktestMetricSet;
    msftBuyHold?: MsftBacktestMetricSet;
  };
  curve?: MsftBacktestCurvePoint[];
  warnings?: string[];
};

function usd(value: number) {
  return `$${value.toFixed(1)}`;
}

function usdm(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`;
}

function usdb(value: number) {
  return `$${(value / 1_000).toFixed(1)}bn`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function calendarQuarterCoveredLabel(event: MsftHistoricalValuationEvent, compact = false) {
  const source = event.fiscalPeriod ?? event.periodLabel ?? "";
  const match = source.match(/Q([1-4])\s+FY20(\d{2})/i) ?? source.match(/FY(\d{2})\s+Q([1-4])/i);
  if (!match) return event.periodLabel ?? event.fiscalPeriod ?? event.fiscalQuarter ?? event.eventDate;
  const firstForm = source.toUpperCase().startsWith("Q");
  const fiscalQuarter = Number(firstForm ? match[1] : match[2]);
  const fiscalYear = 2000 + Number(firstForm ? match[2] : match[1]);
  const calendarYear = fiscalQuarter <= 2 ? fiscalYear - 1 : fiscalYear;
  const calendarQuarter = fiscalQuarter === 1 ? 3 : fiscalQuarter === 2 ? 4 : fiscalQuarter === 3 ? 1 : 2;
  const calendarLabel = compact ? `CY${String(calendarYear).slice(2)} Q${calendarQuarter}` : `CY${calendarYear} Q${calendarQuarter}`;
  const fiscalLabel = compact ? `FY${String(fiscalYear).slice(2)} Q${fiscalQuarter}` : `FY${fiscalYear} Q${fiscalQuarter}`;
  return `${calendarLabel} / ${fiscalLabel}`;
}

function multiple(value: number) {
  return `${value.toFixed(2)}x`;
}

export function MsftDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "MSFT",
    defaultAssumptions: defaultMsftValuationAssumptions,
    storageKey: "valuation-assumptions-MSFT",
    onDataSourceChange,
  });
  const [selectedEarningsCallId, setSelectedEarningsCallId] = useState("q3-fy26");
  const [historicalValuations, setHistoricalValuations] = useState<MsftHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);

  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveMsftDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () =>
      attachMsftRuntimeContext(moduleData, {
        periodId: resolvedPeriod,
        dataSourceType,
      }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const dashboard = useMemo(
    () => buildMsftDashboardData(runtimeData, resolvedPeriod, scenario, valuationAssumptions),
    [runtimeData, resolvedPeriod, scenario, valuationAssumptions],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
        const response = await fetch(
          `${apiBase}/api/msft/historical-valuations?scenario=Base&modelVersion=msft_v1_backend_pilot`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`MSFT backend returned ${response.status}`);
        const payload = (await response.json()) as MsftHistoricalValuationResponse;
        const rows = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setHistoricalValuations(rows);
        setSelectedHistoricalEventId((current) => current ?? [...rows].reverse().find((row) => row.event.id.startsWith("sec-q") && row.valuationRun)?.event.id ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[0]?.event.id ?? null);
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

  const segmentChartRows = dashboard.segment.rows.map((row) => ({
    segment: row.segment.replace(" and ", " & "),
    revenue: row.revenue,
    operatingIncome: row.operatingIncome,
    margin: row.calculatedOperatingMargin * 100,
    quality: row.qualityScore,
  }));

  const cloudRows = dashboard.dataset.cloudMetrics.map((row) => ({
    period: row.label.replace("FY2026", "FY26").replace("FY2025", "FY25"),
    cloudRevenue: row.microsoftCloudRevenue,
    cloudGm: row.microsoftCloudGrossMargin * 100,
    azureGrowth: (row.azureGrowth ?? 0) * 100,
    m365Growth: (row.m365CommercialCloudGrowth ?? 0) * 100,
  }));

  const valuationRows = [
    { method: "DCF", value: dashboard.valuationEngine.dcf.fairValuePerShare, weight: dashboard.valuationEngine.finalWeights.dcf },
    { method: "FCF Yield", value: dashboard.valuationEngine.fcfYieldFairValue, weight: dashboard.valuationEngine.finalWeights.fcfYield },
    { method: "P/E", value: dashboard.valuationEngine.peFairValue, weight: dashboard.valuationEngine.finalWeights.pe },
    { method: "EV / EBIT", value: dashboard.valuationEngine.evEbitFairValue, weight: dashboard.valuationEngine.finalWeights.evEbit },
    { method: "SOTP", value: dashboard.valuationEngine.sotpFairValue, weight: dashboard.valuationEngine.finalWeights.sotp },
    { method: "AI Optionality", value: dashboard.valuationEngine.aiOptionalityFairValue, weight: dashboard.valuationEngine.finalWeights.aiOptionality },
  ];
  const selectedEarningsCall =
    dashboard.earningsCalls.quarters.find((call) => call.id === selectedEarningsCallId) ??
    dashboard.earningsCalls.latest;
  const selectedEarningsCallIndex = Math.max(
    0,
    dashboard.earningsCalls.quarters.findIndex((call) => call.id === selectedEarningsCall.id),
  );
  const callFocusRows = dashboard.earningsCalls.focusTrendRows;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Microsoft AI Platform Research Cockpit"
        description="Official actuals, management commentary, market data, research-only notes, and OpenAI/Copilot scenario assumptions are kept separate."
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Actual" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Recommended Fair Value" value={usd(dashboard.valuation.recommendedFairValue ?? 0)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs price anchor`} />
          <ScoreBlock label="AI ARR" value={`$${dashboard.aiFactory.aiArr.toFixed(0)}bn`} note="Management-commentary run-rate" />
          <ScoreBlock label="Azure Growth" value={pct(dashboard.aiFactory.latestCloud.azureGrowth ?? 0)} note="Q3 FY2026 reported growth" />
          <ScoreBlock label="Cloud GM" value={pct(dashboard.aiFactory.latestCloud.microsoftCloudGrossMargin)} note="Q4 guided roughly 64%" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <InsightPanel icon={<CloudCog className="h-5 w-5" />} title="AI Thesis" text="Microsoft is being underwritten as the enterprise AI platform, not just a hyperscale compute supplier. The model tests whether Azure AI demand and Copilot ARPU can outrun depreciation and inference cost." />
          <InsightPanel icon={<BrainCircuit className="h-5 w-5" />} title="OpenAI Boundary" text={dashboard.openAi.keyBoundary} />
          <InsightPanel icon={<DollarSign className="h-5 w-5" />} title="FCF Debate" text="The most important near-term debate is whether $190bn CY2026 capex is a demand-led capacity catch-up or a structural reset in capital intensity." />
          <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Red Team" text={dashboard.risks.redTeamVerdict} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="USD" />
        ))}
      </div>

      <SectionCard title="Data Boundary" description="Official Microsoft filings and calls anchor actuals. OpenAI revenue share, OpenAI gross margin, Copilot ARPU, eligible seat base, and Copilot gross margin remain scenario assumptions.">
        <div className="grid gap-4 lg:grid-cols-3">
          <BulletPanel title="Official Actuals" items={[
            "FY2025 revenue, gross profit, operating income, FCF, capex, debt, leases, share count, and segment results.",
            "Q3 FY2026 revenue, segment revenue/operating income, Microsoft Cloud revenue and GM, Azure growth, FCF, capex, and OpenAI investment impact.",
          ]} />
          <BulletPanel title="Management Guidance / Commentary" items={[
            "AI ARR over $37bn, M365 Copilot paid seats over 20m, Q4 Azure growth guide of 39%-40% cc, Q4 Cloud GM roughly 64%.",
            "CY2026 capex roughly $190bn, capacity constrained at least through 2026, OpenAI revenue share through 2030, IP rights through 2032.",
          ]} />
          <BulletPanel title="Source Gaps" items={dashboard.dataStatus.missingFields} />
        </div>
      </SectionCard>

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
          <SectionCard title="Executive Snapshot" description="PM-level snapshot of growth, margin, AI capacity, valuation, and source quality.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Market Cap" value={usdb(dashboard.dataset.marketData.marketCap)} note="Price anchor x Q3 diluted shares" />
              <ScoreBlock label="Q3 Revenue" value={usdb(dashboard.period.revenue)} note={`${pct(dashboard.period.grossMargin)} gross margin`} />
              <ScoreBlock label="Q3 Capex" value={usdb(dashboard.period.capex ?? 0)} note={`${pct((dashboard.period.capex ?? 0) / dashboard.period.revenue)} of revenue`} />
              <ScoreBlock label="Q3 FCF" value={usdb(dashboard.period.freeCashFlow ?? 0)} note="OCF less PPE additions" />
              <ScoreBlock label="Probability-Weighted FV" value={usd(dashboard.valuationEngine.probabilityWeightedFairValue)} note="Bear/Base/Bull scenario blend" />
              <ScoreBlock label="Terminal Value Share" value={pct(dashboard.valuationEngine.dcf.terminalValueShareOfEv)} note="DCF sensitivity warning if high" />
              <ScoreBlock label="OpenAI Dependency Score" value={`${dashboard.openAi.dependencyScore}`} note="Scenario opacity and margin risk" />
              <ScoreBlock label="Copilot Penetration" value={pct(dashboard.copilot.currentPenetration)} note="20m seats / scenario denominator" />
            </div>
          </SectionCard>

          <SectionCard title="Model Warnings" description="Warnings are intentionally exposed in the dashboard instead of being hidden inside validation.">
            <WarningList warnings={dashboard.dataStatus.validationWarnings} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="earnings-call" className="mt-6 space-y-6">
          <SectionCard
            title="Earnings Call Intelligence"
            description="Eight-quarter transcript-intelligence layer with a scrollable quarter selector, market-focus migration, management tone, Q&A concerns, and KPI direction. Research-only; not directly wired into valuation."
            badge={<MessageSquareText className="h-5 w-5 text-sky-600" />}
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Selected Call" value={selectedEarningsCall.label} note={selectedEarningsCall.marketFocusSummary} />
              <ScoreBlock label="Azure Growth" value={pct(selectedEarningsCall.azureGrowth)} note="Official investor metric" />
              <ScoreBlock label="Cloud GM" value={pct(selectedEarningsCall.microsoftCloudGrossMargin)} note="Microsoft Cloud gross margin" />
              <ScoreBlock label="Commercial RPO" value={`$${selectedEarningsCall.commercialRpo.toFixed(0)}bn`} note="Official investor metric" />
            </div>

            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
              <input
                type="range"
                min={0}
                max={dashboard.earningsCalls.quarters.length - 1}
                value={selectedEarningsCallIndex}
                onChange={(event) => setSelectedEarningsCallId(dashboard.earningsCalls.quarters[Number(event.target.value)]?.id ?? selectedEarningsCall.id)}
                className="h-2 w-full accent-slate-900"
                aria-label="Select earnings call quarter"
              />
              <div className="mt-2 flex justify-between text-xs font-medium text-slate-500">
                <span>{dashboard.earningsCalls.quarters[0]?.fiscalQuarter}</span>
                <span>{dashboard.earningsCalls.latest.fiscalQuarter}</span>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-2">
                {dashboard.earningsCalls.quarters.map((call) => {
                  const active = call.id === selectedEarningsCall.id;
                  return (
                    <button
                      key={call.id}
                      type="button"
                      onClick={() => setSelectedEarningsCallId(call.id)}
                      className={`w-44 rounded-lg border px-3 py-3 text-left transition ${active ? "border-ink bg-ink text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
                    >
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-semibold">{call.fiscalQuarter}</span>
                      </div>
                      <p className={`mt-2 line-clamp-2 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-500"}`}>
                        Azure {pct(call.azureGrowth)} / Cloud GM {pct(call.microsoftCloudGrossMargin)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <InsightPanel icon={<BrainCircuit className="h-5 w-5" />} title="AI Overview" text={dashboard.earningsCalls.overview.summary} />
                <InsightPanel icon={<TrendingUp className="h-5 w-5" />} title={`${selectedEarningsCall.label} Read-through`} text={selectedEarningsCall.modelReadThrough} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <BulletPanel title="Reported Facts" items={selectedEarningsCall.keyReportedFacts} />
                  <BulletPanel title="Analyst Q&A Themes" items={selectedEarningsCall.analystFocus} />
                  <BulletPanel title="Market Focus" items={[selectedEarningsCall.marketFocusSummary, dashboard.earningsCalls.sourceBoundary]} />
                  <BulletPanel title="Management Tone" items={[selectedEarningsCall.managementTone]} />
                </div>
              </div>

              <div className="space-y-4">
                <ChartPanel title="Market Focus Scores by Quarter">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={callFocusRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="azureGrowth" stroke="#2563eb" strokeWidth={3} name="Azure growth %" />
                      <Line type="monotone" dataKey="aiCapexFcf" stroke="#b91c1c" strokeWidth={3} name="Capex / FCF score" />
                      <Line type="monotone" dataKey="cloudGrossMargin" stroke="#a16207" strokeWidth={3} name="Cloud GM %" />
                      <Line type="monotone" dataKey="openAiExposure" stroke="#7c3aed" strokeWidth={3} name="OpenAI score" />
                      <Line type="monotone" dataKey="copilotMonetization" stroke="#0f766e" strokeWidth={3} name="Copilot score" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartPanel>
                <BulletPanel title="Eight-Quarter Focus Shift" items={dashboard.earningsCalls.overview.phases.map((phase) => `${phase.period}: ${phase.title}. ${phase.description}`)} />
                <BulletPanel title="Latest Read-through" items={[
                  `Latest focus is highest on capex/FCF (${dashboard.earningsCalls.latest.focusScores.aiCapexFcf}) and cloud GM (${dashboard.earningsCalls.latest.focusScores.cloudGrossMargin}).`,
                  `Azure growth remains ${pct(dashboard.earningsCalls.latest.azureGrowth)}, so the debate is conversion quality rather than demand existence.`,
                  dashboard.earningsCalls.latest.copilotPaidSeats ? `M365 Copilot paid seats are over ${dashboard.earningsCalls.latest.copilotPaidSeats.toFixed(0)}m, but revenue, ARPU, usage cost, and churn remain undisclosed.` : "Copilot revenue, ARPU, usage cost, and churn remain undisclosed.",
                ]} />
              </div>
            </div>

            <DataTable
              headers={["Theme", "Start Score", "Latest Score", "Change", "Interpretation"]}
              rows={dashboard.earningsCalls.overview.focusTrend.map((row) => [
                msftFocusLabels[row.theme],
                row.startScore,
                row.endScore,
                `${row.change >= 0 ? "+" : ""}${row.change}`,
                row.interpretation,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment Intelligence" description="The three official reporting segments reconcile to total company revenue and operating income. USDm unless noted.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Revenue and Operating Income">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-14} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                    <Bar dataKey="operatingIncome" fill="#0f766e" name="Operating income" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Margin and Quality Score">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-14} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="margin" fill="#7c3aed" name="Operating margin %" />
                    <Bar dataKey="quality" fill="#334155" name="Quality score" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <DataTable
              headers={["Segment", "Revenue", "Operating Income", "Margin", "Growth", "Key Drivers", "Margin Debate"]}
              rows={dashboard.segment.rows.map((row) => [
                row.segment,
                usdm(row.revenue),
                usdm(row.operatingIncome),
                pct(row.calculatedOperatingMargin),
                row.growth == null ? "n/a" : pct(row.growth),
                row.keyDrivers.join("; "),
                row.marginDebate,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="azure-ai" className="mt-6 space-y-6">
          <SectionCard title="Azure & AI Factory" description="This tab frames Microsoft as a capacity allocator: demand, cloud margin, capex, and utilization must work together.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="AI ARR" value={`$${dashboard.aiFactory.aiArr.toFixed(0)}bn`} note="+123% YoY management commentary" />
              <ScoreBlock label="CY2026 Capex" value={`$${dashboard.aiFactory.cy26Capex.toFixed(0)}bn`} note="Management guidance" />
              <ScoreBlock label="AI ARR / Ann. Q3 Capex" value={multiple(dashboard.aiFactory.aiArrToAnnualizedCapex)} note="Throughput sanity check" />
              <ScoreBlock label="FY26E Capex Intensity" value={pct(dashboard.aiFactory.capexIntensity)} note="Derived from Q3 YTD + Q4 guide" />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Cloud Revenue, Azure Growth, Cloud GM">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cloudRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cloudRevenue" stroke="#2563eb" strokeWidth={3} name="Cloud revenue $bn" />
                    <Line type="monotone" dataKey="azureGrowth" stroke="#0f766e" strokeWidth={3} name="Azure growth %" />
                    <Line type="monotone" dataKey="cloudGm" stroke="#a16207" strokeWidth={3} name="Cloud GM %" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <BulletPanel title={dashboard.aiFactory.status} items={dashboard.aiFactory.diagnostics.map((item) => `${item.label}: ${typeof item.value === "number" ? pct(item.value) : item.value}. ${item.interpretation}`)} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="openai" className="mt-6 space-y-6">
          <SectionCard title="OpenAI Exposure Lab" description="OpenAI is separated into official disclosures and scenario economics, because Microsoft does not disclose revenue share percentage or compute margin.">
            <div className="grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Investment Impact" value="$14m" note="Q3 FY2026 net income reduction" />
              <ScoreBlock label="RPO Including OpenAI" value="$627bn" note="99% YoY incl. OpenAI; 26% excl. OpenAI" />
              <ScoreBlock label="Scenario Revenue Contribution" value={pct(dashboard.openAi.scenarioRevenue)} note="Not official disclosure" />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <BulletPanel title="Official / Management Disclosures" items={dashboard.openAi.officialRecords.map((item) => `${item.label}: ${item.detail}`)} />
              <BulletPanel title="Scenario-Only Economics" items={[
                `Revenue contribution: ${pct(dashboard.openAi.scenarioRevenue)}`,
                `Gross margin: ${pct(dashboard.openAi.scenarioGrossMargin)}`,
                "Revenue share percentage, compute resale margin, and OpenAI revenue split are not disclosed.",
              ]} />
            </div>
            <DataTable
              headers={["Scenario", "Probability", "Revenue Contribution", "Gross Margin", "Narrative"]}
              rows={dashboard.openAi.cases.map((item) => [
                item.scenario,
                pct(item.probability),
                pct(item.revenueContribution),
                pct(item.grossMargin),
                item.narrative,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="copilot" className="mt-6 space-y-6">
          <SectionCard title="Copilot Monetization Lab" description="Copilot is not just revenue. It must pass ARPU, seat penetration, usage cost, and gross-margin tests.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Paid Seats" value={`${dashboard.copilot.paidSeats.toFixed(0)}m+`} note="Management commentary" />
              <ScoreBlock label="Target Seats" value={`${dashboard.copilot.targetSeats.toFixed(1)}m`} note="Scenario assumption" />
              <ScoreBlock label="Target Revenue" value={`$${dashboard.copilot.targetRevenue.toFixed(1)}m`} note="Seats x ARPU" />
              <ScoreBlock label="Gross Profit" value={`$${dashboard.copilot.grossProfitAfterInference.toFixed(1)}m`} note="After inference cost" />
              <ScoreBlock label="Signal" value={dashboard.copilot.adoptionSignal} note={dashboard.copilot.sourceBoundary} />
            </div>
            <BulletPanel title="Copilot Debate" items={dashboard.copilot.bullets} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margin" className="mt-6 space-y-6">
          <SectionCard title="Margin Bridge" description="AI can lift software ARPU but dilute gross margin through inference, model costs, and short-lived GPU/CPU depreciation.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Microsoft Cloud GM Bridge">
                <WaterfallChart rows={dashboard.marginBridge.bridge} formatter={(value) => pct(value)} />
              </ChartPanel>
              <ChartPanel title="Operating Margin Bridge">
                <WaterfallChart rows={dashboard.marginBridge.operatingMarginBridge} formatter={(value) => pct(value)} />
              </ChartPanel>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{dashboard.marginBridge.warning}</p>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capex-fcf" className="mt-6 space-y-6">
          <SectionCard title="Capex & FCF Engine" description="FCF is the pressure point in the AI cycle because capex rises before utilization, pricing, and depreciation normalization.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Short-Lived Mix" value="~67%" note="Q3 capex primarily GPUs/CPUs" />
              <ScoreBlock label="Q4 Capex Guide" value=">$40bn" note="Management commentary" />
              <ScoreBlock label="Payback Stress" value={`${dashboard.capexFcf.paybackYears.toFixed(1)} yrs`} note="Scenario-only test" />
              <ScoreBlock label="CY2026 Capex" value={`$${dashboard.capexFcf.cy26Capex.toFixed(0)}bn`} note="Guided calendar-year capex" />
            </div>
            <DataTable
              headers={["Period", "Revenue", "OCF", "Capex", "FCF", "FCF Margin", "Capex Intensity", "D&A / Sales"]}
              rows={dashboard.capexFcf.rows.map((row) => [
                row.period,
                usdm(row.revenue),
                usdm(row.operatingCashFlow),
                usdm(row.capex),
                usdm(row.freeCashFlow),
                pct(row.fcfMargin),
                pct(row.capexIntensity),
                pct(row.depreciationSalesRatio),
              ])}
            />
            <p className="mt-4 text-sm leading-6 text-slate-600">{dashboard.capexFcf.interpretation}</p>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="business-mix" className="mt-6 space-y-6">
          <SectionCard title="Business Mix Matrix" description="MSFT valuation has to split durable high-margin software, capital-intensive AI cloud, and lower-quality consumer/gaming cash flows.">
            <DataTable
              headers={["Business", "Revenue Pool", "Moat", "Growth", "Margin", "Risk", "Quality", "Strategic Role"]}
              rows={dashboard.businessMix.rows.map((row) => [
                row.name,
                row.revenuePool,
                row.moatScore,
                row.growthScore,
                row.marginScore,
                row.riskScore,
                row.qualityScore,
                row.strategicRole,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <MsftHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <MsftBacktestPanel />
          <SectionCard title="Valuation Triangulation" description="DCF, FCF yield, P/E, EV/EBIT, SOTP, and an explicit AI optionality layer are blended without treating undisclosed OpenAI economics as official actuals.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Method Values">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={valuationRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} angle={-14} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usd(value)} />
                    <Bar dataKey="value" fill="#2563eb" name="Fair value / share" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <DataTable
                headers={["Method", "Value", "Weight"]}
                rows={valuationRows.map((row) => [row.method, usd(row.value), pct(row.weight)])}
              />
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
          <SectionCard title="Risk Red Team" description="The cockpit treats AI upside as falsifiable: every risk maps to a model driver or monitoring trigger.">
            <DataTable
              headers={["Risk", "Score", "Driver", "Kill Criterion", "Monitoring Trigger", "Mitigation"]}
              rows={dashboard.risks.rows.map((risk) => [
                risk.title,
                risk.riskScore,
                risk.affectedDriver,
                risk.killCriterion,
                risk.monitoringTrigger,
                risk.mitigation,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-return" className="mt-6 space-y-6">
          <MsftCapitalReturnsBackendPanel fallback={dashboard.capitalReturn} />
          <SectionCard title="Capital Return" description="Buybacks and dividends are still meaningful, but AI capex now competes directly with near-term FCF conversion.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="FY25 FCF Payout" value={pct(dashboard.capitalReturn.fy25FcfPayout)} note="Dividends + buybacks / FCF" />
              <ScoreBlock label="Q3 Shareholder Return" value={usdb(dashboard.capitalReturn.q3ShareholderReturn)} note="Dividends and buybacks" />
              <ScoreBlock label="Net Cash ex Leases" value={usdb(dashboard.capitalReturn.netCashExLeases)} note="Cash/ST investments less debt" />
              <ScoreBlock label="Net Cash after Leases" value={usdb(dashboard.capitalReturn.netCashAfterLeases)} note="Valuation bridge input" />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{dashboard.capitalReturn.interpretation}</p>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function MsftCapitalReturnsBackendPanel({
  fallback,
}: {
  fallback: {
    fy25DividendPerShare: number;
    fy25Buybacks: number;
    fy25FcfPayout: number;
  };
}) {
  const [history, setHistory] = useState<MsftCapitalReturnHistory | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
    setStatus("loading");
    fetch(`${apiBase}/api/stocks/msft/capital-returns?years=8`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then((payload: MsftCapitalReturnHistory) => {
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
  }, []);

  const rows = history?.rows ?? [];
  const forward = history?.forwardExpectation ?? null;
  const chartRows = [
    ...rows.map((row) => ({
      year: `FY${row.fiscalYear}`,
      dividendCashCost: row.dividendCashCost ?? 0,
      buybackAmount: row.buybackAmount ?? 0,
      equityFreeCashFlow: row.equityFreeCashFlow ?? 0,
      dividendCashForecast: null as number | null,
      buybackForecast: null as number | null,
      equityFreeCashFlowForecast: null as number | null,
      totalCapitalReturn: row.totalCapitalReturn ?? 0,
      dps: row.dividendPerShare,
      fcfCoverage: row.fcfCoverage,
      sourceQuality: row.sourceQuality,
      isForecast: false,
    })),
    ...(forward
      ? [{
          year: `FY${forward.fiscalYear}E`,
          dividendCashCost: null,
          buybackAmount: null,
          equityFreeCashFlow: null,
          dividendCashForecast: forward.dividendCashCost ?? 0,
          buybackForecast: forward.buybackAmount ?? 0,
          equityFreeCashFlowForecast: forward.equityFreeCashFlow ?? 0,
          totalCapitalReturn: forward.totalCapitalReturn ?? 0,
          dps: forward.dividendPerShare,
          fcfCoverage: forward.fcfCoverage,
          sourceQuality: forward.sourceQuality,
          isForecast: true,
        }]
      : []),
  ];
  const latest = rows[rows.length - 1] ?? null;
  const warningText = history?.warnings?.map((warning) => `${warning.title}: ${warning.detail}`).join(" ") ?? null;
  const forecastLabel = forward?.fiscalYear ? `FY${forward.fiscalYear}E` : "Forward";

  return (
    <SectionCard
      title="Backend Dividend & Buyback History"
      description="Eight-year annual capital-return history from the MSFT backend database. Dividends and buybacks are stacked into one capital-return bar and compared against annual FCF."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock
          label="Latest DPS"
          value={latest?.dividendPerShare != null ? usd(latest.dividendPerShare) : usd(fallback.fy25DividendPerShare)}
          note={latest ? `FY${latest.fiscalYear} backend row` : "Static valuation fallback"}
        />
        <ScoreBlock
          label="Latest FCF"
          value={latest?.equityFreeCashFlow != null ? usdm(latest.equityFreeCashFlow) : "n/a"}
          note="Equity free cash flow"
        />
        <ScoreBlock
          label="Latest Buyback"
          value={latest?.buybackAmount != null ? usdm(latest.buybackAmount) : usdm(fallback.fy25Buybacks)}
          note={latest ? `FY${latest.fiscalYear} backend row` : "Static valuation fallback"}
        />
        <ScoreBlock
          label="Forward Capital Return"
          value={forward?.totalCapitalReturn != null ? usdm(forward.totalCapitalReturn) : "n/a"}
          note={`${forecastLabel} dashed forecast bar`}
        />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Capital-return data service is temporarily unavailable.
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
                  <pattern id="msftDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#ecfdf5" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#0f766e" strokeWidth="2" />
                  </pattern>
                  <pattern id="msftBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#eff6ff" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="2" />
                  </pattern>
                  <pattern id="msftFcfForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#fff7ed" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#f97316" strokeWidth="2" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} />
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
                    return [usdm(value), labelByKey[name] ?? name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return `${label}${row?.isForecast ? " | forecast assumption" : ""}${row?.dps != null ? ` | DPS ${usd(row.dps)}` : ""}${row?.fcfCoverage != null ? ` | FCF coverage ${multiple(row.fcfCoverage)}` : ""}`;
                  }}
                />
                <Legend />
                <Bar dataKey="dividendCashCost" stackId="capitalReturn" fill="#0f766e" name="Dividends" />
                <Bar dataKey="buybackAmount" stackId="capitalReturn" fill="#2563eb" name="Buybacks" />
                <Bar dataKey="equityFreeCashFlow" fill="#f97316" name="FCF" />
                <Bar dataKey="dividendCashForecast" stackId="forecastCapitalReturn" fill="url(#msftDividendForecastHatch)" stroke="#0f766e" strokeDasharray="4 3" name={`${forecastLabel} dividend forecast`} />
                <Bar dataKey="buybackForecast" stackId="forecastCapitalReturn" fill="url(#msftBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name={`${forecastLabel} buyback forecast`} />
                <Bar dataKey="equityFreeCashFlowForecast" fill="url(#msftFcfForecastHatch)" stroke="#f97316" strokeDasharray="4 3" name={`${forecastLabel} FCF forecast`} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Backend Source Notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Annual rows come from the MSFT backend financial_periods table. Dividend cash cost is reconciled from cash dividends paid and diluted shares. Buybacks use annual repurchase cash flow. The forward bar is a forecast assumption and is excluded from 8Y cumulative totals.
            </p>
            <div className="mt-4 grid gap-3">
              <ScoreBlock label="Capital Return, 8Y" value={history ? usdm(history.summary.cumulativeCapitalReturn) : "n/a"} note="Dividends plus buybacks" />
              <ScoreBlock label="FCF, 8Y" value={history ? usdm(history.summary.cumulativeFcf) : "n/a"} note="Backend annual FCF series" />
              <ScoreBlock label="Forward Buyback" value={forward?.buybackAmount != null ? usdm(forward.buybackAmount) : "n/a"} note={`${forecastLabel} forecast assumption`} />
              <ScoreBlock label="Latest FCF Coverage" value={latest?.fcfCoverage != null ? multiple(latest.fcfCoverage) : multiple(1 / Math.max(fallback.fy25FcfPayout, 0.01))} note="FCF / dividends + buybacks" />
            </div>
          </div>

          <div className="xl:col-span-2">
            <DataTable
              headers={["Fiscal Year", "DPS", "Dividends", "Buybacks", "Capital Return", "FCF", "FCF Coverage", "Source"]}
              rows={[...rows, ...(forward ? [forward] : [])].map((row) => [
                `FY${row.fiscalYear}${row.isForecast ? "E" : ""}`,
                row.dividendPerShare != null ? usd(row.dividendPerShare) : "n/a",
                row.dividendCashCost != null ? usdm(row.dividendCashCost) : "n/a",
                row.buybackAmount != null ? usdm(row.buybackAmount) : "n/a",
                row.totalCapitalReturn != null ? usdm(row.totalCapitalReturn) : "n/a",
                row.equityFreeCashFlow != null ? usdm(row.equityFreeCashFlow) : "n/a",
                row.fcfCoverage != null ? multiple(row.fcfCoverage) : "n/a",
                `${row.sourceQuality.replace(/_/g, " ")}${row.isForecast ? " / dashed forecast" : ""}`,
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

function MsftHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: MsftHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows.some((row) => row.event.id.startsWith("sec-q"))
    ? rows.filter((row) => row.event.id.startsWith("sec-q"))
    : rows;
  const [visibleCount, setVisibleCount] = useState(16);
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: calendarQuarterCoveredLabel(row.event, true),
      fiscalPeriod: row.event.periodLabel ?? row.event.fiscalPeriod ?? row.event.fiscalQuarter ?? row.event.eventDate,
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
      title="MSFT Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event from the MSFT SQLite backend pilot. Static dashboard data remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length || "n/a"} note="FY18 Q1 through latest imported quarter" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static MSFT dashboard sections still render.
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
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? calendarQuarterCoveredLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? calendarQuarterCoveredLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
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
                <p className="font-semibold text-ink">{selected.event.title ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Market snapshot input" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Including dividend bridge where modeled" />
                </div>
                <DataTable
                  headers={["Method", "Value", "Description"]}
                  rows={methodRows.map((row) => [
                    row.label ?? row.key ?? "Method",
                    typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : usd(row.value)) : "n/a",
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
        <p className="mt-5 text-sm text-slate-600">Loading MSFT historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function MsftBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-01");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MsftBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
      const response = await fetch(`${apiBase}/api/msft/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`MSFT backend returned ${response.status}`);
      const payload = (await response.json()) as MsftBacktestResult;
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
      msftReturn: (row.msftBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="MSFT vs SPY Backtest"
      description="Select a date range and compare daily MSFT buy-and-hold performance against SPY from the backend price history."
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
          <ChartPanel title="MSFT vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="msftReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="MSFT" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="MSFT CAGR" value={metrics.msftBuyHold?.cagr != null ? pct(metrics.msftBuyHold.cagr) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="MSFT MDD" value={metrics.msftBuyHold?.maxDrawdown != null ? pct(metrics.msftBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="MSFT Sharpe" value={metrics.msftBuyHold?.sharpe != null ? metrics.msftBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="MSFT Vol" value={metrics.msftBuyHold?.volatility != null ? pct(metrics.msftBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
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

function InsightPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-ink">
        {icon}
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-semibold text-ink">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
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

function WarningList({ warnings }: { warnings: Array<{ id: string; title: string; detail: string; severity: string }> }) {
  if (!warnings.length) {
    return <p className="text-sm text-emerald-700">No model warnings are active.</p>;
  }
  return (
    <div className="space-y-3">
      {warnings.map((warning) => (
        <div key={warning.id} className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-amber-950">{warning.title}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold uppercase text-amber-700">{warning.severity}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-amber-900">{warning.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
