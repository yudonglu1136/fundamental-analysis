const jobs = new Map();

export function createLegnUpdateJob(request = {}) {
  const id = `legn-update-${Date.now()}`;
  const job = {
    id,
    ticker: "LEGN",
    status: "queued",
    message: "LEGN unified backend update job queued. Automated refresh is stubbed in this phase; seed/backfill scripts own persistence.",
    request,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

export function getLegnUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    ticker: "LEGN",
    status: "not_found",
    message: "No LEGN update job with this id exists in memory.",
  };
}
