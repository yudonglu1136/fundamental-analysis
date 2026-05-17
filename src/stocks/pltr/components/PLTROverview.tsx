import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatPct, formatUsd, getMetric, type PltrComponentProps } from "./PLTRPrimitives";

export function PLTROverview({ dashboard }: PltrComponentProps) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="PLTR Overview"
        description="Investor question: is Palantir becoming the enterprise AI operating layer, or is the market overcapitalizing an exceptional but cyclical AI adoption wave?"
        badge={<DataQualityBadge badge="Needs Review" />}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Latest Revenue" value={formatUsd(getMetric(dashboard, "revenue"))} text={`${dashboard.latestActual.label} reported revenue, sourced from official presentation or SEC seed data.`} tone="positive" />
          <KpiTile label="US Commercial Growth" value={formatPct(getMetric(dashboard, "usCommercialGrowth"))} text="Core AIP monetization signal, not a direct valuation input." tone="positive" />
          <KpiTile label="Rule of 40" value={formatPct(getMetric(dashboard, "ruleOf40"))} text="Adjusted profitability plus revenue growth. Strong, but SBC must be checked." tone="positive" />
          <KpiTile label="SBC / Revenue" value={formatPct(getMetric(dashboard, "sbcAsPctRevenue"))} text="Dilution and per-share FCF remain central to the debate." tone="warning" />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <InsightBox title="Business Summary">
            Palantir sells mission-critical software platforms that connect messy enterprise and government data to workflows, decisions, permissions, and now AI agents. The investment case is not just generic AI software. It is whether Gotham, Foundry, AIP, Apollo, and the Ontology become a durable operating layer for high-stakes institutions.
          </InsightBox>
          <InsightBox title="Products">
            <BulletList
              items={[
                "Gotham: defense, intelligence, and government mission workflows.",
                "Foundry: data operations, analytics, workflow, and ontology foundation.",
                "AIP: generative AI connected to private data, actions, agents, and governance.",
                "Apollo: deployment layer for cloud, regulated, edge, and disconnected environments.",
              ]}
            />
          </InsightBox>
          <InsightBox title="Main Debate">
            <BulletList
              items={[
                "AI platform winner versus expensive narrative stock.",
                "Mission-critical government moat versus procurement cyclicality.",
                "AIP commercial acceleration versus bootcamp hype.",
                "Operating leverage versus adjusted metrics and SBC dilution.",
              ]}
            />
          </InsightBox>
        </div>
      </SectionCard>

      <SectionCard title="Bull / Base / Bear Thesis" description="The dashboard keeps research judgments separate from valuation assumptions. Change assumptions explicitly when the evidence deserves it.">
        <div className="grid gap-4 lg:grid-cols-3">
          <InsightBox title="Bull">
            PLTR becomes the enterprise AI operating system layer. AIP converts quickly from bootcamps to production, US commercial revenue compounds at high rates, government remains durable, margins expand, and dilution falls.
          </InsightBox>
          <InsightBox title="Base">
            AIP sustains elevated US commercial growth but normalizes over time. Government remains a sticky but slower engine. Margins improve, SBC declines as a percent of revenue, and valuation remains premium but less extreme.
          </InsightBox>
          <InsightBox title="Bear">
            AIP excitement fades into slower production conversion. Commercial growth decelerates, government normalizes, adjusted margins overstate per-share economics, SBC remains high, and the multiple compresses.
          </InsightBox>
        </div>
        <div className="mt-4">
          <SourceNote>
            Source discipline: actual metrics need source URLs; forecast assumptions are analyst inputs; AIP, ontology, and transcript scores are research-only and do not directly change valuation.
          </SourceNote>
        </div>
      </SectionCard>
    </div>
  );
}
