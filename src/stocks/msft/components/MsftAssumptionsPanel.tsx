import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { Scenario } from "../../types";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import { TooltipInfo } from "../../../components/shared/TooltipInfo";
import { formatValue } from "../../../utils/formatting";
import type { MsftAssumptions } from "../assumptions";
import { msftAssumptionDefinitions, msftScenarioDefaults } from "../assumptions";

export function MsftAssumptionsPanel({
  values,
  onChange,
  onReset,
  activeScenario,
  categories,
  title = "AI Economics Assumptions",
  description = "Adjust the AI operating model to see how monetization, margins, CapEx, and valuation move together.",
}: {
  values: MsftAssumptions;
  onChange: (key: keyof MsftAssumptions, value: number) => void;
  onReset: (scenario: Scenario | "Consensus") => void;
  activeScenario: Scenario | "Custom";
  categories?: string[];
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const filtered = categories?.length ? msftAssumptionDefinitions.filter((item) => categories.includes(item.category)) : msftAssumptionDefinitions;
    return filtered.reduce<Record<string, typeof filtered>>((acc, item) => {
      acc[item.category] = acc[item.category] ? [...acc[item.category], item] : [item];
      return acc;
    }, {});
  }, [categories]);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-panel">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-ink">{title}</p>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{activeScenario}</span>
          {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="mb-5 flex flex-wrap gap-2">
            {(["Bear", "Base", "Bull"] as Scenario[]).map((scenario) => (
              <button key={scenario} type="button" onClick={() => onReset(scenario)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <RotateCcw className="h-4 w-4" />
                Reset to {scenario}
              </button>
            ))}
            <button type="button" onClick={() => onReset("Consensus")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <RotateCcw className="h-4 w-4" />
              Reset to Consensus
            </button>
          </div>

          <div className="space-y-6">
            {Object.entries(groups).map(([category, items]) => (
              <div key={category} className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{category}</h4>
                </div>
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-ink">{item.label}</p>
                            <TooltipInfo text={item.description} />
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            Bear {formatValue(msftScenarioDefaults.Bear[item.key as keyof MsftAssumptions], item.format, "USD")} · Base {formatValue(msftScenarioDefaults.Base[item.key as keyof MsftAssumptions], item.format, "USD")} · Bull{" "}
                            {formatValue(msftScenarioDefaults.Bull[item.key as keyof MsftAssumptions], item.format, "USD")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{formatValue(values[item.key as keyof MsftAssumptions], item.format, "USD")}</p>
                          <DataQualityBadge badge={item.source} />
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_120px]">
                        <input
                          type="range"
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={values[item.key as keyof MsftAssumptions]}
                          onChange={(event) => onChange(item.key as keyof MsftAssumptions, Number(event.target.value))}
                          className="w-full accent-sky-600"
                        />
                        <input
                          type="number"
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={Number(values[item.key as keyof MsftAssumptions].toFixed(item.step < 1 ? 3 : 1))}
                          onChange={(event) => onChange(item.key as keyof MsftAssumptions, Number(event.target.value))}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-sky-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
