export function safeDivide(a: number, b: number) {
  return b ? a / b : 0;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function annualizeQuarterly(value: number) {
  return value * 4;
}
