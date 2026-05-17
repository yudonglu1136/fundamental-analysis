import { useCallback, useEffect, useMemo, useState } from "react";
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
  attachNocRuntimeContext,
  buildNocDashboardData,
  defaultNocValuationAssumptions,
  resolveNocDataset,
} from "./calculations";
import type { NocEarningsCallTopic, NocProgramStage, NocRiskLevel, NocValuationAssumptions } from "./model";
import { NocBulletPanel, NocChartPanel, NocInsightPanel, NocScoreBlock, NocSelectControl } from "./components/NocResearchPanels";

const topicTrendColors: Record<NocEarningsCallTopic, string> = {
  "B-21": "#7f1d1d",
  Sentinel: "#a16207",
  Space: "#164e63",
  "Mission Systems": "#0f766e",
  Margin: "#334155",
  "FCF / Cash": "#2563eb",
  "Backlog / Awards": "#6d28d9",
  "International / Budget": "#be185d",
};

const NOC_BACKEND_MODEL_VERSION = "noc_v1_backend_pilot";

type NocHistoricalValuationRun = {
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

type NocHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | string | null;
  periodLabel?: string | null;
  title?: string | null;
};

type NocHistoricalValuationItem = {
  event: NocHistoricalValuationEvent;
  valuationRun: NocHistoricalValuationRun | null;
};

type NocHistoricalValuationResponse = {
  historicalValuations?: NocHistoricalValuationItem[];
};

type NocBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  mdd?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
  vol?: number | null;
};

type NocBacktestCurvePoint = {
  date: string;
  nocBuyHold?: number;
  noc?: number;
  spy: number;
  benchmark?: number;
  nocPrice?: number | null;
  benchmarkPrice?: number | null;
};

type NocBacktestWarning = string | { id?: string; title?: string; detail?: string; severity?: string };

type NocBacktestResult = {
  status?: string;
  startDate?: string;
  endDate?: string;
  benchmarkTicker?: string;
  metrics?: {
    nocBuyHold?: NocBacktestMetricSet;
    noc?: NocBacktestMetricSet;
    spy?: NocBacktestMetricSet;
    benchmark?: NocBacktestMetricSet;
  };
  curve?: NocBacktestCurvePoint[];
  warnings?: NocBacktestWarning[];
};

type NocHistoricalChartRow = {
  period: string;
  fiscalPeriod: string;
  eventDate: string;
  price: number | null;
  fairValue: number | null;
  gapPct: number | null;
};

function loadSavedNocValuationAssumptions() {
  if (typeof window === "undefined") return defaultNocValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-NOC");
  if (!saved) return defaultNocValuationAssumptions;
  try {
    return {
      ...defaultNocValuationAssumptions,
      ...(JSON.parse(saved) as Partial<NocValuationAssumptions>),
    };
  } catch {
    return defaultNocValuationAssumptions;
  }
}

function usd(value: number) {
  return `$${value.toFixed(0)}`;
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
  return `${value.toFixed(2)}x`;
}

function nocQuarterLabel(event: NocHistoricalValuationEvent, compact = false) {
  const source = event.fiscalPeriod ?? event.periodLabel ?? "";
  const match = source.match(/FY(\d{4})\s+Q([1-4])/i) ?? source.match(/Q([1-4])\s+FY(\d{4})/i);
  if (!match) return event.periodLabel ?? event.fiscalPeriod ?? String(event.fiscalQuarter ?? event.eventDate);
  const firstForm = source.toUpperCase().startsWith("FY");
  const fiscalYear = Number(firstForm ? match[1] : match[2]);
  const fiscalQuarter = Number(firstForm ? match[2] : match[1]);
  const yearLabel = compact ? String(fiscalYear).slice(2) : String(fiscalYear);
  return `FY${yearLabel} Q${fiscalQuarter} / CY${yearLabel} Q${fiscalQuarter}`;
}

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
}

async function fetchJsonWithFallback<T>(paths: string[], init?: RequestInit): Promise<T> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const response = await fetch(`${apiBaseUrl()}${path}`, init);
      if (!response.ok) throw new Error(`Backend returned ${response.status} for ${path}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Backend request failed"));
}

function backtestMetricValue(metric: NocBacktestMetricSet | undefined, primary: "mdd" | "vol" | "cagr" | "sharpe") {
  if (!metric) return null;
  if (primary === "mdd") return metric.mdd ?? metric.maxDrawdown ?? null;
  if (primary === "vol") return metric.vol ?? metric.volatility ?? null;
  return metric[primary] ?? null;
}

export function NocDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const [programSegment, setProgramSegment] = useState("All");
  const [programStage, setProgramStage] = useState<NocProgramStage | "All">("All");
  const [programRisk, setProgramRisk] = useState<NocRiskLevel | "All">("All");
  const [selectedCallId, setSelectedCallId] = useState("q1-2026");
  const [valuationAssumptions, setValuationAssumptions] = useState<NocValuationAssumptions>(
    loadSavedNocValuationAssumptions,
  );
  const [historicalValuations, setHistoricalValuations] = useState<NocHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);

  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveNocDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () =>
      attachNocRuntimeContext(moduleData, {
        periodId: resolvedPeriod,
        dataSourceType,
      }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const dashboard = useMemo(() => buildNocDashboardData(runtimeData, resolvedPeriod, scenario), [runtimeData, resolvedPeriod, scenario]);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as NocValuationAssumptions);
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
        const payload = await fetchJsonWithFallback<NocHistoricalValuationResponse>(
          [
            `/api/noc/historical-valuations?scenario=Base&modelVersion=${NOC_BACKEND_MODEL_VERSION}`,
            `/api/stocks/noc/historical-valuations?scenario=Base&modelVersion=${NOC_BACKEND_MODEL_VERSION}`,
          ],
          { signal: controller.signal },
        );
        const rows = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setHistoricalValuations(rows);
        setSelectedHistoricalEventId((current) => current ?? [...rows].reverse().find((row) => /^q[1-4]_results$/.test(row.event.eventType) && row.valuationRun)?.event.id ?? [...rows].reverse().find((row) => row.valuationRun)?.event.id ?? rows[0]?.event.id ?? null);
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

  const segmentChartRows = useMemo(
    () =>
      dashboard.segment.rows
        .filter((row) => row.segment !== "Intersegment eliminations")
        .map((row) => ({
          segment: row.segment.replace(" Systems", ""),
          sales: row.sales,
          income: row.operatingIncome ?? 0,
          margin: (row.operatingMargin ?? 0) * 100,
          backlog: row.totalBacklog ?? 0,
          quality: row.qualityScore,
        })),
    [dashboard.segment.rows],
  );

  const backlogTrendRows = dashboard.dataset.periods.map((row) => ({
    period: row.label,
    backlog: row.totalBacklog,
    funded: row.fundedBacklog,
    unfunded: row.unfundedBacklog,
    awards: row.netAwards,
    bookToBill: row.netAwards / row.sales,
  }));

  const selectedPrograms = dashboard.programs.programs.filter((program) => {
    const segmentMatch = programSegment === "All" || program.segment === programSegment;
    const stageMatch = programStage === "All" || program.stage === programStage;
    const riskMatch = programRisk === "All" || program.riskLabel === programRisk;
    return segmentMatch && stageMatch && riskMatch;
  });

  const selectedCall = dashboard.earningsCalls.records.find((record) => record.id === selectedCallId) ?? dashboard.earningsCalls.records[0];
  const oldestCall = dashboard.earningsCalls.records[dashboard.earningsCalls.records.length - 1];
  const selectedCallTopicRows = Object.entries(selectedCall?.topicScores ?? {}).map(([topic, score]) => ({
    topic,
    score,
  }));

  const valuationRows = [
    { method: "DCF", value: dashboard.valuationEngine.dcf.fairValuePerShare, weight: dashboard.valuationEngine.finalWeights.dcf },
    { method: "FCF Yield", value: dashboard.valuationEngine.fcfYieldFairValue, weight: dashboard.valuationEngine.finalWeights.fcfYield },
    { method: "EV / EBIT", value: dashboard.valuationEngine.evEbitFairValue, weight: dashboard.valuationEngine.finalWeights.evEbit },
    { method: "P/E", value: dashboard.valuationEngine.peFairValue, weight: dashboard.valuationEngine.finalWeights.pe },
    { method: "SOTP", value: dashboard.valuationEngine.sotpFairValue, weight: dashboard.valuationEngine.finalWeights.sotp },
    { method: "Backlog", value: dashboard.valuationEngine.backlogAdjustedFairValue, weight: dashboard.valuationEngine.finalWeights.backlogDurability },
  ];

  return (
    <div className="space-y-6">
      <SectionCard
        title="NOC U.S. Defense Prime Research Cockpit"
        description="Official actuals are anchored to FY2025 Annual Report / Form 10-K and Q1 2026 results. Programme notes are research-only and map into explicit scenario assumptions."
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Actual" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <NocScoreBlock label="Recommended Fair Value" value={usd(dashboard.valuation.recommendedFairValue ?? 0)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs price anchor`} />
          <NocScoreBlock label="Current Price" value={usd(dashboard.dataset.marketData.currentPrice)} note={`${dashboard.dataset.marketData.priceDate} market snapshot`} />
          <NocScoreBlock label="Backlog" value={usdb(dashboard.backlog.totalBacklog)} note={`${pct(dashboard.backlog.fundedRatio)} funded`} />
          <NocScoreBlock label="Book-to-Bill" value={multiple(dashboard.backlog.bookToBill)} note={`${dashboard.period.label} net awards / sales`} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <NocInsightPanel title="Main Thesis" text="NOC is a scarce U.S. prime with stealth bomber, nuclear triad, national-security space and mission electronics exposure, but the quality of that scarcity depends on program economics rather than defense budget headlines." />
          <NocInsightPanel title="Key Debate" text="The B-21 can be the decade driver only if production acceleration converts into margin and cash after the 2025 LRIP provision. Sentinel is kept as a separate upside-versus-risk variable." />
          <NocInsightPanel title="What Market May Miss" text="Mission Systems is the cash-quality anchor, while Space Systems is no longer granted automatic growth-premium status after NGI and restricted-program cadence pressure." />
          <NocInsightPanel title="Red-Team Verdict" text={dashboard.risks.redTeamVerdict} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="USD" />
        ))}
      </div>

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
          <SectionCard title="Executive Snapshot" description="PM-level read across program debates, segment economics, backlog visibility and cash conversion.">
            <div className="grid gap-4 lg:grid-cols-4">
              <NocScoreBlock label="Sales" value={usdb(dashboard.period.sales)} note={dashboard.period.label} />
              <NocScoreBlock label="Segment Op Margin" value={pct(dashboard.period.segmentOperatingMargin)} note="Official actual" />
              <NocScoreBlock label="FCF" value={usdb(dashboard.period.freeCashFlow)} note={dashboard.period.periodType === "quarter" ? "Quarterly, seasonal" : "Annual"} />
              <NocScoreBlock label="Net Awards" value={usdb(dashboard.period.netAwards)} note={dashboard.period.label} />
              <NocScoreBlock label="B-21 Scale" value={`${valuationAssumptions.b21ScaleMultiplier.toFixed(2)}x`} note={`${scenario} case assumption`} />
              <NocScoreBlock label="Sentinel Charge" value={pct(valuationAssumptions.sentinelRiskCharge)} note="Margin risk charge" />
              <NocScoreBlock label="Space Premium" value={pct(valuationAssumptions.spaceGrowthPremium)} note="Growth adjustment" />
              <NocScoreBlock label="Mission Premium" value={pct(valuationAssumptions.missionMoatPremium)} note="Moat adjustment" />
            </div>
          </SectionCard>

          <SectionCard title="Buy-Side Debate Map" description="Each debate is mapped to model drivers, not just narrative.">
            <div className="grid gap-4 lg:grid-cols-3">
              <NocBulletPanel title="Core Upside Mechanisms" items={[
                "B-21 production-rate expansion lifts Aeronautics revenue and learning-curve economics.",
                "Sentinel remains funded and avoids recurring EAC charges after restructuring.",
                "Space backlog converts into sales as SDA/restricted work offsets NGI wind-down.",
                "Mission Systems supports a higher quality multiple through C4ISR, EW, radar, sensors and cyber.",
              ]} />
              <NocBulletPanel title="Model Falsifiers" items={dashboard.risks.killCriteria.slice(0, 4)} />
              <NocBulletPanel title="Current Source Gaps" items={dashboard.dataStatus.missingFields} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="earnings-calls" className="mt-6 space-y-6">
          <SectionCard
            title="Earnings Call Intelligence"
            description="Past eight quarters of research-only transcript intelligence. Use the horizontal selector to move quarter by quarter; topic scores are AI-coded salience scores, not official metrics."
            badge={<DataQualityBadge badge="Needs Review" />}
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <NocScoreBlock label="Call Window" value="8 quarters" note={`${oldestCall?.fiscalQuarter} to ${dashboard.earningsCalls.records[0]?.fiscalQuarter}`} />
              <NocScoreBlock label="Latest Focus" value={selectedCall?.fiscalQuarter ?? "n/a"} note={selectedCall?.callDate ?? "n/a"} />
              <NocScoreBlock label="Top Rising Topic" value={dashboard.earningsCalls.topicMomentum[0]?.topic ?? "n/a"} note={`${dashboard.earningsCalls.topicMomentum[0]?.eightQuarterChange ?? 0} pts vs first quarter`} />
              <NocScoreBlock label="Source Status" value="Research-only" note="Transcript summaries do not feed actuals" />
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="flex min-w-max gap-2">
                {dashboard.earningsCalls.records.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedCallId(record.id)}
                    className={`rounded-md border px-4 py-3 text-left text-sm transition ${
                      selectedCall?.id === record.id
                        ? "border-ink bg-ink text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <span className="block font-semibold">{record.fiscalQuarter}</span>
                    <span className={selectedCall?.id === record.id ? "text-slate-200" : "text-slate-500"}>{record.callDate}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <NocInsightPanel title="AI Overall Trend Summary" text={dashboard.earningsCalls.aiOverallSummary} />
              </div>
              <NocBulletPanel title="Trend Change" items={dashboard.earningsCalls.trendBullets} />
            </div>
          </SectionCard>

          <SectionCard title={`${selectedCall?.fiscalQuarter ?? "Selected Quarter"} Call Snapshot`} description="Quarter-level market focus, management message and investor debate.">
            <div className="grid gap-4 lg:grid-cols-3">
              <NocInsightPanel title="Market Focus" text={selectedCall?.marketFocus ?? "n/a"} />
              <NocInsightPanel title="Management Message" text={selectedCall?.managementMessage ?? "n/a"} />
              <NocInsightPanel title="Investor Debate" text={selectedCall?.investorDebate ?? "n/a"} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <NocInsightPanel title="AI Quarter Read" text={selectedCall?.aiSummary ?? "n/a"} />
              </div>
              <NocBulletPanel title="Watch Items" items={selectedCall?.watchItems ?? []} />
            </div>
          </SectionCard>

          <SectionCard title="Market Attention Trend" description="AI-coded topic salience across the last eight earnings calls, ordered chronologically.">
            <div className="grid gap-6 xl:grid-cols-2">
              <NocChartPanel title="Topic Salience by Quarter">
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={dashboard.earningsCalls.trendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    {dashboard.earningsCalls.topics.map((topic) => (
                      <Line
                        key={topic}
                        type="monotone"
                        dataKey={topic}
                        stroke={topicTrendColors[topic]}
                        strokeWidth={topic === "B-21" || topic === "Sentinel" ? 3 : 2}
                        dot={{ r: 2 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </NocChartPanel>
              <NocChartPanel title={`${selectedCall?.fiscalQuarter ?? "Selected Quarter"} Topic Mix`}>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={selectedCallTopicRows} layout="vertical" margin={{ left: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="topic" type="category" tick={{ fontSize: 11 }} width={105} />
                    <Tooltip />
                    <Bar dataKey="score" fill="#164e63" name="Salience" />
                  </BarChart>
                </ResponsiveContainer>
              </NocChartPanel>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Topic", "Latest", "8Q Change", "Average", "Read-through"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.earningsCalls.topicMomentum.map((row) => (
                    <tr key={row.topic} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-semibold text-ink">{row.topic}</td>
                      <td className="px-3 py-3">{row.latestScore}</td>
                      <td className={`px-3 py-3 font-medium ${row.eightQuarterChange >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{row.eightQuarterChange >= 0 ? "+" : ""}{row.eightQuarterChange}</td>
                      <td className="px-3 py-3">{row.averageScore.toFixed(1)}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {row.eightQuarterChange > 20
                          ? "Market focus has structurally intensified."
                          : row.eightQuarterChange < -10
                            ? "Focus has faded versus the starting quarter."
                            : "Still important, but not the largest narrative shift."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="programs" className="mt-6 space-y-6">
          <SectionCard title="B-21 / Sentinel / Space Program Matrix" description="Program records are research-only. They classify where each debate enters scenario assumptions, valuation sensitivities and kill criteria.">
            <div className="mb-5 flex flex-wrap gap-3">
              <NocSelectControl label="Segment" value={programSegment} onChange={setProgramSegment} options={["All", ...dashboard.programs.filters.segments]} />
              <NocSelectControl label="Stage" value={programStage} onChange={(value) => setProgramStage(value as NocProgramStage | "All")} options={["All", ...dashboard.programs.filters.stages] as Array<NocProgramStage | "All">} />
              <NocSelectControl label="Risk" value={programRisk} onChange={(value) => setProgramRisk(value as NocRiskLevel | "All")} options={["All", ...dashboard.programs.filters.riskLevels] as Array<NocRiskLevel | "All">} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {selectedPrograms.map((program) => (
                <div key={program.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-ink">{program.name}</h3>
                      <p className="text-sm text-slate-500">{program.segment} | {program.customer}</p>
                    </div>
                    <DataQualityBadge badge="Placeholder" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <NocScoreBlock label="Attractive" value={`${program.attractivenessScore}`} note="0-100 score" />
                    <NocScoreBlock label="Risk" value={program.riskLabel} note={`${program.executionRiskScore}/100`} />
                    <NocScoreBlock label="Margin" value={`${program.marginQualityScore}`} note="quality score" />
                    <NocScoreBlock label="Mapping" value={program.mappedAssumption} note={program.durationLabel} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">{program.strategicRelevance}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{program.officialDescription}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment Economics" description="NOC's segment mix is the cockpit spine: Aero is B-21 leverage, Defense is Sentinel risk/upside, Mission is quality cash flow, Space is the re-acceleration test. USDm unless noted.">
            <div className="grid gap-6 xl:grid-cols-2">
              <NocChartPanel title="Sales and Operating Income">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Legend />
                    <Bar dataKey="sales" fill="#164e63" name="Sales" />
                    <Bar dataKey="income" fill="#7f1d1d" name="Operating income" />
                  </BarChart>
                </ResponsiveContainer>
              </NocChartPanel>
              <NocChartPanel title="Margin and Quality Score">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="margin" fill="#0f766e" name="Margin %" />
                    <Bar dataKey="quality" fill="#334155" name="Quality score" />
                  </BarChart>
                </ResponsiveContainer>
              </NocChartPanel>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Segment", "Sales", "Op Income", "Margin", "Backlog", "Funded", "Coverage", "Fixed Price", "Score", "Programs"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.segment.rows.filter((row) => row.segment !== "Intersegment eliminations").map((row) => (
                    <tr key={row.segment} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-semibold text-ink">{row.segment}</td>
                      <td className="px-3 py-3">{usdm(row.sales)}</td>
                      <td className="px-3 py-3">{row.operatingIncome == null ? "n/a" : usdm(row.operatingIncome)}</td>
                      <td className="px-3 py-3">{row.operatingMargin == null ? "n/a" : pct(row.operatingMargin)}</td>
                      <td className="px-3 py-3">{row.totalBacklog == null ? "n/a" : usdb(row.totalBacklog)}</td>
                      <td className="px-3 py-3">{row.fundedRatio == null ? "n/a" : pct(row.fundedRatio)}</td>
                      <td className="px-3 py-3">{row.backlogCoverageYears == null ? "n/a" : multiple(row.backlogCoverageYears)}</td>
                      <td className="px-3 py-3">{row.fixedPriceMix == null ? "n/a" : pct(row.fixedPriceMix)}</td>
                      <td className="px-3 py-3">{row.qualityScore}</td>
                      <td className="px-3 py-3 text-slate-600">{row.keyPrograms.slice(0, 3).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="backlog" className="mt-6 space-y-6">
          <SectionCard title="Backlog & Revenue Visibility" description="NOC discloses funded and unfunded backlog. The cockpit treats unfunded backlog as visibility with appropriation risk, not cash in hand.">
            <div className="grid gap-4 lg:grid-cols-5">
              <NocScoreBlock label="Total Backlog" value={usdb(dashboard.backlog.totalBacklog)} note={`${pct(dashboard.backlog.backlogGrowth)} vs prior anchor`} />
              <NocScoreBlock label="Funded Backlog" value={usdb(dashboard.backlog.fundedBacklog)} note={pct(dashboard.backlog.fundedRatio)} />
              <NocScoreBlock label="Unfunded Backlog" value={usdb(dashboard.backlog.unfundedBacklog)} note="appropriation / exercise risk" />
              <NocScoreBlock label="Coverage" value={multiple(dashboard.backlog.backlogCoverageYears)} note="Backlog / annualized sales" />
              <NocScoreBlock label="Visibility Score" value={`${dashboard.backlog.revenueVisibilityScore}`} note="0-100 framework" />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <NocChartPanel title="Backlog, Funding and Awards">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={backlogTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdb(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="backlog" stroke="#164e63" name="Total backlog" strokeWidth={2} />
                    <Line type="monotone" dataKey="funded" stroke="#0f766e" name="Funded" strokeWidth={2} />
                    <Line type="monotone" dataKey="unfunded" stroke="#7f1d1d" name="Unfunded" strokeWidth={2} />
                    <Line type="monotone" dataKey="awards" stroke="#a16207" name="Net awards" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </NocChartPanel>
              <NocChartPanel title="Backlog by Segment">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentChartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdb(value)} />
                    <Bar dataKey="backlog" fill="#164e63" name="Backlog" />
                  </BarChart>
                </ResponsiveContainer>
              </NocChartPanel>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <NocBulletPanel title="Backlog Read-Through" items={dashboard.backlog.qualityNotes} />
              <NocBulletPanel title="Award Watchlist" items={dashboard.backlog.majorAwards.map((award) => `${award.program}: ${award.value ? usdb(award.value) : "value n/a"} - ${award.note}`)} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="budget" className="mt-6 space-y-6">
          <SectionCard title="U.S. Budget Scenario Lab" description="NDAA / DoD / Air Force / Space Force / Navy direction is translated into explicit scenario assumptions.">
            <div className="grid gap-4 lg:grid-cols-3">
              {dashboard.budget.scenarios.map((item) => (
                <div key={item.scenario} className={`rounded-lg border p-4 ${item.scenario === scenario ? "border-ink bg-slate-50" : "border-slate-200 bg-white"}`}>
                  <h3 className="font-semibold text-ink">{item.scenario}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.narrative}</p>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex justify-between"><dt>Revenue CAGR</dt><dd>{pct(item.revenueCagr)}</dd></div>
                    <div className="flex justify-between"><dt>Segment margin</dt><dd>{pct(item.segmentOperatingMargin)}</dd></div>
                    <div className="flex justify-between"><dt>B-21 scale</dt><dd>{item.b21ScaleMultiplier.toFixed(2)}x</dd></div>
                    <div className="flex justify-between"><dt>Sentinel charge</dt><dd>{pct(item.sentinelRiskCharge)}</dd></div>
                    <div className="flex justify-between"><dt>Space premium</dt><dd>{pct(item.spaceGrowthPremium)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-5">
              {dashboard.budget.policyDrivers.map((driver) => (
                <NocInsightPanel key={driver.driver} title={driver.driver} text={`${driver.signal}. ${driver.scenarioMapping}`} />
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <NocHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <NocBacktestPanel />
          <SectionCard title="Valuation Triangulation" description="DCF, FCF yield, EV/EBIT, P/E, segment SOTP and backlog durability are triangulated so no single program narrative dominates the output.">
            <div className="grid gap-4 lg:grid-cols-6">
              {valuationRows.map((row) => (
                <NocScoreBlock key={row.method} label={row.method} value={usd(row.value)} note={`${pct(row.weight)} weight`} />
              ))}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Segment", "Sales", "Margin", "EBIT", "Multiple", "Value"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.valuationEngine.segmentSotpRows.map((row) => (
                    <tr key={row.segment} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-semibold text-ink">{row.segment}</td>
                      <td className="px-3 py-3">{usdm(row.sales)}</td>
                      <td className="px-3 py-3">{pct(row.margin)}</td>
                      <td className="px-3 py-3">{usdm(row.ebit)}</td>
                      <td className="px-3 py-3">{row.multiple.toFixed(1)}x</td>
                      <td className="px-3 py-3">{usdb(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

        <Tabs.Content value="cash" className="mt-6 space-y-6">
          <SectionCard title="Pension / Working Capital / Shareholder Return" description="NOC's shareholder-return case depends on FCF conversion, not just EPS or backlog.">
            <div className="grid gap-4 lg:grid-cols-5">
              <NocScoreBlock label="Dividend / Share" value={`$${dashboard.capitalReturns.dividendPerShare.toFixed(2)}`} note="FY2025" />
              <NocScoreBlock label="Dividend Yield" value={pct(dashboard.capitalReturns.dividendYield)} note="Price anchor based" />
              <NocScoreBlock label="FCF Payout" value={pct(dashboard.capitalReturns.fcfPayout)} note="FY2025 dividends / FCF" />
              <NocScoreBlock label="Buybacks" value={usdb(dashboard.capitalReturns.buybackSpend)} note="FY2025" />
              <NocScoreBlock label="Pension / OPB Surplus" value={usdb(dashboard.capitalReturns.pensionSurplus)} note="Equity bridge item" />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <NocBulletPanel title="Capital Return Notes" items={dashboard.capitalReturns.notes} />
              <NocBulletPanel title="Cash Conversion Watchlist" items={[
                "FY2026 FCF guidance bridge from Q1 seasonal cash use to full-year cash generation.",
                "B-21 and Sentinel unbilled receivable build, EAC changes and inventory timing.",
                "Capex intensity required to support B-21, Space and solid rocket motor capacity.",
                "Buyback discipline versus program investment needs and dividend growth.",
              ]} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="The risk view is adversarial by design: it defines what would falsify the NOC thesis before the model gets comfortable.">
            <div className="grid gap-4 lg:grid-cols-3">
              <NocScoreBlock label="Risk Score" value={`${dashboard.risks.riskScore}`} note="Higher means more thesis fragility" />
              <NocScoreBlock label="High Severity Items" value={`${dashboard.risks.rows.filter((row) => row.severityLabel === "High").length}`} note="Top risks" />
              <NocScoreBlock label="Monitoring Triggers" value={`${dashboard.risks.monitoringTriggers.length}`} note="Quarterly checklist" />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Risk", "Score", "Affected Driver", "Kill Criterion", "Mitigation"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.risks.rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-semibold text-ink">{row.name}</td>
                      <td className="px-3 py-3">{row.weightedScore} / {row.severityLabel}</td>
                      <td className="px-3 py-3 text-slate-600">{row.affectedDriver}</td>
                      <td className="px-3 py-3 text-slate-600">{row.killCriterion}</td>
                      <td className="px-3 py-3 text-slate-600">{row.mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="sources" className="mt-6 space-y-6">
          <SectionCard title="Source Boundary & Data Audit" description="This module separates official actuals, management guidance, forecast assumptions, research-only programme notes and market data.">
            <div className="grid gap-4 lg:grid-cols-3">
              <NocBulletPanel title="Official Actuals" items={[
                "FY2025 annual report / 10-K financials, segment data, backlog, contract mix, FCF, pension and capital returns.",
                "Q1 2026 earnings release for quarter actuals, guidance, segment performance, cash flow and backlog.",
              ]} />
              <NocBulletPanel title="Guidance & Assumptions" items={[
                "FY2026 sales, segment operating income, EPS and FCF are management guidance.",
                "DCF WACC, terminal growth, target multiples and program premia are forecast assumptions.",
              ]} />
              <NocBulletPanel title="Research-Only" items={[
                "B-21 press releases, Sentinel Nunn-McCurdy materials, GAO/DoD/USAF program references and transcript topic intelligence.",
                "Research-only notes can shape assumptions and risks, but do not become official actuals.",
              ]} />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Source", "Publisher", "Status", "Type", "Period", "Notes"].map((heading) => (
                      <th key={heading} className="px-3 py-2">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.dataset.sources.map((source) => (
                    <tr key={source.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-semibold text-ink">{source.title}</td>
                      <td className="px-3 py-3">{source.publisher}</td>
                      <td className="px-3 py-3">{source.sourceStatus}</td>
                      <td className="px-3 py-3">{source.sourceType}</td>
                      <td className="px-3 py-3">{source.reportingPeriod ?? "n/a"}</td>
                      <td className="px-3 py-3 text-slate-600">{source.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function NocHistoricalTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: NocHistoricalChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <p className="font-semibold text-ink">{row.period}</p>
      <p className="mt-1 text-slate-500">{row.fiscalPeriod}</p>
      <p className="text-slate-500">Event date: {row.eventDate}</p>
      <p className="mt-2 text-slate-700">As-of price: {row.price != null ? usd(row.price) : "n/a"}</p>
      <p className="text-slate-700">Fair value: {row.fairValue != null ? usd(row.fairValue) : "n/a"}</p>
      <p className="font-semibold text-slate-900">Gap: {row.gapPct != null ? pct(row.gapPct) : "n/a"}</p>
    </div>
  );
}

function NocHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: NocHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows.filter((row) => /^q[1-4]_results$/.test(row.event.eventType));
  const [visibleCount, setVisibleCount] = useState(16);
  const boundedVisibleCount = Math.min(Math.max(4, visibleCount), Math.max(4, displayRows.length));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - boundedVisibleCount)),
    [boundedVisibleCount, displayRows],
  );
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows: NocHistoricalChartRow[] = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => {
      const price = row.valuationRun?.currentPrice ?? null;
      const fairValue = row.valuationRun?.fairValue ?? null;
      return {
        period: nocQuarterLabel(row.event, true),
        fiscalPeriod: row.event.fiscalPeriod ?? row.event.periodLabel ?? String(row.event.fiscalQuarter ?? row.event.eventDate),
        eventDate: row.event.eventDate,
        price,
        fairValue,
        gapPct: row.valuationRun?.upsideDownside ?? (price && fairValue ? fairValue / price - 1 : null),
      };
    });
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];
  const quickCounts = Array.from(new Set([8, 12, 16, 24, displayRows.length].filter((count) => count > 0)));

  return (
    <SectionCard
      title="NOC Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by quarterly reporting event from the NOC SQLite backend pilot. Static NOC research views remain available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <NocScoreBlock label="Saved Runs" value={`${savedRuns}`} note="Base runs persisted by event" />
        <NocScoreBlock label="Quarter Events" value={displayRows.length ? `${displayRows.length}` : "n/a"} note="FY2018 Q1 through latest imported quarter" />
        <NocScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <NocScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static NOC dashboard sections still render.
        </div>
      ) : null}

      {displayRows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Chart runs oldest to newest. NOC fiscal quarters are calendar quarters, so both labels are shown.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickCounts.map((count) => (
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
              aria-label="Select visible NOC historical valuation window"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <NocScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? nocQuarterLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? nocQuarterLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <NocScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" />
              <NocScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium in visible window" />
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
                  className={`min-w-[178px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{nocQuarterLabel(row.event)}</span>
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
                  <NocScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <NocScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Daily market data when available" />
                  <NocScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <NocScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Backend shareholder return bridge" />
                </div>
                {methodRows.length ? (
                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          {["Method", "Value", "Description"].map((heading) => (
                            <th key={heading} className="px-3 py-2">{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {methodRows.map((row) => (
                          <tr key={row.key ?? row.label} className="border-b border-slate-100 align-top">
                            <td className="px-3 py-3 font-semibold text-ink">{row.label ?? row.key ?? "Method"}</td>
                            <td className="px-3 py-3">{typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : usd(row.value)) : "n/a"}</td>
                            <td className="px-3 py-3 text-slate-600">{row.description ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {warnings.length ? (
                  <div className="mt-4 space-y-2">
                    {warnings.map((warning, index) => {
                      const normalized = typeof warning === "string" ? { title: warning, detail: "", severity: "warning" } : warning;
                      return (
                        <div key={`${normalized.id ?? normalized.title ?? "warning"}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <p className="font-semibold">{normalized.title ?? "Backend warning"}</p>
                          {normalized.detail ? <p className="mt-1 leading-6">{normalized.detail}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <NocChartPanel title="As-of Price vs Fair Value">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis />
                    <Tooltip content={<NocHistoricalTooltip />} />
                    <Legend />
                    <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                    <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
                  </BarChart>
                </ResponsiveContainer>
              </NocChartPanel>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading NOC historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function NocBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NocBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const payload = await fetchJsonWithFallback<NocBacktestResult>(
        ["/api/noc/backtests", "/api/stocks/noc/backtests"],
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate,
            endDate,
            benchmarkTicker: "SPY",
          }),
        },
      );
      setResult(payload);
      setStatus(payload.status === "completed" ? "done" : "error");
      setError(payload.status === "completed" ? null : "NOC backtest did not complete.");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [endDate, startDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => {
      const nocIndexed = row.nocBuyHold ?? row.noc ?? 1;
      return {
        ...row,
        nocReturn: (nocIndexed - 1) * 100,
        spyReturn: (row.spy - 1) * 100,
      };
    });
  }, [result]);

  const nocMetrics = result?.metrics?.nocBuyHold ?? result?.metrics?.noc;
  const spyMetrics = result?.metrics?.spy ?? result?.metrics?.benchmark;
  const warnings = result?.warnings ?? [];

  return (
    <SectionCard
      title="NOC vs SPY Backtest"
      description="Select a date range and compare daily NOC buy-and-hold performance against SPY from the backend price history."
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
          <NocChartPanel title="NOC vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="nocReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="NOC" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </NocChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <NocScoreBlock label="NOC CAGR" value={backtestMetricValue(nocMetrics, "cagr") != null ? pct(backtestMetricValue(nocMetrics, "cagr") as number) : "n/a"} note="Buy-and-hold" />
              <NocScoreBlock label="SPY CAGR" value={backtestMetricValue(spyMetrics, "cagr") != null ? pct(backtestMetricValue(spyMetrics, "cagr") as number) : "n/a"} note="Benchmark" />
              <NocScoreBlock label="NOC MDD" value={backtestMetricValue(nocMetrics, "mdd") != null ? pct(backtestMetricValue(nocMetrics, "mdd") as number) : "n/a"} note="Maximum drawdown" />
              <NocScoreBlock label="SPY MDD" value={backtestMetricValue(spyMetrics, "mdd") != null ? pct(backtestMetricValue(spyMetrics, "mdd") as number) : "n/a"} note="Maximum drawdown" />
              <NocScoreBlock label="NOC Sharpe" value={backtestMetricValue(nocMetrics, "sharpe") != null ? (backtestMetricValue(nocMetrics, "sharpe") as number).toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <NocScoreBlock label="SPY Sharpe" value={backtestMetricValue(spyMetrics, "sharpe") != null ? (backtestMetricValue(spyMetrics, "sharpe") as number).toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <NocScoreBlock label="NOC Vol" value={backtestMetricValue(nocMetrics, "vol") != null ? pct(backtestMetricValue(nocMetrics, "vol") as number) : "n/a"} note="Annualized daily vol" />
              <NocScoreBlock label="SPY Vol" value={backtestMetricValue(spyMetrics, "vol") != null ? pct(backtestMetricValue(spyMetrics, "vol") as number) : "n/a"} note="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="mt-4 space-y-2">
          {warnings.map((warning, index) => {
            const normalized = typeof warning === "string" ? { title: warning, detail: "" } : warning;
            return (
              <div key={`${normalized.id ?? normalized.title ?? "warning"}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">{normalized.title ?? "Backend warning"}</p>
                {normalized.detail ? <p className="mt-1 leading-6">{normalized.detail}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </SectionCard>
  );
}
