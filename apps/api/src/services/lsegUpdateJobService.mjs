import { randomUUID } from "node:crypto";

const jobs = new Map();

export function createLsegUpdateJob({ mode = "stub", runSeed = false } = {}) {
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  const job = {
    jobId,
    ticker: "LSEG.L",
    mode,
    runSeed,
    status: "queued",
    message: "Phase 1 backend pilot does not fetch network data. Run npm run lseg:backend:seed for local refresh.",
    createdAt,
    updatedAt: createdAt,
  };
  jobs.set(jobId, job);
  return job;
}

export function getLsegUpdateJob(jobId) {
  return jobs.get(jobId) ?? {
    jobId,
    ticker: "LSEG.L",
    status: "not_found",
    message: "Job is not present in the in-memory Phase 1 job registry.",
  };
}
