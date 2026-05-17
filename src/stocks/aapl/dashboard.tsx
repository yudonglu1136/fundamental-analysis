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
  AlertTriangle,
  Bot,
  CircleDollarSign,
  Globe2,
  LockKeyhole,
  Repeat2,
  ShieldAlert,
  Smartphone,
  Store,
  TrendingUp,
} from "lucide-react";
import type { StockDashboardProps } from "../types";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { aaplValuationConfig } from "./config";
import { defaultAaplValuationAssumptions } from "./assumptions";
import { buildAaplDashboardData, resolveAaplDataset } from "./calculations";
import type { AaplDataset, AaplFinancialPeriod, AaplSourceStatus, AaplValuationAssumptions } from "./model";

type AaplHistoricalValuationRun = {
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

type AaplHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  periodLabel?: string | null;
  title?: string | null;
};

type AaplHistoricalValuationItem = {
  event: AaplHistoricalValuationEvent;
  valuationRun: AaplHistoricalValuationRun | null;
};

type AaplHistoricalValuationResponse = {
  historicalValuations?: AaplHistoricalValuationItem[];
};

type AaplBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type AaplBacktestCurvePoint = {
  date: string;
  aaplBuyHold: number;
  spy: number;
  benchmark?: number;
  price?: number | null;
};

type AaplBacktestResult = {
  status?: string;
  startDate?: string;
  endDate?: string;
  priceBars?: Record<string, unknown>;
  metrics?: {
    aaplBuyHold?: AaplBacktestMetricSet;
    spy?: AaplBacktestMetricSet;
    benchmark?: AaplBacktestMetricSet;
  };
  curve?: AaplBacktestCurvePoint[];
  warnings?: string[];
};

type AaplCapitalReturnWarning = {
  id?: string;
  severity?: string;
  title?: string;
  detail?: string;
};

type AaplCapitalReturnRow = {
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
  isForecast?: boolean;
};

type AaplCapitalReturnHistory = {
  ticker: "AAPL";
  currency: "USD";
  unit: "USDm";
  years: number;
  rows: AaplCapitalReturnRow[];
  forwardExpectation: AaplCapitalReturnRow | null;
  summary: {
    latestFiscalYear?: number | null;
    latestDividendPerShare?: number | null;
    latestDividendPerShareCents?: number | null;
    latestDividendCashCost?: number | null;
    latestBuybackAmount?: number | null;
    latestTotalCapitalReturn?: number | null;
    latestEquityFreeCashFlow?: number | null;
    latestFcfCoverage?: number | null;
    cumulativeDividendCash?: number | null;
    cumulativeBuybacks?: number | null;
    cumulativeFcf?: number | null;
    cumulativeCapitalReturn?: number | null;
    forwardFiscalYear?: number | null;
    forwardDividendCashCost?: number | null;
    forwardBuybackAmount?: number | null;
    forwardTotalCapitalReturn?: number | null;
    forwardEquityFreeCashFlow?: number | null;
    forwardFcfCoverage?: number | null;
  };
  warnings?: AaplCapitalReturnWarning[];
};

type AaplBackendRow = Record<string, unknown>;

type AaplBackendSnapshotResponse = {
  reportingEvent?: AaplBackendRow | null;
  financialPeriods?: AaplBackendRow[];
  productFinancials?: AaplBackendRow[];
  geographicFinancials?: AaplBackendRow[];
  operatingMetricSnapshots?: AaplBackendRow[];
  marketSnapshot?: AaplBackendRow | null;
};

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_LSEG_API_BASE_URL ?? "http://127.0.0.1:8787";
}

async function fetchJsonWithFallback<T>(legacyPath: string, unifiedPath: string, init?: RequestInit) {
  const base = apiBaseUrl();
  const first = await fetch(`${base}${legacyPath}`, init);
  if (first.ok) return (await first.json()) as T;
  const second = await fetch(`${base}${unifiedPath}`, init);
  if (second.ok) return (await second.json()) as T;
  throw new Error(`AAPL backend returned ${first.status} and unified route returned ${second.status}`);
}

function usd(value: number) {
  return `$${value.toFixed(1)}`;
}

function usdm(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`;
}

function usdb(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${(value / 1_000).toFixed(1)}bn`;
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function multiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(1)}x`;
}

function usdPerShare(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${value.toFixed(2)}`;
}

function chartTickInterval(rowCount: number) {
  return Math.max(Math.ceil(rowCount / 10) - 1, 0);
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function grossMarginRatio({
  grossMargin,
  grossProfit,
  revenue,
  costOfRevenue,
}: {
  grossMargin?: number | null;
  grossProfit?: number | null;
  revenue?: number | null;
  costOfRevenue?: number | null;
}) {
  if (grossMargin != null && Number.isFinite(grossMargin)) {
    return grossMargin > 1.5 ? grossMargin / 100 : grossMargin;
  }
  if (grossProfit != null && revenue) return grossProfit / revenue;
  if (costOfRevenue != null && revenue) return (revenue - costOfRevenue) / revenue;
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function sourceStatusFromBackend(value: unknown): AaplSourceStatus {
  const candidate = String(value ?? "");
  if (
    candidate === "official_actual" ||
    candidate === "management_guidance" ||
    candidate === "forecast_assumption" ||
    candidate === "transcript_commentary" ||
    candidate === "research_only" ||
    candidate === "market_data"
  ) {
    return candidate;
  }
  return "research_only";
}

function fiscalQuarterNumber(event: AaplHistoricalValuationEvent | AaplFinancialPeriod) {
  const source = "fiscalQuarter" in event ? event.fiscalQuarter : undefined;
  if (typeof source === "number") return source;
  const fallback = "label" in event ? event.label : event.fiscalPeriod;
  const match = String(source ?? fallback ?? "").match(/Q([1-4])/i);
  return match ? Number(match[1]) : null;
}

function appleFiscalCalendarLabel(event: AaplHistoricalValuationEvent, compact = false) {
  const fiscalQuarter = fiscalQuarterNumber(event);
  const fiscalYear = event.fiscalYear ?? Number(String(event.fiscalPeriod ?? event.periodLabel ?? "").match(/FY20(\d{2})/i)?.[1]) + 2000;
  if (!fiscalQuarter || !Number.isFinite(fiscalYear)) {
    return event.periodLabel ?? event.fiscalPeriod ?? event.fiscalQuarter ?? event.eventDate;
  }
  const calendarYear = fiscalQuarter === 1 ? fiscalYear - 1 : fiscalYear;
  const calendarQuarter = fiscalQuarter === 1 ? 4 : fiscalQuarter - 1;
  const calendarLabel = compact ? `CY${String(calendarYear).slice(2)} Q${calendarQuarter}` : `CY${calendarYear} Q${calendarQuarter}`;
  const fiscalLabel = compact ? `FY${String(fiscalYear).slice(2)} Q${fiscalQuarter}` : `FY${fiscalYear} Q${fiscalQuarter}`;
  return `${calendarLabel} / ${fiscalLabel}`;
}

function periodShortLabel(period: AaplFinancialPeriod) {
  if (period.periodType === "annual") return `FY${String(period.fiscalYear).slice(2)}`;
  const quarter = fiscalQuarterNumber(period) ?? "";
  return `FY${String(period.fiscalYear).slice(2)} ${quarter ? `Q${quarter}` : ""}`.trim();
}

function buildPeriodLabel(row: AaplBackendRow) {
  const fiscalYear = asNumber(row.fiscalYear);
  const fiscalQuarter = asString(row.fiscalQuarter);
  const periodType = asString(row.periodType);
  if (periodType === "annual" && fiscalYear) return `FY${fiscalYear}`;
  if (fiscalYear && fiscalQuarter) return `FY${fiscalYear} ${fiscalQuarter}`;
  return asString(row.periodId) ?? asString(row.id) ?? "AAPL period";
}

function mapAaplSnapshotToDataset(snapshot: AaplBackendSnapshotResponse, fallback: AaplDataset): AaplDataset | null {
  const financialRows = snapshot.financialPeriods ?? [];
  if (!financialRows.length) return null;

  const periods = financialRows
    .map((row): AaplFinancialPeriod | null => {
      const periodId = asString(row.periodId) ?? asString(row.id);
      const fiscalYear = asNumber(row.fiscalYear);
      const revenue = asNumber(row.revenue);
      const operatingIncome = asNumber(row.operatingIncome);
      if (!periodId || !fiscalYear || revenue == null || operatingIncome == null) return null;
      const period: AaplFinancialPeriod = {
        id: periodId,
        label: buildPeriodLabel(row),
        fiscalYear,
        fiscalQuarter: asString(row.fiscalQuarter),
        periodType: (asString(row.periodType) === "annual" ? "annual" : "quarter") as AaplFinancialPeriod["periodType"],
        periodStartDate: asString(row.periodStartDate),
        periodEndDate: asString(row.periodEndDate),
        sourceStatus: sourceStatusFromBackend(row.sourceType),
        sourceId: asString(row.eventId) ?? asString(row.id) ?? periodId,
        asOfDate: asString(row.asOfDate),
        revenue,
        costOfRevenue: asNumber(row.costOfRevenue),
        grossProfit: asNumber(row.grossProfit),
        grossMargin: asNumber(row.grossMargin),
        operatingIncome,
        operatingMargin: asNumber(row.operatingMargin),
        netIncome: asNumber(row.netIncome),
        dilutedEps: asNumber(row.dilutedEps),
        dilutedShares: asNumber(row.dilutedShares),
        operatingCashFlow: asNumber(row.operatingCashFlow),
        capex: asNumber(row.capex),
        freeCashFlow: asNumber(row.freeCashFlow),
        dividendsPaid: asNumber(row.dividendsPaid),
        buybacks: asNumber(row.buybacks),
        cashAndMarketableSecurities: asNumber(row.cashAndMarketableSecurities),
        debt: asNumber(row.debt),
        netCashDebt: asNumber(row.netCashDebt),
        notes: asString((row.rawJson as AaplBackendRow | undefined)?.notes) ?? "Mapped from AAPL backend SQLite snapshot.",
      };
      return period;
    })
    .filter((row): row is AaplFinancialPeriod => row != null)
    .sort((left, right) => {
      const leftDate = left.periodEndDate ?? left.asOfDate ?? left.id;
      const rightDate = right.periodEndDate ?? right.asOfDate ?? right.id;
      return leftDate.localeCompare(rightDate);
    });

  if (!periods.length) return null;

  const latestPeriod = periods[periods.length - 1];
  const market = snapshot.marketSnapshot ?? {};
  const marketPrice = asNumber(market.currentPrice) ?? fallback.marketData.currentPrice;
  const shares = asNumber(market.sharesOutstanding) ?? latestPeriod.dilutedShares ?? fallback.marketData.sharesForMarketCap;

  return {
    latestReportingPeriod: latestPeriod.label,
    periods,
    productFinancials: (snapshot.productFinancials ?? []).map((row) => {
      const revenue = asNumber(row.revenue);
      const costOfRevenue = asNumber(row.costOfRevenue);
      const grossProfit = asNumber(row.grossProfit) ?? (revenue != null && costOfRevenue != null ? revenue - costOfRevenue : null);
      return {
        periodId: asString(row.periodId) ?? "",
        label: buildPeriodLabel(row),
        productCategory: asString(row.productCategory) ?? "Unknown",
        revenue,
        costOfRevenue,
        grossProfit,
        grossMargin: grossMarginRatio({
          grossMargin: asNumber(row.grossMargin),
          grossProfit,
          revenue,
          costOfRevenue,
        }),
        growth: asNumber(row.growth),
        asOfDate: asString(row.asOfDate),
        sourceStatus: sourceStatusFromBackend(row.sourceType),
        notes: asString(row.notes),
      };
    }).filter((row) => row.periodId && row.productCategory !== "Unknown"),
    geographicFinancials: (snapshot.geographicFinancials ?? []).map((row) => ({
      periodId: asString(row.periodId) ?? "",
      geography: asString(row.geography) ?? "Unknown",
      revenue: asNumber(row.revenue),
      growth: asNumber(row.growth),
      asOfDate: asString(row.asOfDate),
      sourceStatus: sourceStatusFromBackend(row.sourceType),
      notes: asString(row.notes),
    })).filter((row) => row.periodId && row.geography !== "Unknown"),
    operatingMetrics: (snapshot.operatingMetricSnapshots ?? []).map((row) => ({
      periodId: asString(row.periodId),
      asOfDate: asString(row.asOfDate) ?? latestPeriod.asOfDate ?? fallback.marketData.priceDate,
      sourceStatus: sourceStatusFromBackend(row.sourceType),
      installedBaseCommentary: asString(row.installedBaseCommentary),
      activeDevicesCommentary: asString(row.activeDevicesCommentary),
      paidSubscriptionsCommentary: asString(row.paidSubscriptionsCommentary),
      appStoreRegulationCommentary: asString(row.appStoreRegulationCommentary),
      chinaCommentary: asString(row.chinaCommentary),
      fxImpactCommentary: asString(row.fxImpactCommentary),
      iphoneCycleCommentary: asString(row.iphoneCycleCommentary),
      aiAppleIntelligenceCommentary: asString(row.aiAppleIntelligenceCommentary),
      visionProCommentary: asString(row.visionProCommentary),
      supplyChainCommentary: asString(row.supplyChainCommentary),
      capitalReturnCommentary: asString(row.capitalReturnCommentary),
      normalizedFcfCommentary: asString(row.normalizedFcfCommentary),
      notes: asString(row.notes),
    })),
    marketData: {
      currentPrice: marketPrice,
      priceDate: asString(market.priceDate) ?? asString(market.asOfDate) ?? latestPeriod.asOfDate ?? fallback.marketData.priceDate,
      sharesForMarketCap: shares,
      marketCap: asNumber(market.marketCap) ?? (marketPrice && shares ? marketPrice * shares : fallback.marketData.marketCap),
      source: asString(market.source) ?? "AAPL backend SQLite market snapshot",
      sourceStatus: "market_data",
    },
  };
}

function productRevenueRows(data: AaplDataset) {
  const periodById = new Map(data.periods.map((period) => [period.id, period]));
  const quarterIds = data.periods.filter((period) => period.periodType === "quarter").map((period) => period.id);
  return quarterIds.map((periodId) => {
    const period = periodById.get(periodId);
    const rows = data.productFinancials.filter((row) => row.periodId === periodId);
    const find = (name: string) => rows.find((row) => row.productCategory === name)?.revenue ?? null;
    return {
      period: period ? periodShortLabel(period) : periodId,
      iPhone: find("iPhone"),
      Mac: find("Mac"),
      iPad: find("iPad"),
      Wearables: find("Wearables, Home and Accessories"),
      Services: find("Services"),
    };
  });
}

function servicesRows(data: AaplDataset) {
  const periodById = new Map(data.periods.map((period) => [period.id, period]));
  return data.periods
    .filter((period) => period.periodType === "quarter")
    .map((period) => {
      const rows = data.productFinancials.filter((row) => row.periodId === period.id);
      const services = rows.find((row) => row.productCategory === "Services");
      const products = rows.find((row) => row.productCategory === "Products");
      return {
        period: periodShortLabel(periodById.get(period.id) ?? period),
        servicesRevenue: services?.revenue ?? null,
        servicesGm: grossMarginRatio(services ?? {}) != null ? grossMarginRatio(services ?? {})! * 100 : null,
        productsGm: grossMarginRatio(products ?? {}) != null ? grossMarginRatio(products ?? {})! * 100 : null,
      };
    });
}

function geographyRows(data: AaplDataset) {
  return data.periods
    .filter((period) => period.periodType === "quarter")
    .map((period) => {
      const rows = data.geographicFinancials.filter((row) => row.periodId === period.id);
      const find = (name: string) => rows.find((row) => row.geography === name)?.revenue ?? null;
      return {
        period: periodShortLabel(period),
        Americas: find("Americas"),
        Europe: find("Europe"),
        China: find("Greater China"),
        Japan: find("Japan"),
        RestAsiaPacific: find("Rest of Asia Pacific"),
      };
    });
}

function marginAndCashRows(data: AaplDataset) {
  return data.periods
    .filter((period) => period.periodType === "quarter")
    .map((period) => ({
      period: periodShortLabel(period),
      operatingMargin: (period.operatingMargin ?? (period.revenue ? period.operatingIncome / period.revenue : null)) != null
        ? (period.operatingMargin ?? period.operatingIncome / period.revenue) * 100
        : null,
      fcfConversion: period.netIncome && period.freeCashFlow != null ? (period.freeCashFlow / period.netIncome) * 100 : null,
      buybacks: period.buybacks ?? null,
      dilutedShares: period.dilutedShares ?? null,
    }));
}

export function AaplDashboard({ module, scenario, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const [backendDataset, setBackendDataset] = useState<AaplDataset | null>(null);
  const [backendDatasetStatus, setBackendDatasetStatus] = useState<"loading" | "online" | "offline">("loading");
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "AAPL",
    defaultAssumptions: defaultAaplValuationAssumptions as unknown as Record<string, number>,
    storageKey: "valuation-assumptions-AAPL",
    onDataSourceChange,
  });

  const fallbackData = useMemo(() => resolveAaplDataset(module.data), [module.data]);
  useEffect(() => {
    const controller = new AbortController();
    async function loadBackendResearchDataset() {
      setBackendDatasetStatus("loading");
      try {
        const snapshot = await fetchJsonWithFallback<AaplBackendSnapshotResponse>(
          "/api/aapl/snapshot",
          "/api/stocks/aapl/snapshot",
          { signal: controller.signal },
        );
        const mapped = mapAaplSnapshotToDataset(snapshot, fallbackData);
        if (!mapped) throw new Error("AAPL backend snapshot did not include financial periods");
        setBackendDataset(mapped);
        setBackendDatasetStatus("online");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setBackendDataset(null);
        setBackendDatasetStatus("offline");
      }
    }
    loadBackendResearchDataset();
    return () => controller.abort();
  }, [fallbackData]);

  const moduleData = backendDataset ?? fallbackData;
  const dashboard = useMemo(
    () => buildAaplDashboardData(moduleData, scenario, valuationAssumptions as Partial<AaplValuationAssumptions>),
    [moduleData, scenario, valuationAssumptions],
  );
  const summary = useMemo(() => module.calculateSummary(moduleData), [module, moduleData]);
  const valuation = dashboard.valuation;
  const selectedFairValue = valuation.recommendedFairValue ?? valuation.fairValues[0]?.fairValue ?? 0;
  const productRows = useMemo(() => productRevenueRows(moduleData), [moduleData]);
  const serviceTrendRows = useMemo(() => servicesRows(moduleData), [moduleData]);
  const geoTrendRows = useMemo(() => geographyRows(moduleData), [moduleData]);
  const cashRows = useMemo(() => marginAndCashRows(moduleData), [moduleData]);

  const latestOperatingMetric = dashboard.dataset.operatingMetrics[dashboard.dataset.operatingMetrics.length - 1];
  const latestPeriod = dashboard.period;
  const netCash = latestPeriod.netCashDebt ?? (latestPeriod.cashAndMarketableSecurities ?? 0) - (latestPeriod.debt ?? 0);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Apple Ecosystem Research Cockpit"
        description="AAPL is framed around mature iPhone replacement demand, Services monetization, China risk, AI optionality, capital return, and normalized FCF."
        badge={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-600">{backendDatasetStatus === "online" ? "Backend history" : backendDatasetStatus === "loading" ? "Loading backend" : dataSourceType === "manual" ? "Manual scenario" : "Static fallback"}</span>}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Recommended Fair Value" value={usd(selectedFairValue)} note={`${pct(valuation.upsideDownside)} vs price anchor`} />
          <ScoreBlock label="Services Mix" value={pct(summary.find((item) => item.key === "servicesMix")?.value)} note="Installed-base monetization proxy" />
          <ScoreBlock label="Greater China Mix" value={pct(summary.find((item) => item.key === "chinaMix")?.value)} note="Cyclical and structural risk lens" />
          <ScoreBlock label="FCF Margin" value={pct(summary.find((item) => item.key === "fcfMargin")?.value)} note="Normalized cash conversion anchor" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <InsightPanel icon={<Smartphone className="h-5 w-5" />} title="iPhone Cycle" text="The key debate is whether replacement cycles and Apple Intelligence can change unit and ASP trajectory enough to offset mature smartphone demand." />
          <InsightPanel icon={<Store className="h-5 w-5" />} title="Services Durability" text="Services mix supports margin and multiple, but App Store take-rate, DMA pressure, and search arrangement risk need explicit valuation haircuts." />
          <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="China Risk" text="Greater China is shown as its own underwriting variable rather than hidden inside consolidated growth." />
          <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Risk Red Team" text="The bear case tests weak iPhone demand, Services regulation, China deterioration, low growth multiple compression, and buybacks done at rich prices." />
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
          <SectionCard title="Core Investment Questions" description="The dashboard keeps official actuals, research-only commentary, and forecast assumptions separated so the debate stays falsifiable.">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <InsightPanel icon={<Smartphone className="h-5 w-5" />} title="iPhone Cycle and Replacement Demand" text="Mature units can still compound value if premium ASP, replacement cadence, and AI-enabled upgrades support low-single-digit product growth." />
              <InsightPanel icon={<Store className="h-5 w-5" />} title="Services Mix and Gross Margin" text="The Services question is whether higher-margin monetization can keep mixing up while regulatory risk caps take-rate economics." />
              <InsightPanel icon={<LockKeyhole className="h-5 w-5" />} title="Installed Base Monetization" text={latestOperatingMetric?.installedBaseCommentary ?? "The installed base is the moat: retention, device density, payments, subscriptions, and default distribution all matter."} />
              <InsightPanel icon={<Bot className="h-5 w-5" />} title="AI Upgrade Cycle / Apple Intelligence" text={latestOperatingMetric?.aiAppleIntelligenceCommentary ?? "AI optionality is explicit and scenario-driven, not back-cast into pre-2024 historical valuations."} />
              <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="China / Geographic Risk" text={latestOperatingMetric?.chinaCommentary ?? "China risk is separated because demand, policy, and local competition can move independently from global iPhone replacement."} />
              <InsightPanel icon={<CircleDollarSign className="h-5 w-5" />} title="Capital Return and Share Count" text={latestOperatingMetric?.capitalReturnCommentary ?? "Buybacks matter through share-count decline and owner yield, but only create value when FCF durability and repurchase price cooperate."} />
              <InsightPanel icon={<AlertTriangle className="h-5 w-5" />} title="Regulatory / App Store Risk" text={latestOperatingMetric?.appStoreRegulationCommentary ?? "Services regulation, App Store take-rate pressure, and search/TAC uncertainty are modeled as explicit haircuts."} />
              <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Risk Red Team" text="The kill case is not one bad quarter; it is iPhone maturity plus Services pressure plus China erosion compressing the premium multiple." />
            </div>
          </SectionCard>

          <SectionCard title="Latest Economics" description="Static fallback remains available offline. The backend historical section below replaces this with event-by-event SQLite snapshots when the API is online.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Revenue" value={usdb(latestPeriod.periodType === "quarter" ? latestPeriod.revenue * 4 : latestPeriod.revenue)} note={`${latestPeriod.label} annualized where quarterly`} />
              <ScoreBlock label="Operating Margin" value={pct(latestPeriod.operatingMargin ?? latestPeriod.operatingIncome / latestPeriod.revenue)} note="Products, Services, and opex mix" />
              <ScoreBlock label="Net Cash / Debt" value={usdb(netCash)} note="Cash and marketable securities less debt" />
              <ScoreBlock label="Method Dispersion" value={pct(valuation.methodDispersion)} note="Spread among DCF, FCF yield, P/E, EV/EBIT, SOTP" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="products" className="mt-6 space-y-6">
          <SectionCard title="Product Revenue by Quarter" description="iPhone remains the underwriting fulcrum, with Mac, iPad, Wearables and Services shown separately where data is available. USDm.">
            <ChartPanel title="Product Revenue Mix">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={productRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" interval={chartTickInterval(productRows.length)} tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => usdm(value)} />
                  <Legend />
                  <Bar dataKey="iPhone" stackId="product" fill="#2563eb" name="iPhone" />
                  <Bar dataKey="Mac" stackId="product" fill="#0f766e" name="Mac" />
                  <Bar dataKey="iPad" stackId="product" fill="#a16207" name="iPad" />
                  <Bar dataKey="Wearables" stackId="product" fill="#7c3aed" name="Wearables / Home / Accessories" />
                  <Bar dataKey="Services" stackId="product" fill="#334155" name="Services" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <DataTable
              headers={["Product", "Revenue", "Gross Margin", "Source Layer", "Notes"]}
              rows={dashboard.productRows.map((row) => [
                row.productCategory,
                usdm(row.revenue),
                pct(row.grossMargin),
                row.sourceStatus,
                row.notes ?? "",
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="services" className="mt-6 space-y-6">
          <SectionCard title="Services Mix and Gross Margin" description="Services is the high-multiple engine, but the dashboard makes margin and regulation visible instead of assuming indefinite take-rate resilience.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Services Revenue and Gross Margin">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={serviceTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" interval={chartTickInterval(serviceTrendRows.length)} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="revenue" />
                    <YAxis yAxisId="margin" orientation="right" domain={[0, 100]} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number, name: string) => name.includes("GM") ? `${value.toFixed(1)}%` : usdm(value)} />
                    <Legend />
                    <Line yAxisId="revenue" type="monotone" dataKey="servicesRevenue" stroke="#2563eb" strokeWidth={3} name="Services revenue" />
                    <Line yAxisId="margin" type="monotone" dataKey="servicesGm" stroke="#0f766e" strokeWidth={3} name="Services GM %" connectNulls />
                    <Line yAxisId="margin" type="monotone" dataKey="productsGm" stroke="#a16207" strokeWidth={3} name="Products GM %" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <BulletPanel title="Services Debate" items={[
                "Bull: installed base, subscriptions, payments, advertising, and device attach keep Services compounding at premium margins.",
                "Base: Services mixes up and supports gross margin, but regulation creates a visible valuation haircut.",
                "Bear: App Store take-rate pressure and search distribution risk reduce the premium multiple investors assign to Services.",
              ]} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="geography" className="mt-6 space-y-6">
          <SectionCard title="Geographic Revenue and China Risk" description="Greater China is isolated because its cyclical demand, policy exposure, and local competition can change the Apple premium multiple. USDm.">
            <ChartPanel title="Geographic Revenue Trend">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={geoTrendRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" interval={chartTickInterval(geoTrendRows.length)} tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => usdm(value)} />
                  <Legend />
                  <Bar dataKey="Americas" stackId="geo" fill="#2563eb" name="Americas" />
                  <Bar dataKey="Europe" stackId="geo" fill="#0f766e" name="Europe" />
                  <Bar dataKey="China" stackId="geo" fill="#dc2626" name="Greater China" />
                  <Bar dataKey="Japan" stackId="geo" fill="#a16207" name="Japan" />
                  <Bar dataKey="RestAsiaPacific" stackId="geo" fill="#64748b" name="Rest of Asia Pacific" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <DataTable
              headers={["Geography", "Revenue", "Growth", "Source Layer", "Notes"]}
              rows={dashboard.geoRows.map((row) => [
                row.geography,
                usdm(row.revenue),
                pct(row.growth),
                row.sourceStatus,
                row.notes ?? "",
              ])}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-return" className="mt-6 space-y-6">
          <AaplCapitalReturnsBackendPanel />
          <SectionCard title="Capital Return and Share Count" description="Buybacks and dividends are part of the thesis, but the model treats them as a claim on normalized FCF rather than free upside.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Buybacks and Diluted Shares">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cashRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" interval={chartTickInterval(cashRows.length)} tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="buybacks" stroke="#2563eb" strokeWidth={3} name="Buybacks $m" />
                    <Line type="monotone" dataKey="dilutedShares" stroke="#0f766e" strokeWidth={3} name="Diluted shares m" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Operating Margin and FCF Conversion">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cashRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" interval={chartTickInterval(cashRows.length)} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="operatingMargin" stroke="#7c3aed" strokeWidth={3} name="Operating margin" />
                    <Line type="monotone" dataKey="fcfConversion" stroke="#334155" strokeWidth={3} name="FCF / net income" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Cash and Securities" value={usdb(latestPeriod.cashAndMarketableSecurities)} note="Latest period fallback or backend snapshot" />
              <ScoreBlock label="Debt" value={usdb(latestPeriod.debt)} note="Gross debt" />
              <ScoreBlock label="Net Cash / Debt Bridge" value={usdb(netCash)} note="Positive means net cash" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <AaplHistoricalValuationPanel />
          <AaplBacktestPanel />
          <AaplValuationTriangulationPanel valuation={valuation} />
          <SectionCard title="AAPL Valuation Assumptions" description="Interactive controls are last by design: first inspect saved backend runs and AAPL vs SPY history, then tune the current driver-based model.">
            <InteractiveValuationDashboard
              ticker="AAPL"
              config={aaplValuationConfig}
              data={moduleData}
              scenario={scenario}
              currency="USD"
              values={valuationAssumptions}
              onValuesChange={handleValuationValuesChange}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="The risk module turns AAPL's premium multiple into disconfirmable underwriting tests.">
            <div className="grid gap-4 lg:grid-cols-2">
              <BulletPanel title="Bear-Case Chain" items={[
                "iPhone replacement cycles stay elongated and AI features are mostly defensive rather than demand creating.",
                "Services revenue keeps growing but gross margin and terminal multiple compress under App Store and search-arrangement pressure.",
                "Greater China deterioration proves structural rather than cyclical, pressuring mix, inventory, and brand scarcity.",
                "Buybacks continue, but repurchases at a premium multiple dilute future owner return rather than adding meaningful value.",
              ]} />
              <BulletPanel title="Falsifiers and Monitoring Triggers" items={[
                "iPhone revenue and ASP inflect after Apple Intelligence-capable hardware penetration rises.",
                "Services gross margin holds despite regulatory changes and search/TAC uncertainty.",
                "Greater China stabilizes without offsetting promotional intensity or channel inventory stress.",
                "Normalized FCF margin and share-count decline remain durable enough to justify a premium multiple despite low growth.",
              ]} />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function AaplHistoricalValuationPanel() {
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AaplHistoricalValuationItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const [windowStart, setWindowStart] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setStatus("loading");
      setError(null);
      try {
        const payload = await fetchJsonWithFallback<AaplHistoricalValuationResponse>(
          "/api/aapl/historical-valuations?scenario=Base&modelVersion=aapl_v1_backend_pilot",
          "/api/stocks/aapl/historical-valuations?scenario=Base&modelVersion=aapl_v1_backend_pilot",
          { signal: controller.signal },
        );
        const sorted = [...(payload.historicalValuations ?? [])].sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setRows(sorted);
        setSelectedEventId((current) => current ?? [...sorted].reverse().find((row) => row.valuationRun)?.event.id ?? sorted[sorted.length - 1]?.event.id ?? null);
        setVisibleCount((current) => Math.min(Math.max(current, 8), Math.max(sorted.length, 8)));
        setWindowStart(Math.max(0, sorted.length - 16));
        setStatus("online");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRows([]);
        setStatus("offline");
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    loadHistoricalValuations();
    return () => controller.abort();
  }, []);

  const displayRows = rows.filter((row) => row.valuationRun || row.event.eventType.includes("results"));
  const maxStart = Math.max(0, displayRows.length - visibleCount);
  const effectiveWindowStart = Math.min(windowStart, maxStart);
  const visibleRows = displayRows.slice(effectiveWindowStart, effectiveWindowStart + visibleCount);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: appleFiscalCalendarLabel(row.event, true),
      fiscalPeriod: row.event.periodLabel ?? row.event.fiscalPeriod ?? row.event.fiscalQuarter ?? row.event.eventDate,
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

  function updateVisibleCount(count: number) {
    const next = Math.min(count, Math.max(displayRows.length, 1));
    setVisibleCount(next);
    setWindowStart(Math.max(0, displayRows.length - next));
  }

  return (
    <SectionCard
      title="AAPL Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by Apple reporting event. Apple fiscal quarters are labeled beside the approximate calendar quarter they cover."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length || "n/a"} note="Eight-year quarterly reporting history" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs as-of price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static AAPL dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Oldest to newest from left to right. Use the range control to move the window through Apple fiscal quarters.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 16, 24, displayRows.length].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => updateVisibleCount(count)}
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
              min={0}
              max={maxStart}
              value={effectiveWindowStart}
              onChange={(event) => setWindowStart(Number(event.target.value))}
              aria-label="Move historical valuation window"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? appleFiscalCalendarLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? appleFiscalCalendarLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={pct(latestVisibleGap)} note="Fair value minus price, as percent of price" />
              <ScoreBlock label="Average Gap" value={pct(averageVisibleGap)} note="Average model discount / premium in visible window" />
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
                  className={`min-w-[178px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
                  <span className="mt-1 block font-semibold">{appleFiscalCalendarLabel(row.event)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event.periodLabel ?? row.event.fiscalPeriod ?? row.event.fiscalQuarter ?? row.event.eventType}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.title ?? "Selected AAPL reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior adjusted close" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Shareholder CAGR" />
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
                        const first = Array.isArray(payload) ? payload[0]?.payload as { eventDate?: string; fiscalPeriod?: string; gapPct?: number } | undefined : undefined;
                        return `${label}${first?.eventDate ? ` | ${first.eventDate}` : ""}${first?.fiscalPeriod ? ` | ${first.fiscalPeriod}` : ""}${typeof first?.gapPct === "number" ? ` | Gap ${pct(first.gapPct)}` : ""}`;
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
        <p className="mt-5 text-sm text-slate-600">Loading AAPL historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}

function AaplCapitalReturnsBackendPanel() {
  const [history, setHistory] = useState<AaplCapitalReturnHistory | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCapitalReturns() {
      setStatus("loading");
      setMessage(null);
      try {
        const payload = await fetchJsonWithFallback<AaplCapitalReturnHistory>(
          "/api/aapl/capital-returns?years=8",
          "/api/stocks/aapl/capital-returns?years=8",
          { signal: controller.signal },
        );
        setHistory(payload);
        setStatus("online");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
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
      equityFreeCashFlow: row.equityFreeCashFlow ?? 0,
      dividendCashForecast: null as number | null,
      buybackForecast: null as number | null,
      equityFreeCashFlowForecast: null as number | null,
      dps: row.dividendPerShare,
      totalCapitalReturn: row.totalCapitalReturn ?? 0,
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
          dps: forward.dividendPerShare,
          totalCapitalReturn: forward.totalCapitalReturn ?? 0,
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
      description="Eight-year AAPL capital-return history from backend SEC financial-period data. Dividends and buybacks are stacked as one capital-return bar and compared with annual FCF; balance-sheet cash is kept out of FCF coverage."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Latest DPS" value={usdPerShare(latest?.dividendPerShare)} note={latest ? `FY${latest.fiscalYear} split-adjusted where needed` : "Backend row pending"} />
        <ScoreBlock label="Latest FCF" value={usdm(latest?.equityFreeCashFlow)} note="Equity FCF, USDm" />
        <ScoreBlock label="Latest Buyback" value={usdm(latest?.buybackAmount)} note="Gross share repurchases" />
        <ScoreBlock label="Forward Capital Return" value={usdm(forward?.totalCapitalReturn)} note={forward ? `FY${forward.fiscalYear}E forecast bar` : "Forecast pending"} />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Capital-return data service is temporarily unavailable.
        </div>
      ) : null}

      {status === "online" && warningText ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {warningText}
        </div>
      ) : null}

      {chartRows.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
          <ChartPanel title="Capital Return Stack vs FCF">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartRows}>
                <defs>
                  <pattern id="aaplDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#ecfdf5" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#0f766e" strokeWidth="2" />
                  </pattern>
                  <pattern id="aaplBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#eff6ff" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="2" />
                  </pattern>
                  <pattern id="aaplFcfForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#fff7ed" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#f97316" strokeWidth="2" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value: number) => `$${Number(value).toFixed(0)}m`} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const labelByKey: Record<string, string> = {
                      dividendCashCost: "Dividends",
                      buybackAmount: "Buybacks",
                      equityFreeCashFlow: "FCF",
                      dividendCashForecast: "Forecast dividends",
                      buybackForecast: "Forecast buybacks",
                      equityFreeCashFlowForecast: "Forecast FCF",
                    };
                    return [usdm(value), labelByKey[name] ?? name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as { dps?: number | null; fcfCoverage?: number | null; totalCapitalReturn?: number | null; isForecast?: boolean } | undefined;
                    return `${label}${row?.isForecast ? " | forecast assumption" : ""}${row?.dps != null ? ` | DPS ${usdPerShare(row.dps)}` : ""}${row?.totalCapitalReturn != null ? ` | Capital return ${usdm(row.totalCapitalReturn)}` : ""}${row?.fcfCoverage != null ? ` | FCF coverage ${multiple(row.fcfCoverage)}` : ""}`;
                  }}
                />
                <Legend />
                <Bar dataKey="dividendCashCost" stackId="capitalReturn" fill="#0f766e" name="Dividends" />
                <Bar dataKey="buybackAmount" stackId="capitalReturn" fill="#2563eb" name="Buybacks" />
                <Bar dataKey="equityFreeCashFlow" fill="#f97316" name="FCF" />
                <Bar dataKey="dividendCashForecast" stackId="forecastCapitalReturn" fill="url(#aaplDividendForecastHatch)" stroke="#0f766e" strokeDasharray="4 3" name="FY2026E dividends" />
                <Bar dataKey="buybackForecast" stackId="forecastCapitalReturn" fill="url(#aaplBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name="FY2026E buybacks" />
                <Bar dataKey="equityFreeCashFlowForecast" fill="url(#aaplFcfForecastHatch)" stroke="#f97316" strokeDasharray="4 3" name="FY2026E FCF" />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Backend Source Notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Dividend cash cost is calculated in the API from DPS and diluted shares. Buybacks are gross repurchases, not net share-count reduction after SBC. FCF coverage is annual equity FCF divided by dividends plus buybacks, with net cash kept separate. The FY2026E row is a hatched forecast-assumption bar and is excluded from 8Y cumulative totals.
            </p>
            <div className="mt-4 grid gap-3">
              <ScoreBlock label="Capital Return, 8Y" value={usdm(history?.summary.cumulativeCapitalReturn)} note="Dividends plus buybacks" />
              <ScoreBlock label="FCF, 8Y" value={usdm(history?.summary.cumulativeFcf)} note="Backend annual FCF series" />
              <ScoreBlock label="Forward Buyback" value={usdm(forward?.buybackAmount)} note="Forecast assumption" />
              <ScoreBlock label="Latest FCF Coverage" value={multiple(latest?.fcfCoverage)} note="FCF / dividends + buybacks" />
            </div>
          </div>

          <div className="xl:col-span-2">
            <DataTable
              headers={["Fiscal Year", "DPS", "Dividends", "Buybacks", "Capital Return", "FCF", "FCF Coverage", "Source"]}
              rows={[...rows, ...(forward ? [forward] : [])].map((row) => [
                `FY${row.fiscalYear}${row.isForecast ? "E" : ""}`,
                usdPerShare(row.dividendPerShare),
                usdm(row.dividendCashCost),
                usdm(row.buybackAmount),
                usdm(row.totalCapitalReturn),
                usdm(row.equityFreeCashFlow),
                multiple(row.fcfCoverage),
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

function AaplBacktestPanel() {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<AaplBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const payload = await fetchJsonWithFallback<AaplBacktestResult>(
        "/api/aapl/backtests",
        "/api/stocks/aapl/backtests",
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
      date: row.date,
      aaplReturn: (row.aaplBuyHold - 1) * 100,
      spyReturn: (row.spy - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="AAPL vs SPY Backtest"
      description="Simple AAPL buy-and-hold versus SPY over the selected interval. This panel intentionally excludes valuation-signal strategy logic."
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
          <ChartPanel title="AAPL vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="aaplReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="AAPL" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="AAPL CAGR" value={pct(metrics.aaplBuyHold?.cagr)} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={pct(metrics.spy?.cagr)} note="Benchmark" />
              <ScoreBlock label="AAPL MDD" value={pct(metrics.aaplBuyHold?.maxDrawdown)} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={pct(metrics.spy?.maxDrawdown)} note="Maximum drawdown" />
              <ScoreBlock label="AAPL Sharpe" value={metrics.aaplBuyHold?.sharpe != null ? metrics.aaplBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="AAPL Vol" value={pct(metrics.aaplBuyHold?.volatility)} note="Annualized daily vol" />
              <ScoreBlock label="SPY Vol" value={pct(metrics.spy?.volatility)} note="Annualized daily vol" />
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

function AaplValuationTriangulationPanel({ valuation }: { valuation: ReturnType<typeof buildAaplDashboardData>["valuation"] }) {
  const methodRows = valuation.methodCards.map((card) => ({
    method: card.label,
    value: card.value,
  }));

  return (
    <SectionCard title="AAPL Valuation Triangulation" description="DCF / FCFF, FCF yield, P/E, EV/EBIT, and SOTP are blended around iPhone maturity, Services margin, China risk, AI optionality, and capital return.">
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <ChartPanel title="Valuation Method Bridge">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={methodRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={76} />
              <YAxis />
              <Tooltip formatter={(value: number) => usd(value)} />
              <Bar dataKey="value" fill="#2563eb" name="Fair value / share" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <div className="grid gap-3 sm:grid-cols-2">
          <ScoreBlock label="DCF / FCFF" value={usd(valuation.dcfValue ?? 0)} note="Explicit FCF and terminal value" />
          <ScoreBlock label="FCF Yield" value={usd(valuation.fcfFairValue ?? 0)} note="Normalized FCF capitalized" />
          <ScoreBlock label="P/E" value={usd(valuation.peFairValue ?? 0)} note="Normalized EPS multiple" />
          <ScoreBlock label="SOTP" value={usd(valuation.sotpFairValue ?? 0)} note="Products, Services, net cash, AI option" />
          <ScoreBlock label="3Y Target" value={usd(valuation.targetPrice3Y ?? 0)} note="Growth and buyback bridge" />
          <ScoreBlock label="3Y CAGR" value={pct(valuation.expectedReturn3Y)} note="Target plus dividends" />
        </div>
      </div>
      <DataTable
        headers={["Driver", "Value", "Interpretation"]}
        rows={valuation.expectedReturnBridge.map((item) => [
          item.label,
          item.format === "percent" ? pct(item.value) : item.format === "multiple" ? multiple(item.value) : item.format === "currency" ? usd(item.value) : item.value.toFixed(2),
          item.description ?? "Explicit AAPL scenario driver.",
        ])}
      />
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
