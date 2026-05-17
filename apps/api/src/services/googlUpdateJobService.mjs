const jobs = new Map();

export function createGooglUpdateJob(request = {}) {
  const id = `googl-job-${Date.now()}`;
  const job = {
    id,
    ticker: "GOOGL",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "GOOGL backend pilot update job stub. Live ingestion orchestration is deferred to a later phase.",
  };
  jobs.set(id, job);
  return job;
}

export function getGooglUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "GOOGL", status: "not_found" };
}
