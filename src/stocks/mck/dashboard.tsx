import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import type { StockDashboardProps } from "../types";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { EPSBridgeChart } from "../../components/shared/EPSBridgeChart";
import { FCFBridgeChart } from "../../components/shared/FCFBridgeChart";
import { PeerReadThrough } from "../../components/shared/PeerReadThrough";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { parseMckExcelFile, parseMckWorkbookSnapshot, buildMckDashboardData, buildSegmentChart, defaultMckAssumptions, type MckAssumptions } from "./calculations";
import { TooltipInfo } from "../../components/shared/TooltipInfo";

function loadSavedMckAssumptions() {
  if (typeof window === "undefined") return defaultMckAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-MCK");
  if (!saved) return defaultMckAssumptions;
  try {
    return { ...defaultMckAssumptions, ...(JSON.parse(saved) as Partial<MckAssumptions>) };
  } catch {
    return defaultMckAssumptions;
  }
}

export function MckDashboard({ module, scenario, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [assumptions, setAssumptions] = useState<MckAssumptions>(loadSavedMckAssumptions);
  const [modelData, setModelData] = useState(() => parseMckWorkbookSnapshot());
  const [segmentView, setSegmentView] = useState<"revenue" | "profit" | "margin" | "contribution">("revenue");

  const dashboard = useMemo(() => buildMckDashboardData(modelData, assumptions, scenario), [modelData, assumptions, scenario]);
  const segmentChart = useMemo(() => buildSegmentChart(modelData, period, segmentView), [modelData, period, segmentView]);
  const fcfSeries = dashboard.summary.map((metric, index) => ({ period: dashboard.coreEpsSeries[index]?.period ?? `P${index + 1}`, fcf: assumptions.fcfPerShare * (index + 1), cashConversion: 0.92 + index * 0.01, epsGrowth: dashboard.coreEpsSeries[index] ? dashboard.coreEpsSeries[index].adjustedEps / dashboard.coreEpsSeries[0].adjustedEps - 1 : 0 }));
  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setAssumptions(next as MckAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  async function handleUpload(file: File) {
    const buffer = await file.arrayBuffer();
    setModelData(parseMckExcelFile(buffer));
    onDataSourceChange("excel");
  }

  return (
    <div className="space-y-6">
      <SectionCard title="McKesson Dashboard" description={module.description} badge={<DataQualityBadge badge="Actual" />}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm">
            Upload Excel
            <input type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} />
          </label>
          <p className="text-sm text-slate-500">Current period: {period}</p>
          <p className="text-sm text-slate-500">Last updated: {dashboard.dataStatus.lastUpdated}</p>
        </div>
        {dashboard.dataStatus.validationWarnings.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">EPS or valuation may be distorted by placeholder or abnormal input data.</div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((metric) => (
          <MetricCard key={metric.key} metric={metric} currency="USD" />
        ))}
      </div>

      <SectionCard title="Data Status" description="Source quality, missing fields, and validation reliability.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Data source</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.sourceType}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Missing fields</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.missingFields.length}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Validation warnings</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.validationWarnings.length}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Valuation reliable</p><p className="mt-1 text-2xl font-semibold text-ink">{dashboard.dataStatus.valuationReliable ? "Yes" : "Needs review"}</p></div>
        </div>
      </SectionCard>

      <SectionCard title="Investment Read-Through" description="Decision-oriented takeaways for MCK.">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {dashboard.investmentReadThrough.map((item) => (
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

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger key={item.value} value={item.value} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <SectionCard title="Segment Performance" description="Revenue, operating profit, margin, and contribution by segment.">
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
                  <XAxis dataKey="quarter" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {["U.S. Pharmaceutical", "Prescription Technology Solutions", "Medical-Surgical Solutions", "International / Other"].map((segment, index) => (
                    <Bar key={segment} dataKey={segment} stackId={segmentView === "margin" ? undefined : "segments"} fill={["#21486f", "#0f8f6f", "#d97706", "#7c3aed"][index]} radius={[8, 8, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="data-quality" className="mt-6">
          <SectionCard title="Data Quality" description="Validation checks that determine whether MCK outputs are decision-ready.">
            <div className="space-y-3">
              {dashboard.dataStatus.validationWarnings.map((warning) => (
                <div key={warning.id} className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <p className="font-medium text-rose-800">{warning.title}</p>
                  <p className="text-sm text-rose-700">{warning.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="eps-quality" className="mt-6">
          <SectionCard title="EPS Quality Bridge" description="Prior EPS to current EPS with operating, below-the-line, one-off, and buyback attribution." badge={<TooltipInfo text="High quality if operating contribution dominates and one-offs are small." />}>
            <EPSBridgeChart rows={dashboard.epsBridge.rows} />
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard metric={{ key: "op", label: "% from Operating Profit", value: dashboard.epsBridge.mix.operating, format: "percent", description: "", badge: "Derived" }} />
              <MetricCard metric={{ key: "bb", label: "% from Buybacks", value: dashboard.epsBridge.mix.buybacks, format: "percent", description: "", badge: "Derived" }} />
              <MetricCard metric={{ key: "bl", label: "% from Below-the-Line", value: dashboard.epsBridge.mix.belowLine, format: "percent", description: "", badge: "Derived" }} />
              <MetricCard metric={{ key: "oo", label: "% from One-Offs", value: dashboard.epsBridge.mix.oneOff, format: "percent", description: "", badge: "Derived" }} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="core-eps" className="mt-6">
          <SectionCard title="Core EPS vs Adjusted EPS" description="Sustainability view after removing one-offs and buyback support.">
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.coreEpsSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="adjustedEps" stroke="#21486f" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="coreEps" stroke="#0f8f6f" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="epsExBuyback" stroke="#d97706" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="coreExBuyback" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="buybacks" className="mt-6">
          <SectionCard title="Buyback Efficiency" description={dashboard.buybacks.detail}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "yield", label: "Buyback Yield", value: dashboard.buybacks.latest.buybackYield, format: "percent", description: "", badge: "Derived" }} />
              <MetricCard metric={{ key: "price", label: "Average Repurchase Price", value: dashboard.buybacks.latest.avgRepurchasePrice, format: "currency", description: "", badge: "Actual" }} currency="USD" />
              <MetricCard metric={{ key: "shares", label: "Implied Shares Repurchased", value: dashboard.buybacks.latest.impliedSharesRepurchased, format: "number", description: "", badge: "Derived" }} />
              <MetricCard metric={{ key: "eps-acc", label: "EPS Accretion", value: dashboard.buybacks.latest.epsAccretion, format: "currency", description: "", badge: "Derived" }} currency="USD" />
              <MetricCard metric={{ key: "auth", label: "Remaining Authorization", value: dashboard.buybacks.latest.authorizationRemaining, format: "currency", description: "", badge: "Assumption" }} currency="USD" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="glp1" className="mt-6">
          <SectionCard title="GLP-1 Margin Dilution" description={dashboard.glp1.detail} badge={<DataQualityBadge badge={dashboard.glp1.sourceBadge} />}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "g1", label: "Revenue Growth incl. GLP-1", value: dashboard.glp1.current.revenueGrowthWithGlp1, format: "percent", description: "", badge: "Assumption" }} />
              <MetricCard metric={{ key: "g2", label: "Revenue Growth ex. GLP-1", value: dashboard.glp1.current.revenueGrowthWithoutGlp1, format: "percent", description: "", badge: "Assumption" }} />
              <MetricCard metric={{ key: "g3", label: "GLP-1 Profit Contribution", value: dashboard.glp1.current.operatingProfitContribution, format: "currency", description: "", badge: "Assumption" }} currency="USD" />
              <MetricCard metric={{ key: "g4", label: "Margin Dilution", value: dashboard.glp1.current.marginDilution, format: "percent", description: "", badge: "Assumption" }} />
              <MetricCard metric={{ key: "g5", label: "Revenue Quality Score", value: dashboard.glp1.current.revenueQualityScore, format: "number", description: "", badge: "Derived" }} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="specialty" className="mt-6">
          <SectionCard title="Specialty / Oncology Momentum" description={dashboard.specialty.detail}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.specialty.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="quarter" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="specialtyRevenueGrowth" stroke="#21486f" strokeWidth={3} />
                  <Line type="monotone" dataKey="oncologyRevenueGrowth" stroke="#0f8f6f" strokeWidth={3} />
                  <Line type="monotone" dataKey="specialtyPercentOfUsPharmaProfit" stroke="#d97706" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="peers" className="mt-6">
          <PeerReadThrough rows={dashboard.peerRows} title="Peer Read-Through" description="COR, CAH, CVS, UNH, and ELV signals for MCK." />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6">
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={modelData}
            scenario={scenario}
            currency="USD"
            values={assumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>
      </Tabs.Root>

      <SectionCard title="FCF Lens" description="Simple cash-flow overlay to keep valuation grounded.">
        <FCFBridgeChart data={fcfSeries} />
      </SectionCard>
    </div>
  );
}
