import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznTextPanel, formatPct, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function RareDiseaseEnginePanel({ dashboard }: { dashboard: AznDashboard }) {
  const rare = dashboard.rareDisease;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <AznTextPanel title="Rare Disease Revenue">{formatUsdM(rare.rareDiseaseRevenue)} in Q1 2026, anchored by complement biology and orphan economics.</AznTextPanel>
        <AznTextPanel title="Complement Franchise">{formatUsdM(rare.complementFranchiseRevenue)} across Soliris and Ultomiris, with conversion doing most of the cliff mitigation work.</AznTextPanel>
        <AznTextPanel title="Durability Score">{rare.orphanDrugDurabilityScore}/100. The score benefits from Ultomiris mix but carries reimbursement visibility risk.</AznTextPanel>
        <AznTextPanel title="Pipeline Value">{formatUsdM(rare.rareDiseasePipelineValue)} probability-adjusted rare-disease pipeline value in the scenario layer.</AznTextPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Soliris to Ultomiris Transition</h3>
          <div className="mt-3 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rare.solirisToUltomirisTransition}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="product" />
                <YAxis />
                <Tooltip formatter={(value, name) => name === "mix" ? formatPct(Number(value)) : formatUsdM(Number(value))} />
                <Bar dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Orphan Drug Risk / Pricing Matrix</h3>
          <div className="mt-4 space-y-3">
            {rare.riskMatrix.map((risk) => (
              <div key={risk.risk} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{risk.risk}</p>
                  <AznBadge tone={toneForRisk(risk.level)}>{risk.level}</AznBadge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{risk.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <AznTextPanel title="Pricing Power">{rare.pricingPower}</AznTextPanel>
        <AznTextPanel title="Reimbursement Risk">{rare.reimbursementRisk}</AznTextPanel>
        <AznTextPanel title="Lifecycle Expansion">{rare.lifecycleExpansion.join(", ")}</AznTextPanel>
      </div>
    </div>
  );
}
