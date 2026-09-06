import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { verifiedLoginTime } from "./auth/loginTime.js";

// Separate private, additive store: no valuation or portfolio data is changed.
export function createLoginActivityStore(db, { now = Date.now } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_activity_users (
      user_key TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_sign_in_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_login_activity_recent
      ON login_activity_users(last_sign_in_at DESC, last_seen_at DESC, user_key);
  `);
  const cache = new Map();
  const upsert = db.prepare(`INSERT INTO login_activity_users
    (user_key,email,name,provider,first_seen_at,last_seen_at,last_sign_in_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_key) DO UPDATE SET
    email=excluded.email, name=excluded.name, provider=excluded.provider,
    last_seen_at=MAX(login_activity_users.last_seen_at,excluded.last_seen_at),
    last_sign_in_at=CASE WHEN excluded.last_sign_in_at IS NOT NULL AND
      (login_activity_users.last_sign_in_at IS NULL OR excluded.last_sign_in_at>login_activity_users.last_sign_in_at)
      THEN excluded.last_sign_in_at ELSE login_activity_users.last_sign_in_at END`);
  const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  return {
    record(user) {
      if (!user?.id || user.provider === "local-dev" || user.isAnonymous === true) return false;
      const clock = now();
      const at = new Date(clock).toISOString();
      const key = crypto.createHash("sha256").update(String(user.id)).digest("hex");
      const email = clean(user.email, 320).toLowerCase(), name = clean(user.name, 200), provider = clean(user.provider, 64);
      const loginAt = verifiedLoginTime({ lastSignInAt: user.lastSignInAt }, clock);
      const signature = JSON.stringify([email, name, provider, loginAt]);
      const previous = cache.get(key);
      if (previous?.signature === signature && clock - previous.at >= 0 && clock - previous.at < 60_000) return false;
      upsert.run(key, email, name, provider, at, at, loginAt);
      cache.delete(key);
      cache.set(key, { signature, at: clock });
      if (cache.size > 4096) cache.delete(cache.keys().next().value);
      return true;
    },
    list({ search = "", page = 1, pageSize = 20 } = {}) {
      const query = clean(search, 200).toLowerCase();
      const size = Number.isSafeInteger(Number(pageSize)) ? Math.min(50, Math.max(1, Number(pageSize))) : 20;
      const requestedPage = Number.isSafeInteger(Number(page)) ? Math.max(1, Number(page)) : 1;
      // instr treats %, _, quotes and backslashes literally (no LIKE or SQL interpolation).
      const where = "WHERE (?='' OR instr(lower(email),?)>0 OR instr(lower(name),?)>0)";
      const args = [query, query, query];
      const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM login_activity_users ${where}`).get(...args).n);
      const pages = Math.max(1, Math.ceil(total / size));
      const currentPage = Math.min(requestedPage, pages);
      const rows = db.prepare(`SELECT email,name,provider,last_sign_in_at,last_seen_at FROM login_activity_users
        ${where} ORDER BY last_sign_in_at DESC, last_seen_at DESC, user_key ASC LIMIT ? OFFSET ?`)
        .all(...args, size, (currentPage - 1) * size);
      return { generatedAt: new Date(now()).toISOString(), total, page: currentPage, pageSize: size, pages,
        users: rows.map((row) => ({ email: row.email, name: row.name, provider: row.provider,
          lastSignInAt: row.last_sign_in_at, lastSeenAt: row.last_seen_at })),
        coverage: "observed_authenticated_api_users", lastSeenResolutionSeconds: 60 };
    }
  };
}

let store;
export function loginActivityStore() {
  if (store) return store;
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.dirname(process.env.SQLITE_DB_PATH || path.join(serverDir, "data", "guru-analysis.sqlite"));
  const file = process.env.LOGIN_ACTIVITY_DB_PATH || path.join(process.env.USER_PORTFOLIO_DATA_DIR || path.join(dataDir, "user-portfolios"), "login-activity.sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  fs.chmodSync(file, 0o600);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;");
  store = createLoginActivityStore(db);
  return store;
}
