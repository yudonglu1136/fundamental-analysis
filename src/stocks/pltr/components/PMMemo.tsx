import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, SourceNote, formatPct, formatUsd, getMetric, type PltrComponentProps } from "./PLTRPrimitives";

export function PMMemo({ dashboard }: PltrComponentProps) {
  const baseCase = dashboard.scenarios.find((scenario) => scenario.scenario === "Base");
  const bearCase = dashboard.scenarios.find((scenario) => scenario.scenario === "Bear");
  const bullCase = dashboard.scenarios.find((scenario) => scenario.scenario === "Bull");
  return (
    <SectionCard
      title="PM Memo"
      description="Investor question: what is the decision-ready buy-side framing for PLTR?"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <InsightBox title="One-Line Decision">
          Watchlist / valuation discipline. PLTR has unusually strong AIP-led commercial and operating momentum, but the risk/reward depends on whether current price already discounts extreme growth, margin, and dilution improvement.
        </InsightBox>
        <InsightBox title="What PLTR Does">
          Palantir provides software platforms for government and commercial customers that connect data, ontology, workflows, permissions, and AI to operational decisions. The core products are Gotham, Foundry, AIP, and Apollo.
        </InsightBox>
        <InsightBox title="Why Now">
          AIP appears to have accelerated US commercial demand, while Q1 2026 reported revenue growth, Rule of 40, customer count, and guidance all show a step change. The question is durability and price paid.
        </InsightBox>
        <InsightBox title="Core Thesis">
          <BulletList
            items={[
              "AIP can turn Palantir from high-end mission software into a broader enterprise AI operating layer.",
              "Government provides a durable mission-critical base while commercial drives incremental growth.",
              "Operating leverage is real only if GAAP margins improve and SBC dilution declines.",
            ]}
          />
        </InsightBox>
        <InsightBox title="Market Belief">
          The market likely believes PLTR can sustain very high revenue growth, expand FCF margins, and deserve a premium AI infrastructure multiple. Reverse DCF currently requires {formatPct(dashboard.valuation.reverseDcf.requiredRevenueCagr)} revenue CAGR or {formatPct(dashboard.valuation.reverseDcf.requiredFcfMargin)} FCF margin under default assumptions.
        </InsightBox>
        <InsightBox title="Where Consensus Could Be Wrong">
          <BulletList
            items={[
              "Bull variant: AIP production deployments expand faster and deeper than normal SaaS adoption curves.",
              "Bear variant: bootcamp excitement does not translate into durable expansion and pricing power.",
              "Neutral variant: growth is excellent, but the stock already discounts excellence.",
            ]}
          />
        </InsightBox>
        <InsightBox title="What Needs To Happen">
          <BulletList
            items={[
              `US commercial growth stays high from a larger base. Latest: ${formatPct(getMetric(dashboard, "usCommercialGrowth"))}.`,
              "Net dollar retention and large-deal activity confirm production expansion.",
              "GAAP margin, FCF margin, and per-share FCF improve while SBC as percent of revenue declines.",
            ]}
          />
        </InsightBox>
        <InsightBox title="What Could Break It">
          <BulletList
            items={[
              "AIP mentions rise but US commercial revenue growth slows sharply.",
              "Government growth normalizes faster than commercial can offset.",
              "SBC and share count dilute per-share FCF.",
              "Current valuation requires assumptions that leave no margin of safety.",
            ]}
          />
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <InsightBox title="Attractive Price">
          Base fair value is {formatUsd(baseCase?.fairValuePerShare, "")}. A watchlist entry price should be set with a margin of safety to base case and a sober view of bear-case value at {formatUsd(bearCase?.fairValuePerShare, "")}.
        </InsightBox>
        <InsightBox title="Upside Case">
          Bull fair value is {formatUsd(bullCase?.fairValuePerShare, "")}. Underwriting this requires durable AIP-led commercial compounding and lower dilution.
        </InsightBox>
        <InsightBox title="Quarterly Monitor">
          <BulletList
            items={[
              "US commercial revenue and customer count.",
              "Commercial revenue per customer and large deal count.",
              "Government revenue growth and RPO.",
              "Adjusted versus GAAP margin.",
              "SBC as percent of revenue and diluted shares.",
              "Guidance revisions and NDR.",
            ]}
          />
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>This memo is a first-version research aid, not a recommendation. It highlights what needs to be true and what needs to be monitored.</SourceNote>
      </div>
    </SectionCard>
  );
}
