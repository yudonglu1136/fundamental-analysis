export function compactStrictFailure(failure) {
  if (!failure || typeof failure !== "object") return null;
  return {
    code: failure.code || "strict_backtest_failed",
    date: failure.date || null,
    tickers: Array.isArray(failure.tickers) ? failure.tickers.slice(0, 8) : [],
    missingWeight: failure.missingWeight != null &&
      Number.isFinite(Number(failure.missingWeight))
      ? Number(failure.missingWeight)
      : null
  };
}
