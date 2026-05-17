import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";
import { MiniMetric, millions, multiple, pct } from "./MckPrimitives";

export function PrescriptionTechnologyEngine({ dashboard }: { dashboard: MckDashboardDataset }) {
  return (
    <SectionCard title="Prescription Technology / RxTS" description="RxTS is modeled separately because access, affordability, workflow and manufacturer connectivity can deserve a higher multiple than distribution.">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="Revenue" value={millions(dashboard.prescriptionTechnology.revenue)} badge="Actual" />
        <MiniMetric label="Margin" value={pct(dashboard.prescriptionTechnology.margin)} badge="Actual" />
        <MiniMetric label="SOTP multiple" value={multiple(dashboard.prescriptionTechnology.relativeMultiple)} badge="Assumption" />
        <MiniMetric label="Business type" value="Platform-like" subtext="Still reimbursement-sensitive" badge="Derived" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <p className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{dashboard.prescriptionTechnology.thesis}</p>
        <p className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{dashboard.prescriptionTechnology.caveat}</p>
      </div>
    </SectionCard>
  );
}
