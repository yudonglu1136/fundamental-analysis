import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StockDashboardProps } from "../types";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { EPSBridgeChart } from "../../components/shared/EPSBridgeChart";
import { FCFBridgeChart } from "../../components/shared/FCFBridgeChart";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { PeerReadThrough } from "../../components/shared/PeerReadThrough";
import { buildLsegDashboardData, defaultLsegValuationAssumptions, type LsegValuationAssumptions } from "./calculations";
import { lsegMockData } from "./data";

function loadSavedLsegValuationAssumptions() {
  if (typeof window === "undefined") return defaultLsegValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-LSEG");
  if (!saved) return defaultLsegValuationAssumptions;
  try {
    return { ...defaultLsegValuationAssumptions, ...(JSON.parse(saved) as Partial<LsegValuationAssumptions>) };
  } catch {
    return defaultLsegValuationAssumptions;
  }
}

export function LsegDashboard({ module, scenario, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [segmentView, setSegmentView] = useState<"revenue" | "profit" | "margin" | "contribution">("revenue");
  const [valuationAssumptions, setValuationAssumptions] = useState<LsegValuationAssumptions>(loadSavedLsegValuationAssumptions);
  const dashboard = useMemo(() => buildLsegDashboardData(lsegMockData, period, scenario), [period, scenario]);
  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as LsegValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  const segmentChart = dashboard.segments.reduce<Array<Record<string, string | number>>>((acc, row) => {
    const existing = acc.find((item) => item.period === row.periodId);
    const value = segmentView === "revenue" ? row.revenue : segmentView === "profit" ? row.operatingProfit : segmentView === "margin" ? row.margin : row.contributionToGrowth;
    if (existing) {
      existing[row.segment] = value;
    } else {
      acc.push({ period: row.periodId, [row.segment]: value });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard title="LSEG Dashboard" description={module.description} badge={<DataQualityBadge badge="Actual" />}>
        <div className="grid gap-4 lg:grid-cols-3">
          {dashboard.readThrough.map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{item.title}</p>
                <DataQualityBadge badge={item.badge} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((metric) => (
          <MetricCard key={metric.key} metric={metric} currency="GBP" />
        ))}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger key={item.value} value={item.value} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <SectionCard title="Segment Performance" description="Revenue, profit, margin, and contribution across LSEG's business lines.">
            <div className="mb-4 flex flex-wrap gap-2">
              {["revenue", "profit", "margin", "contribution"].map((view) => (
                <button key={view} type="button" onClick={() => setSegmentView(view as typeof segmentView)} className={`rounded-xl px-4 py-2 text-sm font-medium ${segmentView === view ? "bg-ink text-white" : "bg-slate-100 text-slate-600"}`}>
                  {view}
                </button>
              ))}
            </div>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {["Data & Analytics", "FTSE Russell", "Risk Intelligence", "Capital Markets", "Post Trade", "Other"].map((segment, index) => (
                    <Bar key={segment} dataKey={segment} stackId={segmentView === "margin" ? undefined : "stack"} fill={["#21486f", "#0f8f6f", "#d97706", "#7c3aed", "#0ea5e9", "#94a3b8"][index]} radius={[8, 8, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <SectionCard title="Subscription Quality" description="ASV, retention, and recurring revenue quality.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.subscriptions}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="segment" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="asvGrowth" stroke="#21486f" strokeWidth={3} />
                  <Line type="monotone" dataKey="subscriptionRevenueGrowth" stroke="#0f8f6f" strokeWidth={3} />
                  <Line type="monotone" dataKey="retentionRate" stroke="#d97706" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="data-quality" className="mt-6">
          <SectionCard title="Data Status" description="Validation and data reliability.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Data source</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.sourceType}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Last updated</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.lastUpdated}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Warnings</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.validationWarnings.length}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Valuation reliable</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.valuationReliable ? "Yes" : "Needs review"}</p></div>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="eps-quality" className="mt-6">
          <SectionCard title="EPS Bridge" description="Operating, synergy, post-trade, buyback, and below-the-line EPS attribution.">
            <EPSBridgeChart rows={dashboard.epsBridge.map((row) => ({ label: row.label, value: row.value, type: row.type === "start" ? "base" : row.type === "end" ? "total" : row.value >= 0 ? "positive" : "negative" }))} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="fcf" className="mt-6">
          <SectionCard title="FCF Bridge" description="Cash conversion and equity free cash flow profile.">
            <FCFBridgeChart data={dashboard.fcfSeries.map((row) => ({ period: row.periodId, fcf: row.equityFcf, cashConversion: row.cashConversion, epsGrowth: row.epsGrowth }))} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="synergies" className="mt-6">
          <SectionCard title="Refinitiv Synergy Tracker" description="Cost and revenue synergies plus integration remaining.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.synergies}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="periodId" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="costDelivered" fill="#21486f" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="revenueDelivered" fill="#0f8f6f" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 rounded-3xl bg-slate-50 p-5">
              <p className="font-semibold text-ink">Post Trade / SwapClear Economics</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Base retained economics: {dashboard.postTrade.baseRetainedEconomics}. Volume growth: {(dashboard.postTrade.baseVolumeGrowth * 100).toFixed(1)}%. Volatility sensitivity: {(dashboard.postTrade.baseRatesVolatility * 100).toFixed(1)}%.
              </p>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="peers" className="mt-6">
          <PeerReadThrough rows={dashboard.peerRows} title="LSEG Peer Read-Through" description="Bloomberg, FactSet, S&P Global, MSCI, CME, ICE, Deutsche Börse, Tradeweb, and MarketAxess." />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6">
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={lsegMockData}
            scenario={scenario}
            currency="GBP"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
