const DEFAULT_SUCCESS_TTL_MS = 30_000;
const DEFAULT_FAILURE_TTL_MS = 1_000;

function boundedTtl(value, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.min(numeric, maximum)
    : maximum;
}

/**
 * Coalesce and briefly cache the public health aggregate.
 *
 * Building the aggregate verifies every required Guru curve and reads the
 * large production SQLite catalog. Running that synchronous audit once per
 * concurrent load-balancer/browser probe can starve the event loop long
 * enough for the delegated Ontology verification to time out. The service
 * shares one in-flight verification and only reuses a completed result for a
 * bounded interval. It never serves an older healthy result after a failed
 * revalidation.
 */
export function createPublicHealthService({
  resolveOntology,
  buildHealth,
  now = Date.now,
  successTtlMs = process.env.PUBLIC_HEALTH_SUCCESS_TTL_MS || DEFAULT_SUCCESS_TTL_MS,
  failureTtlMs = process.env.PUBLIC_HEALTH_FAILURE_TTL_MS || DEFAULT_FAILURE_TTL_MS
} = {}) {
  if (typeof resolveOntology !== "function") {
    throw new TypeError("resolveOntology must be a function");
  }
  if (typeof buildHealth !== "function") {
    throw new TypeError("buildHealth must be a function");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const healthyTtl = boundedTtl(successTtlMs, DEFAULT_SUCCESS_TTL_MS);
  const failedTtl = boundedTtl(failureTtlMs, DEFAULT_FAILURE_TTL_MS);
  let cached = null;
  let inFlight = null;

  async function read({ force = false } = {}) {
    const requestedAt = Number(now());
    if (
      !force &&
      cached &&
      Number.isFinite(requestedAt) &&
      requestedAt < cached.expiresAt
    ) {
      return cached.value;
    }
    if (inFlight) return inFlight;

    const pending = (async () => {
      const ontology = await resolveOntology();
      const generatedAt = Number(now());
      const health = buildHealth({
        ontology,
        ...(Number.isFinite(generatedAt) ? { now: generatedAt } : {})
      });
      const ttl = health?.ok === true ? healthyTtl : failedTtl;
      cached = {
        value: health,
        expiresAt: (Number.isFinite(generatedAt) ? generatedAt : Date.now()) + ttl
      };
      return health;
    })();

    inFlight = pending;
    try {
      return await pending;
    } finally {
      if (inFlight === pending) inFlight = null;
    }
  }

  function clear() {
    cached = null;
  }

  return { read, clear };
}
