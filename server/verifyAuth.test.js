import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
  SUPABASE_AUTH_TIMEOUT_MS: process.env.SUPABASE_AUTH_TIMEOUT_MS,
  SUPABASE_AUTH_CACHE_TTL_MS: process.env.SUPABASE_AUTH_CACHE_TTL_MS
};

const {
  resetRemoteAuthVerificationCacheForTests,
  verifySupabaseAccessToken
} = await import("./auth/verifyAuth.js");

function token(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  delete process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_AUTH_TIMEOUT_MS = "100";
  process.env.SUPABASE_AUTH_CACHE_TTL_MS = "30000";
  resetRemoteAuthVerificationCacheForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetRemoteAuthVerificationCacheForTests();
});

test("remote Supabase verification caches only a successful result", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      id: "user-1",
      email: "investor@example.com",
      app_metadata: { provider: "google" },
      user_metadata: { full_name: "Investor" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const accessToken = token({ exp: Math.floor(Date.now() / 1000) + 300 });
  const first = await verifySupabaseAccessToken(accessToken);
  const second = await verifySupabaseAccessToken(accessToken);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls, 1);
});

test("remote verification does not cache rejected tokens", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("{}", { status: 401 });
  };
  const accessToken = token({ exp: Math.floor(Date.now() / 1000) + 300 });
  assert.equal((await verifySupabaseAccessToken(accessToken)).status, 401);
  assert.equal((await verifySupabaseAccessToken(accessToken)).status, 401);
  assert.equal(calls, 2);
});

test("remote verification times out as an upstream availability error", async () => {
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const started = Date.now();
  const result = await verifySupabaseAccessToken(
    token({ exp: Math.floor(Date.now() / 1000) + 300 })
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "auth_unavailable");
  assert.ok(Date.now() - started < 1_000);
});

test("remote cache never outlives the JWT expiry", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
  };
  const expiredToken = token({ exp: Math.floor(Date.now() / 1000) - 1 });
  assert.equal((await verifySupabaseAccessToken(expiredToken)).ok, true);
  assert.equal((await verifySupabaseAccessToken(expiredToken)).ok, true);
  assert.equal(calls, 2);
});
