import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { buildEarningsCallTrend } from "./engine";
import type { EarningsCallDataset, EarningsCallQuarter, EarningsCallTrendOutput } from "./types";

function usd(value: number) {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}m`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function miniCard(label: string, value: string, subtext?: string) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {subtext ? <p className="mt-1 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  );
}

function table(headers: string[], rows: Array<Array<ReactNode>>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-slate-700">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ dataset, trend }: { dataset: EarningsCallDataset; trend: EarningsCallTrendOutput }) {
  const latest = trend.selectedQuarter;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {miniCard("Current price", `$${dataset.currentPrice.toFixed(2)}`, dataset.priceDate)}
        {miniCard("Latest revenue", usd(latest.totalRevenue), latest.label)}
        {miniCard(latest.primaryMetricLabel, usd(latest.primaryMetric), latest.label)}
        {miniCard("Liquidity", usd(latest.cashOrLiquidity), latest.label)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{trend.overview.aiTrendSummary}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{dataset.moduleSummary}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{dataset.valuationNote}</div>
      </div>
    </div>
  );
}

function EarningsCallExplorer({ dataset, trend }: { dataset: EarningsCallDataset; trend: EarningsCallTrendOutput }) {
  const [selectedId, setSelectedId] = useState(trend.selectedQuarter.id);
  const selected = dataset.quarters.find((quarter) => quarter.id === selectedId) ?? trend.selectedQuarter;
  const maxIntensity = 10;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Select quarter</p>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">{selected.label}</span>
        </div>
        <input
          aria-label="Select earnings call quarter"
          className="w-full accent-sky-600"
          type="range"
          min={0}
          max={dataset.quarters.length - 1}
          step={1}
          value={dataset.quarters.findIndex((quarter) => quarter.id === selected.id)}
          onChange={(event) => setSelectedId(dataset.quarters[Number(event.target.value)]?.id ?? selected.id)}
        />
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {dataset.quarters.map((quarter) => (
            <button
              key={quarter.id}
              type="button"
              onClick={() => setSelectedId(quarter.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium ${quarter.id === selected.id ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {quarter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {miniCard("Revenue", usd(selected.totalRevenue))}
        {miniCard(selected.primaryMetricLabel, usd(selected.primaryMetric))}
        {miniCard("Liquidity", usd(selected.cashOrLiquidity))}
        {miniCard("Tone", selected.managementTone)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{selected.aiSummary}</div>
        {table(["Analyst question cluster"], selected.analystQuestions.map((question) => [question]))}
      </div>
      {table(
        ["Topic", "Intensity", "Comment"],
        selected.marketFocus.map((focus) => [focus.topic, `${focus.intensity}/10`, focus.summary]),
      )}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        {trend.topicTrendRows.map((row) => (
          <div key={row.topic}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>{row.label} ({row.direction})</span>
              <span>{row.latestIntensity}/10</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(3, Math.min(100, (row.latestIntensity / maxIntensity) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Evidence({ dataset }: { dataset: EarningsCallDataset }) {
  return table(
    ["Source", "Type", "Date", "Metric", "Confidence"],
    dataset.evidence.map((item) => [
      <a className="text-sky-700 underline" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>,
      item.sourceType,
      item.date,
      item.extractedMetric,
      item.confidence,
    ]),
  );
}

export function EarningsCallDashboard({ module, dataSourceType }: StockDashboardProps) {
  const dataset = module.data as EarningsCallDataset;
  const trend = useMemo(() => buildEarningsCallTrend(dataset), [dataset]);
  const summary = useMemo(() => module.calculateSummary(dataset), [dataset, module]);

  return (
    <div className="space-y-6">
      <SectionCard
        title={`${dataset.ticker} Earnings Call Intelligence`}
        description="Eight-quarter earnings-call trend overview with scrollable quarter selection and market-focus synthesis."
        badge={<DataQualityBadge badge={dataSourceType === "manual" ? "Assumption" : "Actual"} />}
      >
        <Overview dataset={dataset} trend={trend} />
      </SectionCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((metric) => <MetricCard key={metric.key} metric={metric} currency="USD" />)}
      </div>
      <Tabs.Root defaultValue="calls">
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          <Tabs.Trigger value="calls" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">Earnings Calls</Tabs.Trigger>
          <Tabs.Trigger value="trend" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">Trend Overview</Tabs.Trigger>
          <Tabs.Trigger value="evidence" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">Evidence</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="calls" className="mt-6">
          <SectionCard title="Earnings Call Explorer"><EarningsCallExplorer dataset={dataset} trend={trend} /></SectionCard>
        </Tabs.Content>
        <Tabs.Content value="trend" className="mt-6">
          <SectionCard title="Market Focus Trend">
            {table(["Topic", "Direction", "Latest", "8Q avg", "AI synthesis"], trend.topicTrendRows.map((row) => [row.label, row.direction, `${row.latestIntensity}/10`, row.eightQuarterAverage.toFixed(1), row.aiSynthesis]))}
          </SectionCard>
        </Tabs.Content>
        <Tabs.Content value="evidence" className="mt-6">
          <SectionCard title="Evidence"><Evidence dataset={dataset} /></SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
