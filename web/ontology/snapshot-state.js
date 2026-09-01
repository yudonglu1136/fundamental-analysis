(function bootstrapOntologySnapshotState(root) {
  const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

  function validTimestamp(value) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function classify(health, { now = Date.now() } = {}) {
    if (!health || health.ok !== true || health.exists !== true || Number(health.sizeBytes || 0) <= 0) {
      return {
        state: "error",
        generatedAt: null,
        ageDays: null,
        reason: health?.error || "Ontology snapshot health check failed"
      };
    }

    if (health.mode === "live" || health.live === true) {
      return { state: "live", generatedAt: null, ageDays: 0, reason: null };
    }

    const generatedAt = health.manifest?.generated_at || health.updatedAt;
    const generatedTimestamp = validTimestamp(generatedAt);
    if (generatedTimestamp === null || generatedTimestamp > now + 5 * 60 * 1000) {
      return {
        state: "error",
        generatedAt: generatedAt || null,
        ageDays: null,
        reason: "Ontology snapshot timestamp is invalid"
      };
    }

    const ageMs = Math.max(0, now - generatedTimestamp);
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    return {
      state: ageMs > staleAfterMs ? "stale" : "cached",
      generatedAt: new Date(generatedTimestamp).toISOString(),
      ageDays,
      reason: null
    };
  }

  root.OntologySnapshotState = Object.freeze({ classify, staleAfterMs });
})(globalThis);
