import type { Scenario } from "../../types";
import type { LegnEvidenceRecord, LegnExplainability, LegnScenarioKey } from "../types";

export function safeRatio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function scenarioKey(scenario: Scenario): LegnScenarioKey {
  return scenario.toLowerCase() as LegnScenarioKey;
}

export function scenarioMultiplier(scenario: Scenario, bear = 0.8, base = 1, bull = 1.2) {
  if (scenario === "Bear") return bear;
  if (scenario === "Bull") return bull;
  return base;
}

export function discountFactor(year: number, baseYear: number, discountRate: number) {
  return (1 + discountRate) ** Math.max(year - baseYear, 0);
}

export function pv(value: number, year: number, baseYear: number, discountRate: number) {
  return value / discountFactor(year, baseYear, discountRate);
}

export function evidenceMap(evidence: LegnEvidenceRecord[]) {
  return new Map(evidence.map((item) => [item.id, item]));
}

export function explain(summary: string, formula: string, evidenceIds: string[], keyAssumptions: string[]): LegnExplainability {
  return { summary, formula, evidenceIds: Array.from(new Set(evidenceIds)), keyAssumptions };
}

export function formatUsdM(value: number) {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}m`;
}

export function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
