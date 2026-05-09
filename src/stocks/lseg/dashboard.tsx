import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { buildLsegDashboardData, calculateLsegValuation, defaultLsegValuationAssumptions, type LsegValuationAssumptions } from "./calculations";
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

  const segmentChart = dashboard.segmentSeries.reduce<Array<Record<string, string | number>>>((acc, row) => {
    const existing = acc.find((item) => item.period === row.periodId);
    const value = segmentView === "revenue" ? row.revenue : segmentView === "profit" ? row.operatingProfit : segmentView === "margin" ? row.margin : row.contributionToGrowth;
    if (existing) {
      existing[row.segment] = value;
    } else {
      acc.push({ period: row.periodId, [row.segment]: value });
    }
    return acc;
  }, []);

  const moatSeries = dashboard.engines.platformGraph.series.map((row) => ({
    period: row.periodId,
    workflowLockInScore: row.workflowLockInScore,
    graphDensity: row.graphDensity * 100,
    pricingPowerScore: row.pricingPowerScore,
  }));
  const recurringSeries = dashboard.engines.recurringRevenue.series.map((row) => ({
    period: row.periodId,
    recurringRevenuePct: row.recurringRevenuePct * 100,
    subscriptionRevenuePct: row.subscriptionRevenuePct * 100,
    recurringRevenueQualityScore: row.recurringRevenueQualityScore,
  }));
  const roicSeries = dashboard.engines.roic.series.map((row) => ({
    period: row.periodId,
    blendedPlatformRoic: row.blendedPlatformRoic * 100,
  }));
  const infrastructureSeries = dashboard.engines.postTrade.series.map((row) => ({
    period: row.periodId,
    postTradeMoatScore: row.postTradeMoatScore,
    clearedVolumeGrowth: row.clearedVolumeGrowth * 100,
    incrementalMargin: row.incrementalMargin * 100,
  }));
  const valuationConfig = useMemo(
    () => ({
      ...module.valuationConfig,
      calculateValuation: (assumptions: Record<string, number>, data: unknown, activeScenario = scenario) =>
        calculateLsegValuation(
          data as typeof lsegMockData,
          period,
          activeScenario,
          { ...defaultLsegValuationAssumptions, ...(assumptions as Partial<LsegValuationAssumptions>) },
        ),
    }),
    [module.valuationConfig, period, scenario],
  );
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
          <SectionCard title="Why this matters" description="The core question is whether LSEG is becoming harder to replace as a market operating system, not just whether EPS is rising.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightCard title="Workflow dependency" body={dashboard.engines.platformGraph.interpretation} badge="Derived" />
              <InsightCard title="Recurring durability" body={dashboard.engines.recurringRevenue.interpretation} badge="Actual" />
              <InsightCard title="Moat compounding" body={dashboard.engines.moat.conclusion} badge="Derived" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="workflow-moat" className="mt-6 space-y-6">
          <SectionCard title="Workflow Moat" description="Graph density, workflow penetration, switching costs, and pricing power should deepen together if LSEG is becoming more irreplaceable.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Workflow Lock-In" value={dashboard.engines.platformGraph.current.workflowLockInScore.toFixed(0)} subtext="Products per client and dependency depth" />
              <ScoreCard label="Graph Density" value={`${(dashboard.engines.platformGraph.current.graphDensity * 100).toFixed(0)}%`} subtext="Connected workflow nodes across the stack" />
              <ScoreCard label="Switching Cost" value={dashboard.engines.platformGraph.current.switchingCostScore.toFixed(0)} subtext="Friction to replace the platform" />
              <ScoreCard label="Pricing Power" value={dashboard.engines.platformGraph.current.pricingPowerScore.toFixed(0)} subtext="Bundle leverage and monetization room" />
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <ChartPanel title="Workflow lock-in trend">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={moatSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="workflowLockInScore" stroke="#21486f" strokeWidth={3} />
                    <Line type="monotone" dataKey="pricingPowerScore" stroke="#0f8f6f" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Financial workflow graph density">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={moatSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="graphDensity" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="recurring-economics" className="mt-6 space-y-6">
          <SectionCard title="Recurring Economics" description="Recurring revenue quality should improve as workflow depth and pricing realization improve, not just because the company says more revenue is recurring.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Recurring Quality" value={dashboard.engines.recurringRevenue.current.recurringRevenueQualityScore.toFixed(0)} subtext="Retention, pricing, duration, and FCF durability" />
              <ScoreCard label="Recurring Revenue %" value={`${(dashboard.engines.recurringRevenue.current.recurringRevenuePct * 100).toFixed(1)}%`} subtext="Revenue under durable contracts or subscriptions" />
              <ScoreCard label="Net Retention" value={`${(dashboard.engines.recurringRevenue.current.netRetention * 100).toFixed(1)}%`} subtext="Expansion revenue inside the client base" />
              <ScoreCard label="Avg Contract Duration" value={`${dashboard.engines.recurringRevenue.current.averageContractDuration.toFixed(1)}y`} subtext="Longer duration generally means higher durability" />
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <ChartPanel title="Recurring mix and quality">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={recurringSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="recurringRevenuePct" stroke="#21486f" strokeWidth={3} />
                    <Line type="monotone" dataKey="subscriptionRevenuePct" stroke="#0f8f6f" strokeWidth={3} />
                    <Line type="monotone" dataKey="recurringRevenueQualityScore" stroke="#d97706" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <InsightPanel title="Why this matters" text={dashboard.engines.recurringRevenue.interpretation} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="platform-roic" className="mt-6 space-y-6">
          <SectionCard title="Platform ROIC" description="The durable question is whether new dollars invested into workflow, data, and clearing are earning better returns over time.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreCard label="Blended Platform ROIC" value={`${(dashboard.engines.roic.current.blendedPlatformRoic * 100).toFixed(1)}%`} subtext="Combined return on new platform investment" />
              <ScoreCard label="Cost Synergy ROIC" value={`${(dashboard.engines.roic.current.costSynergyRoic * 100).toFixed(1)}%`} subtext="Return from cost-out reinvestment" />
              <ScoreCard label="Revenue Synergy ROIC" value={`${(dashboard.engines.roic.current.revenueSynergyRoic * 100).toFixed(1)}%`} subtext="Return from cross-sell and workflow monetization" />
              <ScoreCard label="Clearing ROIC" value={`${(dashboard.engines.roic.current.clearingRoic * 100).toFixed(1)}%`} subtext="Incremental return from Post Trade infrastructure" />
              <ScoreCard label="Moat Compounding" value={dashboard.engines.roic.current.moatCompoundingScore.toFixed(0)} subtext="Is capital creating a stronger moat?" />
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <ChartPanel title="Blended platform ROIC trend">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={roicSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="blendedPlatformRoic" stroke="#21486f" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <InsightPanel title="Why this matters" text={dashboard.engines.roic.interpretation} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="infrastructure-economics" className="mt-6 space-y-6">
          <SectionCard title="Infrastructure Economics" description="Post Trade should influence moat, pricing power, recurring economics, ROIC, and valuation rather than sitting in a side note.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreCard label="Post Trade Moat" value={dashboard.engines.postTrade.current.postTradeMoatScore.toFixed(0)} subtext="Network density, regulation, and collateral utility" />
              <ScoreCard label="Retained Economics" value={dashboard.engines.postTrade.current.retainedEconomics.toFixed(0)} subtext="Economics kept by LSEG after member sharing" />
              <ScoreCard label="Clearing Concentration" value={dashboard.engines.postTrade.current.clearingConcentrationScore.toFixed(0)} subtext="Broader participation usually means a stronger moat" />
              <ScoreCard label="Member Network Density" value={`${(dashboard.engines.postTrade.current.memberNetworkDensity * 100).toFixed(0)}%`} subtext="How interconnected the clearing network is" />
              <ScoreCard label="Operating Leverage" value={`${(dashboard.engines.postTrade.current.operatingLeverage * 100).toFixed(1)}%`} subtext="Incremental margin from clearing activity" />
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <ChartPanel title="Post Trade moat and volume trend">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={infrastructureSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="postTradeMoatScore" stroke="#21486f" strokeWidth={3} />
                    <Line type="monotone" dataKey="clearedVolumeGrowth" stroke="#0ea5e9" strokeWidth={3} />
                    <Line type="monotone" dataKey="incrementalMargin" stroke="#0f8f6f" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <InsightPanel title="Why this matters" text={dashboard.engines.postTrade.interpretation} />
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
            <div className="mt-6 space-y-3">
              {dashboard.dataStatus.validationWarnings.map((warning) => (
                <div key={warning.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{warning.title}</p>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{warning.severity}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{warning.detail}</p>
                </div>
              ))}
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
          <SectionCard title="Refinitiv Synergy Tracker" description="Cost, revenue, workflow, and infrastructure synergies separated so the same economics are not monetized multiple times.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Revenue Flywheel" value={dashboard.engines.synergy.current.revenueSynergyFlywheelScore.toFixed(0)} subtext="Cross-sell and bundle monetization" />
              <ScoreCard label="Platform / Network" value={dashboard.engines.synergy.current.platformNetworkSynergyScore.toFixed(0)} subtext="Workflow plus clearing reinforcement" />
              <ScoreCard label="Infrastructure Synergy" value={dashboard.engines.synergy.current.infrastructureSynergyScore.toFixed(0)} subtext="Clearing and operating stack reinforcement" />
              <ScoreCard label="Cost Exhaustion Risk" value={dashboard.engines.synergy.current.costSynergyExhaustionRisk.toFixed(0)} subtext="Risk that cost takeout matures before structural drivers take over" />
            </div>
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
              <p className="mt-3 text-sm leading-6 text-slate-600">{dashboard.engines.synergy.interpretation}</p>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="peers" className="mt-6">
          <PeerReadThrough rows={dashboard.peerRows} title="LSEG Peer Read-Through" description="Bloomberg, FactSet, S&P Global, MSCI, CME, ICE, Deutsche Börse, Tradeweb, and MarketAxess." />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6">
          <div className="space-y-6">
            <SectionCard title="Valuation guardrails" description="Independent valuation methods only work if moat, clearing, and synergy economics are not counted three times.">
              <div className="grid gap-4 lg:grid-cols-3">
                <InsightCard title="Method independence" body="P/E, FCF yield, DCF, and SOTP now run as separate lenses. Validation warnings flag overlap risk when the same economics appear in more than one layer." badge="Derived" />
                <InsightCard title="SOTP quality overlay" body={dashboard.sotp.overlay} badge="Derived" />
                <InsightCard title="Selected scenario" body={dashboard.valuation.customSummary ?? "Scenario summary unavailable."} badge="Assumption" />
              </div>
            </SectionCard>
            <InteractiveValuationDashboard
              ticker={module.ticker}
              config={valuationConfig}
              data={lsegMockData}
              scenario={scenario}
              currency="GBP"
              values={valuationAssumptions}
              onValuesChange={handleValuationValuesChange}
            />
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function ScoreCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{subtext}</p>
    </div>
  );
}

function InsightCard({ title, body, badge }: { title: string; body: string; badge: "Actual" | "Assumption" | "Derived" | "Placeholder" | "Needs Review" }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{title}</p>
        <DataQualityBadge badge={badge} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function InsightPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="mb-4 font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
