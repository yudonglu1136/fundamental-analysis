export type ExampleSourceStatus = "official_actual" | "market_data" | "forecast_assumption" | "derived" | "research_only" | "placeholder";

export type ExampleFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: "annual" | "quarter" | "forecast";
  asOfDate: string;
  sourceStatus: ExampleSourceStatus;
  revenue: number | null;
  operatingIncome: number | null;
  freeCashFlow: number | null;
  notes: string;
};

export type ExampleHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod: string;
  asOfPrice: number | null;
  fairValue: number | null;
  targetPrice3Y: number | null;
  expectedShareholderCagr: number | null;
  method: string;
  sourceStatus: ExampleSourceStatus;
  warnings: string[];
};

export type ExampleResearchQuestion = {
  question: string;
  dashboardSection: string;
  modelDriver: string;
  evidenceNeeded: string;
};

export const exampleData = {
  periods: [
    { value: "FY25", label: "FY25" },
    { value: "FY26", label: "FY26E" },
  ],
  marketData: {
    currentPrice: 100,
    priceDate: "YYYY-MM-DD",
    sourceStatus: "placeholder" as ExampleSourceStatus,
    source: "Replace with official quote source or mark as Placeholder.",
  },
  financialPeriods: [
    {
      id: "fy2025",
      label: "FY 2025",
      fiscalYear: 2025,
      periodType: "annual",
      asOfDate: "YYYY-MM-DD",
      sourceStatus: "placeholder" as ExampleSourceStatus,
      revenue: null,
      operatingIncome: null,
      freeCashFlow: null,
      notes: "Replace with sourced actuals. Do not invent missing data.",
    },
  ] satisfies ExampleFinancialPeriod[],
  historicalValuations: [
    {
      id: "example-fy2025",
      eventDate: "YYYY-MM-DD",
      fiscalPeriod: "FY 2025",
      asOfPrice: null,
      fairValue: null,
      targetPrice3Y: null,
      expectedShareholderCagr: null,
      method: "Replace with event-specific valuation method.",
      sourceStatus: "placeholder" as ExampleSourceStatus,
      warnings: [
        "Historical valuation rows must use only data available as of the event date.",
        "Use backend daily price bars for as-of price when backend support exists.",
      ],
    },
  ] satisfies ExampleHistoricalValuationEvent[],
  researchQuestions: [
    {
      question: "What company-specific debate will determine forward returns?",
      dashboardSection: "Replace with the relevant insight panel.",
      modelDriver: "Replace with the assumption or KPI this question changes.",
      evidenceNeeded: "Replace with filing, transcript, KPI, price, or peer data needed.",
    },
  ] satisfies ExampleResearchQuestion[],
  sourceGaps: [
    "Replace placeholders with official filings/releases/transcripts before treating the module as production research.",
    "Add eight-year historical valuation coverage or document why the issuer has shorter history.",
  ],
};
