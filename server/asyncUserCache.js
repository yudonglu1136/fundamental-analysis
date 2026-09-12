// Process-local acceleration only: durable user data remains in its store.
// In-flight work has its own bound; invalidating a key cannot resurrect an old
// result after a user changes/disconnects their broker connection.
export class AsyncUserCache {
  #entries = new Map();
  #pending = new Map();
  #active = 0;

  constructor({ maxEntries = 128, maxInFlight = 64, now = Date.now } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1
      || !Number.isSafeInteger(maxInFlight) || maxInFlight < 1) throw new Error("Invalid cache bounds");
    this.maxEntries = maxEntries;
    this.maxInFlight = maxInFlight;
    this.now = now;
  }

  get size() { return this.#entries.size; }
  get inFlightCount() { return this.#active; }

  delete(key) {
    this.#entries.delete(key);
    this.#pending.delete(key);
  }

  async load(key, loader, { forceRefresh = false } = {}) {
    const now = this.now();
    for (const [id, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(id);
    }
    const cached = this.#entries.get(key);
    if (!forceRefresh && cached) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached.value;
    }
    if (this.#pending.has(key)) return this.#pending.get(key).promise;
    if (this.#active >= this.maxInFlight) {
      throw Object.assign(new Error("Portfolio synchronization is busy. Please retry shortly."),
        { status: 503, code: "portfolio_sync_busy" });
    }
    const work = {};
    this.#active += 1;
    this.#pending.set(key, work);
    work.promise = Promise.resolve().then(loader).then(({ value, ttlMs }) => {
      if (this.#pending.get(key) === work && Number.isFinite(ttlMs) && ttlMs > 0) {
        this.#entries.delete(key);
        this.#entries.set(key, { value, expiresAt: this.now() + ttlMs });
        while (this.#entries.size > this.maxEntries) this.#entries.delete(this.#entries.keys().next().value);
      }
      return value;
    }).finally(() => {
      this.#active -= 1;
      if (this.#pending.get(key) === work) this.#pending.delete(key);
    });
    return work.promise;
  }
}
