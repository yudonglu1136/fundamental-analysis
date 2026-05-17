const jobs = new Map();

export function createBmyUpdateJob(request = {}) {
  const id = `bmy-update-${Date.now()}`;
  const job = {
    id,
    ticker: "BMY",
    status: "accepted",
    createdAt: new Date().toISOString(),
    request,
    message: "BMY backend update jobs are accepted by the unified API. Data ingestion is performed by npm run bmy:backend:seed/import-prices.",
  };
  jobs.set(id, job);
  return job;
}

export function getBmyUpdateJob(jobId) {
  return jobs.get(jobId) ?? {
    id: jobId,
    ticker: "BMY",
    status: "not_found",
    message: "No in-memory BMY update job exists for this API process.",
  };
}
