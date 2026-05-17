import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznMiniCard, formatPct } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

function formatGbp(value: number) {
  return `£${value.toFixed(1)}`;
}

function formatUsd(value: number) {
  return `$${value.toFixed(1)}`;
}

export function ValuationTriangulationPanel({ dashboard }: { dashboard: AznDashboard }) {
  const valuation = dashboard.valuation;
  const methods = [
    { label: "DCF", value: valuation.dcfFairValueGbp, weight: valuation.methodWeights.dcf, note: "Core unlevered cash-flow DCF" },
    { label: "SOTP", value: valuation.sotpFairValueGbp, weight: valuation.methodWeights.sotp, note: "Therapy-area revenue multiple approach" },
    { label: "Pipeline rNPV", value: valuation.pipelineFairValueGbp, weight: valuation.methodWeights.pipeline, note: "Research-only probability-adjusted optionality" },
    { label: "Peer Multiples", value: valuation.multiplesFairValueGbp, weight: valuation.methodWeights.multiples, note: "Core EPS times quality-adjusted peer P/E" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <AznMiniCard label="Blended Fair Value" value={formatGbp(valuation.blendedFairValueGbp)} subtext={`${formatPct(valuation.blendedFairValueGbp / dashboard.dataset.marketData.londonPriceGbp - 1)} vs London price`} />
        <AznMiniCard label="NYSE Ordinary FV" value={formatUsd(valuation.nyseOrdinaryFairValueUsd)} subtext="Current US ordinary-share listing, not legacy ADS." />
        <AznMiniCard label="Former ADR Equivalent" value={formatUsd(valuation.formerAdrFairValueUsd)} subtext="Historical 0.5 ordinary-share equivalent only." />
        <AznMiniCard label="Implied CAGR Return" value={formatPct(valuation.impliedCagrReturn)} subtext={`Dividend reinvestment component ${formatPct(valuation.dividendReinvestmentReturn)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {methods.map((method) => (
          <div key={method.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">{method.label}</p>
              <AznBadge tone={method.label === "Pipeline rNPV" ? "amber" : "blue"}>{formatPct(method.weight)}</AznBadge>
            </div>
            <p className="mt-3 text-2xl font-semibold text-ink">{formatGbp(method.value)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{method.note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        {valuation.sensitivityTables.map((table) => (
          <div key={table.title} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">{table.title}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-center text-xs">
                <tbody>
                  {table.table.map((row, rowIndex) => (
                    <tr key={`${table.title}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${table.title}-${rowIndex}-${cellIndex}`} className={`px-2 py-2 ${rowIndex === 0 || cellIndex === 0 ? "bg-slate-100 font-semibold text-slate-600" : "bg-slate-50 text-ink"}`}>
                          {typeof cell === "number" && rowIndex !== 0 && cellIndex !== 0 ? formatGbp(cell) : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
