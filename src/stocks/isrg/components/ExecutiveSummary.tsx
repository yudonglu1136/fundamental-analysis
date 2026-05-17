import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, RiskBadge, SourceNote, formatPct, formatUsd, type IsrgComponentProps } from "./ISRGPrimitives";

export function ExecutiveSummary({ dashboard }: IsrgComponentProps) {
  const baseScenario = dashboard.scenarios.find((item) => item.scenario === "Base") ?? dashboard.scenarios[1];
  const bearScenario = dashboard.scenarios.find((item) => item.scenario === "Bear") ?? dashboard.scenarios[0];
  const bullScenario = dashboard.scenarios.find((item) => item.scenario === "Bull") ?? dashboard.scenarios[2];
  return (
    <SectionCard
      title="ISRG Executive Summary"
      description="The core question is whether ISRG remains a durable surgical robotics compounder or whether the market already prices perfect execution."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Current Price" value={formatUsd(dashboard.marketData.currentPrice, "")} text={`Market snapshot dated ${dashboard.marketData.priceDate}.`} tone="warning" />
        <KpiTile label="Base Fair Value" value={formatUsd(baseScenario?.fairValue, "")} text={`Implied return ${formatPct(baseScenario?.impliedReturn)}.`} />
        <KpiTile label="Fair Value Range" value={`${formatUsd(bearScenario?.fairValue, "")} - ${formatUsd(bullScenario?.fairValue, "")}`} text="Bear / Bull model range, not a single target." />
        <KpiTile label="Red-Team Risk" value={dashboard.riskRedTeam.redTeamRiskLevel} text="Risk level from thesis failure modes." tone="negative" />
        <KpiTile label="Quality Score" value={dashboard.moatEngine.valuationRelevantScore.toFixed(0)} text="Moat factors that map to valuation drivers." tone="positive" />
        <KpiTile label="Growth Score" value={formatPct(dashboard.procedureEngine.procedureGrowth)} text="Latest official da Vinci procedure growth." tone="positive" />
        <KpiTile label="Valuation Risk" value={formatPct(dashboard.valuation.reverseDcf.requiredProcedureCagr)} text="Procedure CAGR required by reverse DCF." tone="warning" />
        <KpiTile label="Latest Quarter" value={dashboard.latestActual.label} text={dashboard.latestActual.periodEnd} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <InsightBox title="Key Thesis">
          <BulletList
            items={[
              "Installed base and surgeon familiarity support procedure growth.",
              "Instruments and accessories revenue behaves more like recurring platform monetization than equipment sales.",
              "da Vinci 5 can support an upgrade cycle, but the model forces it through explicit placement, ASP, and utilization assumptions.",
            ]}
          />
        </InsightBox>
        <InsightBox title="Key Risk">
          <BulletList
            items={[
              "Procedure growth moderates faster than the market expects.",
              "da Vinci 5 is mostly replacement demand rather than TAM expansion.",
              "Competition, China tenders, tariffs, and lease mix compress system ASP and margin.",
            ]}
          />
        </InsightBox>
        <InsightBox title="What The Market Needs">
          <p>
            Reverse DCF points to {formatPct(dashboard.valuation.reverseDcf.requiredProcedureCagr)} procedure CAGR or
            {" "}
            {formatPct(dashboard.valuation.reverseDcf.requiredUtilizationGrowth)} utilization growth to justify the current price in the core DCF leg.
          </p>
          <div className="mt-3">
            <RiskBadge label={dashboard.riskRedTeam.redTeamRiskLevel} />
          </div>
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>
          Data separation: official actuals and guidance can feed valuation; transcript/product narrative remains research-only unless an analyst promotes a validated numeric disclosure into assumptions.
        </SourceNote>
      </div>
    </SectionCard>
  );
}
