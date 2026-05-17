import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, BrainCircuit, Building2, Cpu, DollarSign, Gavel, Search, Server, Tv, Waypoints } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { WaterfallChart } from "../../components/shared/WaterfallChart";
import {
  attachGooglRuntimeContext,
  buildGooglDashboardData,
  defaultGooglValuationAssumptions,
  resolveGooglDataset,
} from "./calculations";
import type { GooglValuationAssumptions } from "./model";

type GooglHistoricalValuationRun = {
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

type GooglHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  label?: string | null;
};

type GooglHistoricalValuationItem = {
  event: GooglHistoricalValuationEvent;
  valuationRun: GooglHistoricalValuationRun | null;
};

type GooglHistoricalValuationResponse = {
  historicalValuations?: GooglHistoricalValuationItem[];
};

type GooglBacktestMetric = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type GooglBacktestResult = {
  status?: string;
  warnings?: string[];
  metrics?: {
    googlBuyHold?: GooglBacktestMetric;
    stock?: GooglBacktestMetric;
    spy?: GooglBacktestMetric;
  };
  curve?: Array<{
    date: string;
    spy: number;
    benchmark?: number;
    googlBuyHold: number;
  }>;
};

function loadSavedGooglValuationAssumptions() {
  if (typeof window === "undefined") return defaultGooglValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-GOOGL");
  if (!saved) return defaultGooglValuationAssumptions;
  try {
    return {
      ...defaultGooglValuationAssumptions,
      ...(JSON.parse(saved) as Partial<GooglValuationAssumptions>),
    };
  } catch {
    return defaultGooglValuationAssumptions;
  }
}

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

function multiple(value: number) {
  return `${value.toFixed(1)}x`;
}

function score(value: number) {
  return value.toFixed(0);
}

const chartColors = ["#1f6f78", "#334155", "#a16207", "#7c3aed", "#0f766e", "#be123c"];

export function GooglDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [valuationAssumptions, setValuationAssumptions] = useState<GooglValuationAssumptions>(
    loadSavedGooglValuationAssumptions,
  );
  const [historicalValuations, setHistoricalValuations] = useState<GooglHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);

  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveGooglDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () =>
      attachGooglRuntimeContext(moduleData, {
        periodId: resolvedPeriod,
        dataSourceType,
      }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const dashboard = useMemo(
    () => buildGooglDashboardData(runtimeData, resolvedPeriod, scenario, valuationAssumptions),
    [runtimeData, resolvedPeriod, scenario, valuationAssumptions],
  );

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as GooglValuationAssumptions);
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
        const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
        const response = await fetch(
          `${apiBase}/api/googl/historical-valuations?scenario=Base&modelVersion=googl_v1_backend_pilot`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`GOOGL backend returned ${response.status}`);
        const payload = (await response.json()) as GooglHistoricalValuationResponse;
        const rows = payload.historicalValuations ?? [];
        setHistoricalValuations(rows);
        setSelectedHistoricalEventId((current) => current ?? rows.find((row) => row.valuationRun)?.event.id ?? rows[0]?.event.id ?? null);
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

  const revenueRows = [
    { line: "Search & other", value: dashboard.revenueLine.googleSearchOther },
    { line: "YouTube ads", value: dashboard.revenueLine.youtubeAds },
    { line: "Network", value: dashboard.revenueLine.googleNetwork },
    { line: "Subscriptions / devices", value: dashboard.revenueLine.googleSubscriptionsPlatformsDevices },
    { line: "Cloud", value: dashboard.revenueLine.googleCloud },
    { line: "Other Bets", value: dashboard.revenueLine.otherBets },
  ];

  const segmentRows = dashboard.dataset.segments
    .filter((row) => row.periodId === dashboard.period.id)
    .map((row) => ({
      segment: row.segment,
      revenue: row.revenue,
      operatingIncome: row.operatingIncome,
      margin: row.revenue ? row.operatingIncome / row.revenue : 0,
    }));

  const forecastRows = dashboard.valuationEngine.dcf.forecast.map((row) => ({
    year: row.year,
    services: row.servicesRevenue,
    cloud: row.cloudRevenue,
    fcfMargin: row.freeCashFlowMargin * 100,
    capex: row.capex,
  }));

  const sourceCounts = dashboard.dataset.sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.sourceType] = (acc[source.sourceType] ?? 0) + 1;
    return acc;
  }, {});

  const valuationRows = [
    { method: "DCF", value: dashboard.valuationEngine.dcf.fairValuePerShare, weight: dashboard.valuationEngine.weights.dcf },
    { method: "FCF Yield", value: dashboard.valuationEngine.fcfYieldFairValue, weight: dashboard.valuationEngine.weights.fcfYield },
    { method: "EV / EBIT", value: dashboard.valuationEngine.evEbitFairValue, weight: dashboard.valuationEngine.weights.evEbit },
    { method: "P/E", value: dashboard.valuationEngine.peFairValue, weight: dashboard.valuationEngine.weights.pe },
    { method: "SOTP", value: dashboard.valuationEngine.sotpFairValue, weight: dashboard.valuationEngine.weights.sotp },
  ];
  const transcriptQuarters = dashboard.transcriptIntelligence.quarters;
  const selectedTranscript = transcriptQuarters.find((quarter) => quarter.transcriptId === selectedTranscriptId) ?? transcriptQuarters[0];
  const transcriptTrendRows = dashboard.transcriptIntelligence.focusTrend.map((trend) => ({
    theme: trend.label,
    early: Number(trend.firstAverage.toFixed(1)),
    recent: Number(trend.secondAverage.toFixed(1)),
    direction: trend.direction,
  }));

  return (
    <div className="space-y-6">
      <SectionCard
        title="Alphabet Research Cockpit"
        description="Official actuals anchor Search, YouTube, Cloud, Other Bets, CapEx, FCF and balance sheet data. AI, TPU, regulatory and Other Bets debates are mapped into explicit scenario assumptions and capped valuation layers."
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Actual" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Recommended Fair Value" value={usd(dashboard.valuation.recommendedFairValue ?? 0)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs current price`} icon={DollarSign} />
          <ScoreBlock label="Current Price" value={usd(dashboard.dataset.marketData.currentPrice)} note={`${dashboard.dataset.marketData.priceDate} market snapshot`} icon={DollarSign} />
          <ScoreBlock label="Cloud Backlog" value={usdb(dashboard.cloud.backlog)} note={`${multiple(dashboard.cloud.backlogCoverageYears)} annualized Cloud revenue`} icon={Server} />
          <ScoreBlock label="TPU Moat Score" value={score(dashboard.tpu.tpuMoatScore)} note={`Compute constraint ${pct(dashboard.tpu.computeConstraint)}`} icon={Cpu} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <InsightPanel title="Thesis" icon={BrainCircuit} text="Alphabet is not just an ad company: Search cash flow funds AI infra, YouTube deepens engagement, Cloud monetizes enterprise AI, and TPU vertical integration can lower unit economics." />
          <InsightPanel title="Main Debate" icon={Search} text="AI Search may expand usage and commercial intent, but answer-heavy surfaces can also compress monetizable clicks and revenue per query." />
          <InsightPanel title="Critical KPI" icon={Server} text="Cloud margin and backlog conversion must rise while FY2026-FY2027 technical infrastructure CapEx and depreciation accelerate." />
          <InsightPanel title="Red Team" icon={Gavel} text={dashboard.risks.verdict} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.slice(0, 12).map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="USD" />
        ))}
      </div>

      <SectionCard title="Source Boundary" description="The cockpit keeps official actuals, management guidance, company commentary, forecast assumptions, research-only risk notes and market data separate.">
        <div className="grid gap-4 lg:grid-cols-4">
          <BulletPanel title="Official Actuals" items={[
            "Q1 2026 revenue, operating income, EPS, OCF, CapEx, FCF, segment revenue and segment operating income.",
            "FY2025 annual revenue lines, segment operating income, cash flow, CapEx, buybacks, dividends, cash, debt and share count.",
          ]} />
          <BulletPanel title="Company Commentary" items={[
            "Subscriptions count, Gemini Enterprise paid MAU growth, token throughput, Cloud AI customer scale, Waymo weekly rides, YouTube living-room hours and TPU performance comments.",
            "Commentary is not official_actual and is not hard-wired into valuation without an assumption cap.",
          ]} />
          <BulletPanel title="Source Mix" items={Object.entries(sourceCounts).map(([type, count]) => `${type}: ${count}`)} />
          <BulletPanel title="Data Gaps" items={dashboard.dataStatus.missingFields} />
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
          <SectionCard title="Executive Snapshot" description="The PM-level view of Alphabet's operating mix, FCF durability, AI CapEx and valuation.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Q1 Revenue" value={usdb(dashboard.period.totalRevenue)} note={`${pct(dashboard.period.revenueGrowth ?? 0)} reported growth`} icon={Building2} />
              <ScoreBlock label="Operating Margin" value={pct(dashboard.period.operatingIncome / dashboard.period.totalRevenue)} note="Q1 2026 actual" icon={DollarSign} />
              <ScoreBlock label="TTM FCF" value={usdb(dashboard.capitalReturn.ttmFcf)} note={`${pct(dashboard.capitalReturn.ttmFcfYield)} FCF yield`} icon={DollarSign} />
              <ScoreBlock label="Net Cash" value={usdb(dashboard.capitalReturn.netCash)} note={usd(dashboard.capitalReturn.netCashPerShare) + " per share"} icon={DollarSign} />
              <ScoreBlock label="Search Moat" value={score(dashboard.search.searchMoatScore)} note={`AI balance ${score(dashboard.search.aiSearchBalanceScore)}`} icon={Search} />
              <ScoreBlock label="YouTube Scale" value={score(dashboard.youtube.youtubeScaleScore)} note="Living-room + Shorts + subs" icon={Tv} />
              <ScoreBlock label="Cloud AI Workloads" value={score(dashboard.cloud.aiWorkloadScore)} note={`${score(dashboard.cloud.computeConstraintScore)} compute risk`} icon={Server} />
              <ScoreBlock label="Moat Score" value={score(dashboard.moat.moatScore)} note="Composite across six drivers" icon={BrainCircuit} />
            </div>
          </SectionCard>

          <SectionCard title="Revenue Mix and Segment Profit" description="Alphabet's valuation depends on different economic engines, not one consolidated revenue multiple.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Q1 2026 Revenue Lines">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={revenueRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="line" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdb(value)} />
                    <Bar dataKey="value" name="Revenue">
                      {revenueRows.map((_, index) => (
                        <Cell key={index} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Segment Revenue and Operating Income">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdb(value)} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#1f6f78" name="Revenue" />
                    <Bar dataKey="operatingIncome" fill="#a16207" name="Operating income" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="search-ads" className="mt-6 space-y-6">
          <SectionCard title="Search & Ads Moat" description="The core underwrite is whether AI Search expands usage and commercial intent faster than it cannibalizes clicks.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Search Revenue" value={usdb(dashboard.search.searchRevenue)} note={`${pct(dashboard.search.searchGrowth)} scenario CAGR`} icon={Search} />
              <ScoreBlock label="Paid Clicks Growth" value={pct(dashboard.search.paidClicksGrowth)} note="FY2025 Search & other" icon={Search} />
              <ScoreBlock label="CPC Growth" value={pct(dashboard.search.cpcGrowth)} note="FY2025 Search & other" icon={DollarSign} />
              <ScoreBlock label="TAC Ratio" value={pct(dashboard.search.tacRatio)} note="Q1 Google advertising TAC / revenue" icon={DollarSign} />
              <ScoreBlock label="Risk" value={dashboard.search.monetizationRisk} note={`Balance score ${score(dashboard.search.aiSearchBalanceScore)}`} icon={AlertTriangle} />
            </div>
            <div className="mt-6">
              <WaterfallChart rows={dashboard.search.bridge} formatter={(value) => usdb(value)} />
            </div>
          </SectionCard>
          <SectionCard title="Search Red-Team Questions" description="These are the questions the model forces into assumptions rather than leaving as vague AI narrative.">
            <div className="grid gap-4 lg:grid-cols-3">
              <BulletPanel title="Bull Evidence" items={[
                "Paid clicks and CPC both grew in FY2025 Search & other.",
                "AI Overviews and AI Mode can increase query frequency and commercial relevance.",
                "TPU cost reductions may lower serving cost for richer answers.",
              ]} />
              <BulletPanel title="Bear Evidence" items={[
                "Answer surfaces can satisfy intent without a paid click.",
                "Default distribution remedies can weaken Android, Chrome and partner placement.",
                "TAC and privacy restrictions can pressure monetization even if usage rises.",
              ]} />
              <BulletPanel title="Monitoring" items={[
                "Search & other revenue growth versus paid-click/CPC commentary.",
                "TAC as percentage of Google advertising revenue.",
                "AI Overviews / AI Mode ad format disclosures.",
                "Commercial query share and advertiser ROI commentary.",
              ]} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="youtube" className="mt-6 space-y-6">
          <SectionCard title="YouTube Economics" description="YouTube is modeled as creator graph, CTV usage, Shorts supply, ads and subscription ecosystem, not just a video ad line.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="YouTube Ads" value={usdb(dashboard.youtube.adsRevenue)} note={`${pct(valuationAssumptions.youtubeRevenueCagr)} scenario CAGR`} icon={Tv} />
              <ScoreBlock label="Living-Room Hours" value={`${(dashboard.youtube.livingRoomDailyHours / 1_000_000).toFixed(0)}m`} note="Daily US hours signal" icon={Tv} />
              <ScoreBlock label="Shorts Publishers" value={`${(dashboard.youtube.shortsPublisherCount / 1_000_000).toFixed(0)}m`} note="Channels publishing daily" icon={Waypoints} />
              <ScoreBlock label="Subscriptions" value={`${dashboard.youtube.subscriptionsSignal}m`} note="Company commentary" icon={DollarSign} />
              <ScoreBlock label="Monetization Score" value={score(dashboard.youtube.monetizationScore)} note="Ads + subscription flywheel" icon={BrainCircuit} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {dashboard.youtube.notes.map((note) => (
                <MiniPanel key={note} title="YouTube Note" text={note} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="cloud" className="mt-6 space-y-6">
          <SectionCard title="Cloud & AI Workloads" description="Cloud is the most visible AI monetization line: backlog, growth, margin and compute capacity have to move together.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Cloud Revenue" value={usdb(dashboard.cloud.revenue)} note="Annualized Q1 2026" icon={Server} />
              <ScoreBlock label="Cloud Margin" value={pct(dashboard.cloud.margin)} note="Q1 2026 actual" icon={DollarSign} />
              <ScoreBlock label="Backlog" value={usdb(dashboard.cloud.backlog)} note={`${pct(dashboard.dataset.cloudBacklog.expectedRecognitionWithin24Months)} in 24 months`} icon={Server} />
              <ScoreBlock label="Backlog Coverage" value={multiple(dashboard.cloud.backlogCoverageYears)} note="Backlog / annualized revenue" icon={Server} />
              <ScoreBlock label="AI Workload Score" value={score(dashboard.cloud.aiWorkloadScore)} note={`${score(dashboard.cloud.computeConstraintScore)} compute risk`} icon={BrainCircuit} />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Cloud Margin Bridge">
                <WaterfallChart rows={dashboard.cloud.marginBridge} formatter={(value) => pct(value)} />
              </ChartPanel>
              <ChartPanel title="DCF Forecast: Services, Cloud, FCF Margin">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={forecastRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="services" stroke="#1f6f78" name="Services revenue" strokeWidth={2} />
                    <Line type="monotone" dataKey="cloud" stroke="#7c3aed" name="Cloud revenue" strokeWidth={2} />
                    <Line type="monotone" dataKey="fcfMargin" stroke="#a16207" name="FCF margin %" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="tpu-capex" className="mt-6 space-y-6">
          <SectionCard title="TPU / Gemini / AI CapEx Lab" description="TPU is treated as a double-edged underwriting variable: lower cost per token and Cloud margin advantage versus higher CapEx, depreciation, power and utilization risk.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="TTM CapEx" value={usdb(dashboard.tpu.capex)} note={`${pct(dashboard.tpu.capexIntensity)} of FY2025 revenue`} icon={Cpu} />
              <ScoreBlock label="FY2026 CapEx Guide" value={usdb(dashboard.tpu.fy2026CapexMidpoint)} note={`${pct(dashboard.tpu.fy2026CapexIntensityOfTtmRevenue)} of annualized Q1 revenue`} icon={Cpu} />
              <ScoreBlock label="TPU Moat Score" value={score(dashboard.tpu.tpuMoatScore)} note="Performance / cost / payback" icon={Cpu} />
              <ScoreBlock label="CapEx Payback" value={score(dashboard.tpu.aiCapexPaybackScore)} note="Revenue and TPU benefit vs spend" icon={DollarSign} />
              <ScoreBlock label="D&A Burden" value={pct(dashboard.tpu.depreciationBurden)} note="Q1 D&A / revenue" icon={AlertTriangle} />
            </div>
            <div className="mt-6">
              <WaterfallChart rows={dashboard.tpu.bridge} formatter={(value) => usdb(value)} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="transcripts" className="mt-6 space-y-6">
          <SectionCard title="Earnings Call Intelligence Lab" description="Past eight Alphabet earnings-call periods are analyzed as transcript/commentary data. They explain market focus shifts, but remain blocked from valuation until promoted into explicit assumptions.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Past Events" value={transcriptQuarters.length.toString()} note="Latest eight earnings-call periods" icon={BrainCircuit} />
              <ScoreBlock label="Q&A Themes" value={dashboard.transcriptIntelligence.qaPairs.length.toString()} note="Analyst-focus extraction layer" icon={Search} />
              <ScoreBlock label="Latest Focus" value={selectedTranscript?.topFocus[0]?.label ?? "n/a"} note={selectedTranscript ? `${selectedTranscript.shortLabel} focus map` : "No transcript selected"} icon={AlertTriangle} />
              <ScoreBlock label="Valuation Guard" value="Blocked" note="Transcript data is not official actual" icon={Gavel} />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
              <InsightPanel title="Eight-Quarter AI Overview" text={dashboard.transcriptIntelligence.aiTrendSummary} icon={BrainCircuit} />
              <ChartPanel title="Market Focus Trend">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={transcriptTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="theme" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={86} />
                    <YAxis allowDecimals />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="early" fill="#94a3b8" name="Earlier four" />
                    <Bar dataKey="recent" fill="#1f6f78" name="Recent four" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-3">
                {transcriptQuarters.map((quarter) => {
                  const active = quarter.transcriptId === selectedTranscript?.transcriptId;
                  return (
                    <button
                      key={quarter.transcriptId}
                      type="button"
                      onClick={() => setSelectedTranscriptId(quarter.transcriptId)}
                      className={`w-64 rounded-md border p-4 text-left transition ${
                        active ? "border-ink bg-ink text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      <span className={`block text-xs font-medium ${active ? "text-slate-200" : "text-slate-500"}`}>{quarter.eventDate}</span>
                      <span className="mt-1 block text-sm font-semibold">{quarter.shortLabel}</span>
                      <span className={`mt-2 block text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>
                        {quarter.qaCount} Q&A themes · {quarter.sourceType}
                      </span>
                      <span className={`mt-2 block text-xs ${active ? "text-slate-100" : "text-slate-600"}`}>
                        {quarter.topFocus.map((focus) => focus.label).join(" / ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedTranscript ? (
              <>
                <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{selectedTranscript.fiscalPeriod}</p>
                        <h3 className="mt-1 text-lg font-semibold text-ink">{selectedTranscript.label}</h3>
                        <p className="mt-1 text-sm text-slate-500">{selectedTranscript.sourceGuard}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTranscript.topFocus.map((focus) => (
                          <span key={focus.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {focus.label}: {focus.score}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-700">{selectedTranscript.aiSummary}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <BulletPanel title="Management Messages" items={selectedTranscript.managementMessages} />
                      <BulletPanel title="Next-Call Watchlist" items={selectedTranscript.watchlist} />
                    </div>
                  </div>

                  <ChartPanel title="Selected Quarter Focus Map">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={selectedTranscript.focusScores}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={96} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="score" fill="#a16207" name="Focus score" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                </div>

                <DataTable
                  columns={["Date", "Topic", "Speaker", "Question", "Answer Summary", "Metric", "Guidance?", "Follow-Up Risk"]}
                  rows={selectedTranscript.analystQuestions.map((pair) => [
                    pair.eventDate,
                    pair.topic,
                    pair.speaker,
                    pair.question,
                    pair.answer,
                    pair.metricMentioned ?? "n/a",
                    pair.managementGaveQuantGuidance ? "Yes" : "No",
                    pair.followUpRisk,
                  ])}
                />
              </>
            ) : null}

            <DataTable
              columns={["Theme", "Earlier Four Avg", "Recent Four Avg", "Direction"]}
              rows={dashboard.transcriptIntelligence.focusTrend.map((trend) => [
                trend.label,
                trend.firstAverage.toFixed(1),
                trend.secondAverage.toFixed(1),
                trend.direction,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="regulatory" className="mt-6 space-y-6">
          <SectionCard title="Regulatory Red Team" description="Regulatory risk enters the scenario discount, kill criteria and SOTP adjustment rather than sitting in a generic risk list.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Regulatory Discount" value={pct(dashboard.regulatory.discount)} note="Valuation scenario input" icon={Gavel} />
              <ScoreBlock label="Risk Score" value={score(dashboard.regulatory.riskScore)} note="Probability x impact x detectability" icon={AlertTriangle} />
              <ScoreBlock label="Legal Accrual" value={usdb(dashboard.regulatory.legalAccrual)} note="Q1 2026 10-Q" icon={Gavel} />
              <ScoreBlock label="Red-Team Score" value={score(dashboard.risks.redTeamScore)} note={dashboard.risks.verdict} icon={AlertTriangle} />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>{["Risk", "Driver", "Probability", "Impact", "Detectability", "Severity"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {dashboard.regulatory.riskRows.map((risk) => (
                    <tr key={risk.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-semibold text-ink">{risk.name}</td>
                      <td className="px-3 py-3 text-slate-600">{risk.affectedDriver}</td>
                      <td className="px-3 py-3">{pct(risk.probability)}</td>
                      <td className="px-3 py-3">{pct(risk.impact)}</td>
                      <td className="px-3 py-3">{pct(risk.detectability)}</td>
                      <td className="px-3 py-3">{risk.severityLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <BulletPanel title="Kill Criteria" items={dashboard.risks.killCriteria} />
              <BulletPanel title="Monitoring Triggers" items={dashboard.risks.monitoringTriggers} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="other-bets" className="mt-6 space-y-6">
          <SectionCard title="Other Bets / Waymo Option Value" description="Other Bets is not allowed to become a narrative plug. The option value is capped and burn risk is visible.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Revenue" value={usdb(dashboard.otherBets.revenue)} note="Annualized Q1 2026" icon={Waypoints} />
              <ScoreBlock label="Operating Loss" value={usdb(dashboard.otherBets.operatingLoss)} note="Annualized Q1 2026" icon={AlertTriangle} />
              <ScoreBlock label="Waymo Rides" value={`${(dashboard.otherBets.waymoRideScale / 1_000).toFixed(0)}k`} note="Weekly fully autonomous rides" icon={Waypoints} />
              <ScoreBlock label="Option Value" value={usd(dashboard.otherBets.optionValuePerShare)} note={`Cap ${usd(dashboard.otherBets.cappedOptionValue)}`} icon={DollarSign} />
              <ScoreBlock label="Burn Risk" value={score(dashboard.otherBets.burnRiskScore)} note="Loss versus option value" icon={AlertTriangle} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {dashboard.otherBets.notes.map((note) => (
                <MiniPanel key={note} title="Option Framework" text={note} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <GooglHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <GooglBacktestPanel />
          <SectionCard title="Valuation Triangulation" description="DCF, FCF yield, EV/EBIT, P/E and SOTP are blended. TPU/CapEx and regulatory adjustments are capped to avoid AI narrative double counting.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="DCF" value={usd(dashboard.valuationEngine.dcf.fairValuePerShare)} note={`Terminal ${pct(dashboard.valuationEngine.dcf.terminalValueShareOfEv)}`} icon={DollarSign} />
              <ScoreBlock label="FCF Yield" value={usd(dashboard.valuationEngine.fcfYieldFairValue)} note={`${pct(valuationAssumptions.targetFcfYield)} target yield`} icon={DollarSign} />
              <ScoreBlock label="SOTP" value={usd(dashboard.valuationEngine.sotpFairValue)} note={`TPU adj ${usd(dashboard.valuationEngine.aiTpuCapexAdjustment)}`} icon={Building2} />
              <ScoreBlock label="Blended Value" value={usd(dashboard.valuationEngine.blendedFairValue)} note={`${usd(dashboard.valuationEngine.valuationRangeLow)}-${usd(dashboard.valuationEngine.valuationRangeHigh)}`} icon={DollarSign} />
              <ScoreBlock label="Prob.-Weighted" value={usd(dashboard.valuationEngine.probabilityWeightedFairValue)} note="Bear/base/bull weighted cross-check" icon={DollarSign} />
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
                    <Bar dataKey="value" fill="#1f6f78" name="Fair value" />
                    <Bar dataKey="weight" fill="#a16207" name="Weight" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="space-y-3">
                {dashboard.valuationEngine.sotpBreakdown.map((row) => (
                  <MiniPanel key={row.label} title={`${row.label}: ${usd(row.value)}`} text={`${row.note} Source type: ${row.sourceType}.`} />
                ))}
              </div>
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

        <Tabs.Content value="capital-return" className="mt-6 space-y-6">
          <SectionCard title="Capital Return & FCF" description="Alphabet's FCF durability has to be judged after the technical infrastructure step-up, not from one quarter in isolation.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="TTM FCF" value={usdb(dashboard.capitalReturn.ttmFcf)} note={`${pct(dashboard.capitalReturn.ttmFcfYield)} yield`} icon={DollarSign} />
              <ScoreBlock label="Net Cash" value={usdb(dashboard.capitalReturn.netCash)} note={usd(dashboard.capitalReturn.netCashPerShare) + " per share"} icon={DollarSign} />
              <ScoreBlock label="Buyback Auth." value={usdb(dashboard.capitalReturn.remainingBuybackAuthorization)} note={usd(dashboard.capitalReturn.remainingBuybackAuthorizationPerShare) + " per share"} icon={DollarSign} />
              <ScoreBlock label="Dividend Yield" value={pct(dashboard.capitalReturn.dividendYield)} note={usd(dashboard.capitalReturn.dividendPerShareAnnualized) + " annualized"} icon={DollarSign} />
              <ScoreBlock label="Capital Return Score" value={score(dashboard.capitalReturn.capitalReturnScore)} note="FCF, net cash, buyback capacity" icon={DollarSign} />
            </div>
            <div className="mt-6">
              <WaterfallChart rows={dashboard.tpu.bridge} formatter={(value) => usdb(value)} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="monitoring" className="mt-6 space-y-6">
          <SectionCard title="Monitoring Dashboard" description="The live diligence plan: what needs to move for the thesis to be confirmed or falsified.">
            <div className="grid gap-4 lg:grid-cols-3">
              <BulletPanel title="Confirming Evidence" items={[
                "Search & other revenue grows while TAC ratio is stable or lower.",
                "Cloud backlog additions remain strong and Cloud margin stays above 30% despite depreciation and Wiz.",
                "TPU response-cost reductions and utilization are visible in Cloud margin or AI gross margin commentary.",
                "TTM FCF margin recovers as FY2026/FY2027 CapEx is absorbed.",
              ]} />
              <BulletPanel title="Falsifiers" items={dashboard.risks.breakpoints.map((item) => `${item.driver}: ${item.threshold}`)} />
              <BulletPanel title="Watch List" items={dashboard.risks.monitoringTriggers.slice(0, 8)} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-6">
              {dashboard.moat.drivers.map((driver) => (
                <MiniPanel key={driver.label} title={`${driver.label}: ${score(driver.score)}`} text={driver.explanation} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function GooglHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: GooglHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows
    .slice()
    .sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
  const [visibleCount, setVisibleCount] = useState(16);
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: row.event.fiscalPeriod ?? row.event.eventDate,
      eventLabel: row.event.label ?? row.event.fiscalPeriod ?? row.event.eventDate,
      fiscalPeriod: row.event.fiscalPeriod ?? row.event.eventDate,
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
  const statusLabel = status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable";

  return (
    <SectionCard
      title="GOOGL Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by reporting event from the GOOGL SQLite backend pilot. Static dashboard data remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {statusLabel}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <HistoryStat label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <HistoryStat label="Quarter Events" value={displayRows.length || "n/a"} note="Canonical fiscal-quarter series" />
        <HistoryStat label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <HistoryStat label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static GOOGL dashboard sections still render.
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
              <HistoryStat label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0]?.event.fiscalPeriod ?? "n/a"} to ${visibleRows[visibleRows.length - 1]?.event.fiscalPeriod ?? "n/a"}`} />
              <HistoryStat label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <HistoryStat label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium in visible window" />
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
                  className={`min-w-[176px] rounded-md border px-3 py-2 text-left text-sm transition ${active ? "border-ink bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
                >
                  <span className={`block text-xs font-semibold uppercase ${active ? "text-slate-200" : "text-slate-500"}`}>{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{row.event.fiscalPeriod ?? row.event.label ?? row.event.eventType}</span>
                  <span className={`mt-1 block text-xs capitalize ${active ? "text-slate-200" : "text-slate-500"}`}>{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <HistoryStat label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <HistoryStat label="Fiscal Period" value={selected.event.fiscalPeriod ?? "n/a"} note={selected.event.fiscalYear ? `FY${selected.event.fiscalYear}` : "Event snapshot"} />
                  <HistoryStat label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Market snapshot input" />
                  <HistoryStat label="Fair Value" value={selected.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Persisted Base run" />
                  <HistoryStat label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <HistoryStat label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Expected shareholder CAGR" />
                </div>
                <DataTable
                  columns={["Method", "Value", "Description"]}
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
                        <div key={`${normalized.title ?? "warning"}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
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
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={74} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload;
                        return `${row?.eventLabel ?? label}${row?.fiscalPeriod ? ` (${row.fiscalPeriod})` : ""}${typeof row?.gapPct === "number" ? ` | Gap ${pct(row.gapPct)}` : ""}`;
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
        <p className="mt-5 text-sm text-slate-600">Loading GOOGL historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function GooglBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GooglBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
      const response = await fetch(`${apiBase}/api/googl/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`GOOGL backend returned ${response.status}`);
      const payload = (await response.json()) as GooglBacktestResult;
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
      googlReturn: (row.googlBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};
  const stockMetrics = metrics.googlBuyHold ?? metrics.stock;

  return (
    <SectionCard
      title="GOOGL vs SPY Backtest"
      description="Select a date range and compare daily GOOGL buy-and-hold performance against SPY from the backend price history."
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
          <ChartPanel title="GOOGL vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="googlReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="GOOGL" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <HistoryStat label="GOOGL CAGR" value={stockMetrics?.cagr != null ? pct(stockMetrics.cagr) : "n/a"} note="Buy-and-hold" />
              <HistoryStat label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <HistoryStat label="GOOGL MDD" value={stockMetrics?.maxDrawdown != null ? pct(stockMetrics.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <HistoryStat label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <HistoryStat label="GOOGL Sharpe" value={stockMetrics?.sharpe != null ? stockMetrics.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <HistoryStat label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <HistoryStat label="GOOGL Vol" value={stockMetrics?.volatility != null ? pct(stockMetrics.volatility) : "n/a"} note="Annualized daily vol" />
              <HistoryStat label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} note="Annualized daily vol" />
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

function HistoryStat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function ScoreBlock({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Search;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className="rounded-md bg-slate-100 p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function InsightPanel({ title, text, icon: Icon }: { title: string; text: string; icon: typeof Search }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-700" />
        <h3 className="font-semibold text-ink">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function MiniPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
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
      <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row[0]}`} className="border-b border-slate-100 align-top">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="max-w-md px-3 py-3 text-slate-700">
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
