import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import express from "express";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guru-admin-directory-test-"));
process.env.USER_PORTFOLIO_DATA_DIR = directory;
process.env.PORTFOLIO_CREDENTIALS_KEY = "synthetic-admin-directory-key";
process.env.PORTFOLIO_USER_RECORD_TTL_MS = "60000";
const file = path.join(directory, "portfolio-admin.sqlite");
// Exercise an actual pre-feature database, not only a new schema.
const legacy = new DatabaseSync(file);
legacy.exec(`CREATE TABLE portfolio_user_registry (
  user_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT, name TEXT,
  avatar TEXT, provider TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
  INSERT INTO portfolio_user_registry VALUES
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'legacy', 'legacy@example.test', 'Legacy', '', 'google',
  '2026-01-01T00:00:00Z', '2026-09-05T23:59:00Z');
  CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('preserved');`);
legacy.close();
const { listAdminPortfolioUsers, recordPortfolioUser, portfolioRegistration, compareAdminLastSignIn,
  portfolioUserRecordCacheStats, savePortfolioConnection, deletePortfolioConnection } = await import("./userPortfolioStore.js");
const { registerAdminPortfolioUsersRoute } = await import("./adminPortfolioUsersRoute.js");
const { requireAuth } = await import("./auth/requireAuth.js");
const { registerLoginActivityRoutes } = await import("./loginActivityRoutes.js");
after(() => fs.rmSync(directory, { recursive: true, force: true }));
const account = (id, lastSignInAt = null) => ({ id, email: `${id}@example.test`, name: id, provider: "google", lastSignInAt });

test("old registry migrates additively with unknown login, without rewriting visit time", () => {
  const data = listAdminPortfolioUsers();
  const row = data.users.find((user) => user.userId === "legacy");
  assert.equal(row.lastSignInAt, null);
  assert.equal(row.lastSeenAt, "2026-09-05T23:59:00Z");
  assert.equal(row.portfolioRegistration, "not_registered");
  const db = new DatabaseSync(file, { readOnly: true });
  assert.equal(db.prepare("SELECT value FROM unrelated").get().value, "preserved");
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  db.close();
});

test("new verified sign-in bypasses throttle; old sessions and missing data cannot regress it", () => {
  const user = account("repeat", "2026-09-01T10:00:00Z");
  recordPortfolioUser(user);
  const before = portfolioUserRecordCacheStats().writes;
  recordPortfolioUser(user);
  assert.equal(portfolioUserRecordCacheStats().writes, before);
  recordPortfolioUser({ ...user, lastSignInAt: "2026-09-05T11:00:00Z" });
  assert.equal(portfolioUserRecordCacheStats().writes, before + 1);
  recordPortfolioUser(user);
  recordPortfolioUser({ ...user, lastSignInAt: null, iat: Date.now() / 1000 });
  assert.equal(listAdminPortfolioUsers().users.find((row) => row.userId === user.id).lastSignInAt, "2026-09-05T11:00:00.000Z");
});

test("both registered and unregistered users retain verified login and sort newest first", () => {
  const linked = account("linked-old", "2026-09-01T09:00:00Z");
  const recent = account("unregistered-new", "2026-09-05T12:00:00Z");
  recordPortfolioUser(linked);
  savePortfolioConnection(linked, { ibkrFlexToken: "synthetic-token", ibkrFlexQueryId: "12345" });
  recordPortfolioUser(recent);
  const data = listAdminPortfolioUsers();
  assert.ok(data.users.findIndex((row) => row.userId === recent.id) < data.users.findIndex((row) => row.userId === linked.id));
  assert.equal(data.users.find((row) => row.userId === linked.id).portfolioRegistration, "registered");
  assert.equal(data.users.find((row) => row.userId === recent.id).portfolioRegistration, "not_registered");
  assert.equal(data.summary.registered + data.summary.notRegistered + data.summary.registrationUnknown, data.summary.users);
  assert.equal(data.sort, "last_sign_in_desc_nulls_last");
  assert.ok(!JSON.stringify(data).includes("synthetic-token"));
  deletePortfolioConnection(linked);
  assert.equal(listAdminPortfolioUsers().users.find((row) => row.userId === linked.id).portfolioRegistration, "not_registered");
});

test("failed saved connections stay registered; empty databases and NAV do not imply registration", () => {
  assert.equal(portfolioRegistration({ connection: { registered: true, status: "decrypt_error" } }), "registered");
  assert.equal(portfolioRegistration({ connection: { registered: true, status: "read_error" } }), "registered");
  assert.equal(portfolioRegistration({ connection: { status: "read_error" } }), "unknown");
  assert.equal(portfolioRegistration({ databaseExists: true, nav: { pointCount: 100 } }), "not_registered");
  assert.equal(portfolioRegistration({ connection: { accountCount: 1 } }), "registered");
});

test("sorting never substitutes sync/visit time; unknown times last and stable ties", () => {
  const users = [
    { email: "unknown", lastSeenAt: "2099-01-01", nav: { updatedAt: "2099-01-01" } },
    { email: "b", lastSignInAt: "2026-09-01T00:00:00Z", lastSeenAt: "2099-01-01" },
    { email: "a", lastSignInAt: "2026-09-01T00:00:00Z" },
    { email: "newest", lastSignInAt: "2026-09-05T00:00:00Z" }
  ].sort(compareAdminLastSignIn);
  assert.deepEqual(users.map((row) => row.email), ["newest", "a", "b", "unknown"]);
});

test("anonymous/dev accounts excluded, metadata and invalid/future timestamps cannot become logins", () => {
  assert.equal(recordPortfolioUser({ ...account("anon"), isAnonymous: true }), null);
  assert.equal(recordPortfolioUser({ ...account("dev"), provider: "local-dev" }), null);
  for (const [id, time] of [["invalid", "invalid"], ["future", "2099-01-01T00:00:00Z"], ["metadata", null]]) {
    recordPortfolioUser({ ...account(id, time), user_metadata: { last_sign_in_at: "2026-09-05T00:00:00Z" } });
    assert.equal(listAdminPortfolioUsers().users.find((row) => row.userId === id).lastSignInAt, null);
  }
});

test("real auth protects directory and auth-shell visits record without trusting the body", async (t) => {
  const keys = ["SUPABASE_JWT_SECRET", "SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_EMAILS", "API_AUTH_DEV_BYPASS"];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.SUPABASE_JWT_SECRET = "synthetic-auth-key";
  process.env.ADMIN_EMAILS = "owner@example.test";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  process.env.API_AUTH_DEV_BYPASS = "false";
  t.after(() => { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const app = express();
  app.use(express.json());
  app.use("/api", requireAuth, (request, _response, next) => { recordPortfolioUser(request.user); next(); });
  registerLoginActivityRoutes(app);
  let fail = false;
  registerAdminPortfolioUsersRoute(app, { listUsers: () => { if (fail) throw new Error("secret private path"); return listAdminPortfolioUsers(); } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = (email) => {
    const body = [Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"), Buffer.from(JSON.stringify({
      sub: email, email, exp: Date.now() / 1000 + 300,
      amr: [{ method: "oauth", timestamp: Date.parse("2026-09-05T13:00:00Z") / 1000 }],
      user_metadata: { email: "owner@example.test", role: "admin" }
    })).toString("base64url")].join(".");
    return `${body}.${crypto.createHmac("sha256", process.env.SUPABASE_JWT_SECRET).update(body).digest("base64url")}`;
  };
  const url = `${origin}/api/admin/portfolio-users`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: "Bearer invalid" } })).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${token("member@example.test")}` } })).status, 403);
  await fetch(`${origin}/api/auth/activity`, { method: "POST", headers: { authorization: `Bearer ${token("visitor@example.test")}`, "content-type": "application/json" }, body: JSON.stringify({ lastSignInAt: "2099-01-01T00:00:00Z", userId: "spoofed" }) });
  const headers = { authorization: `Bearer ${token("owner@example.test")}` };
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.users.find((row) => row.email === "visitor@example.test").lastSignInAt, "2026-09-05T13:00:00.000Z");
  fail = true;
  const unavailable = await fetch(url, { headers });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.ok(!(await unavailable.text()).includes("secret private path"));
});
