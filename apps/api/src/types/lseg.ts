export type LsegScenario = "Bear" | "Base" | "Bull";

export interface LsegSnapshotQuery {
  asOfDate?: string;
  eventId?: string;
}

export interface LsegValuationRunRequest extends LsegSnapshotQuery {
  scenario?: LsegScenario;
  modelVersion?: string;
  assumptions?: Record<string, unknown>;
}

export interface LsegApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
