import type { ValuationResult } from "../../stocks/types";
import { formatValue } from "../../utils/formatting";
import { SectionCard } from "./SectionCard";

export function ValuationSensitivity({ valuation, currency = "USD" }: { valuation: ValuationResult; currency?: string }) {
  return (
    <SectionCard title="Valuation" description="Scenario valuation and sensitivity tables anchored on each stock's module logic.">
      {valuation.warning ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{valuation.warning}</div> : null}
      {valuation.validationWarnings?.length ? (
        <div className="mb-4 space-y-2">
          {valuation.validationWarnings.map((warning) => (
            <div key={warning.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">{warning.title}</span>
              <span className="ml-2">{warning.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
      {valuation.customSummary ? <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{valuation.customSummary}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {valuation.methodCards.map((item) => (
          <div key={item.key} className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{formatValue(item.value, item.format, currency)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {valuation.fairValues.map((item) => (
          <div key={item.scenario} className="rounded-3xl bg-slate-50 p-5">
            <p className="font-semibold text-ink">{item.scenario}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Current Fair Value</p>
            <p className="mt-1 text-3xl font-semibold text-ink">{formatValue(item.fairValue, "currency", currency)}</p>
            <p className="mt-2 text-sm text-slate-600">Upside / downside: {formatValue(item.upsideDownside, "percent", currency)}</p>
            {typeof item.targetPrice3Y === "number" ? <p className="mt-2 text-sm text-slate-600">3Y target price: {formatValue(item.targetPrice3Y, "currency", currency)}</p> : null}
            <p className="mt-1 text-sm text-slate-600">Expected 3Y return: {formatValue(item.expectedReturn3Y, "percent", currency)}</p>
            {item.summary ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-3xl border border-slate-200 p-5">
        <p className="font-semibold text-ink">Expected Return Bridge</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {valuation.expectedReturnBridge.map((item) => (
            <div key={item.key} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{formatValue(item.value, item.format, currency)}</p>
              {item.description ? <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {valuation.sensitivityTables.map((table) => (
          <div key={table.title} className="rounded-3xl border border-slate-200 p-4">
            <p className="mb-3 font-semibold text-ink">{table.title}</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-center text-xs">
                <tbody>
                  {table.table.map((row, rowIndex) => (
                    <tr key={`${table.title}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${table.title}-${rowIndex}-${cellIndex}`} className={`rounded-xl px-3 py-2 ${rowIndex === 0 || cellIndex === 0 ? "bg-slate-100 font-medium text-slate-600" : "bg-slate-50 text-ink"}`}>
                          {typeof cell === "number" && rowIndex !== 0 && cellIndex !== 0 ? formatValue(cell, "currency", currency) : String(cell)}
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
    </SectionCard>
  );
}
