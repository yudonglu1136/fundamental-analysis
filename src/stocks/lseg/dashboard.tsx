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
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import type { StockDashboardProps } from "../types";
import { buildLsegDashboardData } from "./calculations";
import type { LsegSourceType } from "./types";

type BackendHistoricalValuationRun = {
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
  probabilityWeightedFairValue: number | null;
  methodOutputsJson: Array<{
    key: string;
    label: string;
    value: number;
    description: string;
    valuationBase?: string;
    baseYear?: number;
    forecastYear?: number;
    sourceConfidence?: string;
  }>;
  sensitivityTablesJson: Array<{ title: string; table: Array<Array<string | number>> }>;
  warningsJson: Array<{ id: string; title: string; detail: string; severity: string }>;
  dataSnapshotJson: {
    financialPeriodCount?: number;
    segmentFinancialCount?: number;
    marketSnapshotId?: string | null;
    valuationPeriodId?: string | null;
    priceDate?: string | null;
    asOfPriceSource?: { source?: string | null; priceDate?: string | null } | null;
    leaseLiabilities?: number | null;
    balanceSheetCarryForward?: {
      sourcePeriodId?: string;
      leaseLiabilities?: number;
      notes?: string;
    } | null;
    valuationSemantics?: {
      forecastStartYear?: number;
      firstGrowthYear?: number;
      isAnnualizedRunRate?: boolean;
      isSameYearForecastAnchor?: boolean;
      dcfYearOneGrowthSuppressed?: boolean;
      methodBases?: Record<string, { valuationBase?: string; sourceConfidence?: string }>;
      auditedActualBase?: { fiscalYear?: number; revenue?: number; label?: string };
      eventVisibleRunRate?: { fiscalYear?: number; revenue?: number; label?: string };
    } | null;
    adapterWarnings?: string[];
  };
};

type BackendHistoricalValuation = {
  event: {
    id: string;
    eventDate: string;
    fiscalPeriod: string;
    eventType: string;
    label: string;
    sourceType: string;
  };
  valuationRun: BackendHistoricalValuationRun | null;
};

type LsegBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type LsegBacktestCurvePoint = {
  date: string;
  spy: number;
  benchmark: number;
  lsegBuyHold: number;
};

type LsegBacktestResult = {
  id?: string;
  status: "completed" | "insufficient_data" | string;
  ticker?: string;
  benchmarkTicker?: string;
  startDate?: string;
  endDate?: string;
  metrics?: {
    lsegBuyHold?: LsegBacktestMetricSet;
    spy?: LsegBacktestMetricSet;
    benchmark?: LsegBacktestMetricSet;
  };
  curve?: LsegBacktestCurvePoint[];
  warnings?: string[];
};

type LsegCapitalReturnRow = {
  fiscalYear: number;
  periodId: string;
  asOfDate: string;
  sourceType: string;
  sourceQuality: string;
  revenue: number | null;
  equityFreeCashFlow: number | null;
  dilutedShares: number | null;
  dividendPerShare: number | null;
  dividendPerSharePence: number | null;
  dividendCashCost: number | null;
  buybackAmount: number | null;
  totalCapitalReturn: number | null;
  fcfCoverage: number | null;
  payoutRatioOfFcf: number | null;
  isForecast?: boolean;
};

type LsegCapitalReturnHistory = {
  ticker: string;
  currency: "GBP";
  unit: "GBPm";
  years: number;
  rows: LsegCapitalReturnRow[];
  forwardExpectation: LsegCapitalReturnRow | null;
  summary: {
    latestFiscalYear: number | null;
    latestDividendPerSharePence: number | null;
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
    forwardDividendPerSharePence: number | null;
    forwardDividendCashCost: number | null;
    forwardBuybackAmount: number | null;
    forwardTotalCapitalReturn: number | null;
    forwardEquityFreeCashFlow: number | null;
    forwardFcfCoverage: number | null;
  };
  warnings: Array<{ id: string; severity: string; title: string; detail: string }>;
};

function gbp(value: number) {
  return `£${value.toFixed(2)}`;
}

function gbpm(value: number) {
  return `£${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function multiple(value: number) {
  return `${value.toFixed(1)}x`;
}

function sourceBadge(sourceType: LsegSourceType) {
  if (sourceType === "official_actual") return <DataQualityBadge badge="Actual" />;
  if (sourceType === "management_guidance" || sourceType === "forecast_assumption") return <DataQualityBadge badge="Assumption" />;
  if (sourceType === "market_data" || sourceType === "derived") return <DataQualityBadge badge="Derived" />;
  return <DataQualityBadge badge="Placeholder" />;
}

const segmentColors: Record<string, string> = {
  "Data & Analytics": "#175c62",
  "FTSE Russell / Index": "#8b5a2b",
  "Risk Intelligence": "#6d7f2a",
  "Capital Markets": "#345995",
  "Post Trade / LCH": "#7f3b54",
  "Corporate / Other": "#64748b",
};

export function LsegDashboard({ module, scenario, period }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const dashboard = useMemo(() => buildLsegDashboardData(module.data, period, scenario), [module.data, period, scenario]);
  const transcriptQuarters = dashboard.transcriptIntelligence.quarters;
  const selectedTranscript = transcriptQuarters.find((quarter) => quarter.transcriptId === selectedTranscriptId) ?? transcriptQuarters[0];
  const selectedWatchlistItems = selectedTranscript?.watchlist.map((item) => `${item.label}: ${item.rationale}`) ?? [];
  const transcriptTrendRows = dashboard.transcriptIntelligence.focusTrend.map((trend) => ({
    theme: trend.label,
    early: Number(trend.firstAverage.toFixed(1)),
    recent: Number(trend.secondAverage.toFixed(1)),
    direction: trend.direction,
  }));
  const valuationRows = dashboard.valuationEngine.methodBridge.map((row) => ({
    method: row.method,
    fairValue: Number(row.fairValue.toFixed(2)),
    contribution: Number(row.contribution.toFixed(2)),
    weight: row.weight * 100,
  }));
  const segmentRows = dashboard.segment.rows.map((row) => ({
    segment: row.segment,
    revenue: row.revenue,
    ebitda: row.adjustedEbitda,
    margin: row.margin * 100,
    quality: row.qualityScore,
    risk: row.riskScore,
    sourceType: row.sourceType,
  }));
  const scenarioRows = dashboard.valuationEngine.scenarioValues.map((row) => ({
    scenario: row.scenario,
    fairValue: Number(row.fairValue.toFixed(2)),
    upside: Number((row.upsideDownside * 100).toFixed(1)),
    probability: row.probability * 100,
  }));

  return (
    <div className="space-y-6">
      <SectionCard
        title="LSEG Buy-Side Research Cockpit"
        description="Financial market infrastructure plus data/workflow platform plus index IP plus clearing infrastructure. Official actuals, guidance, forecast assumptions, transcripts, research-only notes and market data stay separated."
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Derived" : "Needs Review"} />}
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <ScoreBlock label="Current Price" value={gbp(dashboard.valuationEngine.currentPrice)} note={`${dashboard.valuationEngine.priceDate} market data`} />
          <ScoreBlock label="Base Fair Value" value={gbp(dashboard.valuationEngine.fairValue)} note={`${pct(dashboard.valuationEngine.upsideDownside)} upside/downside`} />
          <ScoreBlock label="Fair Value Range" value={`${gbp(dashboard.valuationEngine.valuationRangeLow)}-${gbp(dashboard.valuationEngine.valuationRangeHigh)}`} note="Bear to bull scenario range" />
          <ScoreBlock label="Signal" value={dashboard.valuationEngine.warnings.some((warning) => warning.severity === "high") ? "Yellow" : "Green"} note={`${dashboard.valuationEngine.warnings.length} validation warnings`} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <InsightPanel title="Thesis" text={dashboard.thesis.summary} />
          <BulletPanel title="Core Debates" items={dashboard.thesis.debates.slice(0, 5)} />
          <BulletPanel title="Data Boundaries" items={dashboard.dataStatus.missingFields} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboard.summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="GBP" />
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
          <SectionCard title="Executive Snapshot" description="PM-level view across price, fair value, scenarios, method contribution and red/yellow/green signal.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Valuation Method Contribution">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={valuationRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="fairValue" fill="#175c62" name="Fair value" />
                    <Bar dataKey="contribution" fill="#8b5a2b" name="Weighted contribution" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Scenario Table">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={scenarioRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="scenario" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="fairValue" fill="#345995" name="Fair value" />
                    <Bar dataKey="upside" fill="#7f3b54" name="Upside %" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <InsightPanel title="What Market Must Believe" text={`At ${multiple(dashboard.valuationEngine.multiples.currentPe)} current P/E and ${multiple(dashboard.valuationEngine.multiples.currentEvEbitda)} EV/EBITDA, LSEG needs sustained D&A/index growth, clearing durability and buyback-supported FCF/share compounding.`} />
              <InsightPanel title="Buy / Hold / Avoid Pivot" text={dashboard.risk.verdict} />
              <BulletPanel title="Validation Flags" items={dashboard.valuationEngine.warnings.length ? dashboard.valuationEngine.warnings.map((warning) => warning.detail) : ["No high-severity cockpit warnings."]} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Business Mix & Segment Quality" description="Reported FY2025 segments are reconciled to group revenue and EBITDA; Markets is analytically split into Capital Markets and Post Trade for buy-side underwriting.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Revenue and EBITDA">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={90} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => gbpm(value)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue">
                      {segmentRows.map((entry) => <Cell key={entry.segment} fill={segmentColors[entry.segment]} />)}
                    </Bar>
                    <Bar dataKey="ebitda" fill="#111827" name="Adjusted EBITDA" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Quality and Risk Scores">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={90} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="quality" fill="#175c62" name="Quality" />
                    <Bar dataKey="risk" fill="#b45309" name="Risk" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <DataTable
              columns={["Segment", "Revenue", "EBITDA", "Margin", "Organic Growth", "Quality", "Source", "Contribution"]}
              rows={dashboard.segment.rows.map((row) => [
                row.segment,
                gbpm(row.revenue),
                gbpm(row.adjustedEbitda),
                pct(row.margin),
                pct(row.organicGrowth),
                row.qualityScore.toFixed(0),
                row.sourceType,
                row.contribution,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="data-analytics" className="mt-6">
          <SpecialistPanel output={dashboard.dataAnalytics} />
        </Tabs.Content>

        <Tabs.Content value="index" className="mt-6">
          <SpecialistPanel output={dashboard.index} />
        </Tabs.Content>

        <Tabs.Content value="post-trade" className="mt-6">
          <SpecialistPanel output={dashboard.postTrade} />
        </Tabs.Content>

        <Tabs.Content value="synergy" className="mt-6 space-y-6">
          <SectionCard title="Refinitiv Synergy Tracker" description="Synergy is modeled through growth, margin and capped platform adjustment. It is not capitalized twice.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Revenue Synergy Score" value={dashboard.refinitivSynergy.revenueSynergyScore.toFixed(0)} note="Research framework" />
              <ScoreBlock label="Technology Score" value={dashboard.refinitivSynergy.technologyRationalizationScore.toFixed(0)} note="Margin bridge support" />
              <ScoreBlock label="Cross-Sell Score" value={dashboard.refinitivSynergy.crossSellScore.toFixed(0)} note="Scenario growth input" />
              <ScoreBlock label="Workspace Score" value={dashboard.refinitivSynergy.workspaceAdoptionScore.toFixed(0)} note="Workflow debate" />
              <ScoreBlock label="Integration Cost" value={gbpm(dashboard.refinitivSynergy.integrationCost)} note="Forecast assumption" />
            </div>
            <DataTable
              columns={["Bridge Item", "Bps", "Source", "Note"]}
              rows={dashboard.refinitivSynergy.marginBridgeBps.map((row) => [row.label, row.bps.toFixed(0), row.sourceType, row.note])}
            />
            <BulletPanel title="Double-Count Controls" items={dashboard.refinitivSynergy.doubleCountWarnings} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="transcripts" className="mt-6 space-y-6">
          <SectionCard title="Transcript Intelligence Lab" description="Call commentary and Q&A are source-tracked and valuation-blocked unless promoted into explicit forecast assumptions after review.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Past Events" value={transcriptQuarters.length.toString()} note="Latest eight call periods" />
              <ScoreBlock label="Q&A Pairs" value={dashboard.transcriptIntelligence.qaPairs.length.toString()} note="Structured analyst Q&A" />
              <ScoreBlock label="Latest Focus" value={selectedTranscript?.topFocus[0]?.label ?? "n/a"} note={selectedTranscript ? `${selectedTranscript.label} focus map` : "No transcript selected"} />
              <ScoreBlock label="Valuation Guard" value="Blocked" note="Transcript commentary stays research-only" />
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
              <InsightPanel title="Eight-Period AI Overview" text={dashboard.transcriptIntelligence.aiTrendSummary} />
              <ChartPanel title="Market Focus Trend">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={transcriptTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="theme" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={80} />
                    <YAxis allowDecimals />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="early" fill="#94a3b8" name="Earlier four" />
                    <Bar dataKey="recent" fill="#175c62" name="Recent four" />
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
                      <span className="mt-1 block text-sm font-semibold">{quarter.label}</span>
                      <span className={`mt-2 block text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>
                        {quarter.qaCount} Q&A · {quarter.eventType}
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
                  <div className="rounded-md border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{selectedTranscript.fiscalPeriod}</p>
                        <h3 className="mt-1 text-lg font-semibold text-ink">{selectedTranscript.label}</h3>
                        <p className="mt-1 text-sm text-slate-500">{selectedTranscript.eventDate} · {selectedTranscript.eventType}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTranscript.topFocus.map((focus) => (
                          <span key={focus.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {focus.label}: {focus.score}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-700">{selectedTranscript.conclusion}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <BulletPanel title="Management Messages" items={selectedTranscript.managementMessages.length ? selectedTranscript.managementMessages : ["No management summary extracted for this period."]} />
                      <BulletPanel title="Next-Call Watchlist" items={selectedWatchlistItems.length ? selectedWatchlistItems : ["No explicit next-call watchlist item extracted."]} />
                    </div>
                  </div>
                  <ChartPanel title="Selected Quarter Focus Map">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={selectedTranscript.focusScores}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={90} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="score" fill="#8b5a2b" name="Focus score" />
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
                    pair.answer.slice(0, 220),
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

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <LsegBacktestPanel />
          <BackendHistoricalValuationPanel scenario={scenario} />
          <SectionCard
            title="Post Trade / SwapClear Forward Economics Bridge"
            description="Converts the 2026-2045 SwapClear bank revenue-share improvement into scenario-based DCF, FCF yield, SOTP and multiple effects. The 2025 snapshot effect is not added again."
            badge={<DataQualityBadge badge={dashboard.valuationEngine.postTradeBridge.active ? "Assumption" : "Needs Review"} />}
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock
                label="Snapshot Value"
                value={gbp(dashboard.valuationEngine.postTradeBridge.snapshotFairValue)}
                note="Before explicit forward economics"
              />
              <ScoreBlock
                label="Adjusted Value"
                value={gbp(dashboard.valuationEngine.postTradeBridge.adjustedFairValue)}
                note={`${pct(dashboard.valuationEngine.postTradeBridge.totalUpliftPct)} bridge uplift`}
              />
              <ScoreBlock
                label="2026 EBITDA Uplift"
                value={gbpm(dashboard.valuationEngine.postTradeBridge.economics.yearOneIncrementalEbitda)}
                note="Incremental Post Trade economics"
              />
              <ScoreBlock
                label="Net Debt Treatment"
                value={dashboard.valuationEngine.postTradeBridge.economics.netDebtImpactAlreadyCaptured ? "Captured" : "Deducted"}
                note="Prevents leverage double count"
              />
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <InsightPanel
                title="Model Design Fix"
                text={dashboard.valuationEngine.postTradeBridge.economics.originalModelLimitation}
              />
              <InsightPanel
                title="Forward Economics Logic"
                text={dashboard.valuationEngine.postTradeBridge.economics.explanation}
              />
            </div>
            <DataTable
              columns={["Bridge Item", "GBP/share", "Detail"]}
              rows={dashboard.valuationEngine.postTradeBridge.rows.map((row) => [
                row.label,
                gbp(row.valuePerShare),
                row.detail,
              ])}
            />
            <DataTable
              columns={["Method", "Method FV Delta", "Weighted Delta"]}
              rows={dashboard.valuationEngine.postTradeBridge.methodDeltas.map((row) => [
                row.method,
                gbp(row.methodFairValueDelta),
                gbp(row.weightedContributionDelta),
              ])}
            />
            <DataTable
              columns={["Year", "Bank Share Baseline", "Forward Share", "Incremental EBITDA", "Incremental FCFF", "AEPS Accretion"]}
              rows={dashboard.valuationEngine.postTradeBridge.economics.annualUplifts.slice(0, 6).map((row) => [
                row.year,
                pct(row.bankRevenueShareBaseline),
                pct(row.bankRevenueShareForward),
                gbpm(row.incrementalEbitda),
                gbpm(row.incrementalFcff),
                `${row.incrementalAepsPence.toFixed(1)}p`,
              ])}
            />
            <BulletPanel title="Uncertain Source Data" items={dashboard.valuationEngine.postTradeBridge.economics.warnings} />
          </SectionCard>
          <SectionCard title="Current Static Valuation Sandbox" description="Live assumption sandbox for the current LSEG cockpit model. Historical as-of valuation runs are shown in the API-backed selector above.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="FCFF DCF" value={gbp(dashboard.valuationEngine.fcffDcf.fairValuePerShare)} note={`TV ${pct(dashboard.valuationEngine.fcffDcf.terminalValuePctOfEnterpriseValue)}`} />
              <ScoreBlock label="FCF Yield" value={gbp(dashboard.valuationEngine.fcfYield.impliedPrice)} note={`${gbpm(dashboard.valuationEngine.fcfYield.postTradeIncrementalFcf)} Post Trade uplift`} />
              <ScoreBlock label="SOTP" value={gbp(dashboard.valuationEngine.sotp.fairValuePerShare)} note={`${gbpm(dashboard.valuationEngine.sotp.postTradeSegmentUplift)} Post Trade EV uplift`} />
              <ScoreBlock label="Overlay" value={pct(dashboard.valuationEngine.moat.cappedValuationAdjustment + dashboard.valuationEngine.risk.cappedRiskAdjustment)} note="Capped moat less risk" />
            </div>
            <DataTable
              columns={["Method", "Fair Value", "Weight", "Contribution", "Valuation Base", "Source", "Explanation"]}
              rows={dashboard.valuationEngine.methodBridge.map((row) => [
                row.method,
                gbp(row.fairValue),
                pct(row.weight),
                gbp(row.contribution),
                row.valuationBase,
                row.sourceType,
                row.explanation,
              ])}
            />
          </SectionCard>
          <InteractiveValuationDashboard
            ticker="LSEG"
            config={module.valuationConfig}
            data={module.data}
            scenario={scenario}
            currency="GBP"
          />
        </Tabs.Content>

        <Tabs.Content value="risk" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="Specific falsifiers, leading indicators and kill criteria for LSEG's data, index, clearing, capital-markets and capital-return thesis.">
            <InsightPanel title="Red-Team Verdict" text={dashboard.risk.verdict} />
            <DataTable
              columns={["Risk", "Segment", "Mechanism", "Leading Indicator", "Kill Criterion", "Trigger", "Impact"]}
              rows={dashboard.risk.items.map((item) => [
                item.risk,
                item.affectedSegment,
                item.mechanism,
                item.leadingIndicator,
                item.killCriterion,
                item.monitoringTrigger,
                pct(item.valuationImpact),
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-returns" className="mt-6 space-y-6">
          <CapitalReturnsBackendPanel fallback={dashboard.valuationEngine.dividendBuyback} />
          <SectionCard title="Dividend & Buyback Model Inputs" description="Current forward capital-return assumptions still feed the valuation model; the historical chart above is loaded from the backend database.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="DPS" value={`${dashboard.valuationEngine.dividendBuyback.dividendPerSharePence.toFixed(1)}p`} note="Official FY2025 total dividend" />
              <ScoreBlock label="FCF Coverage" value={`${dashboard.valuationEngine.dividendBuyback.fcfCoverage.toFixed(1)}x`} note="Official equity FCF / dividend cash" />
              <ScoreBlock label="Buyback Plan" value={gbpm(dashboard.valuationEngine.dividendBuyback.buybackAuthorization)} note="Management guidance" />
              <ScoreBlock label="Share Reduction" value={`${dashboard.valuationEngine.dividendBuyback.modeledShareReduction.toFixed(1)}m`} note="Modeled 2026-2027" />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <InsightPanel title="Leverage Constraint" text={dashboard.valuationEngine.dividendBuyback.leverageConstraint} />
              <InsightPanel title="Dividend Growth Runway" text={dashboard.valuationEngine.dividendBuyback.dividendGrowthRunway} />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function CapitalReturnsBackendPanel({ fallback }: { fallback: { dividendPerSharePence: number; fcfCoverage: number; buybackAuthorization: number } }) {
  const [history, setHistory] = useState<LsegCapitalReturnHistory | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
    setStatus("loading");
    fetch(`${apiBase}/api/stocks/lseg/capital-returns?years=8`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then((payload: LsegCapitalReturnHistory) => {
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
      dps: row.dividendPerSharePence,
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
          dps: forward.dividendPerSharePence,
          fcfCoverage: forward.fcfCoverage,
          sourceQuality: forward.sourceQuality,
          isForecast: true,
        }]
      : []),
  ];
  const latest = rows[rows.length - 1] ?? null;
  const warningText = history?.warnings?.map((warning) => `${warning.title}: ${warning.detail}`).join(" ") ?? null;

  return (
    <SectionCard
      title="Backend Dividend & Buyback History"
      description="Eight-year annual capital-return history from the LSEG backend financial_periods table. Dividends and buybacks are stacked into one capital-return bar and compared against annual FCF."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock
          label="Latest DPS"
          value={latest?.dividendPerSharePence != null ? `${latest.dividendPerSharePence.toFixed(1)}p` : `${fallback.dividendPerSharePence.toFixed(1)}p`}
          note={latest ? `FY${latest.fiscalYear} backend row` : "Static valuation fallback"}
        />
        <ScoreBlock
          label="Latest FCF"
          value={latest?.equityFreeCashFlow != null ? gbpm(latest.equityFreeCashFlow) : "n/a"}
          note="Equity free cash flow"
        />
        <ScoreBlock
          label="Latest Buyback"
          value={latest?.buybackAmount != null ? gbpm(latest.buybackAmount) : gbpm(fallback.buybackAuthorization)}
          note={latest ? `FY${latest.fiscalYear} actual / proxy` : "Forward plan fallback"}
        />
        <ScoreBlock
          label="2026E Return"
          value={forward?.totalCapitalReturn != null ? gbpm(forward.totalCapitalReturn) : "n/a"}
          note="Dashed forecast bar"
        />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Capital-return data service is temporarily unavailable.
        </div>
      ) : null}

      {status === "online" && warningText ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {warningText}
        </div>
      ) : null}

      {chartRows.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <ChartPanel title="Capital Return Stack vs FCF">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartRows}>
                <defs>
                  <pattern id="lsegDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#ecfdf5" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#0f766e" strokeWidth="2" />
                  </pattern>
                  <pattern id="lsegBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#eff6ff" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="2" />
                  </pattern>
                  <pattern id="lsegFcfForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
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
                      dividendCashForecast: "2026E dividends",
                      buybackForecast: "2026E buyback forecast",
                      equityFreeCashFlowForecast: "2026E FCF forecast",
                    };
                    return [gbpm(value), labelByKey[name] ?? name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return `${label}${row?.isForecast ? " | forecast assumption" : ""}${row?.dps != null ? ` | DPS ${row.dps.toFixed(1)}p` : ""}${row?.fcfCoverage != null ? ` | FCF coverage ${multiple(row.fcfCoverage)}` : ""}`;
                  }}
                />
                <Legend />
                <Bar dataKey="dividendCashCost" stackId="capitalReturn" fill="#0f766e" name="Dividends" />
                <Bar dataKey="buybackAmount" stackId="capitalReturn" fill="#2563eb" name="Buybacks" />
                <Bar dataKey="equityFreeCashFlow" fill="#f97316" name="FCF" />
                <Bar dataKey="dividendCashForecast" stackId="forecastCapitalReturn" fill="url(#lsegDividendForecastHatch)" stroke="#0f766e" strokeDasharray="4 3" name="2026E dividend forecast" />
                <Bar dataKey="buybackForecast" stackId="forecastCapitalReturn" fill="url(#lsegBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name="2026E buyback forecast" />
                <Bar dataKey="equityFreeCashFlowForecast" fill="url(#lsegFcfForecastHatch)" stroke="#f97316" strokeDasharray="4 3" name="2026E FCF forecast" />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Backend Source Notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Dividend cash cost is calculated in the API from annual DPS and diluted shares. Buybacks use annual financial-period repurchase amounts. The chart stacks dividends and buybacks as one capital-return bar next to FCF. FY2022-FY2023 remain market-data proxy rows until official table extraction is promoted. FY2026E is shown as a hatched forecast-assumption bar and is excluded from 8Y cumulative totals.
            </p>
            <div className="mt-4 grid gap-3">
              <ScoreBlock label="Capital Return, 8Y" value={history ? gbpm(history.summary.cumulativeCapitalReturn) : "n/a"} note="Dividends plus buybacks" />
              <ScoreBlock label="FCF, 8Y" value={history ? gbpm(history.summary.cumulativeFcf) : "n/a"} note="Backend annual FCF series" />
              <ScoreBlock label="2026E Buyback" value={forward?.buybackAmount != null ? gbpm(forward.buybackAmount) : "n/a"} note="Management guidance / forecast assumption" />
              <ScoreBlock label="Latest FCF Coverage" value={latest?.fcfCoverage != null ? multiple(latest.fcfCoverage) : multiple(fallback.fcfCoverage)} note="FCF / dividends + buybacks" />
            </div>
          </div>

          <div className="xl:col-span-2">
            <DataTable
              columns={["Fiscal Year", "DPS", "Dividends", "Buybacks", "Capital Return", "FCF", "FCF Coverage", "Source"]}
              rows={[...rows, ...(forward ? [forward] : [])].map((row) => [
                `FY${row.fiscalYear}`,
                row.dividendPerSharePence != null ? `${row.dividendPerSharePence.toFixed(1)}p` : "n/a",
                row.dividendCashCost != null ? gbpm(row.dividendCashCost) : "n/a",
                row.buybackAmount != null ? gbpm(row.buybackAmount) : "n/a",
                row.totalCapitalReturn != null ? gbpm(row.totalCapitalReturn) : "n/a",
                row.equityFreeCashFlow != null ? gbpm(row.equityFreeCashFlow) : "n/a",
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

function BackendHistoricalValuationPanel({ scenario }: { scenario: string }) {
  const [history, setHistory] = useState<BackendHistoricalValuation[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
    setStatus("loading");
    fetch(`${apiBase}/api/stocks/lseg/historical-valuations?scenario=${encodeURIComponent(scenario)}&modelVersion=lseg_v1_backend_pilot`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then((payload: { historicalValuations?: BackendHistoricalValuation[] }) => {
        const rows = payload.historicalValuations ?? [];
        const chronologicalRows = rows.slice().sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
        setHistory(rows);
        setSelectedEventId((current) => current ?? [...chronologicalRows].reverse().find((row) => row.valuationRun)?.event.id ?? chronologicalRows[0]?.event.id ?? null);
        setStatus("online");
        setMessage(null);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setStatus("offline");
        setMessage(error.message);
      });
    return () => controller.abort();
  }, [scenario]);

  const displayRows = useMemo(
    () => history
      .slice()
      .sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate)),
    [history],
  );
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - Math.min(visibleCount, displayRows.length || visibleCount))),
    [displayRows, visibleCount],
  );
  const selected =
    displayRows.find((row) => row.event.id === selectedEventId) ??
    [...displayRows].reverse().find((row) => row.valuationRun) ??
    displayRows[0] ??
    null;
  const run = selected?.valuationRun ?? null;
  const selectedSemantics = run?.dataSnapshotJson.valuationSemantics ?? null;
  const selectedIsRunRate = Boolean(selectedSemantics?.isAnnualizedRunRate);
  const selectedPriceSource = run?.dataSnapshotJson.asOfPriceSource ?? null;
  const qaTables = (run?.sensitivityTablesJson ?? []).filter((table) => table.title.startsWith("Model QA:"));
  const completeRuns = displayRows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => {
      const currentPrice = row.valuationRun?.currentPrice ?? null;
      const fairValue = row.valuationRun?.fairValue ?? null;
      const gapPct = row.valuationRun?.upsideDownside ?? (currentPrice && fairValue ? fairValue / currentPrice - 1 : null);
      return {
        label: `${row.event.fiscalPeriod} ${row.event.eventDate.slice(2, 4)}`,
        eventLabel: row.event.label,
        fiscalPeriod: row.event.fiscalPeriod,
        price: currentPrice,
        fairValue,
        gapPct,
      };
    });
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;
  const sourceQualityRows = run
    ? [
        [
          "Event date",
          selected?.event.eventDate ?? run.asOfDate,
          "Historical valuation uses the persisted event snapshot and does not recalculate old runs in the browser.",
        ],
        [
          "Daily price anchor",
          selectedPriceSource?.priceDate ? `${selectedPriceSource.priceDate} | ${selectedPriceSource.source ?? "market data"}` : "market snapshot / proxy fallback",
          selectedPriceSource?.priceDate
            ? "Nearest prior market data source selected by backend when available."
            : "Fallback rows must keep their proxy-price warning visible.",
        ],
        [
          "Snapshot rows",
          `${run.dataSnapshotJson.financialPeriodCount ?? 0} financial / ${run.dataSnapshotJson.segmentFinancialCount ?? 0} segment`,
          "Counts are from the persisted backend snapshot selected for this reporting event.",
        ],
        [
          "Valuation base",
          selectedSemantics?.auditedActualBase?.label ?? selectedSemantics?.eventVisibleRunRate?.label ?? run.dataSnapshotJson.valuationPeriodId ?? "n/a",
          selectedIsRunRate ? "Run-rate event; not treated as a new audited actual base." : "Annual or preliminary actual base where available.",
        ],
        [
          "Forecast timing",
          `forecastStart=${selectedSemantics?.forecastStartYear ?? "n/a"} / firstGrowth=${selectedSemantics?.firstGrowthYear ?? "n/a"}`,
          selectedSemantics?.dcfYearOneGrowthSuppressed
            ? "Year-one DCF growth is suppressed to avoid same-year double compounding."
            : "No same-year growth suppression flag was needed for this event.",
        ],
        [
          "Coverage",
          `${completeRuns}/${displayRows.length} backend events with ${scenario} runs`,
          displayRows.length >= 29 ? "Full backend event set is visible, including pre-2021 proxy-price rows." : "Backend event set is incomplete or API response is truncated.",
        ],
      ]
    : [];

  return (
    <SectionCard
      title="LSEG Backend Historical Valuations"
      description="Persisted scenario valuation runs by reporting event from the LSEG SQLite backend pilot. Static dashboard data remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={`${completeRuns}/${displayRows.length || 0}`} note={`${scenario} scenario, full backend set`} />
        <ScoreBlock label="Reporting Events" value={displayRows.length || "n/a"} note="All disclosure events returned by API" />
        <ScoreBlock label="Selected Fair Value" value={run?.fairValue != null ? gbp(run.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={run?.upsideDownside != null ? pct(run.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Historical data service is temporarily unavailable. Static LSEG dashboard sections still render.
        </div>
      ) : null}

      {displayRows.length ? (
        <>
          <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the chart while the event row remains scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([8, 12, 16, 24, displayRows.length])).map((count) => (
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
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0]?.event.fiscalPeriod ?? "n/a"} to ${visibleRows[visibleRows.length - 1]?.event.fiscalPeriod ?? "n/a"}`} />
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
                  onClick={() => setSelectedEventId(row.event.id)}
                  className={`min-w-[190px] rounded-md border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{row.event.fiscalPeriod}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {row.valuationRun?.fairValue != null ? `${gbp(row.valuationRun.fairValue)} FV / ${gbp(row.valuationRun.currentPrice ?? 0)} price` : "No saved run"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="font-semibold text-ink">{selected?.event.label ?? "Selected reporting event"}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ScoreBlock label="Event Date" value={selected?.event.eventDate ?? "n/a"} note={selected?.event.eventType.replace(/_/g, " ") ?? "n/a"} />
                <ScoreBlock label="As-of Price" value={run?.currentPrice != null ? gbp(run.currentPrice) : "n/a"} note={run?.dataSnapshotJson.asOfPriceSource?.source ?? run?.dataSnapshotJson.priceDate ?? "Market input"} />
                <ScoreBlock label="3Y Target" value={run?.targetPrice3Y != null ? gbp(run.targetPrice3Y) : "n/a"} note="Persisted target price" />
                <ScoreBlock label="3Y CAGR" value={run?.expectedShareholderCagr != null ? pct(run.expectedShareholderCagr) : "n/a"} note="Backend persisted CAGR" />
              </div>
              {selectedIsRunRate ? (
                <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  <p className="font-semibold">Model treatment</p>
                  <p className="mt-1">
                    {selected?.event.fiscalPeriod} is treated as an event-visible FY{selectedSemantics?.forecastStartYear}E run-rate, not as a new audited actual base.
                    DCF year-one growth is suppressed to avoid same-year double compounding, and growth resumes from FY{selectedSemantics?.firstGrowthYear}E.
                    Undisclosed balance-sheet items such as leases are carried forward from the latest full-year actual.
                  </p>
                </div>
              ) : null}
              {run ? (
                <>
                  <DataTable
                    columns={["Method", "Value", "Valuation Base", "Confidence", "Description"]}
                    rows={run.methodOutputsJson.map((method) => [
                      method.label ?? method.key ?? "Method",
                      typeof method.value === "number" ? gbp(method.value) : "n/a",
                      method.valuationBase ?? run.dataSnapshotJson.valuationSemantics?.methodBases?.[method.key]?.valuationBase ?? "n/a",
                      method.sourceConfidence ?? "n/a",
                      method.description ?? "",
                    ])}
                  />
                  {qaTables.map((table) => (
                    <div key={table.title} className="mt-4">
                      <p className="mb-2 text-sm font-semibold text-ink">{table.title}</p>
                      <DataTable
                        columns={(table.table[0] ?? []).map(String)}
                        rows={table.table.slice(1)}
                      />
                    </div>
                  ))}
                  <DataTable
                    columns={["Warning", "Severity", "Detail"]}
                    rows={(run.warningsJson.length ? run.warningsJson : [{ title: "No warnings", severity: "none", detail: "No backend warnings persisted for this run." }]).map((warning) => [
                      warning.title,
                      warning.severity,
                      warning.detail,
                    ])}
                  />
                  <DataTable
                    columns={["Audit Field", "Value", "Operator Note"]}
                    rows={sourceQualityRows}
                  />
                </>
              ) : null}
            </div>

            <ChartPanel title="As-of Price vs Fair Value">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => gbp(value)}
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
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading LSEG historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function LsegBacktestPanel() {
  const [startDate, setStartDate] = useState("2021-05-10");
  const [endDate, setEndDate] = useState("2026-05-10");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LsegBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
      const response = await fetch(`${apiBase}/api/stocks/lseg/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
      });
      if (!response.ok) throw new Error(`LSEG backend returned ${response.status}`);
      const payload = (await response.json()) as LsegBacktestResult;
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
      lsegReturn: (row.lsegBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="LSEG.L vs SPY Backtest"
      description="Select a date range and compare daily LSEG.L buy-and-hold performance against SPY from the backend price history."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-blue-50 text-blue-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "Needs data" : "Ready"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-ink">
          Start date
          <input className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-ink">
          End date
          <input className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={runBacktest}
          disabled={status === "running"}
          className="self-end rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {status === "running" ? "Running..." : "Run backtest"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {error}
        </div>
      ) : null}

      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <ChartPanel title="LSEG.L vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="lsegReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="LSEG.L" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="Stock CAGR" value={metrics.lsegBuyHold?.cagr != null ? pct(metrics.lsegBuyHold.cagr) : "n/a"} note="LSEG.L buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="Stock MDD" value={metrics.lsegBuyHold?.maxDrawdown != null ? pct(metrics.lsegBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="Stock Sharpe" value={metrics.lsegBuyHold?.sharpe != null ? metrics.lsegBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="Stock Vol" value={metrics.lsegBuyHold?.volatility != null ? pct(metrics.lsegBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
              <ScoreBlock label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} note="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => (
            <div key={warning} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function SpecialistPanel({ output }: { output: ReturnType<typeof buildLsegDashboardData>["dataAnalytics"] }) {
  return (
    <SectionCard title={output.title} description={output.summary}>
      <div className="grid gap-4 lg:grid-cols-4">
        {output.metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              {sourceBadge(metric.sourceType)}
            </div>
            <p className="mt-2 text-2xl font-semibold text-ink">{typeof metric.value === "number" ? (metric.value < 1 ? pct(metric.value) : gbpm(metric.value)) : metric.value}</p>
            <p className="mt-1 text-xs text-slate-500">{metric.sourceId}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <BulletPanel title="Drivers" items={output.drivers} />
        <BulletPanel title="Debates" items={output.debates} />
        <BulletPanel title="Monitoring" items={output.monitoring} />
        <BulletPanel title="Warnings" items={output.warnings} />
      </div>
    </SectionCard>
  );
}

function ScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function InsightPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item} className="leading-6">• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
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
