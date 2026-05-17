const jobs = new Map();

export function createBaUpdateJob(request = {}) {
  const id = `ba-update-${Date.now()}`;
  const job = {
    id,
    ticker: "BA.L",
    status: "queued",
    createdAt: new Date().toISOString(),
    request,
    message: "BA.L unified backend update job accepted. Fetch/parse pipeline can refresh official source documents, market snapshots, and backfill valuations.",
  };
  jobs.set(id, job);
  return job;
}

export function getBaUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    ticker: "BA.L",
    status: "not_found",
  };
}
