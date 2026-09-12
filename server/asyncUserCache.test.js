import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncUserCache } from './asyncUserCache.js';

const entry = (value, ttlMs = 100) => ({ value, ttlMs });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('user keys isolate payloads; concurrent refreshes of the same user share work', async () => {
  const cache = new AsyncUserCache();
  const gate = deferred(); let calls = 0;
  const requests = Array.from({ length: 60 }, () => cache.load('user-a', () => { calls += 1; return gate.promise; }, { forceRefresh: true }));
  assert.equal(await cache.load('user-b', () => entry('B')), 'B');
  gate.resolve(entry('A'));
  assert.deepEqual(await Promise.all(requests), Array(60).fill('A'));
  assert.equal(calls, 1); assert.equal(cache.inFlightCount, 0);
});

test('TTL starts at completion, LRU is bounded, expired results are removed', async () => {
  let now = 0; const cache = new AsyncUserCache({ maxEntries: 2, now: () => now });
  await cache.load('a', () => { now = 1000; return entry('A'); });
  now = 1099;
  assert.equal(await cache.load('a', () => { throw Error('should be cached'); }), 'A');
  await cache.load('b', () => entry('B'));
  await cache.load('a', () => entry('unused'));
  await cache.load('c', () => entry('C'));
  assert.equal(cache.size, 2);
  assert.equal(await cache.load('b', () => entry('B2')), 'B2');
  now = 1300;
  await cache.load('d', () => entry('D'));
  assert.equal(cache.size, 1);
});

test('disconnect invalidation prevents late work from repopulating or removing a new request', async () => {
  const cache = new AsyncUserCache(); const old = deferred(); const fresh = deferred();
  const first = cache.load('a', () => old.promise);
  cache.delete('a');
  const second = cache.load('a', () => fresh.promise);
  old.resolve(entry('old credentials'));
  await first;
  assert.equal(cache.size, 0); assert.equal(cache.inFlightCount, 1);
  const third = cache.load('a', () => { throw Error('must join fresh work'); });
  fresh.resolve(entry('new connection'));
  assert.equal(await second, 'new connection'); assert.equal(await third, 'new connection');
  assert.equal(await cache.load('a', () => entry('unexpected')), 'new connection');
});

test('invalidating in-flight work does not evade the concurrency bound', async () => {
  const cache = new AsyncUserCache({ maxInFlight: 1 }); const gate = deferred();
  const first = cache.load('a', () => gate.promise); cache.delete('a');
  await assert.rejects(cache.load('b', () => entry('B')), { code: 'portfolio_sync_busy', status: 503 });
  gate.resolve(entry('A')); await first;
  assert.equal(await cache.load('b', () => entry('B')), 'B');
});

test('errors are retryable; force refresh replaces data without cross-user invalidation', async () => {
  const cache = new AsyncUserCache();
  await assert.rejects(cache.load('a', () => { throw Error('offline'); }), /offline/);
  assert.equal(cache.inFlightCount, 0);
  await cache.load('a', () => entry('A')); await cache.load('b', () => entry('B'));
  assert.equal(await cache.load('a', () => entry('A2'), { forceRefresh: true }), 'A2');
  cache.delete('a');
  assert.equal(await cache.load('b', () => entry('unexpected')), 'B');
  assert.equal(await cache.load('a', () => entry('A3')), 'A3');
});
