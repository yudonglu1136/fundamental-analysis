import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, type IsrgComponentProps } from "./ISRGPrimitives";

export function TranscriptIntelligenceLab({ dashboard }: IsrgComponentProps) {
  const heatmap = dashboard.transcript.topicHeatmap.filter((row) => row.mentions > 0);
  const quarterFocus = dashboard.transcript.quarterFocus;
  const latestQuarter = quarterFocus[quarterFocus.length - 1];
  const [selectedPeriod, setSelectedPeriod] = useState(latestQuarter?.periodId ?? "");
  const selectedQuarter = useMemo(
    () => quarterFocus.find((quarter) => quarter.periodId === selectedPeriod) ?? quarterFocus[quarterFocus.length - 1],
    [quarterFocus, selectedPeriod],
  );
  const selectedTopics = selectedQuarter
    ? (Object.entries(selectedQuarter.focusScores) as Array<[string, number]>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : [];

  return (
    <SectionCard title="Transcript Intelligence" description="Earnings call intelligence is a Q&A and monitoring layer. It is not wired into valuation unless explicit numeric evidence is validated and promoted.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Eight-Quarter Tape" value={`${quarterFocus.length}`} text="Scrollable quarterly focus snapshots." />
        <KpiTile label="Q&A Pairs" value={`${dashboard.transcript.qaPairs.length}`} text="Candidate-only by default." tone="warning" />
        <KpiTile label="Topic Rows" value={`${dashboard.transcript.focusTrendRows.length}`} text="Quarterly market-focus trend rows." />
        <KpiTile label="Valuation Use" value="Research-only" text="AI summaries cannot directly enter valuation." tone="negative" />
      </div>

      <div className="mt-5">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
          <div className="flex min-w-max gap-2">
            {quarterFocus.map((quarter) => (
              <button
                key={quarter.periodId}
                type="button"
                onClick={() => setSelectedPeriod(quarter.periodId)}
                className={`min-w-36 rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedQuarter?.periodId === quarter.periodId
                    ? "border-ink bg-ink text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block font-semibold">{quarter.label}</span>
                <span className="block text-xs opacity-80">{quarter.primaryMarketFocus}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <InsightBox title="Eight-Quarter Market Focus Overview">
          <p>{dashboard.transcript.eightQuarterOverview}</p>
          <div className="mt-3">
            <BulletList items={dashboard.transcript.marketFocusEvolution} />
          </div>
        </InsightBox>
        <InsightBox title={selectedQuarter ? `${selectedQuarter.label} Call Focus` : "Selected Quarter"}>
          <p className="font-medium text-ink">{selectedQuarter?.primaryMarketFocus ?? "No quarter selected."}</p>
          <p className="mt-2">{selectedQuarter?.aiSummary}</p>
          <p className="mt-3">{selectedQuarter?.bullBearRead}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTopics.map(([topic, score]) => (
              <span key={topic} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {topic}: {score}
              </span>
            ))}
          </div>
        </InsightBox>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboard.transcript.focusTrendRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Legend />
              <Line dataKey="Procedure growth" stroke="#2563eb" strokeWidth={2} dot />
              <Line dataKey="da Vinci 5" stroke="#0f766e" strokeWidth={2} dot />
              <Line dataKey="Margins / tariffs" stroke="#dc2626" strokeWidth={2} dot />
              <Line dataKey="OUS / China" stroke="#9333ea" strokeWidth={2} dot />
              <Line dataKey="Ion / SP" stroke="#f59e0b" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={heatmap}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="topic" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="mentions" name="Mentions" fill="#2563eb" />
              <Bar dataKey="focusScore" name="8Q focus score" fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Latest Call Summary">
          <p>{dashboard.transcript.latestCallSummary}</p>
          <p className="mt-3">{dashboard.transcript.managementTone}</p>
        </InsightBox>
        <InsightBox title="Q&A Explorer">
          <div className="space-y-3">
            {dashboard.transcript.qaPairs.map((pair) => (
              <div key={pair.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-ink">{pair.question}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{pair.answer}</p>
                <p className="mt-2 text-xs text-slate-500">{pair.topicTags.join(", ")} / {pair.evidenceStrength}</p>
              </div>
            ))}
          </div>
        </InsightBox>
        <InsightBox title="Guidance vs Actual Tracker">
          <div className="space-y-3">
            {dashboard.transcript.guidanceTracker.map((row) => (
              <div key={`${row.period}-${row.metric}`} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-ink">{row.metric}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {row.period}: {row.low ?? "N/A"} - {row.high ?? "N/A"}; midpoint {row.midpoint ?? "N/A"}
                </p>
              </div>
            ))}
          </div>
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.transcript.extractionRules.join(" ")}</SourceNote>
      </div>
    </SectionCard>
  );
}
