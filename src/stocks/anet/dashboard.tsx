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
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  Database,
  Globe2,
  LineChart as LineChartIcon,
  RefreshCcw,
  Scale,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type { StockDashboardProps } from "../types";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { anetValuationConfig } from "./config";
import { defaultAnetValuationAssumptions } from "./assumptions";
import { buildAnetDashboardData, resolveAnetDataset } from "./calculations";
import type { AnetDataset, AnetFinancialPeriod, AnetSourceStatus, ValuationAssumptions } from "./model";

type VHistoricalValuationRun = {
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

type VHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  label?: string | null;
};

type VHistoricalValuationItem = {
  event: VHistoricalValuationEvent;
  valuationRun: VHistoricalValuationRun | null;
};

type VHistoricalValuationResponse = {
  historicalValuations?: VHistoricalValuationItem[];
};

type AnetBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type AnetBacktestCurvePoint = {
  date: string;
  anetBuyHold: number;
  spy: number;
  benchmark?: number;
  price?: number;
};

type AnetBacktestResult = {
  id?: string;
  status?: string;
  warnings?: string[];
  metrics?: {
    anetBuyHold?: AnetBacktestMetricSet;
    spy?: AnetBacktestMetricSet;
    benchmark?: AnetBacktestMetricSet;
  };
  curve?: AnetBacktestCurvePoint[];
};

type VCapitalReturnRow = {
  fiscalYear: number;
  periodId: string;
  asOfDate: string | null;
  sourceType: string;
  sourceQuality: string;
  revenue: number | null;
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
  rawJson?: Record<string, unknown> | null;
};

type VCapitalReturnResponse = {
  ticker: "ANET";
  currency: "USD";
  unit: "USDm";
  years: number;
  rows: VCapitalReturnRow[];
  forwardExpectation?: VCapitalReturnRow | null;
  summary: {
    latestDividendPerShare?: number | null;
    latestEquityFreeCashFlow?: number | null;
    latestBuybackAmount?: number | null;
    latestFcfCoverage?: number | null;
    cumulativeCapitalReturn?: number | null;
    cumulativeFcf?: number | null;
    forwardTotalCapitalReturn?: number | null;
    forwardBuybackAmount?: number | null;
  };
  warnings?: Array<{ id?: string; title?: string; detail?: string; severity?: string }>;
};

type AnetSubscriptionAgentRow = {
  periodId: string;
  fiscalYear: number;
  fiscalQuarter: string;
  label: string;
  asOfDate: string | null;
  netRevenue: number | null;
  subscriptionRevenue: number | null;
  subscriptionRevenueGrowth?: number | null;
  subscriptionRevenueQoqGrowth?: number | null;
  subscriptionRevenueYoyGrowth?: number | null;
  subscriptionRevenueMix?: number | null;
  currentRpo: number | null;
  currentRpoGrowth?: number | null;
  currentRpoQoqGrowth?: number | null;
  currentRpoYoyGrowth?: number | null;
  remainingPerformanceObligations?: number | null;
  netRetentionRate?: number | null;
  agenticAiArr?: number | null;
  agenticAiCustomers?: number | null;
  agenticAiArrQoqGrowth?: number | null;
  agenticAiArrYoyGrowth?: number | null;
  proPlusAdoptionRate?: number | null;
  freeCashFlow?: number | null;
  freeCashFlowMargin?: number | null;
  sourceQuality: string;
};

type AnetSubscriptionAgentResponse = {
  ticker: "ANET";
  rows: AnetSubscriptionAgentRow[];
  summary: {
    rowCount?: number;
    latestPeriod?: string | null;
    latestNetRevenue?: number | null;
    latestSubscriptionRevenue?: number | null;
    latestSubscriptionRevenueGrowth?: number | null;
    latestCurrentRpo?: number | null;
    latestCurrentRpoGrowth?: number | null;
    latestAgenticAiArr?: number | null;
    latestAgenticAiCustomers?: number | null;
    latestProPlusAdoptionRate?: number | null;
    latestFreeCashFlowMargin?: number | null;
  };
  warnings?: Array<{ id?: string; title?: string; detail?: string; severity?: string }>;
};

type BackendSnapshotResponse = {
  reportingEvent?: unknown;
  financialPeriods?: Array<Record<string, unknown>>;
  segmentFinancials?: Array<Record<string, unknown>>;
  operatingMetricSnapshots?: Array<Record<string, unknown>>;
  marketSnapshot?: Record<string, unknown> | null;
};

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "n/a";
}

function usdm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`
    : "n/a";
}

function usdb(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}bn`
    : "n/a";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function numberFmt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "n/a";
}

function chartTickInterval(length: number) {
  return length > 24 ? 3 : length > 16 ? 2 : length > 10 ? 1 : 0;
}

function qoqGrowthPct(current: number | null | undefined, previous: number | null | undefined) {
  return typeof current === "number" && Number.isFinite(current) && typeof previous === "number" && Number.isFinite(previous) && previous !== 0
    ? (current / previous - 1) * 100
    : null;
}

async function fetchJsonWithFallback<T>(paths: string[], init?: RequestInit): Promise<T> {
  const apiBase = import.meta.env.VITE_ANET_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const headers = new Headers(init?.headers);
      if (!headers.has("authorization") && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(apiBase)) {
        headers.set("authorization", "Bearer local-dev-token");
      }
      const response = await fetch(`${apiBase}${path}`, { ...init, headers });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sourceStatus(value: unknown): AnetSourceStatus {
  const status = asString(value);
  if (
    status === "official_actual" ||
    status === "official_seed" ||
    status === "market_data_proxy" ||
    status === "management_guidance" ||
    status === "forecast_assumption" ||
    status === "transcript_commentary" ||
    status === "research_only" ||
    status === "market_data"
  ) {
    return status;
  }
  return "research_only";
}

function mapAnetSnapshotToDataset(snapshot: BackendSnapshotResponse, fallback: AnetDataset): AnetDataset | null {
  const financialRows = snapshot.financialPeriods ?? [];
  if (!financialRows.length) return null;
  const periods = financialRows.map((row): AnetFinancialPeriod => {
    const fiscalYear = asNumber(row.fiscalYear) ?? 0;
    const fiscalQuarter = asString(row.fiscalQuarter) ?? undefined;
    const label = fiscalQuarter ? `FY${fiscalYear} ${fiscalQuarter}` : `FY${fiscalYear}`;
    return {
      id: asString(row.periodId) ?? asString(row.id) ?? label,
      label,
      fiscalYear,
      fiscalQuarter,
      periodType: sourceStatus(row.periodType) === "forecast_assumption" ? "forecast" : (asString(row.periodType) as AnetFinancialPeriod["periodType"]) ?? "quarter",
      periodStartDate: asString(row.periodStartDate) ?? undefined,
      periodEndDate: asString(row.periodEndDate) ?? undefined,
      sourceStatus: sourceStatus(row.sourceType),
      sourceId: asString(row.eventId) ?? asString(row.id) ?? label,
      asOfDate: asString(row.asOfDate) ?? undefined,
      revenue: asNumber(row.revenue) ?? 0,
      operatingIncome: asNumber(row.operatingIncome) ?? 0,
      operatingMargin: asNumber(row.operatingMargin),
      netIncome: asNumber(row.netIncome),
      dilutedEps: asNumber(row.dilutedEps),
      dilutedShares: asNumber(row.dilutedShares),
      operatingCashFlow: asNumber(row.operatingCashFlow),
      capex: asNumber(row.capex),
      freeCashFlow: asNumber(row.freeCashFlow),
      dividendsPaid: asNumber(row.dividendsPaid),
      buybacks: asNumber(row.buybacks),
      dividendPerShare: asNumber(row.dividendPerShare),
      notes: asString(row.notes),
    };
  });
  const market = snapshot.marketSnapshot ?? {};
  const sortedPeriods = [...periods].sort((left, right) => (left.asOfDate ?? "").localeCompare(right.asOfDate ?? ""));
  const latestPeriod = sortedPeriods[sortedPeriods.length - 1] ?? periods[periods.length - 1]!;
  const marketPrice = asNumber(market.currentPrice) ?? fallback.marketData.currentPrice;
  const shares = asNumber(market.sharesOutstanding) ?? latestPeriod.dilutedShares ?? fallback.marketData.sharesForMarketCap;
  return {
    periods,
    segmentFinancials: (snapshot.segmentFinancials ?? []).map((row) => ({
      periodId: asString(row.periodId) ?? "",
      segment: asString(row.segment) ?? "Unkanetn",
      taxonomy: asString(row.taxonomy),
      revenue: asNumber(row.revenue),
      operatingIncome: asNumber(row.operatingIncome),
      operatingMargin: asNumber(row.operatingMargin),
      growth: asNumber(row.growth),
      sourceStatus: sourceStatus(row.sourceType),
      notes: asString(row.notes),
    })),
    operatingMetrics: (snapshot.operatingMetricSnapshots ?? []).map((row) => ({
      periodId: asString(row.periodId) ?? undefined,
      asOfDate: asString(row.asOfDate) ?? latestPeriod.asOfDate ?? fallback.marketData.priceDate,
      sourceStatus: sourceStatus(row.sourceType),
      grossDollarVolume: asNumber(row.grossDollarVolume),
      purchaseVolume: asNumber(row.purchaseVolume),
      crossBorderVolumeGrowth: asNumber(row.crossBorderVolumeGrowth),
      switchedTransactions: asNumber(row.switchedTransactions),
      switchedTransactionsGrowth: asNumber(row.switchedTransactionsGrowth),
      subscriptionRevenue: asNumber(row.subscriptionRevenue),
      subscriptionRevenueGrowth: asNumber(row.subscriptionRevenueGrowth),
      currentRpo: asNumber(row.currentRpo),
      currentRpoGrowth: asNumber(row.currentRpoGrowth),
      remainingPerformanceObligations: asNumber(row.remainingPerformanceObligations),
      netRetentionRate: asNumber(row.netRetentionRate),
      largeCustomerCount: asNumber(row.largeCustomerCount),
      agenticAiArr: asNumber(row.agenticAiArr),
      agenticAiCustomers: asNumber(row.agenticAiCustomers),
      proPlusAdoptionRate: asNumber(row.proPlusAdoptionRate),
      processedTransactions: asNumber(row.processedTransactions),
      cardsAccounts: asNumber(row.cardsAccounts),
      rebatesIncentives: asNumber(row.rebatesIncentives),
      takeRate: asNumber(row.takeRate),
      takeRateCommentary: asString(row.takeRateCommentary),
      crossBorderCommentary: asString(row.crossBorderCommentary),
      travelCommentary: asString(row.travelCommentary),
      valueAddedServicesCommentary: asString(row.valueAddedServicesCommentary),
      operatingLeverageCommentary: asString(row.operatingLeverageCommentary),
      fxImpactCommentary: asString(row.fxImpactCommentary),
      regulatoryCommentary: asString(row.regulatoryCommentary),
      competitionCommentary: asString(row.competitionCommentary),
      capitalReturnCommentary: asString(row.capitalReturnCommentary),
      normalizedFcfCommentary: asString(row.normalizedFcfCommentary),
    })),
    marketData: {
      currentPrice: marketPrice,
      priceDate: asString(market.priceDate) ?? asString(market.asOfDate) ?? latestPeriod.asOfDate ?? fallback.marketData.priceDate,
      sharesForMarketCap: shares,
      marketCap: asNumber(market.marketCap) ?? marketPrice * shares,
      source: asString(market.source) ?? "V backend SQLite market snapshot",
      sourceStatus: "market_data",
    },
    latestReportingPeriod: latestPeriod.label,
  };
}

export function AnetDashboard({
  module,
  scenario,
  onScenarioChange,
  dataSourceType,
  onDataSourceChange,
}: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const [backendDataset, setBackendDataset] = useState<AnetDataset | null>(null);
  const [backendDatasetStatus, setBackendDatasetStatus] = useState<"loading" | "online" | "offline">("loading");
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "ANET",
    defaultAssumptions: defaultAnetValuationAssumptions,
    storageKey: "anet-valuation-assumptions",
    onDataSourceChange,
  });
  const fallbackData = resolveAnetDataset(module.data);

  useEffect(() => {
    let cancelled = false;
    async function loadSnapshot() {
      setBackendDatasetStatus("loading");
      try {
        const snapshot = await fetchJsonWithFallback<BackendSnapshotResponse>([
          "/api/anet/snapshot",
          "/api/stocks/anet/snapshot",
        ]);
        const mapped = mapAnetSnapshotToDataset(snapshot, fallbackData);
        if (!mapped) throw new Error("V backend snapshot did not include financial periods");
        if (!cancelled) {
          setBackendDataset(mapped);
          setBackendDatasetStatus("online");
          onDataSourceChange("api");
        }
      } catch {
        if (!cancelled) {
          setBackendDataset(null);
          setBackendDatasetStatus("offline");
        }
      }
    }
    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [fallbackData, onDataSourceChange]);

  const moduleData = backendDataset ?? fallbackData;
  const summary = useMemo(() => module.calculateSummary(moduleData), [module, moduleData]);
  const dashboard = useMemo(
    () => buildAnetDashboardData(moduleData, scenario, valuationAssumptions as Partial<ValuationAssumptions>),
    [moduleData, scenario, valuationAssumptions],
  );
  const valuation = dashboard.valuation;
  const selectedFairValue =
    valuation.fairValues.find((item) => item.scenario === scenario)?.fairValue ??
    valuation.recommendedFairValue ??
    valuation.blendedFairValue ??
    valuation.fairValues[1]?.fairValue ??
    null;
  const latestOperatingMetric = dashboard.metric;
  const latestPeriod = dashboard.period;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Arista Payments-Network Research Cockpit"
        description="V is framed around cross-border recovery, switched transactions, gross dollar volume, value-added services, take-rate stability, network-fee regulation, FCF conversion, and buyback-funded EPS growth."
        badge={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-600">{backendDatasetStatus === "online" ? "Backend history" : backendDatasetStatus === "loading" ? "Loading backend" : dataSourceType === "manual" ? "Manual scenario" : "Static fallback"}</span>}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Selected Fair Value" value={usd(selectedFairValue)} note={`${pct(valuation.upsideDownside)} vs price anchor`} />
          <ScoreBlock label="Cross-Border Growth" value={pct(latestOperatingMetric?.crossBorderVolumeGrowth)} note="Travel-sensitive premium driver" />
          <ScoreBlock label="Switched Transactions" value={numberFmt(latestOperatingMetric?.switchedTransactions)} note="Millions of transactions" />
          <ScoreBlock label="FCF Margin" value={pct(summary.find((item) => item.key === "fcfMargin")?.value)} note="Capex-light cash conversion" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="Cross-Border Volume and Travel Recovery" text={latestOperatingMetric?.travelCommentary ?? "Cross-border volume remains the highest-beta driver because travel mix and assessment fees carry above-average economics."} />
          <InsightPanel icon={<Activity className="h-5 w-5" />} title="Switched Transactions / Network Volume" text="The core secular-compounder question is whether switched transactions and GDV keep compounding as cash displacement matures." />
          <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Regulation / Interchange / Network-Fee Risk" text={latestOperatingMetric?.regulatoryCommentary ?? "The module separates network-fee risk from merchant interchange headlines before applying valuation haircuts."} />
          <InsightPanel icon={<CircleDollarSign className="h-5 w-5" />} title="Capital Return and Share Count" text={latestOperatingMetric?.capitalReturnCommentary ?? "Buybacks are separated from organic growth and measured against FCF coverage."} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summary.map((metric) => (
          <MetricCard key={metric.key} metric={metric} currency="USD" />
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

        <Tabs.Content value="dashboard" className="mt-6 space-y-6">
          <SectionCard title="Core Investment Questions" description="V's premium multiple is tested through measurable network, mix, regulation, cash-flow, and capital-return drivers.">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <InsightPanel icon={<TrendingUp className="h-5 w-5" />} title="Secular Volume Compounder or Normalizing Growth" text="The cockpit separates GDV, purchase volume, switched transactions, and cross-border growth so maturity is visible rather than hidden inside net revenue." />
              <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="How Durable Is Cross-Border Revenue Growth" text="Cross-border recovery is isolated from domestic purchase volume because travel-sensitive assessment fees can normalize faster than headline volume." />
              <InsightPanel icon={<CreditCard className="h-5 w-5" />} title="Value-Added Services Mix" text={latestOperatingMetric?.valueAddedServicesCommentary ?? "VAS must keep mixing up to support premium margins as core network growth normalizes."} />
              <InsightPanel icon={<Scale className="h-5 w-5" />} title="Does Regulation Threaten Network Fees" text="Regulation is modeled as an explicit haircut, not an automatic revenue cliff; merchant interchange and network fees have different exposure paths." />
              <InsightPanel icon={<CircleDollarSign className="h-5 w-5" />} title="Organic EPS Growth vs Buybacks" text="EPS growth is split between organic network earnings and gross repurchases so buyback-driven compounding is visible." />
              <InsightPanel icon={<LineChartIcon className="h-5 w-5" />} title="Premium Multiple vs Mastercard and Market" text="P/E, FCF yield, EV/EBIT, and peer-premium methods show whether V still deserves a premium as growth normalizes." />
              <InsightPanel icon={<Database className="h-5 w-5" />} title="Normalized FCF Conversion" text={latestOperatingMetric?.normalizedFcfCommentary ?? "The dashboard underwrites V as a capex-light network but tests incentives, rebates, and regulation against FCF quality."} />
              <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Risk Red Team" text="The bear case asks whether cross-border normalizes, VAS mix disappoints, network-fee regulation bites, and alternative rails compress the multiple." />
            </div>
          </SectionCard>
          <SectionCard title="Latest Economics" description="Backend snapshots replace the fallback dataset when the API is online. Values are USDm unless marked otherwise.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Annualized Net Revenue" value={usdb(latestPeriod.periodType === "quarter" ? latestPeriod.revenue * 4 : latestPeriod.revenue)} note={latestPeriod.label} />
              <ScoreBlock label="Operating Margin" value={pct(latestPeriod.operatingMargin ?? latestPeriod.operatingIncome / latestPeriod.revenue)} note="Scale and VAS mix" />
              <ScoreBlock label="Gross Dollar Volume" value={usdb(latestOperatingMetric?.grossDollarVolume)} note="Network volume base" />
              <ScoreBlock label="Take-Rate / Yield" value={pct(latestOperatingMetric?.takeRate)} note="Net revenue / GDV" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="agent-ai" className="mt-6 space-y-6">
          <SectionCard title="Cross-Border Volume and Travel Recovery" description="Cross-border is separated from domestic purchase volume because travel and assessment-fee mix can move valuation faster than total GDV.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Network Volume and Transactions">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={dashboard.volumeRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" interval={chartTickInterval(dashboard.volumeRows.length)} tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(value: number, name: string) => name.includes("Growth") || name.includes("Take") ? `${value.toFixed(1)}%` : numberFmt(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="switchedTransactions" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Switched transactions" />
                    <Line type="monotone" dataKey="crossBorderGrowth" stroke="#0f766e" strokeWidth={2.5} dot={false} name="Cross-border growth %" />
                    <Line type="monotone" dataKey="takeRate" stroke="#a16207" strokeWidth={2.5} dot={false} name="Take-rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="grid gap-4">
                <InsightPanel icon={<Activity className="h-5 w-5" />} title="Switched Transactions / Network Volume" text="Switched transactions are the cleanest activity measure for the core network and should compound ahead of nominal GDP when cash displacement and digital acceptance persist." />
                <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="Gross Dollar Volume and Purchase Volume" text="GDV and purchase volume keep the take-rate denominator visible, preventing a revenue-only dashboard from missing yield drift." />
                <InsightPanel icon={<RefreshCcw className="h-5 w-5" />} title="FX and Cross-Border Assessment Fees" text={latestOperatingMetric?.fxImpactCommentary ?? "FX translation and cross-border fee mix are tracked separately because they can distort reported growth."} />
              </div>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="subscription-growth" className="mt-6 space-y-6">
          <SectionCard title="Revenue Mix / Value-Added Services" description="The segment framework is analytical, not reported segment accounting: it is built to test what supports V's premium margin and multiple.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Analytical Revenue Mix">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={dashboard.segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="grid gap-4">
                <InsightPanel icon={<CreditCard className="h-5 w-5" />} title="Value-Added Services Mix" text={latestOperatingMetric?.valueAddedServicesCommentary ?? "VAS growth is the main non-volume support for premium margins."} />
                <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Cybersecurity and Data Analytics" text="Fraud, identity, cyber, loyalty, consulting, and data analytics can deepen merchant and issuer relationships beyond pure network assessment fees." />
                <InsightPanel icon={<Activity className="h-5 w-5" />} title="Take-Rate / Yield Stability" text={latestOperatingMetric?.takeRateCommentary ?? "Rebates and incentives are monitored against GDV so growth is not mistaken for yield expansion."} />
              </div>
            </div>
            <DataTable
              headers={["Framework Segment", "Revenue", "Operating Margin", "Growth", "Source", "Notes"]}
              rows={dashboard.segmentRows.map((row) => [
                row.segment,
                usdm(row.revenue),
                pct(row.operatingMargin),
                pct(row.growth),
                row.sourceStatus,
                row.notes ?? "",
              ])}
            />
          </SectionCard>
          <AnetSubscriptionAgentPanel />
        </Tabs.Content>

        <Tabs.Content value="margins-fcf" className="mt-6 space-y-6">
          <SectionCard title="Operating Leverage and Margin Durability" description="Margins and FCF are tested against transaction growth, VAS mix, rebates/incentives, FX, and regulation.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Margin and FCF Conversion">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={dashboard.marginRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="operatingMargin" stroke="#2563eb" strokeWidth={3} name="Operating margin" />
                    <Line type="monotone" dataKey="fcfMargin" stroke="#0f766e" strokeWidth={3} name="FCF margin" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="grid gap-4">
                <InsightPanel icon={<TrendingUp className="h-5 w-5" />} title="Operating Leverage and Incremental Margins" text={latestOperatingMetric?.operatingLeverageCommentary ?? "Incremental margins should stay high when volume, cross-border, and VAS scale faster than fixed network and technology cost."} />
                <InsightPanel icon={<Database className="h-5 w-5" />} title="Normalized FCF Conversion" text={latestOperatingMetric?.normalizedFcfCommentary ?? "V's low capex intensity supports high FCF conversion, but rebates and incentives can still matter."} />
              </div>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-return" className="mt-6 space-y-6">
          <VCapitalReturnsBackendPanel />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <VHistoricalValuationPanel />
          <AnetBacktestPanel />
          <ValuationTriangulationPanel valuation={valuation} />
          <SectionCard title="ANET Valuation Assumptions" description="Interactive controls are last by design: first inspect saved backend runs, V vs SPY history, and method outputs.">
            <InteractiveValuationDashboard
              ticker="ANET"
              config={anetValuationConfig}
              data={moduleData}
              scenario={scenario}
              currency="USD"
              values={valuationAssumptions}
              onValuesChange={handleValuationValuesChange}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="The risk module turns V's premium multiple into disconfirmable underwriting tests.">
            <div className="grid gap-4 lg:grid-cols-2">
              <BulletPanel title="Strongest Bear Case" items={[
                "Cross-border growth normalizes as travel comps mature, removing the highest-multiple recovery driver.",
                "Value-added services grows but cannot offset core network growth normalization or pricing pressure.",
                "Regulation directly constrains network fees or routing economics, compressing the take-rate and terminal multiple.",
                "Mastercard, Amex, domestic networks, RTP, and account-to-account rails pressure acceptance economics and investor confidence.",
                "EPS growth becomes too buyback-dependent while repurchases occur at a premium multiple.",
              ]} />
              <BulletPanel title="Falsifiers and Monitoring Triggers" items={[
                "Cross-border ex-travel and travel-related volumes keep compounding after recovery comps normalize.",
                "Switched transaction growth stays high while take-rate/yield remains stable after rebates and incentives.",
                "VAS/cyber/data analytics mix continues to lift growth without margin dilution.",
                "Regulatory outcomes target merchant economics more than V network fees.",
                "FCF comfortably covers dividends plus buybacks while diluted share count continues falling.",
              ]} />
            </div>
          </SectionCard>
          <SectionCard title="Competitive Position vs Arista and Alternative Rails" description="Competition is split by threat vector rather than treated as a generic fintech risk.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel icon={<CreditCard className="h-5 w-5" />} title="Mastercard / Amex" text="Mastercard is the closest global network comp; Amex is a closed-loop premium-spend comparator with different funding and credit economics." />
              <InsightPanel icon={<Scale className="h-5 w-5" />} title="Domestic Networks and Routing" text="Domestic schemes and routing rules can cap network economics in specific corridors even if global card volume remains healthy." />
              <InsightPanel icon={<RefreshCcw className="h-5 w-5" />} title="RTP / Account-to-Account Rails" text="Alternative rails are most relevant where bank-account payments can remove card-network economics without lowering consumer convenience." />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function VHistoricalValuationPanel() {
  const [rows, setRows] = useState<VHistoricalValuationItem[]>([]);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const [windowStart, setWindowStart] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadHistoricalValuations() {
      setStatus("loading");
      setMessage(null);
      try {
        const payload = await fetchJsonWithFallback<VHistoricalValuationResponse>([
          "/api/anet/historical-valuations?scenario=Base&modelVersion=anet_v1_backend_pilot",
          "/api/stocks/anet/historical-valuations?scenario=Base&modelVersion=anet_v1_backend_pilot",
        ]);
        const sorted = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          return left.event.eventDate.localeCompare(right.event.eventDate);
        });
        if (cancelled) return;
        setRows(sorted);
        setSelectedEventId((current) => current ?? [...sorted].reverse().find((row) => row.valuationRun)?.event.id ?? sorted[sorted.length - 1]?.event.id ?? null);
        setVisibleCount((current) => Math.min(Math.max(current, 8), Math.max(sorted.length, 8)));
        setWindowStart(Math.max(0, sorted.length - 16));
        setStatus("online");
      } catch (error) {
        if (cancelled) return;
        setRows([]);
        setStatus("offline");
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
    loadHistoricalValuations();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayRows = rows;
  const maxStart = Math.max(0, displayRows.length - visibleCount);
  const effectiveWindowStart = Math.min(windowStart, maxStart);
  const visibleRows = displayRows.slice(effectiveWindowStart, effectiveWindowStart + visibleCount);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0];
  const chartRows = visibleRows
    .filter((row) => row.valuationRun)
    .map((row) => ({
      label: row.event.fiscalPeriod ?? row.event.eventDate,
      eventDate: row.event.eventDate,
      fiscalPeriod: row.event.fiscalPeriod ?? "n/a",
      price: row.valuationRun?.currentPrice ?? 0,
      fairValue: row.valuationRun?.fairValue ?? 0,
      gap: row.valuationRun?.upsideDownside ?? null,
    }));
  const latestWithRun = [...displayRows].reverse().find((row) => row.valuationRun);
  const visibleGaps = visibleRows.map((row) => row.valuationRun?.upsideDownside).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageGap = visibleGaps.length ? visibleGaps.reduce((sum, value) => sum + value, 0) / visibleGaps.length : null;
  const savedRunCount = displayRows.filter((row) => row.valuationRun).length;

  function setWindow(count: number) {
    const next = Math.min(count, Math.max(displayRows.length, 1));
    setVisibleCount(next);
    setWindowStart(Math.max(0, displayRows.length - next));
  }

  return (
    <SectionCard
      title="ANET Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by Arista reporting event. Each run uses the data visible as of the reporting event and the nearest prior daily price bar."
      badge={<span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}</span>}
    >
      {status === "offline" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Historical data service is temporarily unavailable. Static ANET dashboard sections still render.
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={numberFmt(savedRunCount)} note="Base valuation rows" />
        <ScoreBlock label="Quarter Events" value={numberFmt(displayRows.length)} note="Reporting events" />
        <ScoreBlock label="Selected Fair Value" value={usd(selected?.valuationRun?.fairValue)} note={selected?.event.fiscalPeriod ?? "Select an event"} />
        <ScoreBlock label="Selected Upside / Downside" value={pct(selected?.valuationRun?.upsideDownside)} note={selected?.event.eventDate ?? "n/a"} />
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Visible window</p>
          <div className="flex flex-wrap gap-2">
            {[8, 12, 16, 24, displayRows.length].map((count) => (
              <button
                key={count}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${visibleCount === count || (count === displayRows.length && visibleCount >= displayRows.length) ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                type="button"
                onClick={() => setWindow(count)}
              >
                {count === displayRows.length ? "All" : `${count}Q`}
              </button>
            ))}
          </div>
        </div>
        <input
          className="mt-3 w-full accent-slate-900"
          type="range"
          min={0}
          max={maxStart}
          value={effectiveWindowStart}
          onChange={(event) => setWindowStart(Number(event.target.value))}
        />
      </div>
      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
        {displayRows.map((row) => {
          const selectedEvent = row.event.id === selected?.event.id;
          return (
            <button
              key={row.event.id}
              className={`min-w-36 rounded-lg border px-3 py-2 text-left text-xs ${selectedEvent ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
              type="button"
              onClick={() => setSelectedEventId(row.event.id)}
            >
              <span className="block font-semibold">{row.event.fiscalPeriod ?? row.event.eventDate}</span>
              <span className="mt-1 block">{row.valuationRun ? `${usd(row.valuationRun.fairValue)} FV` : "No saved run"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <ChartPanel title="Oldest to Newest Event Valuations">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" interval={chartTickInterval(chartRows.length)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value: number) => `$${value.toFixed(0)}`} />
              <Tooltip
                formatter={(value: number, name: string) => name === "Gap" ? pct(value) : usd(value)}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload as { eventDate?: string; fiscalPeriod?: string; price?: number; fairValue?: number; gap?: number | null } | undefined;
                  return row ? `${row.eventDate} / ${row.fiscalPeriod} / price ${usd(row.price)} / fair value ${usd(row.fairValue)} / gap ${pct(row.gap)}` : String(label);
                }}
              />
              <Legend />
              <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
              <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <div className="space-y-4">
          <ScoreBlock label="Visible Window" value={`${visibleRows.length}Q`} note={`${visibleRows[0]?.event.fiscalPeriod ?? "n/a"} to ${visibleRows[visibleRows.length - 1]?.event.fiscalPeriod ?? "n/a"}`} />
          <ScoreBlock label="Latest Gap" value={pct(latestWithRun?.valuationRun?.upsideDownside)} note={latestWithRun?.event.fiscalPeriod ?? "n/a"} />
          <ScoreBlock label="Average Gap" value={pct(averageGap)} note="Visible saved runs" />
          <DataTable
            headers={["Method", "Value", "Description"]}
            rows={(selected?.valuationRun?.methodOutputsJson ?? []).map((method) => [
              method.label ?? method.key ?? "Method",
              typeof method.value === "number" ? usd(method.value) : "n/a",
              method.description ?? "",
            ])}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function AnetSubscriptionAgentPanel() {
  const [history, setHistory] = useState<AnetSubscriptionAgentResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      setStatus("loading");
      try {
        const payload = await fetchJsonWithFallback<AnetSubscriptionAgentResponse>([
          "/api/anet/cloud-ai-history?quarters=40",
          "/api/stocks/anet/cloud-ai-history?quarters=40",
        ]);
        if (!active) return;
        setHistory(payload);
        setStatus("online");
        setMessage(null);
      } catch (error) {
        if (!active) return;
        setStatus("offline");
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
    loadHistory();
    return () => { active = false; };
  }, []);

  const rows = (history?.rows ?? []).map((row) => ({
    ...row,
    subscriptionRevenueGrowthPct: row.subscriptionRevenueGrowth == null ? null : row.subscriptionRevenueGrowth * 100,
    currentRpoGrowthPct: row.currentRpoGrowth == null ? null : row.currentRpoGrowth * 100,
    subscriptionRevenueQoqGrowthPct: row.subscriptionRevenueQoqGrowth == null ? null : row.subscriptionRevenueQoqGrowth * 100,
    currentRpoQoqGrowthPct: row.currentRpoQoqGrowth == null ? null : row.currentRpoQoqGrowth * 100,
    subscriptionRevenueYoyGrowthPct: row.subscriptionRevenueYoyGrowth == null ? null : row.subscriptionRevenueYoyGrowth * 100,
    currentRpoYoyGrowthPct: row.currentRpoYoyGrowth == null ? null : row.currentRpoYoyGrowth * 100,
    subscriptionRevenueMixPct: row.subscriptionRevenueMix == null ? null : row.subscriptionRevenueMix * 100,
    proPlusAdoptionPct: row.proPlusAdoptionRate == null ? null : row.proPlusAdoptionRate * 100,
    freeCashFlowMarginPct: row.freeCashFlowMargin == null ? null : row.freeCashFlowMargin * 100,
  }));
  const latest = history?.rows?.[history.rows.length - 1] ?? null;

  return (
    <SectionCard
      title="Backend Cloud & AI Networking History"
      description="Quarterly backend comparison of ANET cloud titan revenue, backlog, AI Ethernet revenue and cloud concentration, oldest to newest."
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data service unavailable"}</span>
        {status === "offline" ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{message && message !== "Failed to fetch" ? message : "Historical data is temporarily unavailable."}</div> : null}
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <ScoreBlock label="Cloud Titans" value={usdm(latest?.subscriptionRevenue)} note={latest?.label ?? "Backend"} />
        <ScoreBlock label="Latest Backlog" value={usdm(latest?.currentRpo)} note={pct(latest?.currentRpoGrowth)} />
        <ScoreBlock label="Agent ARR Proxy" value={usdm(latest?.agenticAiArr)} note={(numberFmt(latest?.agenticAiCustomers) + " customers")} />
        <ScoreBlock label="Cloud Mix" value={pct(latest?.proPlusAdoptionRate)} note={("FCF margin " + pct(latest?.freeCashFlowMargin))} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel title="Historical Cloud Titan Revenue vs Backlog">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows} margin={{ top: 10, right: 24, bottom: 12, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(value) => "$" + Math.round(Number(value) / 1000) + "b"} />
              <Tooltip formatter={(value: number, name: string) => [usdm(value), name]} labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as AnetSubscriptionAgentRow | undefined;
                return row ? String(label) + " / " + (row.asOfDate ?? "n/a") : String(label);
              }} />
              <Legend />
              <Bar dataKey="subscriptionRevenue" fill="#2563eb" name="Cloud titan revenue" />
              <Bar dataKey="currentRpo" fill="#0f766e" name="Backlog" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="QoQ Growth: Cloud Titans vs Backlog">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows} margin={{ top: 10, right: 24, bottom: 12, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(value) => Number(value).toFixed(0) + "%"} />
              <Tooltip formatter={(value: number, name: string) => [Number(value).toFixed(1) + "%", name]} />
              <Legend />
              <Bar dataKey="subscriptionRevenueQoqGrowthPct" fill="#2563eb" name="Cloud titan revenue QoQ" />
              <Bar dataKey="currentRpoQoqGrowthPct" fill="#0f766e" name="Backlog QoQ" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Subscription Mix and Cloud Mix">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows} margin={{ top: 10, right: 24, bottom: 12, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(value) => Number(value).toFixed(0) + "%"} />
              <Tooltip formatter={(value: number, name: string) => [Number(value).toFixed(1) + "%", name]} />
              <Legend />
              <Line type="monotone" dataKey="subscriptionRevenueMixPct" dot={false} stroke="#2563eb" strokeWidth={2.5} name="Cloud titan / revenue" />
              <Line type="monotone" dataKey="proPlusAdoptionPct" dot={false} stroke="#a16207" strokeWidth={2.5} name="AI networking mix" />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="YoY Growth: Cloud Titans vs Backlog">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows} margin={{ top: 10, right: 24, bottom: 12, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(value) => Number(value).toFixed(0) + "%"} />
              <Tooltip formatter={(value: number, name: string) => [Number(value).toFixed(1) + "%", name]} />
              <Legend />
              <Bar dataKey="subscriptionRevenueYoyGrowthPct" fill="#2563eb" name="Cloud titan revenue YoY" />
              <Bar dataKey="currentRpoYoyGrowthPct" fill="#0f766e" name="Backlog YoY" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InsightPanel icon={<Activity className="h-5 w-5" />} title="Agent Progress" text="Agent ARR and customer counts are explicit proxy fields until official disclosures are parsed; the proxy flag stays visible in warnings and validation." />
        <InsightPanel icon={<Database className="h-5 w-5" />} title="Cloud Titan Demand Check" text="Cloud titan revenue and Backlog are shown together so reported growth can be compared with forward demand, not just trailing revenue." />
      </div>
      <div className="mt-6">
        <DataTable
          headers={["Quarter", "Cloud Titans", "Backlog", "Cloud YoY", "Backlog YoY", "AI Ethernet", "Cloud Mix", "Source"]}
          rows={history?.rows?.slice(-12).map((row) => [
            row.label,
            usdm(row.subscriptionRevenue),
            usdm(row.currentRpo),
            pct(row.subscriptionRevenueYoyGrowth),
            pct(row.currentRpoYoyGrowth),
            usdm(row.agenticAiArr),
            pct(row.proPlusAdoptionRate),
            row.sourceQuality,
          ]) ?? []}
        />
      </div>
    </SectionCard>
  );
}

function VCapitalReturnsBackendPanel() {
  const [history, setHistory] = useState<VCapitalReturnResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const payload = await fetchJsonWithFallback<VCapitalReturnResponse>([
          "/api/anet/capital-returns?years=8",
          "/api/stocks/anet/capital-returns?years=8",
        ]);
        if (!cancelled) {
          setHistory(payload);
          setStatus("online");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("offline");
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = history?.rows ?? [];
  const forward = history?.forwardExpectation ?? null;
  const latest = rows[rows.length - 1];
  const chartRows = [
    ...rows.map((row) => ({
      ...row,
      label: `FY${row.fiscalYear}`,
      dividendCashForecast: null,
      buybackForecast: null,
      equityFreeCashFlowForecast: null,
    })),
    ...(forward
      ? [{
          ...forward,
          label: `FY${forward.fiscalYear}E`,
          dividendCashCost: null,
          buybackAmount: null,
          equityFreeCashFlow: null,
          dividendCashForecast: forward.dividendCashCost,
          buybackForecast: forward.buybackAmount,
          equityFreeCashFlowForecast: forward.equityFreeCashFlow,
        }]
      : []),
  ];
  const warningText = history?.warnings?.map((warning) => `${warning.title}: ${warning.detail}`).join(" ") ?? null;

  return (
    <SectionCard
      title="Backend FCF & Buyback History"
      description="Eight-year ANET capital-return history from backend financial-period data. Dividends are zero for ANET; buybacks stack separately and are compared with annual FCF and are compared with annual FCF."
      badge={<span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}</span>}
    >
      {status === "offline" ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message ?? "Capital return backend unavailable."}</p> : null}
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Latest DPS" value={usd(latest?.dividendPerShare)} note={latest ? `FY${latest.fiscalYear}` : "n/a"} />
        <ScoreBlock label="Latest FCF" value={usdm(latest?.equityFreeCashFlow)} note="Equity free cash flow" />
        <ScoreBlock label="Latest Buyback" value={usdm(latest?.buybackAmount)} note="Gross repurchases" />
        <ScoreBlock label="Forward Capital Return" value={usdm(forward?.totalCapitalReturn)} note={forward ? `FY${forward.fiscalYear}E forecast bar` : "Forecast pending"} />
      </div>
      <div className="mt-5">
        <ChartPanel title="Capital Return Stack vs FCF">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartRows}>
              <defs>
                <pattern id="anetDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#ecfdf5" />
                  <path d="M 0 0 L 0 8" stroke="#0f766e" strokeWidth="2" />
                </pattern>
                <pattern id="vBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#eff6ff" />
                  <path d="M 0 0 L 0 8" stroke="#2563eb" strokeWidth="2" />
                </pattern>
                <pattern id="vFcfForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#fff7ed" />
                  <path d="M 0 0 L 0 8" stroke="#f97316" strokeWidth="2" />
                </pattern>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(value: number) => `$${Number(value).toFixed(0)}m`} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    dividendCashCost: "Dividends",
                    buybackAmount: "Buybacks",
                    equityFreeCashFlow: "FCF",
                    dividendCashForecast: "Forecast dividends",
                    buybackForecast: "Forecast buybacks",
                    equityFreeCashFlowForecast: "Forecast FCF",
                  };
                  return [usdm(value), labels[name] ?? name];
                }}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload as (VCapitalReturnRow & { rawJson?: { forecastAssumptionLabel?: string }; label?: string; equityFreeCashFlowForecast?: number | null }) | undefined;
                  return row ? `${label} / DPS ${usd(row.dividendPerShare)} / capital return ${usdm(row.totalCapitalReturn)} / FCF ${usdm(row.equityFreeCashFlow ?? row.equityFreeCashFlowForecast)} / coverage ${row.fcfCoverage ? `${row.fcfCoverage.toFixed(2)}x` : "n/a"}${row.isForecast ? ` / ${String(row.rawJson?.forecastAssumptionLabel ?? "forecast assumption")}` : ""}` : String(label);
                }}
              />
              <Legend />
              <Bar dataKey="dividendCashCost" stackId="capitalReturn" fill="#0f766e" name="Dividends" />
              <Bar dataKey="buybackAmount" stackId="capitalReturn" fill="#2563eb" name="Buybacks" />
              <Bar dataKey="equityFreeCashFlow" fill="#f97316" name="FCF" />
              <Bar dataKey="dividendCashForecast" stackId="forecastCapitalReturn" fill="url(#anetDividendForecastHatch)" stroke="#0f766e" strokeDasharray="4 3" name="Forecast dividends" />
              <Bar dataKey="buybackForecast" stackId="forecastCapitalReturn" fill="url(#vBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name="Forecast buybacks" />
              <Bar dataKey="equityFreeCashFlowForecast" fill="url(#vFcfForecastHatch)" stroke="#f97316" strokeDasharray="4 3" name="Forecast FCF" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500">
        Dividend cash cost is calculated in the API from annual DPS and diluted shares. Buybacks are gross repurchases, not collapsed into dividends. FCF coverage is annual equity FCF divided by dividends plus buybacks. The forward row is a hatched forecast-assumption bar and is excluded from 8Y cumulative totals.
      </p>
      {warningText ? <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warningText}</p> : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Capital Return, 8Y" value={usdm(history?.summary.cumulativeCapitalReturn)} note="Dividends plus buybacks" />
        <ScoreBlock label="FCF, 8Y" value={usdm(history?.summary.cumulativeFcf)} note="Backend annual FCF series" />
        <ScoreBlock label="Forward Buyback" value={usdm(forward?.buybackAmount)} note="Forecast assumption" />
        <ScoreBlock label="Latest FCF Coverage" value={latest?.fcfCoverage != null ? `${latest.fcfCoverage.toFixed(2)}x` : "n/a"} note="FCF / capital return" />
      </div>
      <div className="mt-5">
        <DataTable
          headers={["Fiscal Year", "DPS", "Dividends", "Buybacks", "Capital Return", "FCF", "FCF Coverage", "Source"]}
          rows={[...rows, ...(forward ? [forward] : [])].map((row) => [
            row.isForecast ? `FY${row.fiscalYear}E` : `FY${row.fiscalYear}`,
            usd(row.dividendPerShare),
            usdm(row.dividendCashCost),
            usdm(row.buybackAmount),
            usdm(row.totalCapitalReturn),
            usdm(row.equityFreeCashFlow),
            row.fcfCoverage != null ? `${row.fcfCoverage.toFixed(2)}x` : "n/a",
            row.sourceQuality,
          ])}
        />
      </div>
    </SectionCard>
  );
}

function AnetBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<AnetBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    try {
      const payload = await fetchJsonWithFallback<AnetBacktestResult>([
        "/api/anet/backtests",
        "/api/stocks/anet/backtests",
      ], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
      });
      setResult(payload);
      setStatus("done");
    } catch (error) {
      setResult({ status: "error", warnings: [error instanceof Error ? error.message : String(error)] });
      setStatus("error");
    }
  }, [startDate, endDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1).map((row) => ({
      date: row.date,
      anetReturn: (row.anetBuyHold - 1) * 100,
      spyReturn: ((row.spy ?? row.benchmark ?? 1) - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="ANET vs SPY Backtest"
      description="Select a date range and compare daily ANET buy-and-hold performance against SPY from backend price history."
      badge={<span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "running" ? "bg-slate-100 text-slate-600" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "Needs data" : "Ready"}</span>}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-slate-600">
          Start Date
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-600">
          End Date
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={runBacktest}
          className="self-end rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={status === "running"}
        >
          Run Backtest
        </button>
      </div>
      {curve.length ? (
        <div className="mt-6">
          <ChartPanel title="Total Return Since Start">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" interval={chartTickInterval(curve.length)} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="anetReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="ANET" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.5} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ScoreBlock label="ANET CAGR" value={pct(metrics.anetBuyHold?.cagr)} note="Buy-and-hold" />
            <ScoreBlock label="SPY CAGR" value={pct(metrics.spy?.cagr)} note="Benchmark" />
            <ScoreBlock label="ANET MDD" value={pct(metrics.anetBuyHold?.maxDrawdown)} note="Maximum drawdown" />
            <ScoreBlock label="SPY MDD" value={pct(metrics.spy?.maxDrawdown)} note="Maximum drawdown" />
            <ScoreBlock label="ANET Sharpe" value={metrics.anetBuyHold?.sharpe != null ? metrics.anetBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
            <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
            <ScoreBlock label="ANET Vol" value={pct(metrics.anetBuyHold?.volatility)} note="Annualized daily vol" />
            <ScoreBlock label="SPY Vol" value={pct(metrics.spy?.volatility)} note="Annualized daily vol" />
          </div>
        </div>
      ) : null}
      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => (
            <p key={warning} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function ValuationTriangulationPanel({ valuation }: { valuation: ReturnType<typeof buildAnetDashboardData>["valuation"] }) {
  const methodRows = valuation.methodCards.map((card) => ({
    method: card.label,
    value: card.value,
  }));
  return (
    <SectionCard title="ANET Valuation Triangulation / Method Outputs" description="DCF / FCFF, FCF yield, P/E, EV/Revenue, and AI networking peer methods test whether ANET deserves a premium multiple as growth normalizes.">
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel title="Valuation Method Bridge">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={methodRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="method" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value: number) => `$${Number(value).toFixed(0)}`} />
              <Tooltip formatter={(value: number) => usd(value)} />
              <Bar dataKey="value" fill="#2563eb" name="Fair value" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <div className="grid gap-4">
          <ScoreBlock label="DCF / FCFF" value={usd(valuation.dcfValue)} note="FCF fade and terminal value" />
          <ScoreBlock label="FCF Yield" value={usd(valuation.fcfFairValue)} note="Normalized FCF capitalized" />
          <ScoreBlock label="P/E" value={usd(valuation.peFairValue)} note="EPS multiple" />
          <ScoreBlock label="Probability Weighted" value={usd(valuation.probabilityWeightedFairValue)} note="25% Bear / 50% Base / 25% Bull" />
        </div>
      </div>
      <div className="mt-5">
        <DataTable
          headers={["Driver", "Value", "Description"]}
          rows={valuation.expectedReturnBridge.map((item) => [
            item.label,
            item.format === "percent" ? pct(item.value) : item.format === "currency" ? usd(item.value) : item.value.toFixed(2),
            item.description ?? "",
          ])}
        />
      </div>
    </SectionCard>
  );
}

function ScoreBlock({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {note ? <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p> : null}
    </div>
  );
}

function InsightPanel({ icon, title, text }: { icon?: ReactNode; title: string; text: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-800">
        {icon ? <span className="text-slate-500">{icon}</span> : null}
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((heading) => (
              <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="max-w-md px-3 py-3 leading-6 text-slate-700">{cell}</td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={headers.length} className="px-3 py-4 text-slate-500">No rows available.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
