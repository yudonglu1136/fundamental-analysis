const jobs = new Map();

export function createTriUpdateJob(request = {}) {
  const id = `tri-job-${Date.now()}`;
  const job = {
    id,
    ticker: "TRI",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "TRI backend pilot update job stub. Use the TRI seed, price import, and valuation backfill scripts for deterministic local refreshes.",
  };
  jobs.set(id, job);
  return job;
}

export function getTriUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "TRI", status: "not_found" };
}
