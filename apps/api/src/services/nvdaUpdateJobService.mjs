const jobs = new Map();

export function createNvdaUpdateJob(request = {}) {
  const id = `nvda-job-${Date.now()}`;
  const job = {
    id,
    ticker: "NVDA",
    status: "stub_created",
    createdAt: new Date().toISOString(),
    request,
    message: "NVDA backend update job stub. Run nvda:fetch-official, nvda:backend:seed, nvda:backend:import-prices, and nvda:backend:backfill-valuations for the local refresh path.",
  };
  jobs.set(id, job);
  return job;
}

export function getNvdaUpdateJob(id) {
  return jobs.get(id) ?? { id, ticker: "NVDA", status: "not_found" };
}
