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
import { AlertTriangle, BrainCircuit, BriefcaseBusiness, CalendarDays, DollarSign, FileText, Gavel, Newspaper, Scale, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import {
  attachTriRuntimeContext,
  buildTriDashboardData,
  defaultTriValuationAssumptions,
  getDefaultTriPeriod,
  resolveTriDataset,
} from "./calculations";
import type { TriValuationAssumptions } from "./model";

function loadSavedTriValuationAssumptions() {
  if (typeof window === "undefined") return defaultTriValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-TRI");
  if (!saved) return defaultTriValuationAssumptions;
  try {
    return { ...defaultTriValuationAssumptions, ...(JSON.parse(saved) as Partial<TriValuationAssumptions>) };
  } catch {
    return defaultTriValuationAssumptions;
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

const chartColors = ["#1f6f78", "#334155", "#a16207", "#0f766e", "#7c3aed", "#be123c"];

type TriHistoricalValuationRun = {
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

type TriHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | null;
  label?: string | null;
};

type TriHistoricalValuationItem = {
  event: TriHistoricalValuationEvent;
  valuationRun: TriHistoricalValuationRun | null;
};

type TriHistoricalValuationResponse = {
  historicalValuations?: TriHistoricalValuationItem[];
};

type TriBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type TriBacktestCurvePoint = {
  date: string;
  triBuyHold: number;
  spy: number;
  benchmark?: number;
  triPrice?: number | null;
  benchmarkPrice?: number | null;
};

type TriBacktestResult = {
  status?: string;
  startDate?: string;
  endDate?: string;
  benchmarkTicker?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    triBuyHold?: TriBacktestMetricSet;
    spy?: TriBacktestMetricSet;
    benchmark?: TriBacktestMetricSet;
  };
  curve?: TriBacktestCurvePoint[];
  warnings?: string[];
};

type TriCapitalReturnWarning = {
  id?: string;
  severity?: string;
  title: string;
  detail: string;
};

type TriCapitalReturnRow = {
  fiscalYear: number;
  periodId: string;
  asOfDate: string;
  sourceType: string;
  sourceQuality: string;
  revenue: number | null;
  equityFreeCashFlow: number | null;
  dilutedShares: number | null;
  dividendPerShare: number | null;
  dividendCashCost: number | null;
  buybackAmount: number | null;
  totalCapitalReturn: number | null;
  fcfCoverage: number | null;
  payoutRatioOfFcf: number | null;
  isForecast?: boolean;
  rawJson?: unknown;
};

type TriCapitalReturnHistory = {
  ticker: string;
  currency: string;
  unit: string;
  years: number;
  rows: TriCapitalReturnRow[];
  forwardExpectation: TriCapitalReturnRow | null;
  summary: {
    latestFiscalYear: number | null;
    latestDividendPerShare: number | null;
    latestDividendCashCost: number | null;
    latestBuybackAmount: number | null;
    latestTotalCapitalReturn: number | null;
    latestFcfCoverage: number | null;
    cumulativeDividendCash: number;
    cumulativeBuybacks: number;
    cumulativeCapitalReturn: number;
    forwardFiscalYear: number | null;
    forwardDividendPerShare: number | null;
    forwardDividendCashCost: number | null;
    forwardBuybackAmount: number | null;
    forwardTotalCapitalReturn: number | null;
    forwardFcfCoverage: number | null;
  };
  warnings?: TriCapitalReturnWarning[];
};

async function fetchTriBackendJson<T>(paths: string[], init?: RequestInit): Promise<T> {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const response = await fetch(`${apiBase}${path}`, init);
      if (response.ok) return (await response.json()) as T;
      lastError = new Error(`TRI backend returned ${response.status} for ${path}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "TRI backend request failed"));
}

export function TriDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const [valuationAssumptions, setValuationAssumptions] = useState<TriValuationAssumptions>(loadSavedTriValuationAssumptions);
  const [historicalValuations, setHistoricalValuations] = useState<TriHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);

  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : getDefaultTriPeriod();
  const moduleData = useMemo(() => resolveTriDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () => attachTriRuntimeContext(moduleData, { periodId: resolvedPeriod, dataSourceType }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const dashboard = useMemo(
    () => buildTriDashboardData(runtimeData, resolvedPeriod, scenario, valuationAssumptions),
    [runtimeData, resolvedPeriod, scenario, valuationAssumptions],
  );

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as TriValuationAssumptions);
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
        const payload = await fetchTriBackendJson<TriHistoricalValuationResponse>(
          [
            "/api/tri/historical-valuations?scenario=Base&modelVersion=tri_v1_backend_pilot",
            "/api/stocks/tri/historical-valuations?scenario=Base&modelVersion=tri_v1_backend_pilot",
          ],
          { signal: controller.signal },
        );
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

  const segmentRows = dashboard.segment.map((row) => ({
    segment: row.segment,
    revenue: row.revenue,
    ebitda: row.adjustedEbitda,
    margin: row.adjustedEbitdaMargin * 100,
    quality: row.qualityScore,
    risk: row.riskScore,
  }));
  const valuationRows = dashboard.valuationEngine.methodBridge.map((row) => ({
    method: row.method,
    fairValue: Number(row.fairValue.toFixed(1)),
    contribution: Number(row.contribution.toFixed(1)),
    weight: Number((row.weight * 100).toFixed(0)),
  }));
  const forecastRows = dashboard.valuationEngine.forecast.map((row) => ({
    year: row.year,
    revenue: row.revenue,
    ebitda: row.adjustedEbitda,
    margin: row.margin * 100,
    fcff: row.fcff,
  }));

  return (
    <div className="space-y-6">
      <SectionCard
        title="Thomson Reuters AI Workflow Research Cockpit"
        description="TRI is modeled as a recurring professional workflow and authoritative-content platform. The dashboard separates official actuals, management guidance, AI commentary, forecast assumptions and market data."
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Derived" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Fair Value" value={usd(dashboard.valuation.recommendedFairValue ?? 0)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs current price`} icon={DollarSign} />
          <ScoreBlock label="Current Price" value={usd(dashboard.dataset.marketData.currentPrice)} note={`${dashboard.dataset.marketData.priceDate} market data`} icon={DollarSign} />
          <ScoreBlock label="AI Progress Score" value={dashboard.aiProgress.aiProgressScore.toFixed(0)} note={`${pct(dashboard.aiProgress.aiRevenueExposure)} high-AI revenue exposure`} icon={BrainCircuit} />
          <ScoreBlock label="Big 3 Organic Guide" value={pct(dashboard.dataset.guidance.big3OrganicGrowth)} note="Legal, Corporates, Tax/Audit/Accounting" icon={BriefcaseBusiness} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <InsightPanel title="Core Thesis" text="CoCounsel can turn Thomson Reuters' legal, tax, audit, compliance and content assets into a paid AI workflow layer for regulated professionals." icon={Sparkles} />
          <InsightPanel title="Main Debate" text="The market needs proof that AI adoption raises recurring revenue and retention, rather than being bundled into existing platforms while technology costs rise." icon={BrainCircuit} />
          <InsightPanel title="Red-Team View" text={dashboard.risk.verdict} icon={AlertTriangle} />
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
          <SectionCard title="Executive Snapshot" description="PM-level view of the AI workflow thesis, segment economics, capital return and valuation triangulation.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Revenue" value={usdb(dashboard.period.revenue)} note={`${pct(dashboard.period.organicRevenueGrowth)} organic growth`} icon={BriefcaseBusiness} />
              <ScoreBlock label="EBITDA Margin" value={pct(dashboard.period.adjustedEbitdaMargin)} note={`${dashboard.period.label} official actual`} icon={DollarSign} />
              <ScoreBlock label="Free Cash Flow" value={usdm(dashboard.period.freeCashFlow)} note="Official FCF" icon={DollarSign} />
              <ScoreBlock label="Recurring Mix" value={pct(dashboard.period.recurringRevenuePct ?? 0)} note="Official reported mix" icon={Scale} />
              <ScoreBlock label="Dividend Yield" value={pct(dashboard.dataset.marketData.dividendYield)} note="Market data" icon={DollarSign} />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Segment Revenue and EBITDA">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={86} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue">
                      {segmentRows.map((_, index) => (
                        <Cell key={index} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Bar>
                    <Bar dataKey="ebitda" fill="#111827" name="Adjusted EBITDA" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Quality and Risk Scores">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={86} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="quality" fill="#1f6f78" name="Quality" />
                    <Bar dataKey="risk" fill="#a16207" name="Risk" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ai-progress" className="mt-6 space-y-6">
          <SectionCard title="AI Progress Lab" description="AI evidence is displayed as product and commercial progress. It is not capitalized directly; valuation uses capped AI premium and explicit growth/margin assumptions.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Progress Score" value={dashboard.aiProgress.aiProgressScore.toFixed(0)} note="Milestones plus revenue exposure" icon={BrainCircuit} />
              <ScoreBlock label="High-AI Revenue Exposure" value={pct(dashboard.aiProgress.aiRevenueExposure)} note="Legal, Corporates and Tax/Audit/Accounting" icon={Sparkles} />
              <ScoreBlock label="Commercial Milestones" value={dashboard.aiProgress.commercialMilestones.toString()} note="Scaling or commercializing" icon={FileText} />
              <ScoreBlock label="AI Premium Cap" value={pct(valuationAssumptions.aiPremiumCap)} note="Valuation guardrail" icon={Gavel} />
            </div>
            <InsightPanel title="What AI Must Prove" text={dashboard.aiProgress.thesis} icon={BrainCircuit} />
            <DataTable
              columns={["Date", "Product Area", "Milestone", "Metric", "Status", "Thesis Impact"]}
              rows={dashboard.aiProgress.milestoneRows.map((item) => [
                item.date,
                item.productArea,
                item.title,
                item.metric ?? "n/a",
                item.status,
                item.thesisImpact,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Business Segment Economics" description="The Big 3 workflow segments carry the AI thesis; Reuters and Global Print are modeled separately to avoid giving every dollar the same multiple.">
            <DataTable
              columns={["Segment", "Revenue", "EBITDA", "Margin", "Organic Growth", "Recurring Mix", "AI Exposure", "Quality", "Risk", "Source"]}
              rows={dashboard.segment.map((row) => [
                row.segment,
                usdm(row.revenue),
                usdm(row.adjustedEbitda),
                pct(row.adjustedEbitdaMargin),
                row.organicGrowth === undefined ? "n/a" : pct(row.organicGrowth),
                row.recurringRevenuePct === undefined ? "n/a" : pct(row.recurringRevenuePct),
                row.aiExposure,
                row.qualityScore,
                row.riskScore,
                row.sourceType,
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <TriHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <TriBacktestPanel />
          <SectionCard title="Valuation Triangulation" description="FCFF DCF, FCF yield, EV/EBITDA, P/E and SOTP are blended with a capped AI premium and capped risk discount.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="DCF" value={usd(dashboard.valuationEngine.dcf.fairValuePerShare)} note={`Terminal ${pct(dashboard.valuationEngine.dcf.terminalValueShareOfEv)}`} icon={DollarSign} />
              <ScoreBlock label="FCF Yield" value={usd(dashboard.valuationEngine.fcfYieldFairValue)} note={`${pct(valuationAssumptions.targetFcfYield)} target yield`} icon={DollarSign} />
              <ScoreBlock label="EV / EBITDA" value={usd(dashboard.valuationEngine.evEbitdaFairValue)} note={multiple(valuationAssumptions.targetEvEbitda)} icon={DollarSign} />
              <ScoreBlock label="SOTP" value={usd(dashboard.valuationEngine.sotpFairValue)} note={`${pct(dashboard.valuationEngine.cappedAiPremium + dashboard.valuationEngine.cappedRiskDiscount)} net overlay`} icon={Scale} />
              <ScoreBlock label="Blended Value" value={usd(dashboard.valuationEngine.blendedFairValue)} note={`${usd(dashboard.valuationEngine.valuationRangeLow)}-${usd(dashboard.valuationEngine.valuationRangeHigh)}`} icon={DollarSign} />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Method Fair Values">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={valuationRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="fairValue" fill="#1f6f78" name="Fair value" />
                    <Bar dataKey="contribution" fill="#a16207" name="Weighted contribution" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="DCF Forecast">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={forecastRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#1f6f78" name="Revenue" strokeWidth={2} />
                    <Line type="monotone" dataKey="ebitda" stroke="#7c3aed" name="Adjusted EBITDA" strokeWidth={2} />
                    <Line type="monotone" dataKey="fcff" stroke="#a16207" name="FCFF" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
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

        <Tabs.Content value="risk" className="mt-6 space-y-6">
          <SectionCard title="AI Risk Red Team" description="The bear case focuses on paid adoption, workflow competition, technology cost and Reuters AI content licensing durability.">
            <InsightPanel title="Red-Team Verdict" text={dashboard.risk.verdict} icon={AlertTriangle} />
            <DataTable
              columns={["Risk", "Affected Segment", "Mechanism", "Leading Indicator", "Kill Criterion", "Impact"]}
              rows={dashboard.risk.items.map((item) => [
                item.risk,
                item.affectedSegment,
                item.mechanism,
                item.leadingIndicator,
                item.killCriterion,
                pct(item.valuationImpact),
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-return" className="mt-6 space-y-6">
          <TriCapitalReturnsBackendPanel />
          <SectionCard title="Capital Return and Guidance" description="Capital return is attractive only if AI investment does not consume FCF conversion or force margin guide revisions.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="FY2026 FCF Guide" value={usdb(dashboard.dataset.guidance.freeCashFlow)} note="Management guidance" icon={DollarSign} />
              <ScoreBlock label="Dividend / Share" value={usd(dashboard.dataset.marketData.dividendPerShare)} note={`${pct(dashboard.dataset.marketData.dividendYield)} yield`} icon={DollarSign} />
              <ScoreBlock label="Q2 Organic Guide" value={`${pct(dashboard.dataset.guidance.q2OrganicGrowthLow)}-${pct(dashboard.dataset.guidance.q2OrganicGrowthHigh)}`} note="Management guidance" icon={BriefcaseBusiness} />
              <ScoreBlock label="Q2 EBITDA Margin" value={pct(dashboard.dataset.guidance.q2AdjustedEbitdaMargin)} note="Management guidance" icon={Scale} />
            </div>
            <BulletPanel title="Monitoring Plan" items={dashboard.aiProgress.monitoring} />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function TriCapitalReturnsBackendPanel() {
  const [history, setHistory] = useState<TriCapitalReturnHistory | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCapitalReturns() {
      setStatus("loading");
      setMessage(null);
      try {
        const payload = await fetchTriBackendJson<TriCapitalReturnHistory>(
          ["/api/stocks/tri/capital-returns?years=8", "/api/tri/capital-returns?years=8"],
          { signal: controller.signal },
        );
        setHistory(payload);
        setStatus("online");
      } catch (error) {
        if (controller.signal.aborted) return;
        setHistory(null);
        setStatus("offline");
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
    loadCapitalReturns();
    return () => controller.abort();
  }, []);

  const rows = history?.rows ?? [];
  const forward = history?.forwardExpectation ?? null;
  const latest = rows[rows.length - 1] ?? null;
  const chartRows = [
    ...rows.map((row) => ({
      year: `FY${row.fiscalYear}`,
      dividendCashCost: row.dividendCashCost ?? 0,
      buybackAmount: row.buybackAmount ?? 0,
      dividendCashForecast: null as number | null,
      buybackForecast: null as number | null,
      totalCapitalReturn: row.totalCapitalReturn ?? 0,
      dividendPerShare: row.dividendPerShare,
      fcfCoverage: row.fcfCoverage,
      sourceQuality: row.sourceQuality,
      isForecast: false,
    })),
    ...(forward
      ? [{
          year: `FY${forward.fiscalYear}E`,
          dividendCashCost: null,
          buybackAmount: null,
          dividendCashForecast: forward.dividendCashCost ?? 0,
          buybackForecast: forward.buybackAmount ?? 0,
          totalCapitalReturn: forward.totalCapitalReturn ?? 0,
          dividendPerShare: forward.dividendPerShare,
          fcfCoverage: forward.fcfCoverage,
          sourceQuality: forward.sourceQuality,
          isForecast: true,
        }]
      : []),
  ];
  const warningText = history?.warnings?.map((warning) => `${warning.title}: ${warning.detail}`).join(" ") ?? null;

  return (
    <SectionCard
      title="Backend Dividend & Buyback History"
      description="Eight-year annual TRI capital-return history from the backend financial_periods table. FY2026E is a forecast assumption and is visually separated from historical actual/proxy rows."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock
          label="Latest DPS"
          value={latest?.dividendPerShare != null ? usd(latest.dividendPerShare) : "n/a"}
          note={latest ? `FY${latest.fiscalYear} ${latest.sourceQuality.replace(/_/g, " ")}` : "Backend row not loaded"}
        />
        <ScoreBlock
          label="Latest Dividend Cash"
          value={latest?.dividendCashCost != null ? usdm(latest.dividendCashCost) : "n/a"}
          note="Cash dividends paid or DPS multiplied by diluted shares"
        />
        <ScoreBlock
          label="Latest Buyback"
          value={latest?.buybackAmount != null ? usdm(latest.buybackAmount) : "n/a"}
          note={latest ? `FY${latest.fiscalYear} share repurchase spend` : "Backend row not loaded"}
        />
        <ScoreBlock
          label="2026E Total Return"
          value={forward?.totalCapitalReturn != null ? usdm(forward.totalCapitalReturn) : "n/a"}
          note="Dashed forecast-assumption bars"
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
          <ChartPanel title="Dividend Cash Cost vs Buybacks">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartRows}>
                <defs>
                  <pattern id="triDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#ecfdf5" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#0f766e" strokeWidth="2" />
                  </pattern>
                  <pattern id="triBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#eff6ff" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="2" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const labelByKey: Record<string, string> = {
                      dividendCashCost: "Dividend cash cost",
                      buybackAmount: "Buybacks",
                      dividendCashForecast: "2026E dividend forecast",
                      buybackForecast: "2026E buyback forecast",
                    };
                    return [usdm(value), labelByKey[name] ?? name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return `${label}${row?.isForecast ? " | forecast assumption" : ""}${row?.dividendPerShare != null ? ` | DPS ${usd(row.dividendPerShare)}` : ""}${row?.fcfCoverage != null ? ` | FCF coverage ${multiple(row.fcfCoverage)}` : ""}`;
                  }}
                />
                <Legend />
                <Bar dataKey="dividendCashCost" fill="#0f766e" name="Dividend cash cost" />
                <Bar dataKey="buybackAmount" fill="#2563eb" name="Buybacks" />
                <Bar dataKey="dividendCashForecast" fill="url(#triDividendForecastHatch)" stroke="#0f766e" strokeDasharray="4 3" name="2026E dividend forecast" />
                <Bar dataKey="buybackForecast" fill="url(#triBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name="2026E buyback forecast" />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Backend Source Notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Dividend cash cost is calculated by the API from official cash dividends paid when available; otherwise it uses DPS multiplied by diluted shares. FY2018-FY2024 are explicitly labeled as proxy rows until official annual-report cash-flow tables are backfilled. FY2026E is a hatched forecast-assumption bar and is excluded from 8Y historical cumulative totals.
            </p>
            <div className="mt-4 grid gap-3">
              <ScoreBlock label="Dividend Cash, 8Y" value={history ? usdm(history.summary.cumulativeDividendCash) : "n/a"} note="Historical rows only" />
              <ScoreBlock label="Buybacks, 8Y" value={history ? usdm(history.summary.cumulativeBuybacks) : "n/a"} note="Historical rows only" />
              <ScoreBlock label="2026E Buyback" value={forward?.buybackAmount != null ? usdm(forward.buybackAmount) : "n/a"} note="Forecast assumption" />
              <ScoreBlock label="Latest FCF Coverage" value={latest?.fcfCoverage != null ? multiple(latest.fcfCoverage) : "n/a"} note="FCF / dividends plus buybacks" />
            </div>
          </div>

          <div className="xl:col-span-2">
            <DataTable
              columns={["Fiscal Year", "DPS", "Dividend Cash", "Buyback", "Total Return", "FCF Coverage", "Source"]}
              rows={[...rows, ...(forward ? [forward] : [])].map((row) => [
                `FY${row.fiscalYear}${row.isForecast ? "E" : ""}`,
                row.dividendPerShare != null ? usd(row.dividendPerShare) : "n/a",
                row.dividendCashCost != null ? usdm(row.dividendCashCost) : "n/a",
                row.buybackAmount != null ? usdm(row.buybackAmount) : "n/a",
                row.totalCapitalReturn != null ? usdm(row.totalCapitalReturn) : "n/a",
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

function eventLabel(event: TriHistoricalValuationEvent, compact = false) {
  if (event.fiscalPeriod) return compact ? event.fiscalPeriod.replace(" ", " ") : event.fiscalPeriod;
  if (event.fiscalYear && event.fiscalQuarter) return compact ? `Q${event.fiscalQuarter} ${String(event.fiscalYear).slice(2)}` : `Q${event.fiscalQuarter} ${event.fiscalYear}`;
  return event.eventDate;
}

function TriHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: TriHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(16);
  const displayRows = rows;
  const boundedVisibleCount = Math.min(Math.max(4, visibleCount), Math.max(4, displayRows.length));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - boundedVisibleCount)),
    [boundedVisibleCount, displayRows],
  );
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => {
      const price = row.valuationRun?.currentPrice ?? null;
      const fairValue = row.valuationRun?.fairValue ?? null;
      return {
        period: eventLabel(row.event, true),
        eventDate: row.event.eventDate,
        fiscalPeriod: eventLabel(row.event),
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

  return (
    <SectionCard
      title="TRI Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by TRI reporting event from the unified SQLite backend. The static TRI dashboard still renders if the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns.toString()} note="Base runs persisted by event" icon={FileText} />
        <ScoreBlock label="Quarter Events" value={displayRows.length ? displayRows.length.toString() : "n/a"} note="Quarterly history imported into TRI backend" icon={CalendarDays} />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" icon={DollarSign} />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" icon={TrendingUp} />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static TRI dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the oldest-to-newest chart while the reporting-event selector remains horizontally scrollable.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 16, 24, displayRows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setVisibleCount(count)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${boundedVisibleCount === Math.min(Math.max(4, count), Math.max(4, displayRows.length)) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {count === displayRows.length ? "All" : `${count}Q`}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="mt-4 h-2 w-full accent-blue-600"
              type="range"
              min={Math.min(4, displayRows.length || 4)}
              max={Math.max(4, displayRows.length)}
              value={boundedVisibleCount}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? eventLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? eventLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} icon={CalendarDays} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as a percent of price" icon={TrendingUp} />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium in visible window" icon={Scale} />
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
                  className={`min-w-[168px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{eventLabel(row.event)}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.valuationRun ? "Valuation saved" : "No run saved"}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} icon={CalendarDays} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior TRI adjusted close" icon={DollarSign} />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" icon={TrendingUp} />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Backend expected shareholder CAGR" icon={TrendingUp} />
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
                        const row = payload?.[0]?.payload as { eventDate?: string; fiscalPeriod?: string; gapPct?: number } | undefined;
                        return `${row?.eventDate ?? label}${row?.fiscalPeriod ? ` (${row.fiscalPeriod})` : ""}${typeof row?.gapPct === "number" ? ` | Gap ${pct(row.gapPct)}` : ""}`;
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
        <p className="mt-5 text-sm text-slate-600">Loading TRI historical valuation runs from the backend pilot.</p>
      ) : null}
    </SectionCard>
  );
}

function TriBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const payload = await fetchTriBackendJson<TriBacktestResult>(
        ["/api/tri/backtests", "/api/stocks/tri/backtests"],
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
        },
      );
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
      triReturn: (row.triBuyHold - 1) * 100,
      spyReturn: (row.spy - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="TRI vs SPY Backtest"
      description="Select a date range and compare daily TRI buy-and-hold performance against SPY from backend adjusted price history."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-blue-50 text-blue-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "Backend error" : "Ready"}
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
          <ChartPanel title="TRI vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="triReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="TRI" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="TRI CAGR" value={metrics.triBuyHold?.cagr != null ? pct(metrics.triBuyHold.cagr) : "n/a"} note="Buy-and-hold" icon={TrendingUp} />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" icon={TrendingUp} />
              <ScoreBlock label="TRI MDD" value={metrics.triBuyHold?.maxDrawdown != null ? pct(metrics.triBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" icon={AlertTriangle} />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" icon={AlertTriangle} />
              <ScoreBlock label="TRI Sharpe" value={metrics.triBuyHold?.sharpe != null ? metrics.triBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" icon={Scale} />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" icon={Scale} />
              <ScoreBlock label="TRI Vol" value={metrics.triBuyHold?.volatility != null ? pct(metrics.triBuyHold.volatility) : "n/a"} note="Annualized daily vol" icon={Scale} />
              <ScoreBlock label="SPY Vol" value={metrics.spy?.volatility != null ? pct(metrics.spy.volatility) : "n/a"} note="Annualized daily vol" icon={Scale} />
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

function ScoreBlock({ label, value, note, icon: Icon = DollarSign }: { label: string; value: string | number; note: string; icon?: LucideIcon }) {
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

function InsightPanel({ title, text, icon: Icon }: { title: string; text: string; icon: typeof BrainCircuit }) {
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
