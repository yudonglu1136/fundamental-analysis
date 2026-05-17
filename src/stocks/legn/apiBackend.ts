export type LegnBackendBundle = {
  events: unknown[];
  historicalValuations: unknown[];
  snapshot: Record<string, unknown> | null;
  loadedAt: string;
};

const apiModeEnabled = import.meta.env.VITE_LEGN_API_MODE === "true";
const apiBaseUrl = import.meta.env.VITE_LEGN_API_BASE_URL || "http://127.0.0.1:8787";

async function fetchJson(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`LEGN backend request failed: ${response.status} ${path}`);
  return response.json();
}

export function isLegnApiModeEnabled() {
  return apiModeEnabled;
}

export async function fetchLegnBackendBundle(): Promise<LegnBackendBundle> {
  const [eventsResponse, historicalResponse, snapshotResponse] = await Promise.all([
    fetchJson("/api/stocks/legn/events"),
    fetchJson("/api/stocks/legn/historical-valuations"),
    fetchJson("/api/stocks/legn/snapshot"),
  ]);
  return {
    events: eventsResponse.events ?? [],
    historicalValuations: historicalResponse.historicalValuations ?? [],
    snapshot: snapshotResponse ?? null,
    loadedAt: new Date().toISOString(),
  };
}
