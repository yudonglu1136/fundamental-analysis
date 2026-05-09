import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import type { StockDashboardProps } from "../types";
import { buildMetaDashboardData } from "./calculations";
import { defaultMetaAssumptions, type MetaAssumptions } from "./assumptions";
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

export function MetaDashboard({ module, scenario, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [valuationAssumptions, setValuationAssumptions] = useState<MetaAssumptions>(loadSavedMetaValuationAssumptions);
  const dashboard = useMemo(
    () => buildMetaDashboardData(metaData, valuationAssumptions, period || metaData.currentPeriodId),
    [period, valuationAssumptions],
  );

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
  }));

  const realityLabsSeries = dashboard.realityLabsTrend.map((row) => ({
    period: row.period,
    revenue: row.revenue,
    operatingLoss: row.operatingLoss,
  }));

  return (
    <div className="space-y-6">
      <SectionCard title="Meta Dashboard" description={module.description} badge={<DataQualityBadge badge="Actual" />}>
        <div className="grid gap-4 lg:grid-cols-4">
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
          <SectionCard title="AI Ad Revenue Bridge" description="The ad engine should show whether AI is adding real monetization, not just engagement.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dashboard.adRevenueBridge.map((row) => (
                <div key={row.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{row.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-ink">{row.value.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Engagement and Reels" description="User engagement and monetization gap should move together if AI recommendations are monetizing correctly.">
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

        <Tabs.Content value="reality-labs" className="mt-6">
          <SectionCard title="Reality Labs Trend" description="Reality Labs should remain visible as a drag until the economics improve materially.">
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

        {module.tabs
          .filter((item) => !["overview", "reality-labs", "valuation"].includes(item.value))
          .map((item) => (
            <Tabs.Content key={item.value} value={item.value} className="mt-6">
              <SectionCard title={item.label} description="This module is wired to the current Meta dashboard dataset and keeps the navigation stable while the deeper analysis layer is refined.">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Current phase</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{dashboard.scenarioLab.phase.title}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">AI adjusted FCF margin</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{(dashboard.scenarioLab.aiAdjustedFcfMargin * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Validation warnings</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{dashboard.dataStatus.validationWarnings.length}</p>
                  </div>
                </div>
              </SectionCard>
            </Tabs.Content>
          ))}
      </Tabs.Root>
    </div>
  );
}
