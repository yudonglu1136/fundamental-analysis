import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildAznEarningsCallIntelligence } from "../engines/earningsCallEngine";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznTextPanel, formatPct, formatUsdM } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function EarningsCallIntelligencePanel({ dashboard }: { dashboard: AznDashboard }) {
  const defaultIndex = dashboard.earningsCall.events.length - 1;
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const selectedSeed = dashboard.earningsCall.events[selectedIndex] ?? dashboard.earningsCall.events[defaultIndex];
  const callLab = useMemo(
    () => buildAznEarningsCallIntelligence(dashboard.dataset, selectedSeed?.id),
    [dashboard.dataset, selectedSeed?.id],
  );
  const selected = callLab.selectedEvent;
  const previous = callLab.previousEvent;
  const quarterOptions = callLab.events;
  const trendRows = callLab.marketFocusTrend.slice(0, 7);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <AznTextPanel title="Tracked Calls">{callLab.events.length} official results events from Q2 2024 through Q1 2026.</AznTextPanel>
        <AznTextPanel title="Transcript Boundary">{callLab.validation.transcriptImportedCount} imported transcripts. This layer uses official webcast/PDF materials and AI research summaries, not valuation inputs.</AznTextPanel>
        <AznTextPanel title="Selected Quarter">{selected.fiscalQuarter}: {selected.label}</AznTextPanel>
        <AznTextPanel title="Valuation Impact"><AznBadge tone="amber">display only</AznBadge><span className="ml-2">Earnings-call AI summaries cannot directly enter valuation.</span></AznTextPanel>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">Quarter Selector</h3>
            <p className="mt-1 text-sm text-slate-500">Use the horizontal scrollbar or slider to choose one of the last eight quarterly result calls.</p>
          </div>
          <AznBadge tone="blue">{selected.eventDate}</AznBadge>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-2">
            {quarterOptions.map((event, index) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`rounded-lg px-4 py-3 text-left text-sm ring-1 ${selected.id === event.id ? "bg-ink text-white ring-ink" : "bg-slate-50 text-slate-600 ring-slate-200"}`}
              >
                <span className="block font-semibold">{event.fiscalQuarter}</span>
                <span className="block text-xs opacity-80">{event.eventDate}</span>
              </button>
            ))}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(quarterOptions.length - 1, 0)}
          value={selectedIndex}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
          className="mt-3 w-full accent-sky-600"
          aria-label="Select AZN earnings call quarter"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">AI Market-Focus Overview</h3>
          <p className="mt-2 text-lg font-semibold text-ink">{callLab.aiOverview.headline}</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{callLab.aiOverview.narrative}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <FocusBucket label="Early Focus" items={callLab.aiOverview.earlyFocus} />
            <FocusBucket label="Mid-Period Focus" items={callLab.aiOverview.middleFocus} />
            <FocusBucket label="Latest Focus" items={callLab.aiOverview.latestFocus} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Market Focus Change</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="topic" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="delta" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Revenue / EPS Trend</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={callLab.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="quarter" />
                <YAxis yAxisId="left" tickFormatter={(value) => `$${Number(value) / 1000}bn`} />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip formatter={(value, name) => name === "coreEps" ? `$${Number(value).toFixed(2)}` : name === "totalRevenue" ? formatUsdM(Number(value)) : formatPct(Number(value))} />
                <Line yAxisId="left" type="monotone" dataKey="totalRevenue" stroke="#2563eb" strokeWidth={3} />
                <Line yAxisId="right" type="monotone" dataKey="coreEps" stroke="#0f766e" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Pipeline / LOE / China Focus</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={callLab.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="quarter" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="pipelineFocus" stroke="#2563eb" strokeWidth={3} />
                <Line type="monotone" dataKey="patentLoeFocus" stroke="#dc2626" strokeWidth={3} />
                <Line type="monotone" dataKey="chinaFocus" stroke="#f59e0b" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink">{selected.fiscalQuarter} Call Summary</h3>
              <p className="mt-1 text-sm text-slate-500">{selected.sourceName}</p>
            </div>
            <AznBadge tone={selected.guidanceTone === "Raised" ? "green" : selected.guidanceTone === "Softened" ? "red" : "blue"}>{selected.guidanceTone}</AznBadge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <MiniStat label="Revenue" value={formatUsdM(selected.totalRevenue)} />
            <MiniStat label="Revenue CER" value={formatPct(selected.totalRevenueGrowthCer)} />
            <MiniStat label="Core EPS" value={`$${selected.coreEps.toFixed(2)}`} />
            <MiniStat label="Core EPS CER" value={formatPct(selected.coreEpsGrowthCer)} />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{selected.aiSummary}</p>
          {previous ? (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Versus {previous.fiscalQuarter}: revenue growth {formatPct(selected.totalRevenueGrowthCer)} vs {formatPct(previous.totalRevenueGrowthCer)}, pipeline focus score {selected.topicScores.Pipeline} vs {previous.topicScores.Pipeline}, patent/LOE focus {selected.topicScores["Patent / LOE"]} vs {previous.topicScores["Patent / LOE"]}.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Source Boundary</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Webcast/PDF source is official; the AI summary, focus scores and watchlist are research-only display analytics.
          </p>
          <a className="mt-3 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-900" href={selected.sourceUrl} target="_blank" rel="noreferrer">Open official source</a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BulletPanel title="Management Messages" items={selected.managementMessages} />
        <BulletPanel title="Market Focus" items={selected.marketFocus} />
        <BulletPanel title="Next Call Watchlist" items={selected.nextCallWatchlist} />
      </div>
    </div>
  );
}

function FocusBucket({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => <AznBadge key={item} tone="blue">{item}</AznBadge>)}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
