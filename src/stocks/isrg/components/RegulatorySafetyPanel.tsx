import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, RiskBadge, SourceNote, type IsrgComponentProps } from "./ISRGPrimitives";

export function RegulatorySafetyPanel({ dashboard }: IsrgComponentProps) {
  return (
    <SectionCard
      title="FDA / Product Safety"
      description="Regulatory milestones, recalls, MAUDE signals, and product safety items are tracked as risk inputs, not as automatic valuation drivers."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Regulatory Risk Score" value={dashboard.regulatorySafetyEngine.riskScore.toFixed(0)} text="Research watch score; not a valuation score." tone="warning" />
        <KpiTile label="Milestones" value={dashboard.regulatorySafetyEngine.milestones.length.toString()} text="Official product/regulatory events tracked." />
        <KpiTile label="Safety Sources" value={dashboard.regulatorySafetyEngine.safetySources.length.toString()} text="FDA recall and MAUDE source hooks." />
        <KpiTile label="Valuation Boundary" value="Research-only" text="Safety data needs validation before model use." tone="negative" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Regulatory Milestones">
          <div className="space-y-3">
            {dashboard.regulatorySafetyEngine.milestones.map((milestone) => (
              <div key={milestone.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-ink">{milestone.platform} / {milestone.region}</p>
                <p className="mt-1 text-sm text-slate-600">{milestone.status} ({milestone.date})</p>
                <p className="mt-1 text-xs text-slate-500">{milestone.valuationRule}</p>
              </div>
            ))}
          </div>
        </InsightBox>
        <InsightBox title="Safety Watchlist">
          <div className="space-y-3">
            {dashboard.regulatorySafetyEngine.safetyWatchlist.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <RiskBadge label={item.severity} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.evidence}</p>
              </div>
            ))}
          </div>
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightBox title="What To Monitor">
          <BulletList items={dashboard.regulatorySafetyEngine.nextQuarterMonitors} />
        </InsightBox>
        <InsightBox title="Source Boundary">
          <p>{dashboard.regulatorySafetyEngine.valuationRule}</p>
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>FDA/MAUDE data can generate diligence questions, but the cockpit does not convert unnormalized event counts into valuation penalties without analyst review.</SourceNote>
      </div>
    </SectionCard>
  );
}

