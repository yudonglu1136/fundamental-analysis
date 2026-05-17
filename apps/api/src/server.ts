// TypeScript entrypoint placeholder for the backend pilot.
//
// The repo does not currently install a TS runtime such as tsx or ts-node.
// The runnable Phase 1 API entrypoint is apps/api/src/server.mjs and is
// intentionally dependency-free. This file keeps the intended TS boundary
// visible for the next backend phase.
export type BackendPilotEntrypoint = {
  runtimeEntrypoint: "apps/api/src/server.mjs";
  service: "fundamental-analysis-api";
};
