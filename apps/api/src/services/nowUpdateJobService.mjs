const jobs = new Map();

export function createNowUpdateJob(request = {}) {
  const id = `now-job-${Date.now()}`;
  const job = {
    id,
    ticker: "NOW",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "NOW backend update job stub. Run npm scripts for fetch, seed, price import, valuation backfill, and validation.",
  };
  jobs.set(id, job);
  return job;
}

export function getNowUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "NOW", status: "not_found" };
}
