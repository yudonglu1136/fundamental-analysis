const jobs = new Map();

export function createVUpdateJob(request = {}) {
  const id = `v-job-${Date.now()}`;
  const job = {
    id,
    ticker: "V",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "V backend update job stub. Run npm scripts for fetch, seed, price import, valuation backfill, and validation.",
  };
  jobs.set(id, job);
  return job;
}

export function getVUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "V", status: "not_found" };
}
