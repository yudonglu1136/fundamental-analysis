import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatPct, formatUsd, type IsrgComponentProps } from "./ISRGPrimitives";

export function HospitalCapexRoiPanel({ dashboard }: IsrgComponentProps) {
  return (
    <SectionCard
      title="Hospital Capex & Surgical ROI"
      description="ISRG adoption is not just demand growth; it has to clear hospital capital budgets, OR throughput economics, surgeon training, and upgrade-cycle ROI."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Operating Lease Mix" value={formatPct(dashboard.hospitalCapexEngine.leaseMix)} text="Lease placements as a percent of da Vinci placements." tone="warning" />
        <KpiTile label="Usage-Based Lease Mix" value={formatPct(dashboard.hospitalCapexEngine.usageBasedLeaseMix)} text="Usage-based leases as a percent of operating leases." tone="warning" />
        <KpiTile label="System ASP Proxy" value={formatUsd(dashboard.hospitalCapexEngine.aspProxy)} text="Systems revenue divided by da Vinci placements." />
        <KpiTile label="Capex Friction Score" value={dashboard.hospitalCapexEngine.capexFrictionScore.toFixed(0)} text="Higher score means adoption increasingly depends on flexible financing." tone="negative" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Interpretation">
          <p>{dashboard.hospitalCapexEngine.interpretation}</p>
        </InsightBox>
        <InsightBox title="Next Quarter Monitors">
          <BulletList items={dashboard.hospitalCapexEngine.nextQuarterMonitors} />
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        {dashboard.hospitalCapexEngine.hospitalRoiDrivers.map((driver) => (
          <InsightBox key={driver.driver} title={driver.driver}>
            <p>{driver.signal}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.hospitalCapexEngine.sourceBoundary}</SourceNote>
      </div>
    </SectionCard>
  );
}

