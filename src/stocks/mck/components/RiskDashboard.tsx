import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckRiskItem } from "../types";
import { pct, PanelTable, SignalPill } from "./MckPrimitives";

export function RiskDashboard({ risks }: { risks: MckRiskItem[] }) {
  return (
    <SectionCard title="Risk Dashboard" description="Risk scores combine probability and severity; each risk has a monitoring metric and early warning indicator.">
      <PanelTable
        headers={["Risk", "Prob.", "Severity", "Score", "Signal", "Evidence", "Early warning", "Metric"]}
        rows={risks.map((risk) => [
          risk.name,
          pct(risk.probability),
          pct(risk.severity),
          risk.score.toFixed(0),
          <SignalPill signal={risk.signal} />,
          risk.evidence,
          risk.earlyWarningIndicator,
          risk.monitoringMetric,
        ])}
      />
    </SectionCard>
  );
}
