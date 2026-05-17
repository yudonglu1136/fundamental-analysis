const jobs = new Map();

export function createMsftUpdateJob(request = {}) {
  const id = `msft-job-${Date.now()}`;
  const job = {
    id,
    ticker: "MSFT",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "MSFT backend pilot update job stub. Live ingestion orchestration is deferred to a later phase.",
  };
  jobs.set(id, job);
  return job;
}

export function getMsftUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "MSFT", status: "not_found" };
}
