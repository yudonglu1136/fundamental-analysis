const jobs = new Map();

export function createDgeUpdateJob(request = {}) {
  const id = `dge-update-stub-${Date.now()}`;
  const job = {
    id,
    status: "stub_created",
    ticker: "DGE.L",
    networkFetchEnabled: false,
    message: "DGE.L backend update is intentionally script-driven. Run the local seed, price import and valuation backfill scripts to refresh pilot data.",
    request,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

export function getDgeUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    status: "not_found",
    ticker: "DGE.L",
    message: "No DGE.L update job exists for this id in the in-memory stub registry.",
  };
}
