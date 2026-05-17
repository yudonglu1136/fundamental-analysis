const jobs = new Map();

export function createMetaUpdateJob(request = {}) {
  const id = `meta-job-${Date.now()}`;
  const job = {
    id,
    ticker: "META",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "META backend update job stub. Live official-source ingestion orchestration is deferred to a later phase.",
  };
  jobs.set(id, job);
  return job;
}

export function getMetaUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "META", status: "not_found" };
}
