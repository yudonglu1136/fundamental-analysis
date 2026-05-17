const jobs = new Map();

export function createAznUpdateJob(request = {}) {
  const id = `azn-update-stub-${Date.now()}`;
  const job = {
    id,
    status: "stub_created",
    ticker: "AZN.L",
    networkFetchEnabled: false,
    message: "AZN backend update is intentionally stubbed. Run the local seed/backfill scripts to refresh pilot data.",
    request,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

export function getAznUpdateJob(id) {
  return jobs.get(id) ?? {
    id,
    status: "not_found",
    ticker: "AZN.L",
    message: "No AZN update job exists for this id in the in-memory stub registry.",
  };
}
