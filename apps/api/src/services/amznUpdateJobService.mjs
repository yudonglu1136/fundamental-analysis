const jobs = new Map();

export function createAmznUpdateJob(request = {}) {
  const id = `amzn-job-${Date.now()}`;
  const job = {
    id,
    ticker: "AMZN",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "AMZN backend update job stub. Run amzn:fetch-official, amzn:backend:seed, amzn:backend:import-prices, and amzn:backend:backfill-valuations for the local refresh path.",
  };
  jobs.set(id, job);
  return job;
}

export function getAmznUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "AMZN", status: "not_found" };
}
