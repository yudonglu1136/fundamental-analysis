import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import express from "express";
import { ADMIN_OWNER_EMAIL, adminResponsePrivacy, isAdminOwner, requireAdmin } from "./auth/requireAdmin.js";
import { requireAuth } from "./auth/requireAuth.js";
import { resetRemoteAuthVerificationCacheForTests } from "./auth/verifyAuth.js";

const owner = { id: "owner-id", email: ADMIN_OWNER_EMAIL, provider: "google" };

function guard(request) {
  let called = false;
  const result = { headers: {}, status: 200 };
  const response = {
    setHeader(name, value) { result.headers[name] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; }
  };
  requireAdmin(request, response, () => { called = true; });
  return { ...result, called };
}

test("the Admin policy grants only the canonical account, not env roles or lookalikes", (t) => {
  const previous = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "other@example.test,*";
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previous; });
  assert.equal(isAdminOwner(owner), true);
  assert.equal(isAdminOwner({ ...owner, email: ` ${ADMIN_OWNER_EMAIL.toUpperCase()} ` }), true);
  for (const user of [
    null, {}, { ...owner, id: "" }, { ...owner, id: ["owner-id"] },
    { ...owner, email: "other@example.test", role: "admin" },
    { ...owner, email: "luyudong1136+admin@gmail.com" },
    { ...owner, email: "luyudong1136@gmail.com.example.test" },
    { ...owner, email: [ADMIN_OWNER_EMAIL] },
    { ...owner, isAnonymous: true }, { ...owner, provider: "local-dev" }
  ]) assert.equal(isAdminOwner(user), false);
});

test("Admin requires the same server-verified identity and never trusts editable metadata", () => {
  const permitted = guard({ user: owner, auth: { user: owner } });
  assert.equal(permitted.called, true);
  assert.equal(permitted.headers["Cache-Control"], "no-store");
  for (const request of [
    {}, { user: owner }, { auth: { user: owner } },
    { user: owner, auth: { user: { ...owner, id: "different-id" } } },
    { user: { ...owner, email: "member@example.test" }, auth: { user: owner } },
    { user: owner, auth: { claims: { email: ADMIN_OWNER_EMAIL } } },
    { user: { id: "member-id", email: "member@example.test", user_metadata: { email: ADMIN_OWNER_EMAIL, role: "admin" } } },
    { body: { user: owner }, query: { email: ADMIN_OWNER_EMAIL }, headers: { "x-admin-email": ADMIN_OWNER_EMAIL } }
  ]) {
    const denied = guard(request);
    assert.equal(denied.status, 403);
    assert.equal(denied.called, false);
    assert.equal(denied.headers["Cache-Control"], "no-store");
  }
});

const adminEndpoints = [
  ["GET", "/api/admin/system-health"],
  ["GET", "/api/admin/portfolio-users"],
  ["GET", "/api/admin/portfolio-users/:hash"],
  ["GET", "/api/admin/login-activity"],
  ["GET", "/api/admin/backtests/status"],
  ["POST", "/api/admin/backtests/refresh"]
];

test("all current Admin APIs have a route guard plus a central pre-handler guard", () => {
  const sources = ["index.js", "adminPortfolioUsersRoute.js", "loginActivityRoutes.js"]
    .map((file) => fs.readFileSync(new URL(file, import.meta.url), "utf8"));
  const found = sources.flatMap((source) => [...source.matchAll(/app\.(get|post|put|patch|delete)\("(\/api\/admin\/[^\"]+)"\s*,\s*([^,\s]+)/g)]
    .map((match) => { assert.equal(match[3], "requireAdmin"); return [match[1].toUpperCase(), match[2]]; }));
  assert.deepEqual(found.sort(), [...adminEndpoints].sort());
  const [entry] = sources;
  const authIndex = entry.indexOf('app.use("/api", requireAuth)');
  const privacyIndex = entry.indexOf('app.use("/api/admin", adminResponsePrivacy)');
  const guardIndex = entry.indexOf('app.use("/api/admin", requireAdmin)');
  const firstHandler = entry.indexOf("registerLoginActivityRoutes(app)");
  assert.ok(authIndex >= 0 && guardIndex > authIndex && firstHandler > guardIndex);
  assert.ok(privacyIndex >= 0 && privacyIndex < authIndex);
  assert.ok(!entry.includes("process.env.ADMIN_EMAILS"));
});

test("real auth denies every Admin endpoint to non-owner tokens without touching private data", async (t) => {
  const envKeys = ["SUPABASE_JWT_SECRET", "SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_EMAILS", "API_AUTH_DEV_BYPASS", "NODE_ENV"];
  const old = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.SUPABASE_JWT_SECRET = "synthetic-owner-policy-test-only";
  process.env.ADMIN_EMAILS = "member@example.test";
  process.env.API_AUTH_DEV_BYPASS = "true";
  process.env.NODE_ENV = "development";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  t.after(() => { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });

  const sign = (claims, secret = process.env.SUPABASE_JWT_SECRET) => {
    const body = [Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: "signed-id", exp: Date.now() / 1000 + 300, ...claims })).toString("base64url")].join(".");
    return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
  };
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminResponsePrivacy);
  app.use("/api", requireAuth);
  app.use("/api/admin", requireAdmin);
  let reads = 0;
  for (const [method, route] of adminEndpoints) app[method.toLowerCase()](route, requireAdmin, (_request, response) => { reads++; response.json({ ownerOnly: true }); });
  app.get("/api/portfolio", (request, response) => response.json({ userId: request.user.id }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const memberToken = sign({ email: "member@example.test", role: "admin", user_metadata: { email: ADMIN_OWNER_EMAIL, is_admin: true }, app_metadata: { role: "admin" } });
  for (const [method, route] of adminEndpoints) {
    const url = `${origin}${route.replace(":hash", "a".repeat(40))}?email=${ADMIN_OWNER_EMAIL}`;
    for (const [token, status] of [
      [null, 401], ["invalid", 401],
      [sign({ email: ADMIN_OWNER_EMAIL }, "wrong-signing-key"), 401],
      [memberToken, 403], [sign({ email: ADMIN_OWNER_EMAIL, is_anonymous: true }), 403],
      ["local-dev-token", 403]
    ]) {
      const response = await fetch(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-admin-email": ADMIN_OWNER_EMAIL, "content-type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify({ user: owner, email: ADMIN_OWNER_EMAIL }) } : {}) });
      assert.equal(response.status, status, `${method} ${route}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  assert.equal(reads, 0);
  for (const [method, route] of adminEndpoints) {
    const response = await fetch(`${origin}${route.replace(":hash", "a".repeat(40))}`, { method, headers: { authorization: `Bearer ${sign({ email: ADMIN_OWNER_EMAIL })}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(reads, adminEndpoints.length);
  const mixedCase = await fetch(`${origin}/API/ADMIN/system-health`, { headers: { authorization: `Bearer ${memberToken}` } });
  assert.equal(mixedCase.status, 403);
  assert.equal((await fetch(`${origin}/api/portfolio`, { headers: { authorization: `Bearer ${memberToken}` } })).status, 200);
});

test("remote verification ignores owner email forged inside token and editable metadata", async (t) => {
  const previousFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.SUPABASE_URL = "https://owner-policy-test.supabase.co";
  process.env.SUPABASE_ANON_KEY = "synthetic-public-key";
  delete process.env.SUPABASE_JWT_SECRET;
  resetRemoteAuthVerificationCacheForTests();
  t.after(() => {
    globalThis.fetch = previousFetch;
    resetRemoteAuthVerificationCacheForTests();
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "real-member", email: "member@example.test", user_metadata: { email: ADMIN_OWNER_EMAIL, role: "admin" }, app_metadata: { provider: "google" } }), { status: 200 });
  const token = [Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: "forged-owner", email: ADMIN_OWNER_EMAIL, exp: Date.now() / 1000 + 300 })).toString("base64url"), "unverified-signature"].join(".");
  const request = { headers: { authorization: `Bearer ${token}` } };
  let authenticated = false;
  await requireAuth(request, {}, () => { authenticated = true; });
  assert.equal(authenticated, true);
  assert.equal(request.user.email, "member@example.test");
  assert.equal(guard(request).status, 403);
});
