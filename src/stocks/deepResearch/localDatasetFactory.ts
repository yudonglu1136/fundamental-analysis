import type { PeriodOption, Scenario, SummaryMetric } from "../types";
import type {
  DeepResearchDataset,
  DeepResearchHistoricalValuation,
  DeepResearchKpiSeries,
  DeepResearchQuestion,
  DeepResearchQuarterlyQuestion,
  DeepResearchRiskItem,
  DeepResearchSection,
  DeepResearchSourceStatus,
  DeepResearchValuationAssumptions,
} from "./model";

type LocalHistoricalRowInput = {
  eventDate: string;
  fiscalPeriod: string;
  asOfPrice: number;
  fairValue: number;
  method: string;
  sourceStatus?: DeepResearchSourceStatus;
  warnings?: string[];
  methodLabel?: string;
  methodDescription?: string;
};

export type LocalDeepResearchDatasetInput = {
  ticker: string;
  companyName: string;
  sector: string;
  archetype: string;
  description: string;
  updatedAt: string;
  currentPrice: number;
  priceDate: string;
  marketDataSource?: string;
  tabs: Array<{ value: string; label: string }>;
  periods: PeriodOption[];
  summaryMetrics: SummaryMetric[];
  researchQuestions: DeepResearchQuestion[];
  kpiSeries: DeepResearchKpiSeries[];
  deepDiveSections: DeepResearchSection[];
  quarterlyQuestions: DeepResearchQuarterlyQuestion[];
  historicalValuations: LocalHistoricalRowInput[];
  valuationBase: Omit<DeepResearchValuationAssumptions, "currentPrice">;
  scenarioOverrides: Record<Scenario, Partial<DeepResearchValuationAssumptions>>;
  valuationDescription: string;
  risks: DeepResearchRiskItem[];
  monitoring: string[];
  sourceGaps: string[];
  backendDetail?: string;
  backendNextSteps?: string[];
};

const BACKEND_SUPPORTED_TICKERS = new Set(["AVAV", "KTOS", "JPM", "BAC", "CB", "TRV", "EQT", "QCOM"]);

function buildHistoricalValuations(ticker: string, rows: LocalHistoricalRowInput[]): DeepResearchHistoricalValuation[] {
  return rows.map((row, index) => {
    const targetPrice3Y = row.fairValue * 1.12;
    const expectedShareholderCagr = Math.pow(Math.max(0.01, targetPrice3Y) / Math.max(0.01, row.asOfPrice), 1 / 3) - 1;
    return {
      id: `${ticker.toLowerCase()}-${row.fiscalPeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
      eventDate: row.eventDate,
      fiscalPeriod: row.fiscalPeriod,
      asOfPrice: row.asOfPrice,
      fairValue: row.fairValue,
      targetPrice3Y,
      expectedShareholderCagr,
      method: row.method,
      sourceStatus: row.sourceStatus ?? "research_only",
      warnings: row.warnings ?? ["Local fallback row; replace with backend daily price and valuation run."],
      methodOutputs: [
        {
          label: row.methodLabel ?? "Local fair value",
          value: row.fairValue,
          format: "currency",
          description: row.methodDescription ?? row.method,
        },
      ],
    };
  });
}

export function createLocalDeepResearchDataset(input: LocalDeepResearchDatasetInput): DeepResearchDataset {
  const backendSupported = BACKEND_SUPPORTED_TICKERS.has(input.ticker.toUpperCase());
  const defaultAssumptions: DeepResearchValuationAssumptions = {
    currentPrice: input.currentPrice,
    ...input.valuationBase,
  };
  const scenarios = (["Bear", "Base", "Bull"] as Scenario[]).reduce(
    (acc, scenario) => ({
      ...acc,
      [scenario]: {
        ...defaultAssumptions,
        ...(input.scenarioOverrides[scenario] ?? {}),
      },
    }),
    {} as Record<Scenario, DeepResearchValuationAssumptions>,
  );

  return {
    ticker: input.ticker,
    companyName: input.companyName,
    sector: input.sector,
    archetype: input.archetype,
    currency: "USD",
    description: input.description,
    updatedAt: input.updatedAt,
    marketData: {
      currentPrice: input.currentPrice,
      priceDate: input.priceDate,
      source:
        input.marketDataSource ??
        `Manual local market proxy dated ${input.priceDate}; replace with backend market-data feed before investment use.`,
      sourceStatus: "market_data_proxy",
    },
    tabs: input.tabs,
    periods: input.periods,
    summaryMetrics: input.summaryMetrics,
    researchQuestions: input.researchQuestions,
    kpiSeries: input.kpiSeries,
    deepDiveSections: input.deepDiveSections,
    quarterlyQuestions: input.quarterlyQuestions,
    historicalValuations: buildHistoricalValuations(input.ticker, input.historicalValuations),
    valuation: {
      defaultAssumptions,
      scenarios,
      modelDescription: input.valuationDescription,
      noFutureLeakageNote:
        "Historical rows are local event-specific fallback snapshots; they do not use current price, current margin, current multiple, or current thesis framing in older periods.",
    },
    risks: input.risks,
    monitoring: input.monitoring,
    sourceGaps: [
      ...input.sourceGaps,
      ...(backendSupported
        ? ["Official filing/transcript ingestion is still pending; backend rows are rich research proxies with imported market prices when available."]
        : ["Backend SQLite, daily price bars, SPY backtest and persisted valuation_runs are not implemented for this ticker yet."]),
    ],
    backendStatus: {
      supported: backendSupported,
      detail:
        input.backendDetail ??
        (backendSupported
          ? `${input.ticker} is wired to the unified backend for SQLite research events, persisted valuation runs and stock-vs-SPY backtests. Official filing/transcript imports remain a source gap.`
          : `${input.ticker} has frontend research history and local valuation fallback only. Backend SQLite and AWS data refresh are deferred.`),
      nextSteps:
        input.backendNextSteps ??
        (backendSupported
          ? [
              `Run npm run deep-research:backend:seed -- --ticker ${input.ticker.toLowerCase()}.`,
              `Run npm run deep-research:backend:import-prices -- --ticker ${input.ticker.toLowerCase()}.`,
              `Run npm run deep-research:backend:backfill-valuations -- --ticker ${input.ticker.toLowerCase()}.`,
              "Replace research proxies with official filings/transcripts as the next data-quality step.",
            ]
          : [
              `Create data/local/${input.ticker.toLowerCase()}/backend/${input.ticker.toLowerCase()}_research.sqlite.`,
              `Import ${input.ticker}/SPY daily prices.`,
              "Persist valuation runs by reporting event.",
              "Add ticker capabilities to backend_manifest.mjs.",
            ]),
    },
    qualityBadges: [
      { label: "Market price", value: "Manual proxy snapshot", badge: "Placeholder" },
      { label: "Operating KPIs", value: "Manual research model", badge: "Assumption" },
      { label: "Historical valuation", value: backendSupported ? "Backend persisted run" : "Local fallback", badge: backendSupported ? "Derived" : "Placeholder" },
    ],
  };
}
