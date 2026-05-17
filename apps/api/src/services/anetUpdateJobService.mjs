const jobs = new Map();

export function createAnetUpdateJob(request = {}) {
  const id = `anet-job-${Date.now()}`;
  const job = {
    id,
    ticker: "ANET",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "ANET backend update job stub. Run npm scripts for fetch, seed, price import, valuation backfill, and validation.",
  };
  jobs.set(id, job);
  return job;
}

export function getAnetUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "ANET", status: "not_found" };
}
