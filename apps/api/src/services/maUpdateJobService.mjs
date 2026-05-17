const jobs = new Map();

export function createMaUpdateJob(request = {}) {
  const id = `ma-job-${Date.now()}`;
  const job = {
    id,
    ticker: "MA",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "MA backend update job stub. Run npm scripts for fetch, seed, price import, valuation backfill, and validation.",
  };
  jobs.set(id, job);
  return job;
}

export function getMaUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "MA", status: "not_found" };
}
