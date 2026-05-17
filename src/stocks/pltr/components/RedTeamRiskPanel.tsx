import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, RiskBadge, SourceNote, type PltrComponentProps } from "./PLTRPrimitives";

export function RedTeamRiskPanel({ dashboard }: PltrComponentProps) {
  return (
    <SectionCard
      title="Risk Red Team Panel"
      description="Investor question: what would make PLTR a narrative bubble rather than a great compounder?"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {dashboard.risks.map((risk) => (
          <InsightBox key={risk.id} title={risk.title}>
            <div className="mb-3 flex flex-wrap gap-2">
              <RiskBadge label={risk.severity} />
              <RiskBadge label={risk.probability} />
            </div>
            <p>{risk.description}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-semibold text-ink">Evidence to monitor</p>
                <BulletList items={risk.evidenceToMonitor} />
              </div>
              <div>
                <p className="font-semibold text-ink">Leading indicators</p>
                <BulletList items={risk.leadingIndicators} />
              </div>
            </div>
            <p className="mt-3"><span className="font-semibold text-ink">Bull thesis invalidator:</span> {risk.bullThesisInvalidator}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>This panel is adversarial but not automatically bearish. It exists to protect the model from narrative overreach.</SourceNote>
      </div>
    </SectionCard>
  );
}
