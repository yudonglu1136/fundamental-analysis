const jobs = new Map();

export function createRtxUpdateJob(request = {}) {
  const id = `rtx-job-${Date.now()}`;
  const job = {
    id,
    ticker: "RTX",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "RTX backend update job stub. Live ingestion orchestration remains on the unified backend and can be promoted later.",
  };
  jobs.set(id, job);
  return job;
}

export function getRtxUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "RTX", status: "not_found" };
}
