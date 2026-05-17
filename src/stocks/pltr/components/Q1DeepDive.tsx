import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import { SectionCard } from "../../../components/shared/SectionCard";
import type { PltrEvidenceLayer, PltrQ1DeepDiveMetric, PltrQ1DeepDiveTextItem } from "../model";
import { InsightBox, SourceNote, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

const layerLabels: Record<PltrEvidenceLayer, string> = {
  official_reported: "Official reported",
  derived_metric: "Derived metric",
  transcript_evidence: "Transcript evidence",
  research_interpretation: "Research interpretation",
  valuation_implication: "Valuation implication",
};

function SourceLink({ url }: { url: string | null }) {
  if (!url) return <span>No URL</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-slate-300 underline-offset-4">
      Source
    </a>
  );
}

function MetricTile({ metric }: { metric: PltrQ1DeepDiveMetric }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-ink">{metric.displayValue}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {layerLabels[metric.layer]}
        </span>
      </div>
      {metric.q4DisplayValue ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Q4 2025: {metric.q4DisplayValue}. Change: {metric.changeVsQ4Display ?? "N/A"}.
        </p>
      ) : null}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
        <SourceLink url={metric.sourceUrl} />: {metric.footnote}
      </p>
    </div>
  );
}

function TextEvidenceCard({ item }: { item: PltrQ1DeepDiveTextItem }) {
  return (
    <InsightBox title={item.title}>
      <p>{item.body}</p>
      {item.topicTags?.length ? <p className="mt-2">Topics: {item.topicTags.join(", ")}</p> : null}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
        <SourceLink url={item.sourceUrl} />: {item.footnote}
      </p>
    </InsightBox>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

export function Q1DeepDive({ dashboard }: PltrComponentProps) {
  const deepDive = dashboard.q1DeepDive;
  const q1Actual = dashboard.actuals.find((period) => period.periodId === deepDive.periodId) ?? dashboard.latestActual;
  const commercialRevenue = q1Actual.metrics.commercialRevenue?.value ?? null;
  const governmentRevenue = q1Actual.metrics.governmentRevenue?.value ?? null;
  const mixChartData = [
    {
      period: deepDive.periodLabel,
      Commercial: commercialRevenue,
      Government: governmentRevenue,
    },
  ];
  const changeChartData = deepDive.whatChangedVsQ4
    .filter((metric) => metric.unit === "percent" && metric.q4Value != null)
    .slice(0, 4)
    .map((metric) => ({
      metric: metric.label.replace(" vs Q4 2025", ""),
      q4Value: metric.q4Value,
      q1Value: metric.value,
      footnote: metric.footnote,
    }));
  const commercialMix = deepDive.derivedMetrics.find((metric) => metric.id === "commercial-mix");
  const governmentMix = deepDive.derivedMetrics.find((metric) => metric.id === "government-mix");

  return (
    <div className="space-y-6">
      <SectionCard
        title="PLTR Q1 2026 Deep Dive"
        description="Investor question: did Q1 2026 provide the first fully analyzable proof that AIP is converting into measurable revenue, margins, and guidance?"
        badge={<DataQualityBadge badge="Actual" />}
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <SourceNote>
            Source priority: {deepDive.sourcePriority.join(" -> ")}. Transcript evidence is used only for Q&A and management commentary.
          </SourceNote>
          <SourceNote>
            Separation rule: official numbers, derived metrics, transcript evidence, research interpretation, and valuation implications are displayed as separate layers.
          </SourceNote>
          <SourceNote>
            Q1 2026 is the first reference quarter in this module. Some Q4 comparison fields still rely on chart-derived starter data until filing refresh is complete.
          </SourceNote>
          <SourceNote>
            Valuation warning: Q1 can support stronger assumptions, but the reverse DCF still decides what is already priced into the stock.
          </SourceNote>
        </div>
      </SectionCard>

      <SectionCard title="Official Reported Numbers" description="Headline metrics sourced from Palantir official release, Q1 Business Update, and SEC filings where applicable.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {deepDive.officialReported.map((metric) => (
            <MetricTile key={metric.id} metric={metric} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Derived Metrics" description="Investor question: what does Q1 imply after reconciling segment mix, GAAP profitability, and SBC?">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <SectionHeader
              title="Commercial vs Government Mix"
              description={`Commercial mix ${commercialMix?.displayValue ?? "N/A"} and Government mix ${governmentMix?.displayValue ?? "N/A"} based on Q1 reported segment revenue.`}
            />
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mixChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => formatUsd(Number(value), "M").replace("$", "")} />
                  <Tooltip formatter={(value) => formatUsd(Number(value))} />
                  <Legend />
                  <Bar dataKey="Commercial" stackId="revenue" fill="#0f766e" />
                  <Bar dataKey="Government" stackId="revenue" fill="#334155" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Source: Commercial revenue $774M and Government revenue $858M are from Palantir's Q1 2026 Business Update:
              {" "}
              <SourceLink url="https://investors.palantir.com/files/Palantir%20-%20Q1%202026%20Business%20Update.pdf" />.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {deepDive.derivedMetrics.map((metric) => (
              <MetricTile key={metric.id} metric={metric} />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Guidance Upgrade" description="Investor question: did management raise the forward bar enough to confirm Q1 was not just a backward-looking spike?">
        <div className="grid gap-4 lg:grid-cols-3">
          {deepDive.guidanceUpgrade.map((item) => (
            <TextEvidenceCard key={item.id} item={item} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="What Changed vs Q4 2025" description="Investor question: did Q1 accelerate the model, or only maintain the Q4 trajectory?">
        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {deepDive.whatChangedVsQ4.map((metric) => (
              <MetricTile key={metric.id} metric={metric} />
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <SectionHeader title="Growth and Margin Step-Up" description="Q4-to-Q1 comparison for percent metrics with Q4 benchmark values." />
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={changeChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="metric" />
                  <YAxis tickFormatter={(value) => `${Number(value * 100).toFixed(0)}%`} />
                  <Tooltip formatter={(value) => formatPct(Number(value))} />
                  <Legend />
                  <Bar dataKey="q4Value" name="Q4 2025" fill="#94a3b8" />
                  <Bar dataKey="q1Value" name="Q1 2026" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
              {changeChartData.map((row) => (
                <p key={row.metric}>Source for {row.metric}: {row.footnote}</p>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Transcript Evidence" description="Investor question: what did management say, and what did analysts probe, without letting sentiment leak into valuation?">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <SectionHeader title="Management Commentary" description="Paraphrased from Q1 2026 Motley Fool Q&A; research-only evidence." />
            {deepDive.managementCommentary.map((item) => (
              <TextEvidenceCard key={item.id} item={item} />
            ))}
          </div>
          <div className="space-y-4">
            <SectionHeader title="Analyst Concerns" description="The two parsed Q1 Q&A pairs focused on capacity allocation, AI competition, talent, and defense budget timing." />
            {deepDive.analystConcerns.map((item) => (
              <TextEvidenceCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Research Interpretation and Valuation" description="Investor question: what does Q1 change in the thesis, and what does it still leave unproven?">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {deepDive.researchInterpretation.map((item) => (
              <TextEvidenceCard key={item.id} item={item} />
            ))}
          </div>
          <div className="space-y-4">
            {deepDive.valuationImplication.map((item) => (
              <TextEvidenceCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="What Would Invalidate the Q1 2026 Bull Signal?" description="Red-team checklist for the next several quarters.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deepDive.redTeamInvalidators.map((item) => (
            <TextEvidenceCard key={item.id} item={item} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
