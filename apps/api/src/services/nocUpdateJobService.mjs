const jobs = new Map();

export function createNocUpdateJob(request = {}) {
  const id = `noc-update-${Date.now()}`;
  const job = {
    id,
    ticker: "NOC",
    status: "queued",
    createdAt: new Date().toISOString(),
    request,
    message: "NOC unified backend update job accepted. The pilot can refresh official source documents, daily prices, and event-visible valuation runs.",
  };
  jobs.set(id, job);
  return job;
}

export function getNocUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    ticker: "NOC",
    status: "not_found",
  };
}
