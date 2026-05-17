import type { Signal } from "../../types";

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined, fallback = 0) {
  if (numerator == null || denominator == null || denominator === 0) return fallback;
  return numerator / denominator;
}

export function average(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const denominator = values.reduce((sum, item) => sum + item.weight, 0);
  if (denominator === 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / denominator;
}

export function scoreFromGrowth(growth: number, neutral = 0, scale = 0.1) {
  return clamp(50 + ((growth - neutral) / scale) * 50);
}

export function signalFromScore(score: number): Signal {
  if (score >= 70) return "Positive";
  if (score >= 55) return "Inflecting";
  if (score >= 40) return "Neutral";
  if (score >= 25) return "Needs Review";
  return "Negative";
}

export function normalizeWeights(weights: Record<string, number>) {
  const sum = Object.values(weights).reduce((total, value) => total + Math.max(value, 0), 0);
  if (sum === 0) return Object.fromEntries(Object.keys(weights).map((key) => [key, 0]));
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.max(value, 0) / sum]));
}

export function evidenceList(...groups: Array<string[]>) {
  return Array.from(new Set(groups.flat()));
}

export function formatPercentText(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
