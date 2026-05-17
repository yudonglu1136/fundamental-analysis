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
import { AlertTriangle, Boxes, BrainCircuit, Cpu, Database, Factory, Gamepad2, Network, ShieldAlert, TrendingUp, Zap } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { SectionCard } from "../../components/shared/SectionCard";
import {
  attachNvdaRuntimeContext,
  buildNvdaDashboardData,
  resolveNvdaDataset,
} from "./calculations";
import { defaultNvdaValuationAssumptions, type NvdaValuationAssumptions } from "./assumptions";
import type { NvdaDataset, NvdaOperatingMetric, NvdaPeriod, NvdaSegment } from "./model";

type NvdaHistoricalValuationRun = {
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

type NvdaHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: string | null;
  label?: string | null;
  title?: string | null;
};

type NvdaHistoricalValuationItem = {
  event: NvdaHistoricalValuationEvent;
  valuationRun: NvdaHistoricalValuationRun | null;
};

type NvdaHistoricalValuationResponse = {
  historicalValuations?: NvdaHistoricalValuationItem[];
};

type NvdaBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type NvdaBacktestCurvePoint = {
  date: string;
  spy: number;
  benchmark?: number;
  nvdaBuyHold: number;
};

type NvdaBacktestResult = {
  status?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    spy?: NvdaBacktestMetricSet;
    nvdaBuyHold?: NvdaBacktestMetricSet;
  };
  curve?: NvdaBacktestCurvePoint[];
  warnings?: string[];
};

type NvdaBackendSnapshotResponse = {
  financialPeriods?: Array<NvdaPeriod & { periodId?: string; asOfDate?: string | null; sourceType?: string | null }>;
  segmentFinancials?: Array<NvdaSegment & { sourceType?: string | null }>;
  operatingMetricSnapshots?: Array<NvdaOperatingMetric & { sourceType?: string | null }>;
  marketSnapshot?: {
    currentPrice?: number | null;
    priceDate?: string | null;
    sharesOutstanding?: number | null;
    source?: string | null;
    sourceType?: string | null;
  } | null;
};

function loadSavedNvdaValuationAssumptions() {
  if (typeof window === "undefined") return defaultNvdaValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-NVDA");
  if (!saved) return defaultNvdaValuationAssumptions;
  try {
    return {
      ...defaultNvdaValuationAssumptions,
      ...(JSON.parse(saved) as Partial<NvdaValuationAssumptions>),
    };
  } catch {
    return defaultNvdaValuationAssumptions;
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

function fiscalLabel(event: NvdaHistoricalValuationEvent, compact = false) {
  const fiscalYear = event.fiscalYear ? String(event.fiscalYear).slice(2) : "";
  const quarter = event.fiscalQuarter ?? event.fiscalPeriod?.match(/Q[1-4]/i)?.[0]?.toUpperCase();
  if (fiscalYear && quarter) return compact ? `FY${fiscalYear} ${quarter}` : `FY20${fiscalYear} ${quarter}`;
  return event.fiscalPeriod ?? event.label ?? event.eventDate;
}

function periodLabel(period: NvdaPeriod) {
  return `FY${String(period.fiscalYear).slice(2)} ${period.fiscalQuarter}`;
}

function sourceStatus(value?: string | null): NvdaDataset["marketData"]["sourceStatus"] {
  if (value === "official_actual" || value === "market_data" || value === "forecast_assumption" || value === "transcript_commentary" || value === "management_guidance") return value;
  return "research_only";
}

function mapSnapshotToDataset(snapshot: NvdaBackendSnapshotResponse | null, fallback: NvdaDataset): NvdaDataset {
  if (!snapshot?.financialPeriods?.length) return fallback;
  const periods = snapshot.financialPeriods.map((row) => ({
    ...row,
    id: row.periodId ?? row.id,
    label: row.label ?? `${row.fiscalYear} ${row.fiscalQuarter}`,
    sourceStatus: sourceStatus(row.sourceType) as NvdaPeriod["sourceStatus"],
    periodType: row.periodType ?? "quarter",
    revenue: Number(row.revenue ?? 0),
    grossProfit: Number(row.grossProfit ?? 0),
    grossMargin: Number(row.grossMargin ?? 0),
    operatingIncome: Number(row.operatingIncome ?? 0),
    operatingMargin: Number(row.operatingMargin ?? 0),
    dilutedShares: Number(row.dilutedShares ?? snapshot.marketSnapshot?.sharesOutstanding ?? fallback.marketData.sharesOutstanding),
  })) as NvdaPeriod[];
  const latest = periods[periods.length - 1] ?? fallback.periods[0];
  return {
    marketData: {
      currentPrice: snapshot.marketSnapshot?.currentPrice ?? fallback.marketData.currentPrice,
      priceDate: snapshot.marketSnapshot?.priceDate ?? latest?.label ?? fallback.marketData.priceDate,
      sharesOutstanding: snapshot.marketSnapshot?.sharesOutstanding ?? latest?.dilutedShares ?? fallback.marketData.sharesOutstanding,
      currency: "USD",
      source: snapshot.marketSnapshot?.source ?? "NVDA backend snapshot",
      sourceStatus: sourceStatus(snapshot.marketSnapshot?.sourceType),
    },
    periods,
    segments: (snapshot.segmentFinancials ?? []).map((row) => ({
      ...row,
      periodId: row.periodId,
      segment: row.segment,
      sourceStatus: sourceStatus(row.sourceType) as NvdaSegment["sourceStatus"],
      revenue: Number(row.revenue ?? 0),
    })),
    operatingMetrics: (snapshot.operatingMetricSnapshots ?? []).map((row) => ({
      ...row,
      periodId: row.periodId,
      sourceStatus: sourceStatus(row.sourceType) as NvdaOperatingMetric["sourceStatus"],
    })),
    sourceNotes: [
      "Backend snapshot loaded from NVDA SQLite.",
      "Consolidated financials are official SEC actuals when sourceType=official_actual.",
      "Segment/product/supply-chain rows marked research_only are not official actuals.",
    ],
    selectedPeriodId: latest.id,
    dataSourceType: "api",
  };
}

export function NvdaDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "cockpit");
  const [valuationAssumptions, setValuationAssumptions] = useState<NvdaValuationAssumptions>(loadSavedNvdaValuationAssumptions);
  const [historicalValuations, setHistoricalValuations] = useState<NvdaHistoricalValuationItem[]>([]);
  const [historicalStatus, setHistoricalStatus] = useState<"loading" | "online" | "offline">("loading");
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedHistoricalEventId, setSelectedHistoricalEventId] = useState<string | null>(null);
  const [backendSnapshot, setBackendSnapshot] = useState<NvdaBackendSnapshotResponse | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<"loading" | "online" | "offline">("loading");
  const fallbackData = useMemo(() => resolveNvdaDataset(module.data), [module.data]);
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_NVDA_API_BASE_URL ?? "http://127.0.0.1:8787";
  const backendDataset = useMemo(() => mapSnapshotToDataset(backendSnapshot, fallbackData), [backendSnapshot, fallbackData]);
  const resolvedPeriod = backendDataset.periods.some((option) => option.id === period) ? period : backendDataset.selectedPeriodId ?? module.getDefaultPeriod();
  const runtimeData = useMemo(
    () => attachNvdaRuntimeContext(backendDataset, { periodId: resolvedPeriod, dataSourceType: snapshotStatus === "online" ? "api" : dataSourceType }),
    [backendDataset, dataSourceType, resolvedPeriod, snapshotStatus],
  );
  const dashboard = useMemo(
    () => buildNvdaDashboardData(runtimeData, resolvedPeriod, scenario, dataSourceType === "manual" ? valuationAssumptions : {}),
    [dataSourceType, runtimeData, resolvedPeriod, scenario, valuationAssumptions],
  );

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as NvdaValuationAssumptions);
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
          `${apiBase}/api/nvda/historical-valuations?scenario=Base&modelVersion=nvda_v1_backend_pilot`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          response = await fetch(
            `${apiBase}/api/stocks/nvda/historical-valuations?scenario=Base&modelVersion=nvda_v1_backend_pilot`,
            { signal: controller.signal },
          );
        }
        if (!response.ok) throw new Error(`NVDA backend returned ${response.status}`);
        const payload = (await response.json()) as NvdaHistoricalValuationResponse;
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
    async function loadSnapshot() {
      setSnapshotStatus("loading");
      try {
        let response = await fetch(`${apiBase}/api/nvda/snapshot`, { signal: controller.signal });
        if (!response.ok) response = await fetch(`${apiBase}/api/stocks/nvda/snapshot`, { signal: controller.signal });
        if (!response.ok) throw new Error(`NVDA snapshot returned ${response.status}`);
        setBackendSnapshot((await response.json()) as NvdaBackendSnapshotResponse);
        setSnapshotStatus("online");
      } catch {
        if (!controller.signal.aborted) setSnapshotStatus("offline");
      }
    }
    loadSnapshot();
    return () => controller.abort();
  }, [apiBase]);

  const selectedPeriod = dashboard.period;
  const periods = [...backendDataset.periods].sort((left, right) => left.fiscalYear * 10 + Number(left.fiscalQuarter.slice(1)) - (right.fiscalYear * 10 + Number(right.fiscalQuarter.slice(1))));
  const trendRows = periods.map((row) => {
    const metric = backendDataset.operatingMetrics.find((item) => item.periodId === row.id);
    return {
      period: periodLabel(row),
      revenue: row.revenue,
      grossMargin: row.grossMargin * 100,
      operatingMargin: row.operatingMargin * 100,
      inventory: row.inventory ?? 0,
      fcfConversion: (metric?.fcfConversion ?? 0) * 100,
      dataCenterRevenue: metric?.dataCenterRevenue ?? 0,
      gamingRevenue: metric?.gamingRevenue ?? 0,
      dataCenterGrowth: (metric?.dataCenterGrowth ?? 0) * 100,
    };
  });
  const segmentRows = dashboard.segments.map((row) => ({
    segment: row.segment,
    revenue: row.revenue,
    growth: (row.growth ?? 0) * 100,
    source: row.sourceStatus,
  }));
  const valuationRows = dashboard.valuation.methodCards.map((row) => ({
    method: row.label,
    value: row.value,
  }));

  return (
    <div className="space-y-6">
      <SectionCard
        title="NVIDIA AI Infrastructure Research Cockpit"
        description="Backend-owned SEC actuals, market prices, persisted valuations, and dated research-only AI infrastructure assumptions are separated before they reach the UI."
        badge={<DataQualityBadge badge={snapshotStatus === "online" ? "Actual" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Fair Value" value={usd(dashboard.valuation.recommendedFairValue ?? 0)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs price anchor`} />
          <ScoreBlock label="Data Center" value={usdb(dashboard.cockpit.dataCenterRevenue)} note="TTM or selected-window backend rows" />
          <ScoreBlock label="Gross Margin" value={pct(dashboard.cockpit.grossMargin)} note="ASP and product-cycle pressure point" />
          <ScoreBlock label="Product Cycle" value={dashboard.cockpit.productCyclePhase} note="Dated backend operating metric" />
        </div>
        {snapshotStatus === "offline" ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Historical data service is temporarily unavailable. Static NVDA dashboard sections still render.
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          {dashboard.insights.slice(0, 5).map((insight, index) => (
            <InsightPanel
              key={insight.title}
              icon={[<BrainCircuit className="h-5 w-5" />, <Cpu className="h-5 w-5" />, <TrendingUp className="h-5 w-5" />, <Network className="h-5 w-5" />, <Zap className="h-5 w-5" />][index]}
              title={insight.title}
              text={insight.text}
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

        <Tabs.Content value="cockpit" className="mt-6 space-y-6">
          <SectionCard title="Core Investment Questions" description="The cockpit translates buy-side NVDA diligence into falsifiable monitoring items tied to backend event data.">
            <div className="grid gap-4 lg:grid-cols-5">
              {dashboard.insights.slice(5).map((insight, index) => (
                <InsightPanel
                  key={insight.title}
                  icon={[<Database className="h-5 w-5" />, <ShieldAlert className="h-5 w-5" />, <Factory className="h-5 w-5" />, <Gamepad2 className="h-5 w-5" />, <AlertTriangle className="h-5 w-5" />][index]}
                  title={insight.title}
                  text={insight.text}
                />
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Backend Financial Snapshot" description="Consolidated actuals load from the NVDA SQLite backend; research-only segment rows are clearly tagged.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Selected Period" value={periodLabel(selectedPeriod)} note={selectedPeriod.sourceStatus} />
              <ScoreBlock label="Revenue" value={usdm(selectedPeriod.revenue)} note="SEC consolidated actual when backend is online" />
              <ScoreBlock label="Operating Income" value={usdm(selectedPeriod.operatingIncome)} note={pct(selectedPeriod.operatingMargin)} />
              <ScoreBlock label="FCF" value={selectedPeriod.freeCashFlow != null ? usdm(selectedPeriod.freeCashFlow) : "n/a"} note="OCF less capex" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment and Platform Economics" description="Data Center, Gaming, ProViz, Automotive, and OEM / Other rows come from the backend. Research-only tags are not official actuals.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Selected Segment Revenue">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-14} textAnchor="end" height={72} />
                    <YAxis tickFormatter={(value: number) => `$${value / 1000}bn`} />
                    <Tooltip formatter={(value: number) => usdm(value)} />
                    <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <DataTable
                headers={["Segment", "Revenue", "Growth", "Source"]}
                rows={segmentRows.map((row) => [row.segment, usdm(row.revenue), pct(row.growth / 100), row.source])}
              />
            </div>
          </SectionCard>
          <SectionCard title="Data Center and Gaming Trends" description="Backend operating metrics drive the trend chart. Missing official platform disclosures remain marked as research-only.">
            <ChartPanel title="Platform Revenue Trend">
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={trendRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tickFormatter={(value: number) => `$${value / 1000}bn`} />
                  <Tooltip formatter={(value: number) => usdm(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="dataCenterRevenue" dot={false} stroke="#2563eb" strokeWidth={2.4} name="Data Center" />
                  <Line type="monotone" dataKey="gamingRevenue" dot={false} stroke="#64748b" strokeWidth={2.2} name="Gaming" />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ai-cycle" className="mt-6 space-y-6">
          <SectionCard title="AI Accelerator Moat Framework" description="The NVDA dashboard centers the AI infrastructure debate rather than using a generic technology template.">
            <DataTable
              headers={["Question", "Backend Driver", "What Breaks It"]}
              rows={[
                ["Data Center growth durability", "Data Center growth, revenue, inventory, deferred revenue", "Hyperscaler digestion or poor GPU monetization"],
                ["GPU moat versus AMD and ASICs", "Accelerator moat score, SOTP multiple, custom ASIC risk", "Internal silicon shifts high-value training/inference workloads"],
                ["Blackwell / Rubin transition", "Product-cycle phase, transition risk, gross margin", "Ramp delays, lower ASPs, or margin reset"],
                ["Training versus inference", "Customer/end-market snapshot and networking attach", "Inference workloads commoditize hardware economics"],
                ["Networking profit pool", "Networking revenue and attach-rate assumption", "Ethernet/InfiniBand attach weakens or pricing compresses"],
                ["China controls", "China risk score and valuation haircut", "Controls expand or workaround products lose attractiveness"],
              ]}
            />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margins" className="mt-6 space-y-6">
          <SectionCard title="Gross Margin, Working Capital, and FCF" description="Margins and cash conversion are tracked from backend financial rows, with inventory as a product-cycle and supply-allocation tell.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Gross and Operating Margin Trend">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="grossMargin" dot={false} stroke="#2563eb" strokeWidth={2.4} name="Gross margin" />
                    <Line type="monotone" dataKey="operatingMargin" dot={false} stroke="#16a34a" strokeWidth={2.2} name="Operating margin" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Inventory and FCF Conversion">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis yAxisId="left" tickFormatter={(value: number) => `$${value / 1000}bn`} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                    <Tooltip formatter={(value: number, name: string) => name === "FCF conversion" ? `${value.toFixed(1)}%` : usdm(value)} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="inventory" dot={false} stroke="#64748b" strokeWidth={2.2} name="Inventory" />
                    <Line yAxisId="right" type="monotone" dataKey="fcfConversion" dot={false} stroke="#2563eb" strokeWidth={2.4} name="FCF conversion" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <NvdaHistoricalValuationPanel
            status={historicalStatus}
            error={historicalError}
            rows={historicalValuations}
            selectedEventId={selectedHistoricalEventId}
            onSelectEvent={setSelectedHistoricalEventId}
          />
          <NvdaBacktestPanel apiBase={apiBase} />
          <SectionCard title="NVDA Valuation Triangulation" description="DCF, FCF yield, P/E, EV/EBIT, and SOTP are blended around Data Center durability, networking attach, gross margin, and dated risk haircuts.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Valuation Method Bridge">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={valuationRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} angle={-14} textAnchor="end" height={72} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usd(value)} />
                    <Bar dataKey="value" fill="#2563eb" name="Fair value / share" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <DataTable headers={["Method", "Value"]} rows={valuationRows.map((row) => [row.method, usd(row.value)])} />
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
          <SectionCard title="Risk Red Team" description="Risks are framed as falsifiable monitoring items that can change valuation drivers.">
            <DataTable
              headers={["Risk", "Model Driver", "Kill Criterion", "Monitoring Trigger"]}
              rows={[
                ["Hyperscaler digestion", "Data Center growth", "Cloud capex slows while GPU lead times normalize", "CSP capex commentary, GPU utilization, cloud AI revenue"],
                ["Custom ASIC share loss", "Data Center multiple and custom ASIC risk", "Internal silicon captures training or inference economics", "Hyperscaler chip deployment and AMD MI-series traction"],
                ["Blackwell/Rubin transition risk", "Gross margin and transition risk", "Ramp delays or lower ASP mix reset margins", "Product lead times, allocation, gross margin guidance"],
                ["China export controls", "China risk haircut", "Additional controls block meaningful workaround products", "Export-rule updates and China revenue disclosures"],
                ["CoWoS / TSMC constraint", "Supply constraint benefit and inventory", "Packaging bottleneck caps shipment growth or forces expensive supply commitments", "TSMC capacity, inventory, purchase obligations"],
                ["Gaming normalization fades", "Gaming growth and support value", "Gaming becomes a cyclical drag rather than support", "Channel inventory, sell-through, GeForce launch cadence"],
              ]}
            />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function NvdaHistoricalValuationPanel({
  status,
  error,
  rows,
  selectedEventId,
  onSelectEvent,
}: {
  status: "loading" | "online" | "offline";
  error: string | null;
  rows: NvdaHistoricalValuationItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const displayRows = rows;
  const [visibleCount, setVisibleCount] = useState(16);
  const visibleRows = useMemo(() => displayRows.slice(Math.max(0, displayRows.length - visibleCount)), [displayRows, visibleCount]);
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? [...displayRows].reverse().find((row) => row.valuationRun) ?? displayRows[0] ?? null;
  const savedRuns = rows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows
    .filter((row) => row.valuationRun?.currentPrice != null || row.valuationRun?.fairValue != null)
    .map((row) => ({
      period: fiscalLabel(row.event, true),
      fiscalPeriod: row.event.fiscalPeriod ?? row.event.label ?? row.event.eventDate,
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
  const averageVisibleGap = visibleGapRows.length ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length : null;
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];

  return (
    <SectionCard
      title="NVDA Backend Historical Valuations"
      description="Persisted Base scenario valuation runs by NVDA reporting event from the SQLite backend. The browser does not recompute historical fair values from current assumptions."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns} note="Base runs persisted by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length || "n/a"} note="NVDA fiscal quarters, event-date anchored" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "n/a"} note="Backend persisted value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "n/a"} note="Fair value vs as-of price" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Historical data service is temporarily unavailable. Static NVDA dashboard sections still render.
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Visible history window</p>
                <p className="mt-1 text-xs text-slate-500">NVDA fiscal years end in late January, so event labels keep fiscal periods explicit.</p>
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
              min={Math.min(4, displayRows.length)}
              max={Math.max(4, displayRows.length)}
              value={Math.min(visibleCount, Math.max(4, displayRows.length))}
              onChange={(event) => setVisibleCount(Number(event.target.value))}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? fiscalLabel(visibleRows[0].event, true) : "n/a"} to ${visibleRows[visibleRows.length - 1] ? fiscalLabel(visibleRows[visibleRows.length - 1].event, true) : "n/a"}`} />
              <ScoreBlock label="Latest Gap" value={latestVisibleGap != null ? pct(latestVisibleGap) : "n/a"} note="Fair value minus price, as percent of price" />
              <ScoreBlock label="Average Gap" value={averageVisibleGap != null ? pct(averageVisibleGap) : "n/a"} note="Average model discount / premium" />
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
                  <span className="mt-1 block font-semibold">{fiscalLabel(row.event)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{row.event.fiscalPeriod ?? row.event.label ?? row.event.fiscalQuarter ?? row.event.eventType}</span>
                  <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold text-ink">{selected.event.title ?? "Selected NVDA reporting event"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
                  <ScoreBlock label="As-of Price" value={selected.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "n/a"} note="Nearest prior daily adjusted close" />
                  <ScoreBlock label="3Y Target" value={selected.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "n/a"} note="Persisted target price" />
                  <ScoreBlock label="3Y CAGR" value={selected.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "n/a"} note="Backend persisted" />
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
                        const first = payload?.[0]?.payload;
                        return `${label}${first?.fiscalPeriod ? ` (${first.fiscalPeriod})` : ""}${typeof first?.gapPct === "number" ? ` | Gap ${pct(first.gapPct)}` : ""}${first?.eventDate ? ` | ${first.eventDate}` : ""}`;
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
        <p className="mt-5 text-sm text-slate-600">Loading NVDA historical valuation runs from the backend.</p>
      ) : null}
    </SectionCard>
  );
}

function NvdaBacktestPanel({ apiBase }: { apiBase: string }) {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NvdaBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      let response = await fetch(`${apiBase}/api/nvda/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
      });
      if (!response.ok) {
        response = await fetch(`${apiBase}/api/stocks/nvda/backtests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, benchmarkTicker: "SPY" }),
        });
      }
      if (!response.ok) throw new Error(`NVDA backend returned ${response.status}`);
      const payload = (await response.json()) as NvdaBacktestResult;
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
      nvdaReturn: (row.nvdaBuyHold - 1) * 100,
    }));
  }, [result]);
  const metrics = result?.metrics ?? {};

  return (
    <SectionCard
      title="NVDA vs SPY Backtest"
      description="Select a date range and compare daily NVDA buy-and-hold performance against SPY from backend price history."
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
          <ChartPanel title="NVDA vs SPY Total Return">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="nvdaReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="NVDA" />
                <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="NVDA CAGR" value={metrics.nvdaBuyHold?.cagr != null ? pct(metrics.nvdaBuyHold.cagr) : "n/a"} note="Buy-and-hold" />
              <ScoreBlock label="SPY CAGR" value={metrics.spy?.cagr != null ? pct(metrics.spy.cagr) : "n/a"} note="Benchmark" />
              <ScoreBlock label="NVDA MDD" value={metrics.nvdaBuyHold?.maxDrawdown != null ? pct(metrics.nvdaBuyHold.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="SPY MDD" value={metrics.spy?.maxDrawdown != null ? pct(metrics.spy.maxDrawdown) : "n/a"} note="Maximum drawdown" />
              <ScoreBlock label="NVDA Sharpe" value={metrics.nvdaBuyHold?.sharpe != null ? metrics.nvdaBuyHold.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="SPY Sharpe" value={metrics.spy?.sharpe != null ? metrics.spy.sharpe.toFixed(2) : "n/a"} note="Zero risk-free rate" />
              <ScoreBlock label="NVDA Vol" value={metrics.nvdaBuyHold?.volatility != null ? pct(metrics.nvdaBuyHold.volatility) : "n/a"} note="Annualized daily vol" />
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
