import { useMemo, useState } from "react";
import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";
import { MiniMetric, money, PanelTable, pct, SignalPill } from "./MckPrimitives";

export function EarningsCallIntelligence({ dashboard }: { dashboard: MckDashboardDataset }) {
  const [selectedEventId, setSelectedEventId] = useState(dashboard.earningsCall.selectedEventId);
  const selectedEvent = useMemo(
    () => dashboard.earningsCall.events.find((event) => event.id === selectedEventId) ?? dashboard.earningsCall.events[0],
    [dashboard.earningsCall.events, selectedEventId],
  );
  const selectedQuotes = dashboard.earningsCall.quotes.filter((quote) => quote.eventId === selectedEvent?.id);
  const selectedQa = dashboard.earningsCall.qaPairs.filter((pair) => pair.eventId === selectedEvent?.id);

  return (
    <SectionCard title="Earnings Call Intelligence" description="Past eight quarters are shown as official-release-derived call events. Full transcript Q&A remains research-only until local transcripts are ingested.">
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">Eight-quarter AI overview</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{dashboard.earningsCall.trendOverview.aiSummary}</p>
          </div>
          <span className="shrink-0 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Research-only
          </span>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {dashboard.earningsCall.events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedEventId(event.id)}
              className={`w-44 rounded-2xl border px-4 py-3 text-left transition ${
                selectedEvent?.id === event.id
                  ? "border-ink bg-ink text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              <p className="text-sm font-semibold">{event.fiscalPeriod}</p>
              <p className={`mt-1 text-xs ${selectedEvent?.id === event.id ? "text-slate-200" : "text-slate-500"}`}>{event.eventDate}</p>
              <p className={`mt-2 line-clamp-2 text-xs leading-5 ${selectedEvent?.id === event.id ? "text-slate-100" : "text-slate-500"}`}>
                {event.marketFocus}
              </p>
            </button>
          ))}
        </div>
      </div>

      {selectedEvent ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <MiniMetric label="Selected quarter" value={selectedEvent.fiscalPeriod} subtext={selectedEvent.title} badge={selectedEvent.tag.sourceType === "actual" ? "Actual" : "Needs Review"} />
            <MiniMetric label="Revenue" value={selectedEvent.metrics?.revenue ? money(selectedEvent.metrics.revenue) : "n/a"} subtext={selectedEvent.metrics?.revenueGrowth !== undefined ? pct(selectedEvent.metrics.revenueGrowth) : undefined} badge="Actual" />
            <MiniMetric label="Adjusted EPS" value={selectedEvent.metrics?.adjustedEps ? money(selectedEvent.metrics.adjustedEps, 2) : "n/a"} subtext={selectedEvent.metrics?.adjustedEpsGrowth !== undefined ? pct(selectedEvent.metrics.adjustedEpsGrowth) : undefined} badge="Actual" />
            <MiniMetric label="FCF" value={selectedEvent.metrics?.freeCashFlow !== undefined ? money(selectedEvent.metrics.freeCashFlow) : "n/a"} subtext={selectedEvent.sourceCoverage.replace(/_/g, " ")} badge={selectedEvent.sourceCoverage === "transcript_ingested" ? "Actual" : "Needs Review"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="font-semibold text-ink">Quarter read-through</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{selectedEvent.summary}</p>
              <p className="mt-3 text-sm font-semibold text-ink">Market focus</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{selectedEvent.marketFocus}</p>
              <p className="mt-3 text-sm font-semibold text-ink">Thesis read</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{selectedEvent.thesisRead}</p>
            </div>
            <PanelTable
              headers={["Quarter highlights"]}
              rows={selectedEvent.quarterHighlights.map((highlight) => [highlight])}
            />
          </div>

          <PanelTable
            headers={["Topic", "Analyst / market concern"]}
            rows={selectedEvent.analystConcerns.map((concern, index) => [selectedEvent.topics[index % selectedEvent.topics.length], concern])}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PanelTable
          headers={["Quarter", "Primary focus", "Key concern", "Thesis read"]}
          rows={dashboard.earningsCall.trendOverview.quarterlyFocus.map((row) => [
            `${row.fiscalPeriod} / ${row.eventDate}`,
            row.primaryFocus,
            row.concern,
            row.thesisRead,
          ])}
        />
        <PanelTable
          headers={["Topic", "Earlier 4Q", "Recent 4Q", "Direction", "Interpretation"]}
          rows={dashboard.earningsCall.trendOverview.topicTrends.map((row) => [
            row.topic,
            row.earlyMentions,
            row.recentMentions,
            row.direction,
            row.interpretation,
          ])}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PanelTable
          headers={["Topic", "Mentions", "Tone"]}
          rows={dashboard.earningsCall.themes.map((row) => [row.topic, row.count, <SignalPill signal={row.tone} />])}
        />
        <PanelTable
          headers={["Topic", "Speaker", "Interpretation"]}
          rows={(selectedQuotes.length ? selectedQuotes : dashboard.earningsCall.quotes).map((quote) => [quote.topic, quote.speaker, quote.interpretation])}
        />
      </div>
      <div className="mt-5">
        <PanelTable
          headers={["Topic", "Analyst concern", "Pressure point"]}
          rows={(selectedQa.length ? selectedQa : dashboard.earningsCall.qaPairs).map((pair) => [pair.topic, pair.question, pair.pressurePoint])}
        />
      </div>
    </SectionCard>
  );
}
