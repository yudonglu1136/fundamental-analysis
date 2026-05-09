import { useMemo, useState } from "react";
import type { Scenario, StockValuationConfig } from "../../stocks/types";
import { DataQualityBadge } from "./DataQualityBadge";
import { TooltipInfo } from "./TooltipInfo";
import { formatValue } from "../../utils/formatting";

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ValuationAssumptionsPanel({
  config,
  values,
  activeScenario,
  onChange,
  onReset,
}: {
  config: StockValuationConfig;
  values: Record<string, number>;
  activeScenario: Scenario | "Custom";
  onChange: (key: string, value: number) => void;
  onReset: (preset: Scenario | "consensus") => void;
}) {
  const [open, setOpen] = useState(true);
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof config.assumptions>();
    config.assumptions.forEach((assumption) => {
      const items = groups.get(assumption.category) ?? [];
      items.push(assumption);
      groups.set(assumption.category, items);
    });
    return [...groups.entries()];
  }, [config.assumptions]);

  const scenarioDefaults = useMemo(() => {
    const lookup: Record<Scenario, Record<string, number>> = {
      Bear: {},
      Base: {},
      Bull: {},
    };
    config.scenarios.forEach((scenario) => {
      lookup[scenario.name] = scenario.assumptions;
    });
    return lookup;
  }, [config.scenarios]);

  function handleSliderChange(key: string, rawValue: string, min: number, max: number) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      console.warn(`[valuation] Ignoring invalid slider value for "${key}".`, rawValue);
      return;
    }
    onChange(key, clampValue(parsed, min, max));
  }

  function handleInputChange(key: string, rawValue: string, min: number, max: number) {
    if (rawValue.trim() === "") return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      console.warn(`[valuation] Ignoring invalid numeric input for "${key}".`, rawValue);
      return;
    }
    onChange(key, clampValue(parsed, min, max));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <p className="font-semibold text-ink">Valuation Assumptions</p>
          <p className="text-sm text-slate-500">
            {config.modelType} model · Active preset: <span className="font-medium text-ink">{activeScenario}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResetButton label="Reset Bear" onClick={() => onReset("Bear")} />
          <ResetButton label="Reset Base" onClick={() => onReset("Base")} />
          <ResetButton label="Reset Bull" onClick={() => onReset("Bull")} />
          <ResetButton label="Reset Consensus Defaults" onClick={() => onReset("consensus")} />
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-5 py-5">
          <div className="space-y-6">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{category}</p>
                <div className="space-y-4">
                  {items.map((assumption) => (
                    <div key={assumption.key} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-ink">{assumption.label}</p>
                            <TooltipInfo text={assumption.description} />
                            <DataQualityBadge badge={assumption.source} />
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            Bear {formatValue(scenarioDefaults.Bear[assumption.key] ?? assumption.value, assumption.format)} · Base {formatValue(scenarioDefaults.Base[assumption.key] ?? assumption.value, assumption.format)} · Bull{" "}
                            {formatValue(scenarioDefaults.Bull[assumption.key] ?? assumption.value, assumption.format)}
                          </p>
                          {assumption.unit || assumption.periodicity || assumption.asOfDate || assumption.provenance ? (
                            <p className="mt-1 text-xs text-slate-400">
                              {[assumption.unit, assumption.periodicity, assumption.asOfDate, assumption.provenance].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-ink">{formatValue(values[assumption.key] ?? assumption.value, assumption.format)}</p>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_120px]">
                        <input
                          type="range"
                          min={assumption.min}
                          max={assumption.max}
                          step={assumption.step}
                          value={values[assumption.key] ?? assumption.value}
                          onChange={(event) => handleSliderChange(assumption.key, event.target.value, assumption.min, assumption.max)}
                          className="w-full accent-[#21486f]"
                        />
                        <input
                          type="number"
                          step={assumption.step}
                          min={assumption.min}
                          max={assumption.max}
                          inputMode="decimal"
                          value={values[assumption.key] ?? assumption.value}
                          onChange={(event) => handleInputChange(assumption.key, event.target.value, assumption.min, assumption.max)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-ink"
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

function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
    >
      {label}
    </button>
  );
}
