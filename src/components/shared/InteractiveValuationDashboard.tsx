import { useEffect, useMemo, useRef, useState } from "react";
import type { Scenario, StockValuationConfig, ValuationResult } from "../../stocks/types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { ValuationAssumptionsPanel } from "./ValuationAssumptionsPanel";
import { ValuationSensitivity } from "./ValuationSensitivity";

function defaultsFromConfig(config: StockValuationConfig) {
  const defaults = Object.fromEntries(config.assumptions.map((assumption) => [assumption.key, assumption.value]));
  const priceMetadata = config.priceMetadata ?? priceMetadataByTicker[config.ticker];
  if (priceMetadata && "currentPrice" in defaults) {
    defaults.currentPrice = priceMetadata.currentPrice;
  }
  return defaults;
}

function scenarioFromConfig(config: StockValuationConfig, scenario: Scenario) {
  return config.scenarios.find((item) => item.name === scenario)?.assumptions ?? defaultsFromConfig(config);
}

function clampAssumptionValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeAssumptions(config: StockValuationConfig, rawValues: Record<string, number> | null | undefined, fallback: Record<string, number>) {
  if (!rawValues) return fallback;
  return config.assumptions.reduce<Record<string, number>>((acc, assumption) => {
    const rawValue = rawValues[assumption.key];
    acc[assumption.key] = Number.isFinite(rawValue) ? clampAssumptionValue(rawValue, assumption.min, assumption.max) : fallback[assumption.key];
    return acc;
  }, {});
}

function readStoredScenarioMode(storageKey: string, fallback: Scenario | "Custom") {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(storageKey);
  return stored === "Bear" || stored === "Base" || stored === "Bull" || stored === "Custom" ? stored : fallback;
}

export function InteractiveValuationDashboard({
  ticker,
  config,
  data,
  scenario,
  currency,
  values: controlledValues,
  onValuesChange,
}: {
  ticker: string;
  config: StockValuationConfig;
  data: unknown;
  scenario: Scenario;
  currency: string;
  values?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
}) {
  const storageKey = `valuation-assumptions-${ticker}`;
  const modeStorageKey = `valuation-scenario-mode-${ticker}`;
  const didMountRef = useRef(false);
  const isControlled = controlledValues !== undefined;
  const [activePreset, setActivePreset] = useState<Scenario | "Custom">(() => readStoredScenarioMode(modeStorageKey, scenario));
  const [internalValues, setInternalValues] = useState<Record<string, number>>(() => {
    const fallback = scenarioFromConfig(config, scenario);
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try {
          return sanitizeAssumptions(config, JSON.parse(saved) as Record<string, number>, fallback);
        } catch {
          return fallback;
        }
      }
    }
    return fallback;
  });
  const values = useMemo(() => sanitizeAssumptions(config, controlledValues ?? internalValues, scenarioFromConfig(config, scenario)), [config, controlledValues, internalValues, scenario]);

  useEffect(() => {
    if (isControlled && !onValuesChange) {
      console.warn(`[valuation:${ticker}] Controlled valuation inputs were provided without onValuesChange.`);
    }
  }, [isControlled, onValuesChange, ticker]);

  useEffect(() => {
    if (!values || Object.keys(values).length === 0) {
      console.warn(`[valuation:${ticker}] Assumptions object is undefined or empty. Falling back to scenario defaults.`);
    }
  }, [ticker, values]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const next = scenarioFromConfig(config, scenario);
    if (onValuesChange) onValuesChange(next);
    else setInternalValues(next);
    setActivePreset(scenario);
  }, [config, scenario, ticker]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(values));
      window.localStorage.setItem(modeStorageKey, activePreset);
    }
  }, [activePreset, modeStorageKey, storageKey, values]);

  const valuationInputs = useMemo(
    () => (activePreset === "Custom" ? values : scenarioFromConfig(config, activePreset)),
    [activePreset, config, values],
  );
  const valuation = useMemo<ValuationResult>(
    () => config.calculateValuation(valuationInputs, data, activePreset === "Custom" ? scenario : activePreset),
    [activePreset, config, valuationInputs, data, scenario],
  );
  const scenarioCards = useMemo(() => {
    return (["Bear", "Base", "Bull"] as Scenario[]).map((preset) => ({
      scenario: preset,
      result:
        config.calculateValuation(scenarioFromConfig(config, preset), data, preset).fairValues.find((item) => item.scenario === preset) ??
        config.calculateValuation(scenarioFromConfig(config, preset), data, preset).fairValues[0],
    }));
  }, [config, data]);

  const selectedScenario = activePreset === "Custom" ? scenario : activePreset;
  const currentResult = valuation.fairValues.find((item) => item.scenario === selectedScenario) ?? valuation.fairValues[0];
  const decoratedValuation: ValuationResult = {
    ...valuation,
    fairValues: scenarioCards.map(({ scenario: preset, result }) => ({
      ...result,
      scenario: preset,
      summary: activePreset === preset ? "Top-nav scenario defaults" : undefined,
    })),
    customSummary: activePreset === "Custom" ? `Custom assumption set implies ${currency} ${currentResult.fairValue.toFixed(1)} fair value and ${(currentResult.upsideDownside * 100).toFixed(1)}% upside/downside.` : undefined,
  };

  function updateValues(next: Record<string, number>, nextMode?: Scenario | "Custom") {
    const sanitized = sanitizeAssumptions(config, next, scenarioFromConfig(config, scenario));
    if (onValuesChange) onValuesChange(sanitized);
    else setInternalValues(sanitized);
    if (nextMode) setActivePreset(nextMode);
  }

  function handleChange(key: string, value: number) {
    const assumption = config.assumptions.find((item) => item.key === key);
    if (!assumption) {
      console.warn(`[valuation:${ticker}] Missing valuation assumption config for key "${key}".`);
      return;
    }
    if (!Number.isFinite(value)) {
      console.warn(`[valuation:${ticker}] Ignoring invalid numeric input for "${key}".`, value);
      return;
    }
    const next = { ...values, [key]: clampAssumptionValue(value, assumption.min, assumption.max) };
    updateValues(next, "Custom");
  }

  function handleReset(target: Scenario | "consensus") {
    if (target === "consensus") {
      const next = defaultsFromConfig(config);
      updateValues(next, "Custom");
      return;
    }
    const next = scenarioFromConfig(config, target);
    updateValues(next, target);
  }

  return (
    <div className="space-y-6">
      <ValuationAssumptionsPanel config={config} values={values} activeScenario={activePreset} onChange={handleChange} onReset={handleReset} />
      <ValuationSensitivity valuation={decoratedValuation} currency={currency} />
    </div>
  );
}
