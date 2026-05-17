import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { AlertTriangle, Building2, Cpu, Factory, Globe2, Layers3, ShieldAlert } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { apiFetch } from "../../api/client";
import { buildTsmDashboardData, calculateTsmSummary, resolveTsmDataset } from "./calculations";

const TSM_BACKEND_MODEL_VERSION = "tsm_v1_backend_pilot";

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(1)}` : "n/a";
}

function usdb(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${(value / 1000).toFixed(1)}bn` : "n/a";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function ScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{note}</p>
    </div>
  );
}

function InsightPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-blue-700">
        {icon}
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${row[0]}-${cellIndex}`} className="px-3 py-2 align-top">
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

type TsmHistoricalValuationRun = {
  id: string;
  asOfDate: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y: number | null;
  expectedShareholderCagr: number | null;
  upsideDownside: number | null;
  methodOutputsJson?: Array<{ key?: string; label?: string; value?: number; format?: string; description?: string }>;
  sensitivityTablesJson?: Array<{ title?: string; table?: Array<Array<string | number>> }>;
  warningsJson?: Array<{ id?: string; title?: string; detail?: string; severity?: string } | string>;
  dataSnapshotJson?: {
    financialPeriod?: TsmBackendFinancialPeriod | null;
    assumptions?: Record<string, number | string | null | undefined>;
    revenueBase?: number | null;
    effectiveGrowth?: number | null;
    normalizedRevenue?: number | null;
    operatingMargin?: number | null;
    fcfMargin?: number | null;
    riskMultiplier?: number | null;
  };
};

type TsmBackendFinancialPeriod = {
  asOfDate?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  revenueUsd?: number | null;
  revenueGrowth?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  guidanceRevenueNextQuarterUsd?: number | null;
  guidanceGrossMarginNextQuarter?: number | null;
  guidanceOperatingMarginNextQuarter?: number | null;
  capexGuidanceUsd?: number | null;
  hpcMix?: number | null;
  advancedNodeMix?: number | null;
  smartphoneMix?: number | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  rawJson?: {
    proxyFields?: string[];
    sourceDiscipline?: string;
    mixSourceType?: string;
    capexSourceType?: string;
  } | null;
};

type TsmHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  label?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
};

type TsmHistoricalValuationItem = {
  event: TsmHistoricalValuationEvent;
  valuationRun: TsmHistoricalValuationRun | null;
};

type TsmHistoricalValuationResponse = {
  historicalValuations?: TsmHistoricalValuationItem[];
};

async function fetchTsmBackendJson<T>(paths: string[], init?: RequestInit): Promise<T> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await apiFetch<T>(path, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "TSM backend request failed"));
}

function eventLabel(event: TsmHistoricalValuationEvent, compact = false) {
  if (event.fiscalPeriod) return event.fiscalPeriod;
  if (event.fiscalYear && event.fiscalQuarter) return compact ? `${event.fiscalQuarter} ${String(event.fiscalYear).slice(2)}` : `${event.fiscalQuarter} ${event.fiscalYear}`;
  return event.eventDate;
}

function financialPeriodFromRow(row: TsmHistoricalValuationItem) {
  return row.valuationRun?.dataSnapshotJson?.financialPeriod ?? null;
}

function annualizedQuarterlyCagr(first: number | null, last: number | null, quarterIntervals: number) {
  if (!first || !last || first <= 0 || last <= 0 || quarterIntervals <= 0) return null;
  return (last / first) ** (4 / quarterIntervals) - 1;
}

function backendHistoryRows(rows: TsmHistoricalValuationItem[]) {
  return rows
    .map((row) => {
      const fp = financialPeriodFromRow(row);
      if (!fp) return null;
      const price = row.valuationRun?.currentPrice ?? null;
      const fairValue = row.valuationRun?.fairValue ?? null;
      return {
        eventId: row.event.id,
        period: eventLabel(row.event, true),
        eventDate: row.event.eventDate,
        fiscalPeriod: eventLabel(row.event),
        revenue: fp.revenueUsd ?? null,
        revenueGrowth: fp.revenueGrowth ?? null,
        grossMargin: typeof fp.grossMargin === "number" ? fp.grossMargin * 100 : null,
        operatingMargin: typeof fp.operatingMargin === "number" ? fp.operatingMargin * 100 : null,
        guidanceRevenue: fp.guidanceRevenueNextQuarterUsd ?? null,
        capexIntensity:
          fp.capexGuidanceUsd && fp.guidanceRevenueNextQuarterUsd
            ? fp.capexGuidanceUsd / Math.max(fp.guidanceRevenueNextQuarterUsd * 4, 1)
            : null,
        advancedNodeMix: typeof fp.advancedNodeMix === "number" ? fp.advancedNodeMix * 100 : null,
        hpcMix: typeof fp.hpcMix === "number" ? fp.hpcMix * 100 : null,
        price,
        fairValue,
        gapPct: row.valuationRun?.upsideDownside ?? (price && fairValue ? fairValue / price - 1 : null),
        sourceUrl: fp.sourceUrl ?? row.event.sourceUrl,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate));
}

function TsmEightYearInsightPanel({
  status,
  rows,
}: {
  status: "loading" | "online" | "offline";
  rows: TsmHistoricalValuationItem[];
}) {
  const historyRows = useMemo(() => backendHistoryRows(rows), [rows]);
  const first = historyRows[0] ?? null;
  const latest = historyRows[historyRows.length - 1] ?? null;
  const revenueCagr = annualizedQuarterlyCagr(first?.revenue ?? null, latest?.revenue ?? null, historyRows.length - 1);
  const latestGap = latest?.gapPct ?? null;
  const troughGrowth = historyRows.reduce<typeof historyRows[number] | null>((worst, row) => {
    if (typeof row.revenueGrowth !== "number") return worst;
    if (!worst || row.revenueGrowth < (worst.revenueGrowth ?? Infinity)) return row;
    return worst;
  }, null);
  const peakMargin = historyRows.reduce<typeof historyRows[number] | null>((best, row) => {
    if (typeof row.grossMargin !== "number") return best;
    if (!best || row.grossMargin > (best.grossMargin ?? -Infinity)) return row;
    return best;
  }, null);
  const chartRows = historyRows.map((row) => ({
    period: row.period,
    revenue: row.revenue,
    grossMargin: row.grossMargin,
    operatingMargin: row.operatingMargin,
    revenueGrowth: typeof row.revenueGrowth === "number" ? row.revenueGrowth * 100 : null,
  }));

  return (
    <SectionCard
      title="Eight-Year Foundry Cycle Read-Through"
      description="Backend reporting-event history now spans 2018Q1-2026Q1 and separates official revenue/margin actuals from proxy platform, node and capex drivers."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Backend history" : status === "loading" ? "Loading" : "Backend offline"}
        </span>
      }
    >
      {status === "loading" ? (
        <p className="text-sm text-slate-600">Loading eight-year TSM reporting history from the backend.</p>
      ) : null}
      {status === "offline" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static TSM dashboard sections still render.
        </div>
      ) : null}
      {historyRows.length ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            <ScoreBlock label="Backend Quarters" value={historyRows.length.toString()} note={`${first?.fiscalPeriod ?? "n/a"} to ${latest?.fiscalPeriod ?? "n/a"}`} />
            <ScoreBlock label="Revenue CAGR" value={pct(revenueCagr)} note="Annualized from official quarterly revenue rows" />
            <ScoreBlock label="Latest Gross / Op Margin" value={`${latest?.grossMargin?.toFixed(1) ?? "n/a"}% / ${latest?.operatingMargin?.toFixed(1) ?? "n/a"}%`} note="Latest event-visible margin quality" />
            <ScoreBlock label="Latest Valuation Gap" value={pct(latestGap)} note="Backend fair value vs as-of ADR price" />
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">Revenue, margin and cycle pressure</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              The line chart keeps official revenue and reported margins visible across the full foundry cycle, so the AI upcycle can be compared against the 2019 reset, the 2021-2022 shortage boom and the 2023 inventory correction.
            </p>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} interval={3} />
                  <YAxis yAxisId="left" tickFormatter={(value: number) => `$${value / 1000}bn`} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value: number) => `${value}%`} />
                  <Tooltip formatter={(value: number, name: string) => (name === "Revenue" ? usdb(value) : `${value.toFixed(1)}%`)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} name="Revenue" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="grossMargin" stroke="#16a34a" strokeWidth={2.1} name="Gross Margin" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="operatingMargin" stroke="#7c3aed" strokeWidth={2.1} name="Operating Margin" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="revenueGrowth" stroke="#f97316" strokeWidth={1.8} name="YoY Revenue Growth" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <InsightPanel
              icon={<AlertTriangle className="h-5 w-5" />}
              title="2018-2019 reset"
              text="The early history shows why a foundry model needs cycle-aware valuation. Revenue and margins fell before the next structural growth phase, so normalized earnings power matters more than a single quarter."
            />
            <InsightPanel
              icon={<Factory className="h-5 w-5" />}
              title="2020-2022 shortage boom"
              text="Revenue scale and margins stepped up as utilization, pricing and advanced-node mix improved. This period is the benchmark for what a high-return capacity cycle looks like."
            />
            <InsightPanel
              icon={<Cpu className="h-5 w-5" />}
              title="2023 correction"
              text={`The weakest YoY row in the backend is ${troughGrowth?.fiscalPeriod ?? "n/a"} at ${pct(troughGrowth?.revenueGrowth ?? null)}, which keeps the AI thesis grounded in semiconductor cyclicality.`}
            />
            <InsightPanel
              icon={<Layers3 className="h-5 w-5" />}
              title="2024-2026 AI acceleration"
              text={`The latest gross margin peak is ${peakMargin?.fiscalPeriod ?? "n/a"} at ${peakMargin?.grossMargin?.toFixed(1) ?? "n/a"}%, but the valuation gap tests whether the market has already capitalized that AI/HPC strength.`}
            />
          </div>

          <div className="mt-6">
            <DataTable
              headers={["Cycle", "Evidence", "Underwriting implication"]}
              rows={[
                ["Smartphone / crypto digestion", "2018-2019 revenue and margin reset", "Do not value TSM on peak-quarter demand or a one-year multiple."],
                ["Shortage and pricing boom", "2020-2022 revenue scale-up with gross margin above 60% by late 2022", "High utilization can produce exceptional margins, but the market may over-extrapolate them."],
                ["Inventory correction", "2023 revenue contraction and margin compression", "Even a dominant foundry has cyclical downside when customer inventory normalizes."],
                ["AI/HPC upcycle", "2024-2026 revenue reacceleration and margin expansion", "The bull case needs durable AI wafer demand plus capex returns, not only near-term GPU shortages."],
              ]}
            />
          </div>

          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Source note: revenue, gross margin, operating margin and next-quarter guidance are official TSMC quarterly-result rows. Platform mix, advanced-node mix and capex history are proxy/research-only until full management-report tables are imported.
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}

export function TsmDashboard({ module, scenario, period, dataSourceType }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [historicalValuations, setHistoricalValuations] = useState<TsmHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);
  const dataset = useMemo(() => resolveTsmDataset(module.data), [module.data]);
  const resolvedPeriod = dataset.periods.some((item) => item.id === period) ? period : module.getDefaultPeriod();
  const dashboard = useMemo(
    () => buildTsmDashboardData(dataset, resolvedPeriod, scenario, {}),
    [dataset, resolvedPeriod, scenario],
  );
  const summary = useMemo(() => calculateTsmSummary({ ...dataset, selectedPeriodId: resolvedPeriod }), [dataset, resolvedPeriod]);
  const trendRows = dataset.periods
    .filter((item) => item.periodType !== "forecast")
    .map((item) => ({
      period: item.label,
      revenue: item.revenueUsd,
      grossMargin: item.grossMargin * 100,
      operatingMargin: item.operatingMargin * 100,
      source: item.sourceStatus,
    }));
  const guidanceRows = dataset.periods
    .filter((item) => item.periodType === "forecast")
    .map((item) => ({
      period: item.label,
      revenue: item.revenueUsd,
      grossMargin: item.grossMargin * 100,
      operatingMargin: item.operatingMargin * 100,
      source: item.sourceStatus,
    }));
  const platformRows = dashboard.platform.map((row) => ({
    platform: row.platform,
    revenueMix: row.revenueMix * 100,
    source: row.sourceStatus,
  }));
  const technologyRows = dashboard.technology.map((row) => ({
    node: row.node,
    revenueMix: row.revenueMix * 100,
    source: row.sourceStatus,
  }));
  const selectedFairValue = dashboard.valuation.fairValues.find((row) => row.scenario === scenario) ?? dashboard.valuation.fairValues[0];
  const methodRows = dashboard.valuation.methodCards.map((row) => ({
    method: row.label,
    value: row.value,
  }));

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistoricalValuations() {
      setHistoricalStatus("loading");
      setHistoricalError(null);
      try {
        const payload = await fetchTsmBackendJson<TsmHistoricalValuationResponse>(
          [
            `/api/stocks/tsm/historical-valuations?scenario=Base&modelVersion=${TSM_BACKEND_MODEL_VERSION}`,
            `/api/tsm/historical-valuations?scenario=Base&modelVersion=${TSM_BACKEND_MODEL_VERSION}`,
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

  return (
    <div className="space-y-6">
      <SectionCard
        title="TSMC Foundry Research Cockpit"
        description="A TSM-specific module focused on advanced-node capacity, AI/HPC wafer demand, CoWoS and advanced packaging, capex intensity, overseas fab cost drag and Taiwan/geopolitical risk."
        badge={<DataQualityBadge badge={dashboard.dataStatus.missingFields.length ? "Needs Review" : "Actual"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          {summary.map((metric) => (
            <MetricCard key={metric.key} metric={metric} currency="USD" />
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Market price and ADR-equivalent shares are currently proxy inputs. Add a TSM backend market table before treating historical valuation or backtest output as production-grade.
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {dashboard.investmentQuestions.map((item, index) => (
            <InsightPanel
              key={item.title}
              icon={[<Cpu className="h-5 w-5" />, <Layers3 className="h-5 w-5" />, <Factory className="h-5 w-5" />, <ShieldAlert className="h-5 w-5" />][index]}
              title={item.title}
              text={item.text}
            />
          ))}
        </div>
      </SectionCard>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <SectionCard title="Business Model" description="TSMC is not a chip designer. It is the scaled, pure-play manufacturing layer for advanced logic customers.">
            <div className="grid gap-4 lg:grid-cols-4">
              <InsightPanel icon={<Building2 className="h-5 w-5" />} title="Pure-Play Foundry" text="TSMC does not compete with its customers by selling branded chips, which supports trust and ecosystem breadth." />
              <InsightPanel icon={<Cpu className="h-5 w-5" />} title="AI / HPC Pull" text="AI accelerator, CPU, networking ASIC and custom silicon demand runs through advanced nodes and packaging capacity." />
              <InsightPanel icon={<Layers3 className="h-5 w-5" />} title="Node Leadership" text="3nm, 5nm, 7nm and N2 execution are the key mix and margin drivers, not generic semiconductor unit growth." />
              <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="Geographic Risk" text="Taiwan concentration is central to valuation and should be modeled explicitly, not buried in vague discount-rate language." />
            </div>
          </SectionCard>
          <TsmEightYearInsightPanel status={historicalStatus} rows={historicalValuations} />
          <SectionCard title="Revenue and Margin Trend" description="Official annual and quarterly rows are shown with management guidance separated from actuals.">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={[...trendRows, ...guidanceRows]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" />
                <YAxis yAxisId="left" tickFormatter={(value: number) => `$${value / 1000}bn`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value: number) => `${value}%`} />
                <Tooltip formatter={(value: number, name: string) => (name.includes("Margin") ? `${value.toFixed(1)}%` : usdb(value))} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.6} name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="grossMargin" stroke="#16a34a" strokeWidth={2.2} name="Gross Margin" />
                <Line yAxisId="right" type="monotone" dataKey="operatingMargin" stroke="#7c3aed" strokeWidth={2.2} name="Operating Margin" />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="node-packaging" className="mt-6 space-y-6">
          <SectionCard title="Node and Packaging Engine" description="Advanced-node mix is treated as evidence for pricing power and margin, not as an automatic valuation booster.">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={technologyRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="node" />
                  <YAxis tickFormatter={(value: number) => `${value}%`} />
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                  <Bar dataKey="revenueMix" fill="#2563eb" name="Revenue Mix" />
                </BarChart>
              </ResponsiveContainer>
              <DataTable
                headers={["Node", "Revenue Mix", "Source"]}
                rows={technologyRows.map((row) => [row.node, `${row.revenueMix.toFixed(1)}%`, row.source])}
              />
            </div>
          </SectionCard>
          <SectionCard title="Advanced Manufacturing Evidence" description="Official operating facts from the annual report are tracked separately from valuation assumptions.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Advanced Nodes" value={pct(dashboard.metric?.advancedNodeMix)} note="7nm and beyond revenue mix evidence" />
              <ScoreBlock label="Customers" value={dashboard.metric?.customerCount ?? "n/a"} note="Customer breadth from annual report" />
              <ScoreBlock label="Products" value={dashboard.metric?.productCount?.toLocaleString() ?? "n/a"} note="Products manufactured in 2025" />
              <ScoreBlock label="Capacity" value={`${dashboard.metric?.annualCapacity12InchEqM ?? "n/a"}m`} note="12-inch equivalent wafers" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="end-markets" className="mt-6 space-y-6">
          <SectionCard title="End-Market Mix" description="This panel answers whether the growth engine is broad foundry demand or mostly AI/HPC pull-forward.">
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={platformRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="platform" />
                  <YAxis tickFormatter={(value: number) => `${value}%`} />
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                  <Bar dataKey="revenueMix" fill="#0f766e" name="Revenue Mix" />
                </BarChart>
              </ResponsiveContainer>
              <DataTable
                headers={["Platform", "Revenue Mix", "Source"]}
                rows={platformRows.map((row) => [row.platform, `${row.revenueMix.toFixed(1)}%`, row.source])}
              />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margins-capex" className="mt-6 space-y-6">
          <SectionCard title="Margin and Capex Debate" description="TSMC can have elite margins and still face FCF volatility if capex intensity rises faster than pricing power.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Q1 Gross Margin" value={pct(dashboard.period.grossMargin)} note="Actual reported gross margin" />
              <ScoreBlock label="Q1 Operating Margin" value={pct(dashboard.period.operatingMargin)} note="Actual reported operating margin" />
              <ScoreBlock label="Q2 Gross Guide" value={pct(dashboard.guidance?.grossMargin)} note="Management guidance midpoint" />
              <ScoreBlock label="Capex Guide" value={usdb(dashboard.metric?.capexGuidanceUsd)} note="Research-only cycle variable until full import" />
            </div>
            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
              The core underwriting tension is whether AI/HPC pricing and advanced-node utilization can offset N2 ramp cost, overseas fab dilution, depreciation and advanced packaging expansion.
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <TsmHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <SectionCard title="Valuation Snapshot" description="The first TSM valuation pass triangulates DCF, FCF yield, P/E, EV/EBIT and node-mix SOTP.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Selected Fair Value" value={usd(selectedFairValue?.fairValue)} note={`${pct(selectedFairValue?.upsideDownside)} vs proxy ADR price`} />
              <ScoreBlock label="Current Price" value={usd(dashboard.valuation.currentPrice)} note={dashboard.valuation.priceDate ?? "proxy"} />
              <ScoreBlock label="3Y CAGR" value={pct(selectedFairValue?.expectedReturn3Y)} note="Includes assumed dividends" />
              <ScoreBlock label="Revenue Base" value={usdb(dashboard.annualRevenueBase)} note="Latest guidance annualized when available" />
            </div>
            <div className="mt-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={methodRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => usd(value)} />
                  <Bar dataKey="value" fill="#2563eb" name="Fair Value / ADR" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <InteractiveValuationDashboard
            ticker="TSM"
            config={module.valuationConfig}
            data={dataset}
            scenario={scenario}
            currency={module.currency}
          />
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="Every risk needs a monitored evidence set before it deserves to change the valuation inputs.">
            <DataTable headers={["Risk", "Evidence to Monitor", "Severity"]} rows={dashboard.risks} />
          </SectionCard>
          <SectionCard title="What Would Break the Bull Case?" description="The TSM bull case is not just AI growth; it requires durable returns on a very large capital cycle.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel icon={<AlertTriangle className="h-5 w-5" />} title="AI capex digestion" text="HPC customers push out wafer starts or packaging reservations after overbuilding accelerator capacity." />
              <InsightPanel icon={<Factory className="h-5 w-5" />} title="Capex without returns" text="N2, CoWoS and overseas fabs lift depreciation faster than pricing or utilization." />
              <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Risk premium shock" text="Geopolitical risk widens the equity risk premium faster than earnings estimates rise." />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function TsmHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: TsmHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(8);
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
  const allGapRows = rows
    .filter((row) => row.valuationRun?.currentPrice != null && row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: eventLabel(row.event, true),
      gapPct: row.valuationRun?.upsideDownside ?? null,
      fairValue: row.valuationRun?.fairValue ?? null,
    }))
    .filter((row) => typeof row.gapPct === "number" && typeof row.fairValue === "number");
  const fairValues = allGapRows.map((row) => row.fairValue as number);
  const fairValueRange = fairValues.length ? `${usd(Math.min(...fairValues))} - ${usd(Math.max(...fairValues))}` : "n/a";
  const largestDiscount = allGapRows.reduce<typeof allGapRows[number] | null>((best, row) => {
    if (!best || (row.gapPct ?? -Infinity) > (best.gapPct ?? -Infinity)) return row;
    return best;
  }, null);
  const largestPremium = allGapRows.reduce<typeof allGapRows[number] | null>((worst, row) => {
    if (!worst || (row.gapPct ?? Infinity) < (worst.gapPct ?? Infinity)) return row;
    return worst;
  }, null);
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];
  const selectedSnapshot = selected?.valuationRun?.dataSnapshotJson ?? null;
  const selectedFinancial = selectedSnapshot?.financialPeriod ?? null;
  const selectedAssumptions = selectedSnapshot?.assumptions ?? {};
  const driverRows: Array<Array<string | number>> = selectedSnapshot
    ? [
        ["Revenue base", usdb(selectedSnapshot.revenueBase ?? null), "Annualized event-visible guidance or reported revenue"],
        ["Effective growth", pct(selectedSnapshot.effectiveGrowth ?? null), "Blended revenue, HPC and advanced-node signal after AI cycle haircut"],
        ["FCF margin", pct(selectedSnapshot.fcfMargin ?? null), "Normalized margin after capex and overseas cost drag"],
        ["Risk multiplier", pct(selectedSnapshot.riskMultiplier ?? null), "Customer, geopolitics and AI cycle haircuts"],
        ["Capex intensity", pct(typeof selectedAssumptions.capexIntensity === "number" ? selectedAssumptions.capexIntensity : null), "Capex guide divided by annualized event revenue base"],
        ["Advanced-node mix", pct(selectedFinancial?.advancedNodeMix ?? null), selectedFinancial?.rawJson?.mixSourceType ?? "source pending"],
        ["HPC mix", pct(selectedFinancial?.hpcMix ?? null), selectedFinancial?.rawJson?.mixSourceType ?? "source pending"],
      ]
    : [];

  return (
    <SectionCard
      title="TSM Backend Historical Valuations"
      description="Base scenario valuation runs by TSMC reporting event from the unified SQLite backend. Each event uses only event-visible financials, guidance and nearest-prior ADR market price."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns.toString()} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length ? displayRows.length.toString() : "n/a"} note="TSMC reporting-event history imported" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted fair value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs as-of ADR price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static TSM dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">Oldest-to-newest chart of as-of ADR price versus backend fair value. Use the selector to inspect one reporting event.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[8, 12, 16, 24, displayRows.length].filter((count, index, list) => list.indexOf(count) === index).map((count) => (
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
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? eventLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? eventLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus as-of price" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average premium / discount in visible window" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Fair Value Range" value={fairValueRange} note="Range across all persisted backend events" />
              <ScoreBlock label="Largest Discount" value={largestDiscount?.gapPct != null ? `${largestDiscount.period} ${pct(largestDiscount.gapPct)}` : "n/a"} note="Most favorable fair value gap" />
              <ScoreBlock label="Largest Premium" value={largestPremium?.gapPct != null ? `${largestPremium.period} ${pct(largestPremium.gapPct)}` : "n/a"} note="Most demanding market price vs fair value" />
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
                <p className="font-semibold text-ink">{selected.event.title ?? selected.event.label ?? "Selected TSMC reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior TSM ADR adjusted close" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Backend target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Expected shareholder CAGR" />
                </div>
                <div className="mt-5">
                  <DataTable
                    headers={["Method", "Value", "Description"]}
                    rows={methodRows.map((row) => [
                      row.label ?? row.key ?? "Method",
                      typeof row.value === "number" ? (row.format === "percent" ? pct(row.value) : usd(row.value)) : "n/a",
                      row.description ?? "",
                    ])}
                  />
                </div>
                {driverRows.length ? (
                  <div className="mt-5">
                    <p className="mb-3 text-sm font-semibold text-ink">Selected event valuation drivers</p>
                    <DataTable headers={["Driver", "Value", "Interpretation"]} rows={driverRows} />
                  </div>
                ) : null}
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

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">As-of Price vs Fair Value</p>
                <div className="mt-4">
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
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading TSM historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}
