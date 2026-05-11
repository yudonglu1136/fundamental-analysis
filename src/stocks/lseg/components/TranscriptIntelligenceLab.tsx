import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import { SectionCard } from "../../../components/shared/SectionCard";
import {
  getPreviousTranscriptEventId,
  lsegTranscriptIntelligenceLab,
  type TranscriptConfidence,
  type TranscriptEvidenceItem,
  type TranscriptQaPair,
  type TranscriptTrendComparison,
  type TranscriptWatchlistItem,
  type TranscriptWatchlistReviewItem,
} from "../data/transcripts";

const STATUS_COPY: Record<TranscriptWatchlistReviewItem["status"], string> = {
  fulfilled: "Fulfilled",
  partially_fulfilled: "Partially Fulfilled",
  not_fulfilled: "Not Fulfilled",
  unclear: "Unclear",
};

const DIRECTION_COPY: Record<TranscriptTrendComparison["direction"], string> = {
  improved: "Improved",
  stable: "Stable",
  weaker: "Weaker",
  unclear: "Unclear",
};

type TranscriptLabTab = "summary" | "qa" | "trend" | "watchlist-review" | "next-watchlist";

export function TranscriptIntelligenceLab() {
  const defaultEventId =
    lsegTranscriptIntelligenceLab.events[lsegTranscriptIntelligenceLab.events.length - 1]?.transcriptId ?? "";
  const [selectedEventId, setSelectedEventId] = useState(defaultEventId);
  const [comparisonMode, setComparisonMode] = useState<"previous" | "manual">("previous");
  const [manualPriorEventId, setManualPriorEventId] = useState(
    getPreviousTranscriptEventId(defaultEventId) ?? lsegTranscriptIntelligenceLab.events[0]?.transcriptId ?? "",
  );
  const [researchTab, setResearchTab] = useState<TranscriptLabTab>("qa");
  const [topicFilter, setTopicFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [analystFilter, setAnalystFilter] = useState("all");
  const [answerQualityFilter, setAnswerQualityFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");

  const selectedSummary = useMemo(
    () => lsegTranscriptIntelligenceLab.summaryById.get(selectedEventId),
    [selectedEventId],
  );
  const previousEventId = useMemo(() => getPreviousTranscriptEventId(selectedEventId), [selectedEventId]);
  const comparisonEventId = comparisonMode === "previous" ? previousEventId : manualPriorEventId;
  const comparisonSummary = useMemo(
    () => (comparisonEventId ? lsegTranscriptIntelligenceLab.summaryById.get(comparisonEventId) : undefined),
    [comparisonEventId],
  );
  const comparisons = useMemo(
    () => (comparisonEventId ? lsegTranscriptIntelligenceLab.buildTrendComparison(selectedEventId, comparisonEventId) : []),
    [comparisonEventId, selectedEventId],
  );
  const watchlistReview = useMemo(
    () => (comparisonEventId ? lsegTranscriptIntelligenceLab.getWatchlistReview(selectedEventId, comparisonEventId) : []),
    [comparisonEventId, selectedEventId],
  );
  const nextCallWatchlist = useMemo(
    () => lsegTranscriptIntelligenceLab.getNextCallWatchlist(selectedEventId),
    [selectedEventId],
  );
  const selectedQaPairs = useMemo(
    () => lsegTranscriptIntelligenceLab.getQaPairs(selectedEventId),
    [selectedEventId],
  );

  const topicOptions = useMemo(
    () =>
      unique(selectedQaPairs.map((pair) => humanize(pair.topic))).map((value) => ({
        value,
        label: value,
      })),
    [selectedQaPairs],
  );
  const segmentOptions = useMemo(
    () =>
      unique(selectedQaPairs.map((pair) => pair.segment)).map((value) => ({
        value,
        label: value,
      })),
    [selectedQaPairs],
  );
  const analystOptions = useMemo(
    () =>
      unique(selectedQaPairs.map((pair) => analystLabel(pair))).map((value) => ({
        value,
        label: value,
      })),
    [selectedQaPairs],
  );

  const resolvedTopicFilter = topicOptions.some((option) => option.value === topicFilter) ? topicFilter : "all";
  const resolvedSegmentFilter = segmentOptions.some((option) => option.value === segmentFilter) ? segmentFilter : "all";
  const resolvedAnalystFilter = analystOptions.some((option) => option.value === analystFilter) ? analystFilter : "all";

  const filteredQaPairs = useMemo(
    () =>
      selectedQaPairs.filter((pair) => {
        if (resolvedTopicFilter !== "all" && humanize(pair.topic) !== resolvedTopicFilter) return false;
        if (resolvedSegmentFilter !== "all" && pair.segment !== resolvedSegmentFilter) return false;
        if (resolvedAnalystFilter !== "all" && analystLabel(pair) !== resolvedAnalystFilter) return false;
        if (answerQualityFilter !== "all" && pair.answerQuality !== answerQualityFilter) return false;
        if (confidenceFilter !== "all" && pair.confidence !== confidenceFilter) return false;
        return true;
      }),
    [
      answerQualityFilter,
      confidenceFilter,
      resolvedAnalystFilter,
      resolvedSegmentFilter,
      resolvedTopicFilter,
      selectedQaPairs,
    ],
  );

  if (!selectedSummary) return null;

  const groupedWatchlist = groupBy(nextCallWatchlist, (item) => item.category);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Transcript Intelligence"
        description="This transcript intelligence layer is for research review only. It is not used in valuation and requires human verification before promotion into official model data."
        badge={<DataQualityBadge badge="Needs Review" />}
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <MetricTile label="Tracked Events" value={`${lsegTranscriptIntelligenceLab.events.length}`} text="Quarterly and investor-event transcript snapshots currently in the research lab." />
          <MetricTile label="Selected Event" value={selectedSummary.event.shortLabel} text={selectedSummary.event.label} />
          <MetricTile label="Q&A Pairs" value={`${selectedQaPairs.length}`} text={`${selectedSummary.event.shortLabel} structured analyst question / management answer pairs.`} />
          <MetricTile
            label="Validation"
            value={lsegTranscriptIntelligenceLab.validation.warnings.length === 0 ? "Clean" : "Review"}
            text={
              lsegTranscriptIntelligenceLab.validation.warnings.length === 0
                ? "Display-only transcript checks are passing."
                : lsegTranscriptIntelligenceLab.validation.warnings.join(" ")
            }
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <SelectPanel
            label="Event Selector"
            value={selectedEventId}
            onChange={setSelectedEventId}
            options={lsegTranscriptIntelligenceLab.events.map((event) => ({ value: event.transcriptId, label: event.label }))}
          />
          <SelectPanel
            label="Comparison Mode"
            value={comparisonMode}
            onChange={(value) => setComparisonMode(value as "previous" | "manual")}
            options={[
              { value: "previous", label: "Selected event vs previous event" },
              { value: "manual", label: "Selected event vs chosen prior event" },
            ]}
          />
          <SelectPanel
            label="Manual Prior Event"
            value={manualPriorEventId}
            onChange={setManualPriorEventId}
            disabled={comparisonMode !== "manual"}
            options={lsegTranscriptIntelligenceLab.events
              .filter((event) => event.transcriptId !== selectedEventId)
              .map((event) => ({ value: event.transcriptId, label: event.label }))}
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-sm font-semibold text-ink">Event Quality</span>
            <div className="mt-3 flex flex-wrap gap-2">
              <SourceBadge label={selectedSummary.event.qualityTag} tone="neutral" />
              <SourceBadge label={`Q&A boundary ${selectedSummary.event.qaBoundaryConfidence}`} tone={confidenceTone(selectedSummary.event.qaBoundaryConfidence)} />
              <SourceBadge label={selectedSummary.event.confidence} tone={confidenceTone(selectedSummary.event.confidence)} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Source path: {selectedSummary.event.sourcePath}
            </p>
          </div>
        </div>
      </SectionCard>

      <Tabs.Root value={researchTab} onValueChange={(value) => setResearchTab(value as TranscriptLabTab)}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          <Tabs.Trigger value="summary" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
            Call Summary
          </Tabs.Trigger>
          <Tabs.Trigger value="qa" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
            Q&amp;A Explorer
          </Tabs.Trigger>
          <Tabs.Trigger value="trend" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
            Trend vs Prior Call
          </Tabs.Trigger>
          <Tabs.Trigger value="watchlist-review" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
            Last Call Watchlist Review
          </Tabs.Trigger>
          <Tabs.Trigger value="next-watchlist" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
            Next Call Watchlist
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="summary" className="mt-6 space-y-6">
          <SectionCard title="Call Summary" description={selectedSummary.conclusion}>
            <ResearchOnlyBanner />
            <div className="mt-4 grid gap-4 lg:grid-cols-5">
              <MetricTile label="Management Messages" value={`${selectedSummary.topManagementMessages.length}`} text="Top transcript-derived management messages." />
              <MetricTile label="Guidance Candidates" value={`${selectedSummary.explicitGuidanceCandidates.length}`} text="Review-only company guidance candidates." />
              <MetricTile label="KPI Highlights" value={`${selectedSummary.kpiHighlights.length}`} text="Operating / workflow items flagged for monitoring." />
              <MetricTile label="Risk Highlights" value={`${selectedSummary.riskMentions.length}`} text="Quote-grounded risk items, not valuation inputs." />
              <MetricTile label="Q&A Pairs" value={`${selectedQaPairs.length}`} text="Structured analyst question / management answer pairs." />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedSummary.badges.map((badge) => (
                <SourceBadge key={badge} label={badge} tone="warning" />
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <EvidencePanel title="Top Management Messages" items={selectedSummary.topManagementMessages} />
              <EvidencePanel title="Explicit Guidance Candidates" items={selectedSummary.explicitGuidanceCandidates} />
              <EvidencePanel title="KPI Highlights" items={selectedSummary.kpiHighlights} />
              <EvidencePanel title="Risk Highlights" items={selectedSummary.riskMentions} />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="qa" className="mt-6 space-y-6">
          <SectionCard title="Q&A Explorer" description="Structured analyst questions and management answers reconstructed from transcript Q&A sections. Source quote and AI summary are separated so review can focus on actual evidence before interpretation.">
            <ResearchOnlyBanner />
            <div className="mt-4 grid gap-4 lg:grid-cols-6">
              <SelectPanel label="Topic Filter" value={resolvedTopicFilter} onChange={setTopicFilter} options={[{ value: "all", label: "All topics" }, ...topicOptions]} />
              <SelectPanel label="Segment Filter" value={resolvedSegmentFilter} onChange={setSegmentFilter} options={[{ value: "all", label: "All segments" }, ...segmentOptions]} />
              <SelectPanel label="Analyst / Firm Filter" value={resolvedAnalystFilter} onChange={setAnalystFilter} options={[{ value: "all", label: "All analysts" }, ...analystOptions]} />
              <SelectPanel
                label="Answer Quality"
                value={answerQualityFilter}
                onChange={setAnswerQualityFilter}
                options={[
                  { value: "all", label: "All answer quality" },
                  { value: "direct", label: "Direct" },
                  { value: "partial", label: "Partial" },
                  { value: "evasive", label: "Evasive" },
                  { value: "unclear", label: "Unclear" },
                ]}
              />
              <SelectPanel
                label="Confidence Filter"
                value={confidenceFilter}
                onChange={setConfidenceFilter}
                options={[
                  { value: "all", label: "All confidence" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-semibold text-ink">Filtered Pair Count</span>
                <p className="mt-2 text-2xl font-semibold text-ink">{filteredQaPairs.length}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedQaPairs.length} total Q&amp;A pairs for {selectedSummary.event.shortLabel}. Low-confidence or OCR-noisy items remain visible but flagged.
                </p>
              </div>
            </div>

            {filteredQaPairs.length > 0 ? (
              <div className="mt-4 space-y-4">
                <div className="hidden rounded-2xl bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid xl:grid-cols-[1.3fr,1fr,1.6fr,auto]">
                  <span>Analyst / Topic</span>
                  <span>Responder / Segment</span>
                  <span>AI Summary / Source Quote</span>
                  <span>Review Flags</span>
                </div>
                {filteredQaPairs.map((pair) => (
                  <QaPairCard key={pair.id} pair={pair} />
                ))}
              </div>
            ) : (
              <EmptyPanel text="No Q&A pairs matched the current filters. Try broadening the topic, analyst, or confidence filter." />
            )}
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="trend" className="mt-6 space-y-6">
          <SectionCard title="Trend vs Prior Call" description="For the selected event, the lab compares current transcript evidence with the previous or manually selected prior call across growth, margin, FCF, data-platform, Markets, Post Trade, capital allocation, and risk tone.">
            <ResearchOnlyBanner />
            {comparisonSummary ? (
              <>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <MetricTile label="Current Event" value={selectedSummary.event.shortLabel} text={selectedSummary.event.label} />
                  <MetricTile label="Prior Event" value={comparisonSummary.event.shortLabel} text={comparisonSummary.event.label} />
                  <MetricTile label="Dimensions Tracked" value={`${comparisons.length}`} text="Improved / stable / weaker / unclear read-through across key drivers." />
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {comparisons.map((comparison) => (
                    <div key={comparison.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{comparison.label}</p>
                          <p className="text-sm text-slate-500">{DIRECTION_COPY[comparison.direction]} · {comparison.confidence} confidence</p>
                        </div>
                        <SourceBadge label={comparison.needsHumanReview ? "Needs Human Review" : "Display Only"} tone={comparison.needsHumanReview ? "warning" : "neutral"} />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{comparison.analystNote}</p>
                      <div className="mt-4 space-y-3">
                        <QuoteBox label={`${selectedSummary.event.shortLabel} source quote`} quote={comparison.currentQuote} />
                        <QuoteBox label={`${comparisonSummary.event.shortLabel} source quote`} quote={comparison.priorQuote} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyPanel text="Select an event with an available prior event to view trend comparisons." />
            )}
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="watchlist-review" className="mt-6 space-y-6">
          <SectionCard title="Last Call Watchlist Review" description="The prior event's watchlist is checked against the selected event and bucketed as fulfilled, partially fulfilled, not fulfilled, or unclear.">
            <ResearchOnlyBanner />
            {comparisonSummary && watchlistReview.length > 0 ? (
              <div className="mt-4 space-y-3">
                {watchlistReview.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{item.originalItem.label}</p>
                        <p className="text-sm text-slate-500">{STATUS_COPY[item.status]} · {item.originalItem.category.replace(/_/g, " ")}</p>
                      </div>
                      <SourceBadge label={STATUS_COPY[item.status]} tone={statusTone(item.status)} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.explanation}</p>
                    <QuoteBox label="Source quote" quote={item.evidenceQuote} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel text="No prior-event watchlist is available for the current selection." />
            )}
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="next-watchlist" className="mt-6 space-y-6">
          <SectionCard title="Next Call Watchlist" description="Top next-call questions, KPI checks, risks to revisit, and guidance points to verify generated from the selected event's transcript evidence.">
            <ResearchOnlyBanner />
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <WatchlistPanel title="Top Questions for Next Call" items={groupedWatchlist.top_questions ?? []} />
              <WatchlistPanel title="KPIs to Monitor" items={groupedWatchlist.kpis_to_monitor ?? []} />
              <WatchlistPanel title="Risks to Revisit" items={groupedWatchlist.risks_to_revisit ?? []} />
              <WatchlistPanel title="Guidance Points to Verify" items={groupedWatchlist.guidance_points ?? []} />
              <WatchlistPanel title="Likely Analyst Q&A Questions" items={groupedWatchlist.likely_qa ?? []} />
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K) {
  return items.reduce<Record<K, T[]>>((acc, item) => {
    const key = keyFn(item);
    acc[key] ??= [];
    acc[key].push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

function statusTone(status: TranscriptWatchlistReviewItem["status"]) {
  if (status === "fulfilled") return "positive";
  if (status === "partially_fulfilled") return "warning";
  if (status === "not_fulfilled") return "danger";
  return "neutral";
}

function confidenceTone(confidence: TranscriptConfidence | "none") {
  if (confidence === "high") return "positive";
  if (confidence === "medium") return "warning";
  if (confidence === "low") return "danger";
  return "neutral";
}

function analystLabel(pair: TranscriptQaPair) {
  return pair.analystFirm && pair.analystFirm !== "unknown"
    ? `${pair.analystName} (${pair.analystFirm})`
    : pair.analystName || "unknown";
}

function MetricTile({ label, value, text }: { label: string; value: string; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function SelectPanel({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResearchOnlyBanner() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
      This transcript intelligence layer is for research review only. It is not used in valuation and requires human verification before promotion.
    </div>
  );
}

function EvidencePanel({ title, items }: { title: string; items: TranscriptEvidenceItem[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink">{item.title}</p>
                <SourceBadge label={item.sourceTag} tone="neutral" />
                <SourceBadge label={item.needsHumanReview ? "Needs Human Review" : "Display Only"} tone={item.needsHumanReview ? "warning" : "neutral"} />
                {item.mappingStatus ? <SourceBadge label={item.mappingStatus.replace(/_/g, " ")} tone="neutral" /> : null}
              </div>
              <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-medium text-ink">AI note: </span>
                {item.explanation}
              </div>
              <QuoteBox label="Source quote" quote={item.quote} />
              <p className="mt-2 text-xs text-slate-400">{item.sourceReference}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No display-ready transcript items were found for this section.</p>
        )}
      </div>
    </div>
  );
}

function QaPairCard({ pair }: { pair: TranscriptQaPair }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 xl:grid-cols-[1.3fr,1fr,1.6fr,auto] xl:items-start">
        <div>
          <p className="font-semibold text-ink">{analystLabel(pair)}</p>
          <p className="mt-1 text-sm text-slate-500">{humanize(pair.topic)}{pair.subtopic && pair.subtopic !== pair.topic ? ` · ${humanize(pair.subtopic)}` : ""}</p>
          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="font-medium text-ink">AI question summary: </span>
            {pair.questionSummary ?? "Question summary unavailable"}
          </div>
        </div>
        <div>
          <p className="font-medium text-ink">{pair.managementResponder}</p>
          <p className="mt-1 text-sm text-slate-500">{pair.segment} · {pair.modelDriver}</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            <MetaRow label="Answer quality" value={humanize(pair.answerQuality)} />
            <MetaRow label="Q&A confidence" value={`${pair.confidence} / boundary ${pair.qaBoundaryConfidence}`} />
            <MetaRow label="Follow-up needed" value={pair.followUpNeeded ? "Yes" : "No"} />
          </div>
        </div>
        <div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="font-medium text-ink">AI answer summary: </span>
            {pair.answerSummary ?? "Answer summary unavailable"}
          </div>
          <QuoteBox label="Source quote" quote={pair.supportingQuoteShort} />
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <SourceBadge label="ManualUpload" tone="warning" />
          <SourceBadge label="Needs Human Review" tone="warning" />
          <SourceBadge label="Not Model Ready" tone="neutral" />
          <SourceBadge label="Not Used In Valuation" tone="neutral" />
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Expand full question / answer details</summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source question</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{pair.questionText ?? "Question text unavailable."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source answer</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{pair.answerText ?? "Answer text unavailable."}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SourceBadge label={`${pair.segment}`} tone="neutral" />
          <SourceBadge label={`${pair.modelDriver}`} tone="neutral" />
          <SourceBadge label={humanize(pair.answerQuality)} tone={pair.answerQuality === "direct" ? "positive" : pair.answerQuality === "partial" ? "warning" : "danger"} />
          <SourceBadge label={`Confidence ${pair.confidence}`} tone={confidenceTone(pair.confidence)} />
        </div>
        {pair.warnings && pair.warnings.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
            {pair.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-xs text-slate-400">{pair.sourcePath}</p>
      </details>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

function WatchlistPanel({ title, items }: { title: string; items: TranscriptWatchlistItem[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-ink">{item.label}</p>
                <SourceBadge label={item.priority} tone={item.priority === "high" ? "warning" : "neutral"} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.rationale}</p>
              <QuoteBox label="Source quote" quote={item.evidenceQuote} />
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No watchlist items were generated for this category.</p>
        )}
      </div>
    </div>
  );
}

function QuoteBox({ label, quote }: { label: string; quote?: string }) {
  if (!quote) return null;
  return (
    <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
      <span className="font-medium text-ink">{label}: </span>
      {quote}
    </div>
  );
}

function SourceBadge({ label, tone }: { label: string; tone: "neutral" | "warning" | "positive" | "danger" }) {
  const toneClass =
    tone === "warning"
      ? "bg-amber-100 text-amber-800"
      : tone === "positive"
        ? "bg-emerald-100 text-emerald-800"
        : tone === "danger"
          ? "bg-rose-100 text-rose-800"
          : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{label}</span>;
}

function EmptyPanel({ text }: { text: string }) {
  return <p className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">{text}</p>;
}
