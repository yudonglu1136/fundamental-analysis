import { useMemo, useState } from "react";
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
import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, KpiTile, SourceNote, type PltrComponentProps } from "./PLTRPrimitives";

const focusTopics = ["AIP", "bootcamp", "US Commercial", "Government", "Defense", "margin", "SBC", "valuation"] as const;

function periodId(fiscalYear: number, fiscalQuarter: number) {
  return `q${fiscalQuarter}-${fiscalYear}`;
}

function periodLabel(fiscalYear: number, fiscalQuarter: number) {
  return `Q${fiscalQuarter} ${fiscalYear}`;
}

function topicMentions(rows: Array<{ topic: string; mentions: number }>, topic: string) {
  return rows.find((row) => row.topic === topic)?.mentions ?? 0;
}

function topTopics(rows: Array<{ topic: string; mentions: number }>, limit = 3) {
  return rows
    .filter((row) => row.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}

function focusHeadline(fiscalYear: number, fiscalQuarter: number) {
  if (fiscalYear === 2024 && fiscalQuarter <= 3) {
    return "The debate was still proof-of-AIP: investors wanted evidence that AI demand was converting into real U.S. commercial growth.";
  }
  if (fiscalYear === 2024 && fiscalQuarter === 4) {
    return "Focus shifted from AI promise to operating proof: U.S. commercial acceleration, Rule of 40, and government pressure-testing.";
  }
  if (fiscalYear === 2025 && fiscalQuarter <= 2) {
    return "Market attention broadened to production deployments, bootcamp-to-contract conversion, and whether demand could support raised guidance.";
  }
  if (fiscalYear === 2025 && fiscalQuarter >= 3) {
    return "The conversation became more demanding: commercial durability, defense urgency, international divergence, and premium-execution valuation risk.";
  }
  return "The latest calls emphasize capacity, U.S. revenue acceleration, defense prioritization, and whether valuation already discounts near-perfect execution.";
}

function buildAiOverview(latestLabel: string, earliestLabel: string, qaCount: number) {
  return [
    `Across ${earliestLabel} to ${latestLabel}, the market focus moved from "is AIP real?" to "how much durable growth is already priced in?"`,
    "AIP and U.S. Commercial became the central proof points: investors keep testing whether bootcamps, pilots, and production deployments translate into revenue per customer and guidance raises.",
    "Government and defense stayed mission-critical, but the question changed from demand existence to budget timing, procurement cycles, and how much PLTR should prioritize U.S. national security over commercial capacity.",
    "Margin quality moved up the agenda as growth accelerated: Rule of 40 is impressive, but investors still need to separate adjusted operating leverage from SBC, dilution, and GAAP profitability.",
    `${qaCount} parsed Q&A pairs are treated as research evidence only. Topic frequency and management tone are not valuation inputs unless explicitly mapped to revenue, margin, retention, or dilution assumptions.`,
  ];
}

export function TranscriptIntelligenceLab({ dashboard }: PltrComponentProps) {
  const [keyword, setKeyword] = useState("");
  const [topic, setTopic] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("overview");

  const sortedEvents = useMemo(
    () =>
      [...dashboard.transcript.events].sort(
        (a, b) => b.fiscalYear - a.fiscalYear || b.fiscalQuarter - a.fiscalQuarter,
      ),
    [dashboard.transcript.events],
  );
  const lastEightEvents = sortedEvents.slice(0, 8);
  const chronologicalEvents = [...lastEightEvents].reverse();
  const selectedEvent = lastEightEvents.find((event) => periodId(event.fiscalYear, event.fiscalQuarter) === selectedPeriod);

  const topics = useMemo(
    () => Array.from(new Set(dashboard.transcript.qaPairs.flatMap((pair) => pair.topicTags))).sort(),
    [dashboard.transcript.qaPairs],
  );

  const trendsByPeriod = useMemo(() => {
    const map = new Map<string, typeof dashboard.transcript.topicTrends>();
    for (const row of dashboard.transcript.topicTrends) {
      const existing = map.get(row.periodId) ?? [];
      existing.push(row);
      map.set(row.periodId, existing);
    }
    return map;
  }, [dashboard.transcript.topicTrends]);

  const focusTrendRows = chronologicalEvents.map((event) => {
    const rows = trendsByPeriod.get(periodId(event.fiscalYear, event.fiscalQuarter)) ?? [];
    return {
      quarter: periodLabel(event.fiscalYear, event.fiscalQuarter),
      AIP: topicMentions(rows, "AIP"),
      Bootcamp: topicMentions(rows, "bootcamp"),
      "US Comm": topicMentions(rows, "US Commercial"),
      Gov: topicMentions(rows, "Government"),
      Defense: topicMentions(rows, "Defense"),
      Margin: topicMentions(rows, "margin"),
      SBC: topicMentions(rows, "SBC"),
      Valuation: topicMentions(rows, "valuation"),
    };
  });

  const selectedTrendRows =
    selectedPeriod === "overview"
      ? focusTopics.map((item) => {
          const rows = dashboard.transcript.topicTrends.filter((row) => row.topic === item);
          return {
            topic: item,
            mentions: rows.reduce((sum, row) => sum + row.mentions, 0),
            qaMentions: rows.reduce((sum, row) => sum + (row.qaMentions ?? 0), 0),
          };
        })
      : dashboard.transcript.topicTrends.filter((row) => row.periodId === selectedPeriod && row.mentions > 0);

  const filteredPairs = dashboard.transcript.qaPairs.filter((pair) => {
    const pairPeriod = periodId(pair.fiscalYear, pair.fiscalQuarter);
    const text = `${pair.question} ${pair.answer} ${pair.managementSpeaker} ${pair.analystName}`.toLowerCase();
    if (selectedPeriod !== "overview" && pairPeriod !== selectedPeriod) return false;
    if (keyword && !text.includes(keyword.toLowerCase())) return false;
    if (topic !== "all" && !pair.topicTags.some((item) => item === topic)) return false;
    return true;
  });

  const overviewItems = buildAiOverview(
    periodLabel(lastEightEvents[0]?.fiscalYear ?? 0, lastEightEvents[0]?.fiscalQuarter ?? 0),
    periodLabel(chronologicalEvents[0]?.fiscalYear ?? 0, chronologicalEvents[0]?.fiscalQuarter ?? 0),
    dashboard.transcript.qaPairs.length,
  );

  return (
    <SectionCard
      title="Transcript Intelligence Lab"
      description="Investor question: how did the market's earnings-call focus evolve across PLTR's last eight quarters?"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="8Q Coverage" value={`${lastEightEvents.length}/8`} text="Most recent earnings calls wired into the transcript lab." tone="positive" />
        <KpiTile label="Q&A Pairs" value={`${dashboard.transcript.qaPairs.length}`} text="Parsed analyst and shareholder questions with management answers." />
        <KpiTile label="Topic Rows" value={`${dashboard.transcript.topicTrends.length}`} text="Quarter-topic observations from prepared remarks and Q&A." />
        <KpiTile label="Selected" value={selectedEvent ? periodLabel(selectedEvent.fiscalYear, selectedEvent.fiscalQuarter) : "8Q"} text={selectedEvent ? selectedEvent.sourceName : "Eight-quarter overview."} />
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-w-max gap-2">
          <button
            type="button"
            onClick={() => setSelectedPeriod("overview")}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${
              selectedPeriod === "overview" ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            8Q Overview
          </button>
          {lastEightEvents.map((event) => {
            const id = periodId(event.fiscalYear, event.fiscalQuarter);
            return (
              <button
                key={event.transcriptId}
                type="button"
                onClick={() => setSelectedPeriod(id)}
                className={`rounded-md border px-4 py-2 text-sm font-semibold ${
                  selectedPeriod === id ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {periodLabel(event.fiscalYear, event.fiscalQuarter)}
              </button>
            );
          })}
        </div>
      </div>

      {selectedPeriod === "overview" ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <InsightBox title="AI Research Synthesis">
            <ul className="space-y-2">
              {overviewItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </InsightBox>
          <div className="lg:col-span-2">
            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={focusTrendRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="AIP" stroke="#0f766e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="US Comm" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Gov" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Defense" stroke="#b45309" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Valuation" stroke="#e11d48" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-3 lg:col-span-3 md:grid-cols-2 xl:grid-cols-4">
            {chronologicalEvents.map((event) => {
              const id = periodId(event.fiscalYear, event.fiscalQuarter);
              const rankedTopics = topTopics(trendsByPeriod.get(id) ?? []);
              const qaCount = dashboard.transcript.qaPairs.filter((pair) => periodId(pair.fiscalYear, pair.fiscalQuarter) === id).length;
              return (
                <InsightBox key={event.transcriptId} title={periodLabel(event.fiscalYear, event.fiscalQuarter)}>
                  <p>{focusHeadline(event.fiscalYear, event.fiscalQuarter)}</p>
                  <p className="mt-2">Top topics: {rankedTopics.map((row) => `${row.topic} (${row.mentions})`).join(", ") || "N/A"}.</p>
                  <p className="mt-2">Parsed Q&A: {qaCount}. Source: {event.sourceName}.</p>
                </InsightBox>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600">
          Search
          <input
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="AIP, SBC, government"
          />
        </label>
        <label className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600">
          Topic
          <select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="all">All topics</option>
            {topics.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <InsightBox title="Research Boundary">
          Transcript tone, topic frequency, and the AI overview are research-only. They do not enter valuation unless explicitly mapped to assumptions.
        </InsightBox>
      </div>

      <div className="mt-4">
        {selectedEvent ? (
          <SourceNote>
            {periodLabel(selectedEvent.fiscalYear, selectedEvent.fiscalQuarter)} transcript status: {selectedEvent.status}. Source: {selectedEvent.sourceName}.{" "}
            {selectedEvent.transcriptUrl ? <a className="font-semibold underline" href={selectedEvent.transcriptUrl} target="_blank" rel="noreferrer">Transcript link</a> : "No transcript URL."}
          </SourceNote>
        ) : (
          <SourceNote>
            Eight-quarter overview combines parsed Q&A and topic tags from local transcript files. Q1 2025 uses Earnings.video as a backup source because a stable Motley Fool URL was not found.
          </SourceNote>
        )}
      </div>

      <div className="mt-5 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={selectedTrendRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="topic" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="mentions" name="Mentions" fill="#0f766e" />
            <Bar dataKey="qaMentions" name="Q&A mentions" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-4">
        {filteredPairs.length > 0 ? (
          filteredPairs.map((pair) => (
            <InsightBox key={pair.id} title={`${periodLabel(pair.fiscalYear, pair.fiscalQuarter)}: ${pair.analystName} to ${pair.managementSpeaker}`}>
              <p className="font-semibold text-ink">Q: {pair.question}</p>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 p-3">
                A: {pair.answer}
              </div>
              <p className="mt-2">Topics: {pair.topicTags.join(", ")}. Evidence strength: {pair.evidenceStrength}.</p>
            </InsightBox>
          ))
        ) : (
          <SourceNote>No Q&A pairs match the selected quarter, keyword, and topic filters.</SourceNote>
        )}
      </div>
    </SectionCard>
  );
}
