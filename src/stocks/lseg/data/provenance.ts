import type { LsegConfidenceLevel } from "../model";

export type LsegQualityTag = "Actual" | "Guidance" | "Forecast Anchor" | "Assumption" | "Derived" | "Placeholder";

export type LsegProvenanceSourceType =
  | "company_disclosure"
  | "manual_snapshot"
  | "analyst_estimate"
  | "mock"
  | "derived"
  | "placeholder";

export type LsegProvenanceRecord = {
  id: string;
  qualityTag: LsegQualityTag;
  sourceType: LsegProvenanceSourceType;
  source: string;
  asOfDate?: string;
  period?: string;
  confidenceLevel?: LsegConfidenceLevel;
  notes?: string;
};

export type LsegRowWithProvenance<T> = {
  row: T;
  provenance: LsegProvenanceRecord;
};

export function stripProvenance<T>(rows: readonly LsegRowWithProvenance<T>[]): T[] {
  return rows.map((entry) => entry.row);
}

export function indexProvenanceById<T>(
  rows: readonly LsegRowWithProvenance<T>[],
  getId: (row: T) => string,
): Record<string, LsegProvenanceRecord> {
  return Object.fromEntries(rows.map((entry) => [getId(entry.row), entry.provenance]));
}
