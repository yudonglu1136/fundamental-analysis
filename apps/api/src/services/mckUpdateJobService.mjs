const jobs = new Map();

export function createMckUpdateJob(request = {}) {
  const id = `mck-update-${Date.now()}`;
  const job = {
    id,
    status: "stub_created",
    request,
    createdAt: new Date().toISOString(),
    message: "MCK backend update job accepted. Automated network refresh is handled by mck_fetch_official_data.mjs in this pilot.",
  };
  jobs.set(id, job);
  return job;
}

export function getMckUpdateJob(id) {
  return jobs.get(id) ?? { id, status: "not_found" };
}
