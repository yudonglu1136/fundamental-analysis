import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { pltrSegmentGrowthHistory } from "../data/segmentGrowthHistory";
import { CommercialExpansionEngine } from "./CommercialExpansionEngine";
import { GovernmentBusinessEngine } from "./GovernmentBusinessEngine";
import { OntologyPlatformEngine } from "./OntologyPlatformEngine";
import { KpiTile, SourceNote, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function PLTRBusinessSegments({ dashboard }: PltrComponentProps) {
  const rows = dashboard.actuals.map((period) => ({
    period: period.label,
    government: period.metrics.governmentRevenue.value,
    commercial: period.metrics.commercialRevenue.value,
    usCommercial: period.metrics.usCommercialRevenue.value,
    usGovernment: period.metrics.usGovernmentRevenue.value,
  }));
  const growthRows = pltrSegmentGrowthHistory.map((row) => ({
    ...row,
    commercialYoyPct: row.commercialYoyGrowth,
    governmentYoyPct: row.governmentYoyGrowth,
    commercialQoqPct: row.commercialQoqGrowth,
    governmentQoqPct: row.governmentQoqGrowth,
  }));
  const latestGrowth = pltrSegmentGrowthHistory[pltrSegmentGrowthHistory.length - 1];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Business Segment Dashboard"
        description="Investor question: is growth broadening across government and commercial, or is the AIP narrative concentrated in a narrow US commercial window?"
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip formatter={(value) => formatUsd(Number(value))} />
              <Legend />
              <Bar dataKey="government" name="Government" stackId="segment" fill="#1f2937" />
              <Bar dataKey="commercial" name="Commercial" stackId="segment" fill="#14b8a6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <GovernmentBusinessEngine dashboard={dashboard} />
          <CommercialExpansionEngine dashboard={dashboard} />
          <OntologyPlatformEngine dashboard={dashboard} />
        </div>
        <div className="mt-4">
          <SourceNote>Several historical quarter segment values are incomplete until official filing extraction is run. The chart connects only reported or explicitly derived values.</SourceNote>
        </div>
      </SectionCard>

      <SectionCard
        title="Quarterly Commercial vs Government Growth"
        description="Quarter-level comparison of PLTR's reported Commercial segment and Government / mission-market proxy. Government is the reported segment and should not be read as pure military revenue."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Latest Commercial YoY"
            value={formatPct(latestGrowth.commercialYoyGrowth)}
            text={`${latestGrowth.period} reported Commercial revenue growth.`}
            tone="positive"
          />
          <KpiTile
            label="Latest Government YoY"
            value={formatPct(latestGrowth.governmentYoyGrowth)}
            text={`${latestGrowth.period} reported Government revenue growth.`}
            tone="positive"
          />
          <KpiTile
            label="Latest Commercial QoQ"
            value={formatPct(latestGrowth.commercialQoqGrowth)}
            text="Sequential commercial momentum."
            tone="positive"
          />
          <KpiTile
            label="Latest Government QoQ"
            value={formatPct(latestGrowth.governmentQoqGrowth)}
            text="Sequential mission-market momentum."
            tone="positive"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">YoY Growth: Commercial vs Government</h3>
            <div className="mt-3 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                  <Tooltip formatter={(value) => formatPct(Number(value))} />
                  <Legend />
                  <Bar dataKey="commercialYoyPct" name="Commercial YoY" fill="#14b8a6" />
                  <Bar dataKey="governmentYoyPct" name="Government YoY" fill="#1f2937" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">QoQ Growth: Commercial vs Government</h3>
            <div className="mt-3 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                  <Tooltip formatter={(value) => formatPct(Number(value))} />
                  <Legend />
                  <Bar dataKey="commercialQoqPct" name="Commercial QoQ" fill="#2dd4bf" />
                  <Bar dataKey="governmentQoqPct" name="Government QoQ" fill="#475569" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <th className="px-3 py-2">Quarter</th>
                <th className="px-3 py-2">Commercial Revenue</th>
                <th className="px-3 py-2">Government Revenue</th>
                <th className="px-3 py-2">Commercial YoY</th>
                <th className="px-3 py-2">Government YoY</th>
                <th className="px-3 py-2">Commercial QoQ</th>
                <th className="px-3 py-2">Government QoQ</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pltrSegmentGrowthHistory.map((row) => (
                <tr key={row.period}>
                  <td className="px-3 py-2 font-semibold text-ink">{row.period}</td>
                  <td className="px-3 py-2 text-slate-600">{formatUsd(row.commercialRevenue)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatUsd(row.governmentRevenue)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatPct(row.commercialYoyGrowth)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatPct(row.governmentYoyGrowth)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatPct(row.commercialQoqGrowth)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatPct(row.governmentQoqGrowth)}</td>
                  <td className="px-3 py-2 text-slate-500">Official transcript</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <SourceNote>
            Source-backed quarterly series from local PLTR transcript extractions, Q2 2024 through Q1 2026. Earlier
            quarterly segment growth is not filled with estimates here. Government is PLTR's reported segment and is
            used as the closest mission-market proxy, not as a pure military revenue line.
          </SourceNote>
        </div>
      </SectionCard>
    </div>
  );
}
