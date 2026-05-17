import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, RiskBadge, SourceNote, formatPct, type IsrgComponentProps } from "./ISRGPrimitives";

export function CompetitionRiskPanel({ dashboard }: IsrgComponentProps) {
  return (
    <SectionCard title="Competition & Risk" description="This page is deliberately adversarial: it tracks what could break the compounder thesis and how those risks map to assumptions.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Red-Team Level" value={dashboard.riskRedTeam.redTeamRiskLevel} text="Highest-severity thesis risks." tone="negative" />
        <KpiTile label="Tariff Drag" value={formatPct(dashboard.marginRiskEngine.tariffDrag)} text="Explicit risk assumption." tone="warning" />
        <KpiTile label="Margin Compression" value={formatPct(dashboard.marginRiskEngine.marginCompression)} text="Competition, tenders, manufacturing." tone="warning" />
        <KpiTile label="Recurring Mix" value={formatPct(dashboard.riskRedTeam.recurringMix)} text="Higher mix mitigates equipment-cycle risk." tone="positive" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Competitor Tracker">
          <div className="space-y-3">
            {dashboard.competitionRiskEngine.competitors.map((competitor) => (
              <div key={competitor.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{competitor.name}</p>
                  <RiskBadge label={competitor.riskSeverity} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{competitor.likelyImpact}</p>
                <p className="mt-1 text-xs text-slate-500">{competitor.geography} / {competitor.timing}</p>
              </div>
            ))}
          </div>
        </InsightBox>
        <InsightBox title="Risk Heatmap">
          <div className="space-y-3">
            {dashboard.competitionRiskEngine.riskHeatmap.map((risk) => (
              <div key={risk.category} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <span className="font-medium text-ink">{risk.category}</span>
                <RiskBadge label={risk.globalRisk} />
                <RiskBadge label={risk.chinaRisk} />
                <RiskBadge label={risk.marginRisk} />
              </div>
            ))}
          </div>
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Risk Red-Team Table">
          <div className="space-y-3">
            {dashboard.riskRedTeam.items.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{item.redFlag}</p>
                  <RiskBadge label={item.severity} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.evidence}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">Monitor: {item.monitorNextQuarter}</p>
              </div>
            ))}
          </div>
        </InsightBox>
        <InsightBox title="Kill Criteria">
          <BulletList items={dashboard.riskRedTeam.killCriteria} />
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.competitionRiskEngine.valuationRule}</SourceNote>
      </div>
    </SectionCard>
  );
}
