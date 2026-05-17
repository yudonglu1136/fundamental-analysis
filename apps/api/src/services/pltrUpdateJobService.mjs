const jobs = new Map();

export function createPltrUpdateJob(payload = {}) {
  const id = `pltr-update-${Date.now()}`;
  const job = {
    id,
    ticker: "PLTR",
    status: "stub_created",
    message: "PLTR update jobs are routed through the unified stock backend; run npm run pltr:backend:seed and npm run pltr:backend:import-prices to refresh local SQLite.",
    request: payload,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

export function getPltrUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    ticker: "PLTR",
    status: "not_found",
    message: "No PLTR update job found in this in-memory API process.",
  };
}
