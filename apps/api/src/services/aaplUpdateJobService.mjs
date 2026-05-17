const jobs = new Map();

export function createAaplUpdateJob(request = {}) {
  const id = `aapl-job-${Date.now()}`;
  const job = {
    id,
    ticker: "AAPL",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "AAPL backend update job stub. Run npm scripts for fetch, seed, price import, and valuation backfill.",
  };
  jobs.set(id, job);
  return job;
}

export function getAaplUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "AAPL", status: "not_found" };
}
