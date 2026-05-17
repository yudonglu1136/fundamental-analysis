const jobs = new Map();

export function createTsmUpdateJob(body = {}) {
  const id = `tsm-update-${Date.now()}`;
  const job = {
    id,
    ticker: "TSM",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request: body,
    message: "TSM backend update job stub created. Seed/import/backfill scripts own the current backend refresh path.",
  };
  jobs.set(id, job);
  return job;
}

export function getTsmUpdateJob(jobId) {
  return jobs.get(jobId) ?? { id: jobId, ticker: "TSM", status: "not_found" };
}
