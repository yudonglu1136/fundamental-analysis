import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { formatValue } from "../../utils/formatting";
import type { StockDashboardProps } from "../types";
import { defaultMetaAssumptions, getMetaScenarioDefaults, matchMetaScenario, type MetaAssumptions } from "./assumptions";
import { buildMetaDashboardData } from "./calculations";
import { MetaAssumptionsPanel } from "./components/MetaAssumptionsPanel";
import { MetaSignalBadge } from "./components/MetaSignalBadge";
import { MetaStatusBanner } from "./components/MetaStatusBanner";
import { metaData } from "./data";

function loadSavedMetaValuationAssumptions() {
  if (typeof window === "undefined") return defaultMetaAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-META");
  if (!saved) return defaultMetaAssumptions;
  try {
    return { ...defaultMetaAssumptions, ...(JSON.parse(saved) as Partial<MetaAssumptions>) };
  } catch {
    return defaultMetaAssumptions;
  }
}

function WaterfallCards({
  rows,
  currency = "USD",
}: {
  rows: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  currency?: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">{row.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${row.type === "negative" ? "text-rose-600" : "text-ink"}`}>
            {formatValue(row.value, "currency", currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ScoreCards({
  items,
  currency = "USD",
}: {
  items: Array<{ label: string; value: number; format: "currency" | "percent" | "number" | "multiple"; detail: string; badge: "Actual" | "Assumption" | "Derived" | "Placeholder" | "Needs Review" }>;
  currency?: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">{item.label}</p>
            <DataQualityBadge badge={item.badge} />
          </div>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatValue(item.value, item.format, currency)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function MetaDashboard({ module, scenario, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [valuationAssumptions, setValuationAssumptions] = useState<MetaAssumptions>(loadSavedMetaValuationAssumptions);
  const dashboard = useMemo(
    () => buildMetaDashboardData(metaData, valuationAssumptions, period || metaData.currentPeriodId),
    [period, valuationAssumptions],
  );
  const activeScenario = matchMetaScenario(valuationAssumptions);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions((current) => ({ ...current, ...next }));
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  const engagementSeries = dashboard.engagementTrend.map((row) => ({
    period: row.period,
    timeSpent: row.timeSpent,
    reelsWatchTime: row.reelsWatchTime,
    monetizationGap: row.monetizationGap * 100,
    advantagePlusAdoption: row.advantagePlusAdoption * 100,
  }));

  const realityLabsSeries = dashboard.realityLabsTrend.map((row) => ({
    period: row.period,
    revenue: row.revenue,
    operatingLoss: row.operatingLoss,
  }));

  const whatsappSeries = dashboard.whatsappTrend.map((row) => ({
    period: row.period,
    revenue: row.revenue,
    optionalityValue: row.optionalityValue / 10,
    businessMessagingRevenue: row.businessMessagingRevenue,
  }));

  const scenarioBars = dashboard.scenarioLab.cards.map((item) => ({
    scenario: item.scenario,
    fairValue: item.fairValue,
    aiAdRoic: item.aiAdRoic * 100,
    fcfMargin: item.fcfMargin * 100,
    uplift: item.totalUpliftRate * 100,
  }));

  return (
    <div className="space-y-6">
      <SectionCard title="Meta Dashboard" description={module.description} badge={<DataQualityBadge badge="Actual" />}>
        <MetaStatusBanner title={dashboard.statusBanner.title} detail={dashboard.statusBanner.detail} signal={dashboard.statusBanner.signal} />
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {dashboard.investmentReadThrough.map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{item.title}</p>
                <MetaSignalBadge signal={item.signal} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((metric) => (
          <MetricCard key={metric.key} metric={metric} currency="USD" />
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
          <SectionCard title="AI Ad Revenue Bridge" description="The core question is whether AI is lifting ad profit through CPM, conversion, and ROAS rather than just driving engagement.">
            <WaterfallCards rows={dashboard.adRevenueBridge} />
          </SectionCard>
          <SectionCard title="Engagement and Reels" description="Recommendation quality should raise both time spent and monetization quality if the AI stack is working.">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="timeSpent" stroke="#21486f" strokeWidth={3} />
                  <Line type="monotone" dataKey="reelsWatchTime" stroke="#0f8f6f" strokeWidth={3} />
                  <Line type="monotone" dataKey="monetizationGap" stroke="#d97706" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ads-engine" className="mt-6 space-y-6">
          <SectionCard title="Ads Engine" description="CPM, conversion, and ROAS should explain why ad revenue quality is improving.">
            <ScoreCards items={dashboard.adsEngineCards} />
          </SectionCard>
          <SectionCard title="Ad Revenue Composition" description="This bridge shows how impression growth, pricing, and AI revenue uplift combine to produce the current revenue run-rate.">
            <WaterfallCards rows={dashboard.adRevenueBridge} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ai-ad-stack" className="mt-6 space-y-6">
          <SectionCard title="AI Ad Stack" description="Serving cost, inference cost, and AI ad stack opex determine whether ad uplift is profit accretive.">
            <ScoreCards items={dashboard.aiAdStackCards} />
          </SectionCard>
          <SectionCard title="AI Ad Profit Bridge" description="AI monetization must more than offset inference and stack costs to create durable value.">
            <WaterfallCards rows={dashboard.aiAdBridge} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="engagement-reels" className="mt-6 space-y-6">
          <SectionCard title="Engagement and Recommendation Economics" description="Time spent, Reels watch time, and Advantage+ adoption are the demand-side proof points for AI monetization.">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="timeSpent" stroke="#21486f" strokeWidth={3} />
                  <Line type="monotone" dataKey="reelsWatchTime" stroke="#0f8f6f" strokeWidth={3} />
                  <Line type="monotone" dataKey="advantagePlusAdoption" stroke="#7c3aed" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capex-fcf" className="mt-6 space-y-6">
          <SectionCard title="CapEx and FCF" description="The institutional question is whether AI monetization is outgrowing GPU, data center, and inference burden.">
            <ScoreCards items={dashboard.capexCards} />
          </SectionCard>
          <SectionCard title="FCF After AI Burden" description="Reported FCF is not enough. We also show a version that charges AI infrastructure burden against incremental AI profit.">
            <WaterfallCards rows={dashboard.capexFcfBridge} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ai-ad-roic" className="mt-6 space-y-6">
          <SectionCard title="AI Ad ROIC" description="AI Ad ROIC is incremental after-tax ad profit divided by AI invested capital, not a cloud ROIC or generic AI narrative score.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Selected period read-through</p>
                <p className="mt-2 text-xl font-semibold text-ink">{dashboard.selectedRow.scenarioReadThrough}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">AI Ad ROIC</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatValue(dashboard.selectedRow.aiAdRoic, "percent", "USD")}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">AI Payback</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatValue(dashboard.selectedRow.aiPaybackYears, "number", "USD")}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">AI Revenue / Capital</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatValue(dashboard.selectedRow.aiRevenueToCapital, "number", "USD")}</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Scenario Comparison" description="Bear, Base, and Bull each recalculate uplift, ROIC, FCF margin, and fair value independently.">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="scenario" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="fairValue" fill="#21486f" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="aiAdRoic" fill="#0f8f6f" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="reality-labs" className="mt-6 space-y-6">
          <SectionCard title="Reality Labs Trend" description="Reality Labs remains visible as a valuation drag until losses improve materially.">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={realityLabsSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="operatingLoss" fill="#dc2626" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="whatsapp" className="mt-6 space-y-6">
          <SectionCard title="WhatsApp Optionality" description="WhatsApp optionality should be visible, but it should not overwhelm the core AI ad and FCF debate.">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={whatsappSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="businessMessagingRevenue" stroke="#21486f" strokeWidth={3} />
                  <Line type="monotone" dataKey="revenue" stroke="#0f8f6f" strokeWidth={3} />
                  <Line type="monotone" dataKey="optionalityValue" stroke="#d97706" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6">
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={metaData}
            scenario={scenario}
            currency="USD"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="scenario-lab" className="mt-6 space-y-6">
          <MetaAssumptionsPanel
            values={valuationAssumptions}
            activeScenario={activeScenario}
            onChange={(key, value) => handleValuationValuesChange({ ...valuationAssumptions, [key]: value })}
            onReset={(target) => {
              if (target === "Consensus") {
                handleValuationValuesChange(defaultMetaAssumptions);
                return;
              }
              handleValuationValuesChange(getMetaScenarioDefaults(target));
            }}
          />
          <SectionCard title="Independent Scenario Cards" description="These cards are recalculated independently and should show visibly different AI economics, FCF durability, and fair value by case.">
            <div className="grid gap-4 lg:grid-cols-3">
              {dashboard.scenarioLab.cards.map((item) => (
                <div key={item.scenario} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-ink">{item.scenario}</p>
                    <MetaSignalBadge signal={item.scenario === "Bull" ? "Positive" : item.scenario === "Bear" ? "Compute Constrained" : "Neutral"} />
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>Fair value: <span className="font-semibold text-ink">{formatValue(item.fairValue, "currency", "USD")}</span></p>
                    <p>AI Ad ROIC: <span className="font-semibold text-ink">{formatValue(item.aiAdRoic, "percent", "USD")}</span></p>
                    <p>AI-adjusted FCF margin: <span className="font-semibold text-ink">{formatValue(item.fcfMargin, "percent", "USD")}</span></p>
                    <p>Total AI uplift: <span className="font-semibold text-ink">{formatValue(item.totalUpliftRate, "percent", "USD")}</span></p>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Scenario Fair Value" description="Bear, Base, and Bull should diverge as CPM, conversion, engagement, and AI burden assumptions change.">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="scenario" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="fairValue" radius={[8, 8, 0, 0]}>
                    {scenarioBars.map((entry) => (
                      <Cell key={entry.scenario} fill={entry.scenario === "Bear" ? "#dc2626" : entry.scenario === "Base" ? "#21486f" : "#0f8f6f"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
