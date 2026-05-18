const jobs = new Map();

export function createCegUpdateJob(payload = {}) {
  const id = `ceg-update-${Date.now()}`;
  const job = {
    id,
    ticker: "CEG",
    status: "accepted",
    createdAt: new Date().toISOString(),
    payload,
    message: "CEG backend update jobs are run through scripts/backend_runner.mjs and ticker-specific seed/import/backfill scripts.",
  };
  jobs.set(id, job);
  return job;
}

export function getCegUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "CEG", status: "not_found" };
}
