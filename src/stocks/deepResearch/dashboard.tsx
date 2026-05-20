import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, Database, ShieldAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockDashboardProps } from "../types";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { apiFetch } from "../../api/client";
import { calculateDeepResearchValuation, formatMetricValue, resolveDeepResearchDataset } from "./calculations";
import type { DeepResearchDataset, DeepResearchHistoricalValuation, DeepResearchKpiSeries } from "./model";

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(value > 100 ? 0 : 1)}` : "n/a";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function chartWindow(rows: DeepResearchHistoricalValuation[], windowSize: string) {
  if (windowSize === "All") return rows;
  const count = Number(windowSize.replace("Q", ""));
  return rows.slice(Math.max(0, rows.length - count));
}

type BackendHistoricalPayload = {
  historicalValuations?: Array<{
    event?: {
      id: string;
      eventDate: string;
      fiscalPeriod?: string;
      fiscalYear?: number;
      fiscalQuarter?: number;
    };
    valuationRun?: {
      id: string;
      currentPrice?: number | null;
      fairValue?: number | null;
      targetPrice3Y?: number | null;
      expectedShareholderCagr?: number | null;
      methodOutputsJson?: Array<{ label?: string; value?: number; format?: string; description?: string }>;
      warningsJson?: Array<{ title?: string; detail?: string }>;
    } | null;
  }>;
};

function backendRowsFromPayload(dataset: DeepResearchDataset, payload: BackendHistoricalPayload): DeepResearchHistoricalValuation[] {
  return (payload.historicalValuations ?? [])
    .filter((row) => row.event && row.valuationRun && Number.isFinite(Number(row.valuationRun.fairValue)) && Number.isFinite(Number(row.valuationRun.currentPrice)))
    .map((row) => {
      const event = row.event!;
      const run = row.valuationRun!;
      const fiscalPeriod = event.fiscalPeriod ?? (event.fiscalYear && event.fiscalQuarter ? `FY${event.fiscalYear} Q${event.fiscalQuarter}` : event.eventDate);
      const asOfPrice = Number(run.currentPrice);
      const fairValue = Number(run.fairValue);
      return {
        id: run.id,
        eventDate: event.eventDate,
        fiscalPeriod,
        asOfPrice,
        fairValue,
        targetPrice3Y: Number(run.targetPrice3Y ?? fairValue * 1.1),
        expectedShareholderCagr: Number(run.expectedShareholderCagr ?? Math.pow(Math.max(0.01, fairValue) / Math.max(0.01, asOfPrice), 1 / 3) - 1),
        method: `${dataset.ticker} persisted backend valuation run using event-visible assumption set.`,
        sourceStatus: "derived",
        warnings: [
          "Backend persisted valuation run.",
          ...((run.warningsJson ?? []).map((warning) => warning.detail ?? warning.title ?? "").filter(Boolean)),
        ],
        methodOutputs: (run.methodOutputsJson ?? []).map((item) => ({
          label: item.label ?? "Backend method",
          value: Number(item.value ?? fairValue),
          format: (item.format as DeepResearchHistoricalValuation["methodOutputs"][number]["format"]) ?? "currency",
          description: item.description ?? "Persisted backend method output.",
        })),
      };
    });
}

function HistoricalValuationPanel({ dataset }: { dataset: DeepResearchDataset }) {
  const [windowSize, setWindowSize] = useState("12Q");
  const [selectedId, setSelectedId] = useState(dataset.historicalValuations[dataset.historicalValuations.length - 1]?.id ?? "");
  const [backendRows, setBackendRows] = useState<DeepResearchHistoricalValuation[] | null>(null);
  const [apiStatus, setApiStatus] = useState<"idle" | "loading" | "online" | "offline">("idle");
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!dataset.backendStatus.supported) return;
    let active = true;
    setApiStatus("loading");
    setApiError(null);
    apiFetch<BackendHistoricalPayload>(`/api/stocks/${dataset.ticker.toLowerCase()}/historical-valuations?scenario=Base`)
      .then((payload) => {
        if (!active) return;
        const rows = backendRowsFromPayload(dataset, payload);
        setBackendRows(rows.length ? rows : null);
        setApiStatus(rows.length ? "online" : "offline");
        if (rows.length) setSelectedId(rows[rows.length - 1].id);
      })
      .catch((error) => {
        if (!active) return;
        setApiStatus("offline");
        setApiError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [dataset]);

  const rows = backendRows ?? dataset.historicalValuations;
  const visibleRows = chartWindow(rows, windowSize);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[rows.length - 1];
  const latest = rows[rows.length - 1];
  const avgGap =
    visibleRows.reduce((sum, row) => sum + (row.fairValue / Math.max(0.01, row.asOfPrice) - 1), 0) / Math.max(1, visibleRows.length);
  const chartRows = visibleRows.map((row) => ({
    ...row,
    label: row.fiscalPeriod.replace("FY", "FY "),
    gap: row.fairValue / Math.max(0.01, row.asOfPrice) - 1,
  }));

  return (
    <SectionCard title={`${dataset.ticker} Backend-Style Historical Valuations`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className={`rounded-full px-3 py-1 ${apiStatus === "online" ? "bg-emerald-50 text-emerald-700" : apiStatus === "loading" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
            {apiStatus === "online" ? "Backend online" : apiStatus === "loading" ? "Loading backend" : "Local fallback"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{rows.length} event rows</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">MSFT/AAPL UX pattern</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {["8Q", "12Q", "16Q", "24Q", "All"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setWindowSize(item)}
              className={`h-8 border px-3 text-xs font-semibold ${windowSize === item ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MetricCard
          metric={{
            key: "visible-window",
            label: "Visible window",
            value: visibleRows.length,
            format: "number",
            description: `${windowSize} oldest-to-newest chart slice.`,
            badge: "Derived",
          }}
        />
        <MetricCard
          metric={{
            key: "latest-gap",
            label: "Latest gap",
            value: latest ? latest.fairValue / Math.max(0.01, latest.asOfPrice) - 1 : 0,
            format: "percent",
            description: latest ? `${latest.fiscalPeriod}: ${usd(latest.asOfPrice)} price vs ${usd(latest.fairValue)} fair value.` : "No latest row.",
            badge: "Derived",
          }}
        />
        <MetricCard
          metric={{
            key: "avg-gap",
            label: "Average gap",
            value: avgGap,
            format: "percent",
            description: "Average visible-window fair value gap.",
            badge: "Derived",
          }}
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelectedId(row.id)}
            className={`min-w-[8rem] border px-3 py-2 text-left text-xs ${selected?.id === row.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}
          >
            <span className="block font-semibold">{row.fiscalPeriod}</span>
            <span className="block opacity-80">{row.eventDate}</span>
          </button>
        ))}
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" interval={chartRows.length > 16 ? 2 : chartRows.length > 10 ? 1 : 0} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
            <Tooltip
              formatter={(value, name) => [usd(Number(value)), name === "asOfPrice" ? "As-of price" : "Fair value"]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as (typeof chartRows)[number] | undefined;
                return row ? `${row.eventDate} · ${row.fiscalPeriod} · Gap ${pct(row.gap)}` : "";
              }}
            />
            <Legend />
            <Bar dataKey="asOfPrice" name="As-of price" fill="#94a3b8" />
            <Bar dataKey="fairValue" name="Fair value" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selected ? (
        <div className="mt-4 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">
            Selected: {selected.fiscalPeriod} · {usd(selected.fairValue)} fair value · {pct(selected.fairValue / Math.max(0.01, selected.asOfPrice) - 1)} gap
          </p>
          <p className="mt-1">{selected.method}</p>
          {selected.warnings.length > 0 ? <p className="mt-2 text-amber-700">{selected.warnings.join(" ")}</p> : null}
          {apiError ? <p className="mt-2 text-amber-700">API fallback: {apiError}</p> : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

function KpiSeriesChart({ series }: { series: DeepResearchKpiSeries }) {
  return (
    <SectionCard title={series.title}>
      <p className="mb-4 text-sm text-slate-600">{series.subtitle}</p>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series.points}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {series.measures.map((measure) =>
              measure.chartType === "bar" ? (
                <Bar key={measure.key} yAxisId={measure.axis ?? "left"} dataKey={measure.key} name={measure.label} fill={measure.color} />
              ) : (
                <Line
                  key={measure.key}
                  yAxisId={measure.axis ?? "right"}
                  type="monotone"
                  dataKey={measure.key}
                  name={measure.label}
                  stroke={measure.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function ResearchQuestionGrid({ dataset }: { dataset: DeepResearchDataset }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {dataset.researchQuestions.map((item) => (
        <div key={item.key} className="border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-950">{item.question}</p>
          <p className="mt-2 text-sm text-slate-600">{item.currentView}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
            <span><strong className="text-slate-700">Metric:</strong> {item.metric}</span>
            <span><strong className="text-slate-700">Valuation:</strong> {item.valuationTie}</span>
            <span><strong className="text-slate-700">Bear case:</strong> {item.bearCase}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EarningsQuestionPanel({ dataset }: { dataset: DeepResearchDataset }) {
  const chartRows = dataset.quarterlyQuestions.map((row, index) => ({
    quarter: row.quarter,
    focusScore: 60 + (row.keyQuestions.length * 7) + (row.riskSignal === "Negative" ? 8 : row.riskSignal === "Inflecting" ? 5 : 0),
    riskScore: row.riskSignal === "Positive" ? 35 : row.riskSignal === "Neutral" ? 45 : row.riskSignal === "Inflecting" ? 60 : 70,
    index,
  }));
  return (
    <div className="space-y-6">
      <SectionCard title="Historical Quarterly Earnings Questions">
        <p className="mb-4 text-sm text-slate-600">
          Each row frames what investors needed to ask at that reporting event. Rows are local research summaries until transcript ingestion is backend-backed.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="focusScore" name="Question intensity" fill="#0f172a" />
              <Bar dataKey="riskScore" name="Risk scrutiny" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <div className="grid gap-4">
        {dataset.quarterlyQuestions.map((row) => (
          <div key={`${row.quarter}-${row.eventDate}`} className="border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{row.quarter} · {row.headline}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{row.eventDate} · {row.sourceStatus}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{row.riskSignal}</span>
            </div>
            <ul className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
              {row.keyQuestions.map((question) => <li key={question}>• {question}</li>)}
            </ul>
            <p className="mt-3 text-sm text-slate-700"><strong>Model read-through:</strong> {row.modelReadThrough}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeepDiveTab({ dataset, tab }: { dataset: DeepResearchDataset; tab: string }) {
  const sections = dataset.deepDiveSections.filter((section) => section.tab === tab);
  const fallbackSections = sections.length > 0 ? sections : dataset.deepDiveSections.slice(0, 2);
  const series = dataset.kpiSeries.find((item) => item.key === tab) ?? dataset.kpiSeries[0];
  return (
    <div className="space-y-6">
      {series ? <KpiSeriesChart series={series} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {fallbackSections.map((section) => (
          <SectionCard key={section.key} title={section.title}>
            <p className="text-sm text-slate-700">{section.thesis}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence to track</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {section.evidence.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Watch items</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {section.watchItems.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

type BackendBacktestResult = {
  status?: string;
  warnings?: string[];
  metrics?: {
    stock?: { cagr?: number | null; maxDrawdown?: number | null; sharpe?: number | null; volatility?: number | null };
    spy?: { cagr?: number | null; maxDrawdown?: number | null; sharpe?: number | null; volatility?: number | null };
  };
  curve?: Array<{ date: string; stock?: number; spy?: number }>;
};

function BackendBacktestPanel({ dataset }: { dataset: DeepResearchDataset }) {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState(dataset.updatedAt);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<BackendBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBacktest() {
    setStatus("running");
    setError(null);
    try {
      const payload = await apiFetch<BackendBacktestResult>(`/api/stocks/${dataset.ticker.toLowerCase()}/backtests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
      });
      setResult(payload);
      setStatus(payload.status === "completed" ? "done" : "error");
      if (payload.status !== "completed") setError((payload.warnings ?? []).join(" ") || "Backtest did not complete.");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const chartRows = result?.curve?.map((row) => ({
    date: row.date,
    stock: row.stock ? row.stock * 100 : null,
    spy: row.spy ? row.spy * 100 : null,
  })) ?? [];

  return (
    <SectionCard title={`${dataset.ticker} vs SPY Backtest`}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Start date
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 border border-slate-200 px-3 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          End date
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 border border-slate-200 px-3 font-normal" />
        </label>
        <button type="button" onClick={runBacktest} className="h-10 bg-slate-950 px-4 text-sm font-semibold text-white">
          {status === "running" ? "Running" : "Run backtest"}
        </button>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "done" ? "bg-emerald-50 text-emerald-700" : status === "error" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "done" ? "Backtest ready" : status === "error" ? "Needs data" : "Ready"}
        </span>
      </div>
      {result?.metrics ? (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <MetricCard metric={{ key: "stock-cagr", label: `${dataset.ticker} CAGR`, value: result.metrics.stock?.cagr ?? 0, format: "percent", description: "Backend daily adjusted buy-and-hold CAGR.", badge: "Derived" }} />
          <MetricCard metric={{ key: "spy-cagr", label: "SPY CAGR", value: result.metrics.spy?.cagr ?? 0, format: "percent", description: "Backend SPY benchmark CAGR.", badge: "Derived" }} />
          <MetricCard metric={{ key: "stock-mdd", label: `${dataset.ticker} MDD`, value: result.metrics.stock?.maxDrawdown ?? 0, format: "percent", description: "Maximum drawdown.", badge: "Derived" }} />
          <MetricCard metric={{ key: "stock-sharpe", label: `${dataset.ticker} Sharpe`, value: result.metrics.stock?.sharpe ?? 0, format: "number", description: "Daily return annualized Sharpe, no risk-free-rate adjustment.", badge: "Derived" }} />
        </div>
      ) : null}
      {chartRows.length ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Number(value).toFixed(0)}`} />
              <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)}`, name === "stock" ? dataset.ticker : "SPY"]} />
              <Legend />
              <Line type="monotone" dataKey="stock" name={dataset.ticker} stroke="#0f172a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="spy" name="SPY" stroke="#2563eb" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {error ? <p className="mt-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
      {result?.warnings?.length ? <p className="mt-3 text-sm text-amber-700">{result.warnings.join(" ")}</p> : null}
    </SectionCard>
  );
}

function ValuationTab({ dataset, module, scenario, onDataSourceChange }: StockDashboardProps & { dataset: DeepResearchDataset }) {
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: dataset.ticker,
    defaultAssumptions: dataset.valuation.defaultAssumptions,
    onDataSourceChange,
  });
  const valuation = useMemo(
    () => calculateDeepResearchValuation(dataset, valuationAssumptions, scenario),
    [dataset, scenario, valuationAssumptions],
  );

  return (
    <div className="space-y-6">
      <HistoricalValuationPanel dataset={dataset} />
      {dataset.backendStatus.supported ? <BackendBacktestPanel dataset={dataset} /> : null}
      <SectionCard title={`${dataset.ticker} Valuation Triangulation`}>
        <div className="mb-5 grid gap-4 md:grid-cols-4">
          {valuation.methodCards.map((card) => (
            <div key={card.key} className="border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMetricValue(card.value, card.format)}</p>
              <p className="mt-2 text-xs text-slate-500">{card.description}</p>
            </div>
          ))}
        </div>
        <InteractiveValuationDashboard
          ticker={dataset.ticker}
          config={module.valuationConfig}
          data={dataset}
          scenario={scenario}
          currency={dataset.currency}
          values={valuationAssumptions}
          onValuesChange={handleValuationValuesChange}
        />
      </SectionCard>
    </div>
  );
}

function RiskTab({ dataset }: { dataset: DeepResearchDataset }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Risk Red Team">
        <div className="grid gap-4 md:grid-cols-2">
          {dataset.risks.map((risk) => (
            <div key={risk.title} className="border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className={`mt-1 h-4 w-4 ${risk.severity === "high" ? "text-red-600" : risk.severity === "medium" ? "text-amber-600" : "text-slate-500"}`} />
                <div>
                  <p className="font-semibold text-slate-950">{risk.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{risk.detail}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kill signal: {risk.killSignal}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Backend / Source Gaps">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-slate-950"><Database className="h-4 w-4" /> Backend status</p>
            <p className="mt-2 text-sm text-slate-600">{dataset.backendStatus.detail}</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {dataset.backendStatus.nextSteps.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
          <div className="border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Source gaps</p>
            <ul className="mt-3 space-y-2 text-sm text-amber-800">
              {dataset.sourceGaps.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function DeepResearchDashboard(props: StockDashboardProps) {
  const { module, scenario, onScenarioChange } = props;
  const [activeTab, setActiveTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const dataset = resolveDeepResearchDataset(module.data);
  const summary = useMemo(() => module.calculateSummary(dataset), [dataset, module]);
  const selectedValuation = useMemo(() => module.calculateValuation(dataset, undefined, scenario), [dataset, module, scenario]);
  const selected = selectedValuation.fairValues.find((row) => row.scenario === scenario) ?? selectedValuation.fairValues[1] ?? selectedValuation.fairValues[0];

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{dataset.archetype}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{dataset.ticker} · {dataset.companyName}</h1>
          <p className="mt-2 max-w-5xl text-sm text-slate-600">{dataset.description}</p>
        </div>
        <div className="flex gap-2">
          {(["Bear", "Base", "Bull"] as const).map((item) => (
            <button key={item} type="button" onClick={() => onScenarioChange(item)} className={`h-9 border px-4 text-sm font-semibold ${scenario === item ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <Tabs.List className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {module.tabs.map((tab) => (
          <Tabs.Trigger key={tab.value} value={tab.value} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 data-[state=active]:border-slate-950 data-[state=active]:text-slate-950">
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="dashboard" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summary.map((metric) => <MetricCard key={metric.key} metric={metric} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="Investment Read">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                metric={{
                  key: "selected-fair-value",
                  label: "Selected fair value",
                  value: selected?.fairValue ?? 0,
                  format: "currency",
                  description: selectedValuation.recommendedFairValueReason ?? "",
                  badge: "Derived",
                }}
              />
              <MetricCard
                metric={{
                  key: "upside",
                  label: "Upside / downside",
                  value: selected?.upsideDownside ?? 0,
                  format: "percent",
                  description: `Against ${dataset.marketData.sourceStatus} price as of ${dataset.marketData.priceDate}.`,
                  badge: "Derived",
                }}
              />
              <MetricCard
                metric={{
                  key: "integrity",
                  label: "Reliability score",
                  value: selectedValuation.overallIntegrityScore ?? 0,
                  format: "number",
                  description: "Penalizes source gaps, proxy price history and local fallback rows.",
                  badge: "Derived",
                }}
              />
            </div>
          </SectionCard>
          <SectionCard title="Quality Badges">
            <div className="grid gap-2">
              {dataset.qualityBadges.map((item) => (
                <div key={item.label} className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-semibold text-slate-950">{item.value} · {item.badge}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
        {dataset.kpiSeries[0] ? <KpiSeriesChart series={dataset.kpiSeries[0]} /> : null}
        <SectionCard title="Core Investment Questions">
          <ResearchQuestionGrid dataset={dataset} />
        </SectionCard>
      </Tabs.Content>

      <Tabs.Content value="earnings-questions" className="space-y-6">
        <EarningsQuestionPanel dataset={dataset} />
      </Tabs.Content>

      <Tabs.Content value="valuation" className="space-y-6">
        <ValuationTab {...props} dataset={dataset} />
      </Tabs.Content>

      <Tabs.Content value="risk-red-team" className="space-y-6">
        <RiskTab dataset={dataset} />
      </Tabs.Content>

      {module.tabs
        .filter((tab) => !["dashboard", "earnings-questions", "valuation", "risk-red-team"].includes(tab.value))
        .map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value} className="space-y-6">
            <DeepDiveTab dataset={dataset} tab={tab.value} />
          </Tabs.Content>
        ))}
    </Tabs.Root>
  );
}
