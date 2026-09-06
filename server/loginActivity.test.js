import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import { createLoginActivityStore } from "./loginActivityStore.js";
import { verifiedLoginTime } from "./auth/loginTime.js";
import { requireAuth } from "./auth/requireAuth.js";
import { createLoginActivityRecorder, registerLoginActivityRoutes } from "./loginActivityRoutes.js";

const time = Date.parse("2026-09-06T12:00:00Z");
const user = { id: "user-1", email: "one@example.test", name: "One", provider: "google", lastSignInAt: "2026-09-06T10:00:00Z" };
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let clock = time;
  return { db, store: createLoginActivityStore(db, { now: () => clock }), advance: (ms) => { clock += ms; } };
}

test("login time uses verified primary authentication, never refresh iat or user metadata", () => {
  assert.equal(verifiedLoginTime({ iat: time / 1000, user_metadata: { last_sign_in_at: new Date(time).toISOString() } }, time), null);
  assert.equal(verifiedLoginTime({ amr: [{ method: "oauth", timestamp: time / 1000 - 7200 }, { method: "totp", timestamp: time / 1000 - 300 }] }, time), user.lastSignInAt.replace("Z", ".000Z"));
  for (const input of [{ lastSignInAt: "invalid" }, { lastSignInAt: "2027-01-01T00:00:00Z" }, { amr: [{ method: "oauth", timestamp: "123" }] }, { amr: [{ method: "token_refresh", timestamp: time / 1000 }] }]) {
    assert.equal(verifiedLoginTime(input, time), null);
  }
});
test("one row per account; page refresh does not create a login and writes are bounded", (t) => {
  const { store, advance } = fixture(t);
  assert.equal(store.record(user), true);
  assert.equal(store.record(user), false);
  advance(61_000);
  assert.equal(store.record(user), true);
  const result = store.list();
  assert.equal(result.total, 1);
  assert.equal(result.users[0].lastSignInAt, "2026-09-06T10:00:00.000Z");
  assert.equal(result.users[0].lastSeenAt, "2026-09-06T12:01:01.000Z");
  assert.deepEqual(Object.keys(result.users[0]).sort(), ["email", "lastSeenAt", "lastSignInAt", "name", "provider"]);
});
test("new sign-in bypasses write throttle; old sessions and missing timestamps cannot regress it", (t) => {
  const { store } = fixture(t);
  store.record(user);
  assert.equal(store.record({ ...user, lastSignInAt: "2026-09-06T11:00:00Z" }), true);
  store.record(user);
  store.record({ ...user, lastSignInAt: null });
  assert.equal(store.list().users[0].lastSignInAt, "2026-09-06T11:00:00.000Z");
});
test("unknown login remains null; dev/anonymous/missing identities are not recorded", (t) => {
  const { store } = fixture(t);
  for (const entry of [{}, { ...user, provider: "local-dev" }, { ...user, isAnonymous: true }]) assert.equal(store.record(entry), false);
  store.record({ ...user, lastSignInAt: null });
  assert.equal(store.list().users[0].lastSignInAt, null);
});
test("recent sign-in ordering, literal search, deterministic pagination and input bounds", (t) => {
  const { store } = fixture(t);
  store.record(user);
  store.record({ ...user, id: "second", email: "second@example.test", name: "Percent%_", lastSignInAt: "2026-09-06T11:00:00Z" });
  store.record({ ...user, id: "third", email: "third@example.test", lastSignInAt: null });
  assert.equal(store.list({ pageSize: 1 }).users[0].email, "second@example.test");
  assert.equal(store.list({ pageSize: 1, page: 2 }).users[0].email, user.email);
  assert.equal(store.list({ pageSize: 1, page: 999 }).page, 3);
  assert.equal(store.list({ search: "%_" }).total, 1);
  assert.equal(store.list({ search: "SECOND@" }).total, 1);
  assert.equal(store.list({ search: "' OR 1=1--" }).total, 0);
  assert.equal(store.list({ pageSize: 9999 }).pageSize, 50);
  assert.equal(store.list({ pageSize: "bad", page: "bad" }).page, 1);
});
test("stored login information survives a store restart without losing other tables", (t) => {
  const { db, store } = fixture(t);
  db.exec("CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('preserved')");
  store.record(user);
  const reopened = createLoginActivityStore(db, { now: () => time });
  assert.equal(reopened.list().total, 1);
  assert.equal(db.prepare("SELECT value FROM unrelated").get().value, "preserved");
});
test("recording failure never breaks authentication or logs user data", () => {
  const logs = [];
  const middleware = createLoginActivityRecorder({ getStore: () => { throw new Error("private@example.test secret DB path"); }, warn: (message) => logs.push(message) });
  let calls = 0;
  middleware({ user }, {}, () => calls++);
  assert.equal(calls, 1);
  assert.deepEqual(logs, ["Login activity could not be recorded."]);
});
test("recording failure backs off for one minute instead of blocking every API request", () => {
  let clock = time, attempts = 0, nextCalls = 0;
  const middleware = createLoginActivityRecorder({ now: () => clock, getStore: () => {
    attempts++; throw new Error("synthetic storage failure");
  }, warn: () => {} });
  for (let i = 0; i < 10; i++) middleware({ user }, {}, () => nextCalls++);
  assert.equal(attempts, 1);
  assert.equal(nextCalls, 10);
  clock += 60_001;
  middleware({ user }, {}, () => nextCalls++);
  assert.equal(attempts, 2);
});
test("real auth + admin guard block anonymous, invalid and ordinary users; admin response is no-store", async (t) => {
  const old = Object.fromEntries(["SUPABASE_JWT_SECRET", "SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_EMAILS"].map((key) => [key, process.env[key]]));
  process.env.SUPABASE_JWT_SECRET = "synthetic-test-secret";
  process.env.ADMIN_EMAILS = "owner@example.test";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  t.after(() => { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const { store } = fixture(t);
  const app = express();
  app.use("/api", requireAuth, createLoginActivityRecorder({ getStore: () => store }));
  registerLoginActivityRoutes(app, { getStore: () => store });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/admin/login-activity`;
  const sign = (email) => {
    const body = [Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: email, email, exp: Date.now() / 1000 + 300,
      user_metadata: { email: "owner@example.test", role: "admin" }, amr: [{ method: "oauth", timestamp: time / 1000 - 3600 }] })).toString("base64url")].join(".");
    return `${body}.${crypto.createHmac("sha256", process.env.SUPABASE_JWT_SECRET).update(body).digest("base64url")}`;
  };
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: "Bearer invalid" } })).status, 401);
  assert.equal(store.list().total, 0);
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${sign("member@example.test")}` } })).status, 403);
  const response = await fetch(url, { headers: { authorization: `Bearer ${sign("owner@example.test")}` } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.total, 2);
  assert.ok(!JSON.stringify(result).includes("synthetic-test-secret"));
  const visitUrl = url.replace("/admin/login-activity", "/auth/activity");
  assert.equal((await fetch(visitUrl, { method: "POST" })).status, 401);
  const visit = await fetch(visitUrl, { method: "POST", headers: { authorization: `Bearer ${sign("visitor@example.test")}`, "content-type": "application/json" },
    body: JSON.stringify({ userId: "spoofed-user", lastSignInAt: "2099-01-01T00:00:00Z" }) });
  assert.equal(visit.status, 200);
  assert.equal(visit.headers.get("cache-control"), "no-store");
  assert.equal(store.list().total, 3);
  assert.equal(store.list({ search: "spoofed-user" }).total, 0);
  assert.notEqual(store.list({ search: "visitor@" }).users[0].lastSignInAt, "2099-01-01T00:00:00.000Z");
});
