import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, Boxes, CloudCog, DollarSign, Satellite, ShieldAlert, ShoppingCart, Sparkles, TrendingUp } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import {
  attachAmznRuntimeContext,
  buildAmznDashboardData,
  resolveAmznDataset,
} from "./calculations";
import { defaultAmznValuationAssumptions, type AmznValuationAssumptions } from "./assumptions";
import type { AmznResearchFramework } from "./data";

type AmznHistoricalValuationRun = {
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

type AmznHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  label?: string | null;
  title?: string | null;
};

type AmznHistoricalValuationItem = {
  event: AmznHistoricalValuationEvent;
  valuationRun: AmznHistoricalValuationRun | null;
};

type AmznHistoricalValuationResponse = {
  historicalValuations?: AmznHistoricalValuationItem[];
};

type AmznBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type AmznBacktestCurvePoint = {
  date: string;
  spy: number;
  benchmark?: number;
  amznBuyHold: number;
};

type AmznBacktestResult = {
  status?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    spy?: AmznBacktestMetricSet;
    amznBuyHold?: AmznBacktestMetricSet;
  };
  curve?: AmznBacktestCurvePoint[];
  warnings?: string[];
};

type AmznBackendFinancialPeriod = {
  periodId: string;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  periodType?: string | null;
  asOfDate?: string | null;
  sourceType?: string | null;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  operatingCashFlow?: number | null;
  capex?: number | null;
  freeCashFlow?: number | null;
};

type AmznBackendSegmentFinancial = {
  periodId: string;
  segment: string;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  revenueGrowth?: number | null;
  sourceType?: string | null;
};

type AmznBackendBusinessUnitFinancial = {
  periodId: string;
  businessUnit: string;
  revenue?: number | null;
  operatingIncome?: number | null;
  contributionMargin?: number | null;
  revenueGrowth?: number | null;
  sourceType?: string | null;
};

type AmznBackendOperatingMetric = {
  periodId: string;
  sourceType?: string | null;
  awsRevenue?: number | null;
  awsOperatingIncome?: number | null;
  awsOperatingMargin?: number | null;
  awsGrowth?: number | null;
  advertisingRevenue?: number | null;
  advertisingGrowth?: number | null;
  subscriptionServicesRevenue?: number | null;
  northAmericaOperatingIncome?: number | null;
  internationalOperatingIncome?: number | null;
  capexIntensity?: number | null;
  reportedFcf?: number | null;
  normalizedFcf?: number | null;
  fcfConversion?: number | null;
};

type AmznBackendSnapshotResponse = {
  financialPeriods?: AmznBackendFinancialPeriod[];
  segmentFinancials?: AmznBackendSegmentFinancial[];
  businessUnitFinancials?: AmznBackendBusinessUnitFinancial[];
  operatingMetricSnapshots?: AmznBackendOperatingMetric[];
  researchFramework?: AmznResearchFramework;
};

function loadSavedAmznValuationAssumptions() {
  if (typeof window === "undefined") return defaultAmznValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-AMZN");
  if (!saved) return defaultAmznValuationAssumptions;
  try {
    return {
      ...defaultAmznValuationAssumptions,
      ...(JSON.parse(saved) as Partial<AmznValuationAssumptions>),
    };
  } catch {
    return defaultAmznValuationAssumptions;
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

function quarterLabel(event: AmznHistoricalValuationEvent, compact = false) {
  const fiscalYear = event.fiscalYear ? String(event.fiscalYear).slice(2) : "";
  const quarter = event.fiscalQuarter ?? event.fiscalPeriod?.match(/Q[1-4]/i)?.[0]?.toUpperCase();
  if (fiscalYear && quarter) return compact ? `FY${fiscalYear} ${quarter}` : `FY20${fiscalYear} ${quarter}`;
  return event.fiscalPeriod ?? event.label ?? event.eventDate;
}

function snapshotPeriodLabel(period: AmznBackendFinancialPeriod) {
  const fiscalYear = period.fiscalYear ? String(period.fiscalYear).slice(2) : "";
  const quarter = period.fiscalQuarter ?? "";
  if (fiscalYear && quarter) return `FY${fiscalYear} ${quarter}`;
  return period.periodId;
}

function snapshotQuarterRank(period: AmznBackendFinancialPeriod) {
  const match = /^Q([1-4])$/.exec(period.fiscalQuarter ?? "");
  return match ? Number(match[1]) : 4;
}

function snapshotPeriodSortValue(period: AmznBackendFinancialPeriod) {
  return (period.fiscalYear ?? 0) * 10 + snapshotQuarterRank(period);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AmznDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [valuationAssumptions, setValuationAssumptions] = useState<AmznValuationAssumptions>(loadSavedAmznValuationAssumptions);
  const [historicalValuations, setHistoricalValuations] = useState<AmznHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);
  const [backendSnapshot, setBackendSnapshot] = useState<AmznBackendSnapshotResponse | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<"loading" | "online" | "offline">("loading");
  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveAmznDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () => attachAmznRuntimeContext(moduleData, { periodId: resolvedPeriod, dataSourceType }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const dashboard = useMemo(
    () => buildAmznDashboardData(runtimeData, resolvedPeriod, scenario, dataSourceType === "manual" ? valuationAssumptions : {}),
    [dataSourceType, runtimeData, resolvedPeriod, scenario, valuationAssumptions],
  );
  const summary = useMemo(() => module.calculateSummary(runtimeData), [runtimeData, module]);
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_AMZN_API_BASE_URL ?? "http://127.0.0.1:8787";

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as AmznValuationAssumptions);
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
        let response = await fetch(
          `${apiBase}/api/amzn/historical-valuations?scenario=Base&modelVersion=amzn_v1_backend_pilot`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          response = await fetch(
            `${apiBase}/api/stocks/amzn/historical-valuations?scenario=Base&modelVersion=amzn_v1_backend_pilot`,
            { signal: controller.signal },
          );
        }
        if (!response.ok) throw new Error(`AMZN backend returned ${response.status}`);
        const payload = (await response.json()) as AmznHistoricalValuationResponse;
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
  }, [apiBase]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBackendSnapshot() {
      setSnapshotStatus("loading");
      try {
        let response = await fetch(`${apiBase}/api/amzn/snapshot`, { signal: controller.signal });
        if (!response.ok) {
          response = await fetch(`${apiBase}/api/stocks/amzn/snapshot`, { signal: controller.signal });
        }
        if (!response.ok) throw new Error(`AMZN snapshot returned ${response.status}`);
        const payload = (await response.json()) as AmznBackendSnapshotResponse;
        setBackendSnapshot(payload);
        setSnapshotStatus("online");
      } catch {
        if (controller.signal.aborted) return;
        setBackendSnapshot(null);
        setSnapshotStatus("offline");
      }
    }
    loadBackendSnapshot();
    return () => controller.abort();
  }, [apiBase]);

  const segmentRows = dashboard.segments.map((segment) => ({
    segment: segment.segment,
    revenue: segment.revenue,
    operatingIncome: segment.operatingIncome,
    margin: segment.operatingMargin * 100,
  }));
  const aws = dashboard.segments.find((segment) => segment.segment === "AWS");
  const northAmerica = dashboard.segments.find((segment) => segment.segment === "North America");
  const international = dashboard.segments.find((segment) => segment.segment === "International");
  const advertising = dashboard.segments.find((segment) => segment.segment === "Advertising");
  const methodRows = dashboard.valuation.methodCards.map((method) => ({ method: method.label, value: method.value }));
  const fcfRows = [{
    period: dashboard.period.label,
    reportedFcf: dashboard.metric?.reportedFcf ?? dashboard.period.freeCashFlow ?? 0,
    normalizedFcf: dashboard.metric?.normalizedFcf ?? dashboard.period.freeCashFlow ?? 0,
    capexIntensity: (dashboard.metric?.capexIntensity ?? ((dashboard.period.capex ?? 0) / Math.max(dashboard.period.revenue, 1))) * 100,
    fcfConversion: (dashboard.metric?.fcfConversion ?? ((dashboard.period.freeCashFlow ?? 0) / Math.max(dashboard.period.revenue, 1))) * 100,
  }];
  const backendTrendRows = useMemo(() => {
    const financialPeriods = [...(backendSnapshot?.financialPeriods ?? [])]
      .filter((row) => row.periodType === "quarter")
      .sort((left, right) => snapshotPeriodSortValue(left) - snapshotPeriodSortValue(right))
      .slice(-12);
    if (!financialPeriods.length) {
      return [{
        period: dashboard.period.label,
        revenue: dashboard.period.revenue,
        operatingIncome: dashboard.period.operatingIncome,
        awsRevenue: aws?.revenue ?? null,
        awsGrowth: aws?.revenueGrowth != null ? aws.revenueGrowth * 100 : null,
        awsMargin: aws?.operatingMargin != null ? aws.operatingMargin * 100 : null,
        northAmericaOperatingIncome: northAmerica?.operatingIncome ?? null,
        internationalOperatingIncome: international?.operatingIncome ?? null,
        advertisingRevenue: advertising?.revenue ?? null,
        advertisingGrowth: advertising?.revenueGrowth != null ? advertising.revenueGrowth * 100 : null,
        subscriptionServicesRevenue: dashboard.segments.find((segment) => segment.segment === "Subscription / Prime")?.revenue ?? null,
        reportedFcf: dashboard.metric?.reportedFcf ?? dashboard.period.freeCashFlow ?? null,
        normalizedFcf: dashboard.metric?.normalizedFcf ?? dashboard.period.freeCashFlow ?? null,
        capexIntensity: (dashboard.metric?.capexIntensity ?? ((dashboard.period.capex ?? 0) / Math.max(dashboard.period.revenue, 1))) * 100,
        fcfConversion: dashboard.metric?.fcfConversion != null ? dashboard.metric.fcfConversion * 100 : null,
        sourceType: dashboard.period.sourceStatus,
      }];
    }

    const segmentsByPeriod = new Map<string, Map<string, AmznBackendSegmentFinancial>>();
    for (const row of backendSnapshot?.segmentFinancials ?? []) {
      const bucket = segmentsByPeriod.get(row.periodId) ?? new Map<string, AmznBackendSegmentFinancial>();
      bucket.set(row.segment, row);
      segmentsByPeriod.set(row.periodId, bucket);
    }
    const businessUnitsByPeriod = new Map<string, Map<string, AmznBackendBusinessUnitFinancial>>();
    for (const row of backendSnapshot?.businessUnitFinancials ?? []) {
      const bucket = businessUnitsByPeriod.get(row.periodId) ?? new Map<string, AmznBackendBusinessUnitFinancial>();
      bucket.set(row.businessUnit, row);
      businessUnitsByPeriod.set(row.periodId, bucket);
    }
    const metricsByPeriod = new Map((backendSnapshot?.operatingMetricSnapshots ?? []).map((row) => [row.periodId, row]));

    return financialPeriods.map((period) => {
      const segmentBucket = segmentsByPeriod.get(period.periodId);
      const businessBucket = businessUnitsByPeriod.get(period.periodId);
      const metric = metricsByPeriod.get(period.periodId);
      const awsSegment = segmentBucket?.get("AWS");
      const northAmericaSegment = segmentBucket?.get("North America");
      const internationalSegment = segmentBucket?.get("International");
      const advertisingUnit = businessBucket?.get("Advertising");
      const subscriptionUnit = businessBucket?.get("Subscription services");
      const capexIntensity = numberOrNull(metric?.capexIntensity) ?? (
        period.revenue && period.capex ? period.capex / period.revenue : null
      );
      const fcfConversion = numberOrNull(metric?.fcfConversion) ?? (
        period.revenue && period.freeCashFlow ? period.freeCashFlow / period.revenue : null
      );
      return {
        period: snapshotPeriodLabel(period),
        revenue: numberOrNull(period.revenue),
        operatingIncome: numberOrNull(period.operatingIncome),
        awsRevenue: numberOrNull(metric?.awsRevenue) ?? numberOrNull(awsSegment?.revenue),
        awsGrowth: (numberOrNull(metric?.awsGrowth) ?? numberOrNull(awsSegment?.revenueGrowth)) != null
          ? (numberOrNull(metric?.awsGrowth) ?? numberOrNull(awsSegment?.revenueGrowth) ?? 0) * 100
          : null,
        awsMargin: (numberOrNull(metric?.awsOperatingMargin) ?? numberOrNull(awsSegment?.operatingMargin)) != null
          ? (numberOrNull(metric?.awsOperatingMargin) ?? numberOrNull(awsSegment?.operatingMargin) ?? 0) * 100
          : null,
        northAmericaOperatingIncome: numberOrNull(metric?.northAmericaOperatingIncome) ?? numberOrNull(northAmericaSegment?.operatingIncome),
        internationalOperatingIncome: numberOrNull(metric?.internationalOperatingIncome) ?? numberOrNull(internationalSegment?.operatingIncome),
        advertisingRevenue: numberOrNull(metric?.advertisingRevenue) ?? numberOrNull(advertisingUnit?.revenue),
        advertisingGrowth: (numberOrNull(metric?.advertisingGrowth) ?? numberOrNull(advertisingUnit?.revenueGrowth)) != null
          ? (numberOrNull(metric?.advertisingGrowth) ?? numberOrNull(advertisingUnit?.revenueGrowth) ?? 0) * 100
          : null,
        subscriptionServicesRevenue: numberOrNull(metric?.subscriptionServicesRevenue) ?? numberOrNull(subscriptionUnit?.revenue),
        reportedFcf: numberOrNull(metric?.reportedFcf) ?? numberOrNull(period.freeCashFlow),
        normalizedFcf: numberOrNull(metric?.normalizedFcf) ?? numberOrNull(period.freeCashFlow),
        capexIntensity: capexIntensity != null ? capexIntensity * 100 : null,
        fcfConversion: fcfConversion != null ? fcfConversion * 100 : null,
        sourceType: metric?.sourceType ?? period.sourceType ?? "research_only",
      };
    });
  }, [advertising, aws, backendSnapshot, dashboard.metric, dashboard.period, dashboard.segments, international, northAmerica]);
  const researchFramework = backendSnapshot?.researchFramework ?? dashboard.researchFramework;
  const researchThemeRows = researchFramework.themeTiles.map((theme) => ({
    ...theme,
    signalLabel: theme.portfolioSignal === "constructive" ? "Constructive" : theme.portfolioSignal === "neutral" ? "Neutral" : "Caution",
    leadingIndicatorsText: theme.leadingIndicators.join(", "),
  }));
  const profitPoolRows = researchFramework.profitPoolScorecard.map((row) => ({
    ...row,
    growthPct: row.growth * 100,
    marginPct: row.margin * 100,
  }));
  const aiCapexScenarioRows = researchFramework.aiCapexScenarios.map((row) => ({
    ...row,
    awsGrowthPct: row.awsGrowth * 100,
    awsMarginPct: row.awsMargin * 100,
    capexIntensityPct: row.capexIntensity * 100,
    normalizedFcfMarginPct: row.normalizedFcfMargin * 100,
    aiCapexDragPct: row.aiCapexDrag * 100,
  }));
  const constructiveThemes = researchThemeRows.filter((theme) => theme.portfolioSignal === "constructive").length;
  const cautionThemes = researchThemeRows.filter((theme) => theme.portfolioSignal === "caution").length;
  const topProfitPool = [...profitPoolRows].sort((left, right) => right.score - left.score)[0];
  const weakestProfitPool = [...profitPoolRows].sort((left, right) => left.score - right.score)[0];
  const baseAiScenario = aiCapexScenarioRows.find((row) => row.scenario === "Base");
  const bearAiScenario = aiCapexScenarioRows.find((row) => row.scenario === "Bear");
  const bullAiScenario = aiCapexScenarioRows.find((row) => row.scenario === "Bull");
  const aiFcfSpread = bullAiScenario && bearAiScenario ? bullAiScenario.normalizedFcf - bearAiScenario.normalizedFcf : null;

  return (
    <div className="space-y-6">
      <SectionCard
        title="AMZN Research Cockpit"
        description="Amazon is underwritten as a multi-engine system: AWS AI economics, retail margin expansion, advertising contribution, Prime/subscription flywheel, normalized FCF after capex, Kuiper optionality, and red-team risk."
        badge={<DataQualityBadge badge={dashboard.period.sourceStatus === "official_actual" ? "Actual" : "Placeholder"} />}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <InsightPanel icon={<CloudCog className="h-4 w-4" />} title="Variant View" text={dashboard.thesis.variantView} />
          <InsightPanel icon={<ShieldAlert className="h-4 w-4" />} title="Falsifiers" text={dashboard.thesis.falsifiers} />
          <InsightPanel icon={<Activity className="h-4 w-4" />} title="Source Discipline" text="Consolidated actuals come from the backend SEC layer when online; segment and business-unit estimates remain research-only until official rows are imported." />
        </div>
      </SectionCard>

      <SectionCard
        title="AMZN Market Focus System"
        description="Latest public-source decision layer: what the market is watching, how it maps into the model, and what would falsify the thesis."
        badge={
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${snapshotStatus === "online" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {snapshotStatus === "online" ? "Backend synced" : "Static fallback"}
          </span>
        }
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <ScoreBlock label="Current Read" value={constructiveThemes > cautionThemes ? "Constructive" : "Balanced"} note={researchFramework.currentRead.verdict} />
          <ScoreBlock label="Top Profit Pool" value={topProfitPool?.engine ?? "n/a"} note={topProfitPool ? `Evidence score ${topProfitPool.score}/100` : "No scorecard"} />
          <ScoreBlock label="AI FCF Spread" value={aiFcfSpread != null ? usdb(aiFcfSpread) : "n/a"} note="Bull minus bear normalized FCF in the capex scenario grid" />
          <ScoreBlock label="Market Debate" value="AWS + Ads + FCF" note={researchFramework.currentRead.marketIsWatching} />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <ChartPanel title="Profit-Pool Evidence Score">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={profitPoolRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="engine" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={76} />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(value: number) => `${value.toFixed(0)} / 100`} />
                <Bar dataKey="score" fill="#111827" name="Evidence score" />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="AI Capex Scenario: Normalized FCF and Capex Intensity">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={aiCapexScenarioRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="scenario" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tickFormatter={(value: number) => `$${(value / 1_000).toFixed(0)}bn`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number, name: string) => name === "Capex intensity" ? `${value.toFixed(1)}%` : usdb(value)}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="normalizedFcf" fill="#2563eb" name="Normalized FCF" />
                <Line yAxisId="right" type="monotone" dataKey="capexIntensityPct" dot stroke="#f97316" strokeWidth={2.4} name="Capex intensity" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      </SectionCard>

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

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <SectionCard title="Core Investment Questions" description="The AMZN dashboard follows the buy-side skill framework: source map, segment economics, variant perception, valuation triangulation, and risk red-team.">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {dashboard.insightPanels.map((panel, index) => (
                <InsightPanel key={panel.title} icon={panelIcons[index]} title={panel.title} text={panel.text} />
              ))}
            </div>
          </SectionCard>
          <SectionCard
            title="Segment Revenue and Operating Income"
            description={snapshotStatus === "online" ? "Backend quarterly history is online; research-only segment allocations remain labeled as such." : "Offline fallback remains visible while backend quarterly history is unavailable."}
          >
            <div className="grid gap-5 xl:grid-cols-2">
              <ChartPanel title="Current Segment Mix">
                <ResponsiveContainer width="100%" height={330}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={64} />
                    <YAxis />
                    <Tooltip formatter={(value: number, name: string) => name === "margin" ? pct(value / 100) : usdm(value)} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                    <Bar dataKey="operatingIncome" fill="#0f766e" name="Operating income" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Quarterly Revenue and Operating Income">
                <ResponsiveContainer width="100%" height={330}>
                  <ComposedChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#bfdbfe" name="Revenue" />
                    <Line type="monotone" dataKey="operatingIncome" dot={false} stroke="#0f766e" strokeWidth={2.4} name="Operating income" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="market-focus" className="mt-6 space-y-6">
          <SectionCard title="Latest Market Focus Map" description="A buy-side map of the debates currently most likely to move AMZN estimates, multiple, and portfolio sizing.">
            <DataTable
              headers={["Theme", "Market Focus", "Model Driver", "Signal", "Leading Indicators"]}
              rows={researchThemeRows.map((theme) => [
                theme.title,
                theme.marketFocus,
                theme.modelDriver,
                theme.signalLabel,
                theme.leadingIndicatorsText,
              ])}
            />
          </SectionCard>
          <SectionCard title="Bull / Bear Debate by Research Theme" description="Each theme is tied to falsifiable evidence so the dashboard does not become generic Amazon optimism.">
            <div className="grid gap-4 lg:grid-cols-2">
              {researchThemeRows.map((theme) => (
                <div key={theme.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{theme.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${theme.portfolioSignal === "constructive" ? "bg-emerald-50 text-emerald-700" : theme.portfolioSignal === "neutral" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
                      {theme.signalLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{theme.evidence}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                      <p className="font-semibold">Bull case</p>
                      <p className="mt-1">{theme.bullCase}</p>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                      <p className="font-semibold">Bear case</p>
                      <p className="mt-1">{theme.bearCase}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Management Question Bank" description="Questions that connect earnings-call commentary to model drivers and monitoring cadence.">
            <DataTable
              headers={["Topic", "Question", "Metric to Watch"]}
              rows={researchFramework.managementQuestions.map((row) => [row.topic, row.question, row.metricToWatch])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment Economics" description="Amazon's valuation debate depends on which engine creates the next dollar of EBIT.">
            <DataTable
              headers={["Segment", "Revenue", "Operating Income", "Margin", "Growth", "Source"]}
              rows={dashboard.segments.map((segment) => [
                segment.segment,
                usdb(segment.revenue),
                usdb(segment.operatingIncome),
                pct(segment.operatingMargin),
                segment.revenueGrowth != null ? pct(segment.revenueGrowth) : "n/a",
                segment.sourceStatus.replace(/_/g, " "),
              ])}
            />
          </SectionCard>
          <SectionCard title="AWS Revenue Growth and Margin Trend" description="AWS AI demand must offset infrastructure intensity and price competition.">
            <div className="grid gap-4 md:grid-cols-3">
              <ScoreBlock label="AWS Revenue" value={aws ? usdb(aws.revenue) : "n/a"} note="AWS base used in valuation" />
              <ScoreBlock label="AWS Growth" value={aws?.revenueGrowth != null ? pct(aws.revenueGrowth) : "n/a"} note="As-of growth driver" />
              <ScoreBlock label="AWS Margin" value={aws ? pct(aws.operatingMargin) : "n/a"} note="Operating margin driver" />
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ChartPanel title="AWS Revenue">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Bar dataKey="awsRevenue" fill="#2563eb" name="AWS revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="AWS Growth and Operating Margin">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="awsGrowth" dot={false} stroke="#2563eb" strokeWidth={2.4} name="AWS growth" />
                    <Line type="monotone" dataKey="awsMargin" dot={false} stroke="#0f766e" strokeWidth={2.4} name="AWS margin" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="aws-ai" className="mt-6 space-y-6">
          <SectionCard title="AWS AI Economics" description="The underwriting question is not just AI demand; it is AI demand after capex, depreciation, price competition, and silicon strategy.">
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightPanel icon={<Sparkles className="h-4 w-4" />} title="Demand" text="Bedrock, Amazon Q, GPU capacity, Trainium, and Inferentia can reaccelerate AWS, but utilization and price discipline determine returns." />
              <InsightPanel icon={<DollarSign className="h-4 w-4" />} title="Returns" text="The model routes AI capex through normalized FCF and AWS margin rather than giving AI a free multiple uplift." />
            </div>
            <DataTable
              headers={["Driver", "Value", "Debate"]}
              rows={[
                ["AWS revenue", aws ? usdb(aws.revenue) : "n/a", "Scale of the AI/cloud profit pool"],
                ["AWS margin", aws ? pct(aws.operatingMargin) : "n/a", "Depreciation and pricing after AI infrastructure spend"],
                ["AI capex drag", pct(valuationAssumptions.aiCapexDrag), "Near-term FCF suppression from growth capex"],
              ]}
            />
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <ChartPanel title="AWS AI Scenario Matrix">
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={aiCapexScenarioRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="scenario" />
                    <YAxis yAxisId="left" tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value: number) => `$${(value / 1_000).toFixed(0)}bn`} />
                    <Tooltip
                      formatter={(value: number, name: string) => name === "Normalized FCF" ? usdb(value) : `${value.toFixed(1)}%`}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="awsGrowthPct" fill="#2563eb" name="AWS growth" />
                    <Bar yAxisId="left" dataKey="awsMarginPct" fill="#0f766e" name="AWS margin" />
                    <Line yAxisId="right" type="monotone" dataKey="normalizedFcf" stroke="#f97316" strokeWidth={2.4} name="Normalized FCF" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Base Case Read-Through</p>
                <div className="mt-4 grid gap-3">
                  <ScoreBlock label="Base AWS Growth" value={baseAiScenario ? pct(baseAiScenario.awsGrowth) : "n/a"} note="AI demand growth assumption" />
                  <ScoreBlock label="Base Capex Intensity" value={baseAiScenario ? pct(baseAiScenario.capexIntensity) : "n/a"} note="Revenue reinvested into infrastructure and logistics capacity" />
                  <ScoreBlock label="AI FCF Drag" value={baseAiScenario ? pct(baseAiScenario.aiCapexDrag) : "n/a"} note="Explicit normalized FCF haircut, not a hidden multiple penalty" />
                </div>
              </div>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="retail-ads" className="mt-6 space-y-6">
          <SectionCard title="Retail Margin Bridge" description="North America versus International operating income shows whether fulfillment regionalization and cost discipline are durable.">
            <div className="grid gap-4 md:grid-cols-3">
              <ScoreBlock label="North America OI" value={northAmerica ? usdb(northAmerica.operatingIncome) : "n/a"} note={northAmerica ? pct(northAmerica.operatingMargin) : "n/a"} />
              <ScoreBlock label="International OI" value={international ? usdb(international.operatingIncome) : "n/a"} note={international ? pct(international.operatingMargin) : "n/a"} />
              <ScoreBlock label="Retail Spread" value={northAmerica && international ? pct(northAmerica.operatingMargin - international.operatingMargin) : "n/a"} note="NA margin less International margin" />
            </div>
            <div className="mt-5">
              <ChartPanel title="North America vs International Operating Income">
                <ResponsiveContainer width="100%" height={310}>
                  <LineChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="northAmericaOperatingIncome" dot={false} stroke="#2563eb" strokeWidth={2.4} name="North America OI" />
                    <Line type="monotone" dataKey="internationalOperatingIncome" dot={false} stroke="#0f766e" strokeWidth={2.4} name="International OI" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
          <SectionCard title="Advertising Profit Pool" description="Advertising deserves a separate high-multiple lens only if growth and contribution margin remain resilient.">
            <div className="grid gap-4 md:grid-cols-3">
              <ScoreBlock label="Ad Revenue" value={advertising ? usdb(advertising.revenue) : "n/a"} note="Profit-pool revenue lens" />
              <ScoreBlock label="Ad Growth" value={advertising?.revenueGrowth != null ? pct(advertising.revenueGrowth) : "n/a"} note="As-of growth driver" />
              <ScoreBlock label="Ad Margin" value={advertising ? pct(advertising.operatingMargin) : pct(valuationAssumptions.advertisingContributionMargin)} note="Contribution margin lens" />
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ChartPanel title="Advertising Revenue">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Bar dataKey="advertisingRevenue" fill="#2563eb" name="Advertising revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Advertising Growth">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Line type="monotone" dataKey="advertisingGrowth" dot={false} stroke="#0f766e" strokeWidth={2.4} name="Advertising growth" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
          <SectionCard title="Retail and Ads Profit-Pool Scorecard" description="This scorecard compares Amazon's earnings engines using growth, margin, durability, and the specific watch item that would change the thesis.">
            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <ChartPanel title="Engine Quality Score">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={profitPoolRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="engine" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={76} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(0)} / 100`} />
                    <Bar dataKey="score" fill="#111827" name="Evidence score" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <DataTable
                headers={["Engine", "Growth", "Margin", "Durability", "Watch Item", "Valuation Implication"]}
                rows={profitPoolRows.map((row) => [
                  row.engine,
                  row.growth ? pct(row.growth) : "n/a",
                  row.margin ? pct(row.margin) : "n/a",
                  row.durability,
                  row.watchItem,
                  row.valuationImplication,
                ])}
              />
            </div>
            {weakestProfitPool ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <p className="font-semibold">Weakest proof point: {weakestProfitPool.engine}</p>
                <p className="mt-1">{weakestProfitPool.watchItem}</p>
              </div>
            ) : null}
          </SectionCard>
          <SectionCard title="Prime / Subscription Flywheel" description="Prime supports frequency, retention, logistics density, streaming, and ad inventory quality.">
            <InsightPanel icon={<ShoppingCart className="h-4 w-4" />} title="Flywheel" text="The valuation framework treats subscription revenue as a reinforcing flywheel rather than a stand-alone media multiple, with retention and retail frequency as the main proof points." />
            <div className="mt-5">
              <ChartPanel title="Subscription Services Revenue">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={backendTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Bar dataKey="subscriptionServicesRevenue" fill="#64748b" name="Subscription services revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="fcf-capex" className="mt-6 space-y-6">
          <SectionCard title="FCF / Capex Debate" description="Reported FCF versus normalized FCF separates maintenance capex from growth capex, AI infrastructure, logistics, and Kuiper.">
            <div className="grid gap-5 xl:grid-cols-2">
              <ChartPanel title="Reported FCF vs Normalized FCF">
                <ResponsiveContainer width="100%" height={310}>
                  <BarChart data={backendTrendRows.length ? backendTrendRows : fcfRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Legend />
                    <Bar dataKey="reportedFcf" fill="#94a3b8" name="Reported FCF" />
                    <Bar dataKey="normalizedFcf" fill="#2563eb" name="Normalized FCF" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Capex Intensity and FCF Conversion">
                <ResponsiveContainer width="100%" height={310}>
                  <LineChart data={backendTrendRows.length ? backendTrendRows : fcfRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="capexIntensity" dot={false} stroke="#64748b" strokeWidth={2.4} name="Capex intensity" />
                    <Line type="monotone" dataKey="fcfConversion" dot={false} stroke="#0f766e" strokeWidth={2.4} name="FCF conversion" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <DataTable
              headers={["Scenario", "Normalized FCF", "FCF Margin", "Capex Intensity", "AI Capex Drag", "Interpretation", "Action"]}
              rows={aiCapexScenarioRows.map((row) => [
                row.scenario,
                usdb(row.normalizedFcf),
                pct(row.normalizedFcfMargin),
                pct(row.capexIntensity),
                pct(row.aiCapexDrag),
                row.interpretation,
                row.action,
              ])}
            />
          </SectionCard>
          <SectionCard title="Project Kuiper Optionality" description="Kuiper has real-option value only if strategic value exceeds the capex and ROIC dilution.">
            <InsightPanel icon={<Satellite className="h-4 w-4" />} title="Optionality With Discipline" text={dashboard.metric?.projectKuiperCommentary ?? "Kuiper is modeled as explicit optionality, with zero value in bear cases and no automatic uplift in historical periods before it was knowable."} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <AmznHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <AmznBacktestPanel apiBase={apiBase} />
          <SectionCard title="Valuation Triangulation" description="AMZN valuation blends FCFF, FCF yield, EV/EBIT, and SOTP across AWS, advertising, retail, subscription, and Kuiper.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Valuation Method Bridge">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={methodRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usd(value)} />
                    <Bar dataKey="value" fill="#2563eb" name="Fair value / share" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <DataTable
                headers={["Method", "Value", "Description"]}
                rows={dashboard.valuation.methodCards.map((method) => [method.label, usd(method.value), method.description])}
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
          <SectionCard title="Risk Red Team" description="The red-team lens maps bear-case risks to model drivers, breakpoints, and monitoring triggers.">
            <DataTable
              headers={["Risk", "Driver", "Trigger", "Severity"]}
              rows={dashboard.riskRows.map((risk) => [risk.risk, risk.driver, risk.trigger, risk.severity])}
            />
          </SectionCard>
          <SectionCard title="Kill Criteria and Monitoring Cadence" description="The position should be reduced or re-underwritten if these disconfirming signals appear.">
            <div className="grid gap-5 xl:grid-cols-2">
              <DataTable
                headers={["Kill Criteria"]}
                rows={researchFramework.killCriteria.map((item) => [item])}
              />
              <DataTable
                headers={["Monitoring Plan"]}
                rows={researchFramework.monitoringPlan.map((item) => [item])}
              />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

const panelIcons: ReactNode[] = [
  <CloudCog className="h-4 w-4" />,
  <Boxes className="h-4 w-4" />,
  <DollarSign className="h-4 w-4" />,
  <TrendingUp className="h-4 w-4" />,
  <ShoppingCart className="h-4 w-4" />,
  <Satellite className="h-4 w-4" />,
  <AlertTriangle className="h-4 w-4" />,
];

function AmznHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: AmznHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows.filter((row) => /^q[1-4]_results$/.test(row.event.eventType));
  const [visibleCount, setVisibleCount] = useState(16);
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: quarterLabel(row.event, true),
      fiscalPeriod: row.event.fiscalPeriod ?? row.event.fiscalQuarter ?? row.event.eventDate,
      eventDate: row.event.eventDate,
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
      title="AMZN Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by AMZN reporting event from the SQLite backend. Static dashboard data remains available when the API is offline."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length || "n/a"} note="Eight-year quarterly history target" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs event price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static AMZN dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">AMZN valuation history is ordered oldest to newest.</p>
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
              min={Math.min(4, Math.max(displayRows.length, 4))}
              max={Math.max(4, displayRows.length)}
              value={Math.min(visibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? quarterLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? quarterLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value / price minus one" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average visible-window gap" />
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
                  <span className="mt-1 block font-semibold">{quarterLabel(row.event)}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.label ?? "Selected reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior daily adjusted close" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Expected shareholder CAGR" />
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
                        const row = payload?.[0]?.payload;
                        return `${row?.eventDate ?? ""} ${label}${row?.fiscalPeriod ? ` (${row.fiscalPeriod})` : ""}${typeof row?.gapPct === "number" ? ` | Gap ${pct(row.gapPct)}` : ""}`;
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
        <p className="mt-5 text-sm text-slate-600">Loading AMZN historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}

function AmznBacktestPanel({ apiBase }: { apiBase: string }) {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AmznBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      let response = await fetch(`${apiBase}/api/amzn/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
      });
      if (!response.ok) {
        response = await fetch(`${apiBase}/api/stocks/amzn/backtests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
        });
      }
      if (!response.ok) throw new Error(`AMZN backend returned ${response.status}`);
      const payload = (await response.json()) as AmznBacktestResult;
      setResult(payload);
      setStatus(payload.status === "insufficient_data" ? "error" : "done");
      setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : null);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [apiBase, endDate, startDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({
      ...row,
      spyReturn: (row.spy - 1) * 100,
      amznReturn: (row.amznBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="AMZN vs SPY Backtest"
      description="Simple AMZN buy-and-hold performance versus SPY over the selected interval."
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
          <ChartPanel title="AMZN vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="amznReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="AMZN" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="AMZN CAGR" value={metrics.amznBuyHold?.cagr != null ? pct(metrics.amznBuyHold.cagr) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="AMZN MDD" value={metrics.amznBuyHold?.maxDrawdown != null ? pct(metrics.amznBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="AMZN Sharpe" value={metrics.amznBuyHold?.sharpe != null ? metrics.amznBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="AMZN Vol" value={metrics.amznBuyHold?.volatility != null ? pct(metrics.amznBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
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

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-4 text-sm font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => <th key={header} className="px-3 py-3 font-semibold">{header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 align-top text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
