const jobs = new Map();

export function createIsrgUpdateJob(request = {}) {
  const id = `isrg-update-${Date.now()}`;
  const job = {
    id,
    ticker: "ISRG",
    status: "accepted",
    createdAt: new Date().toISOString(),
    request,
    message: "ISRG update jobs are stubbed in the backend pilot; run npm run isrg:backend:seed to refresh local SQLite.",
  };
  jobs.set(id, job);
  return job;
}

export function getIsrgUpdateJob(id) {
  return jobs.get(id) ?? null;
}

