const jobs = new Map();

export function createGildUpdateJob(payload = {}) {
  const id = `gild-update-${Date.now()}`;
  const job = {
    id,
    ticker: "GILD",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request: payload,
    message: "GILD update jobs are routed through the unified stock backend; run npm run gild:backend:seed to refresh the local SQLite seed.",
  };
  jobs.set(id, job);
  return job;
}

export function getGildUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    ticker: "GILD",
    status: "not_found",
    message: "No in-memory GILD update job exists for this API process.",
  };
}
