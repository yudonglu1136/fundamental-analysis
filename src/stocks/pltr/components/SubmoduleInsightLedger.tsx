import { SectionCard } from "../../../components/shared/SectionCard";
import type { PltrSubmoduleInsight } from "../model";
import { KpiTile, SourceNote, type PltrComponentProps } from "./PLTRPrimitives";

const stanceClass: Record<PltrSubmoduleInsight["stance"], string> = {
  Constructive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Mixed: "bg-amber-50 text-amber-700 border-amber-200",
  Caution: "bg-orange-50 text-orange-700 border-orange-200",
  Adversarial: "bg-rose-50 text-rose-700 border-rose-200",
};

const evidenceClass: Record<PltrSubmoduleInsight["evidenceStrength"], string> = {
  High: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium: "bg-blue-50 text-blue-700 border-blue-200",
  Low: "bg-orange-50 text-orange-700 border-orange-200",
  "Source Gap": "bg-rose-50 text-rose-700 border-rose-200",
};

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function InsightCard({ insight }: { insight: PltrSubmoduleInsight }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{insight.tab}</p>
          <h3 className="mt-1 text-base font-semibold text-ink">{insight.module}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={insight.stance} className={stanceClass[insight.stance]} />
          <Badge label={insight.evidenceStrength} className={evidenceClass[insight.evidenceStrength]} />
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
        <div>
          <p className="font-semibold text-ink">Key question</p>
          <p>{insight.keyQuestion}</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Key insight</p>
          <p>{insight.keyInsight}</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Data read-through</p>
          <p>{insight.dataReadThrough}</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Model implication</p>
          <p>{insight.modelImplication}</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Falsifier</p>
          <p>{insight.falsifier}</p>
        </div>
        <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
          <span className="font-semibold text-slate-600">Source quality:</span> {insight.sourceQuality}
        </p>
      </div>
    </div>
  );
}

export function SubmoduleInsightLedger({ dashboard }: PltrComponentProps) {
  const insights = dashboard.submoduleInsights;
  const highEvidence = insights.filter((insight) => insight.evidenceStrength === "High").length;
  const cautionCount = insights.filter((insight) => insight.stance === "Caution" || insight.stance === "Adversarial").length;
  const sourceGapPattern = /deferred|future|gap|incomplete|missing|not fully|refresh|required diligence/i;
  const sourceGapCount = insights.filter(
    (insight) =>
      insight.evidenceStrength === "Source Gap" ||
      sourceGapPattern.test(`${insight.keyInsight} ${insight.dataReadThrough} ${insight.modelImplication} ${insight.sourceQuality}`),
  ).length;
  const valuationLinked = insights.filter((insight) => insight.modelImplication.toLowerCase().includes("valuation")).length;

  return (
    <SectionCard
      title="PLTR Submodule Key Insights"
      description="Decision-ready insight ledger tying each PLTR submodule to evidence, model implications, source quality, and falsifiers."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Submodules Covered" value={`${insights.length}`} text="Includes dashboard tabs plus historical valuation/backend coverage." tone="positive" />
        <KpiTile label="High Evidence" value={`${highEvidence}`} text="Items supported mostly by high-confidence official or SEC data." />
        <KpiTile label="Caution / Red Team" value={`${cautionCount}`} text="Areas where valuation, SBC, or risk discipline should dominate." tone="warning" />
        <KpiTile label="Source Gaps" value={`${sourceGapCount}`} text="Items with explicit source, data, or backend caveats." tone={sourceGapCount ? "warning" : "positive"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SourceNote>
          Research-only signals remain outside the valuation engine. AIP, ontology, transcript tone, and risk scores can change fair value only through explicit assumption edits.
        </SourceNote>
        <SourceNote>
          {valuationLinked} insights include valuation linkage. Current price is used for reverse DCF and return math only, not as a fair-value anchor.
        </SourceNote>
        <SourceNote>
          Historical valuation coverage is visible inside the valuation tab; backend PLTR support currently supplies reporting events and price anchors, with full persisted fair value runs still deferred.
        </SourceNote>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </SectionCard>
  );
}
