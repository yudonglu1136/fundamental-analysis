function generatedAtMillis(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isNewerSnapshot(incoming, current) {
  if (!current) return true;
  const incomingMillis = generatedAtMillis(incoming?.generated_at);
  const currentMillis = generatedAtMillis(current?.generated_at);
  if (incomingMillis == null) return false;
  if (currentMillis == null) return true;
  return incomingMillis > currentMillis;
}

export function valuationDashboardTickerCount(payloadJson) {
  try {
    const payload = JSON.parse(String(payloadJson || "{}"));
    return Array.isArray(payload.tickers) ? payload.tickers.length : 0;
  } catch {
    return 0;
  }
}

export function shouldInstallBundledValuationDashboard(incoming, current) {
  if (!isNewerSnapshot(incoming, current)) return false;
  if (!current) return true;
  const currentTickerCount = valuationDashboardTickerCount(current.payload_json);
  const incomingTickerCount = valuationDashboardTickerCount(incoming?.payload_json);
  return currentTickerCount === 0 || incomingTickerCount >= currentTickerCount;
}

export function shouldInstallBundledValuationTicker(incoming, current) {
  return isNewerSnapshot(incoming, current);
}
