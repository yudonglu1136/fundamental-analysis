import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledDbPath = path.join(__dirname, "data", "guru-analysis.sqlite");
const defaultDataDir = path.dirname(process.env.SQLITE_DB_PATH || bundledDbPath);
const userPortfolioRoot = process.env.USER_PORTFOLIO_DATA_DIR || path.join(defaultDataDir, "user-portfolios");
const adminRegistryDbPath = path.join(userPortfolioRoot, "portfolio-admin.sqlite");
const encryptionAad = Buffer.from("thesisforge-portfolio-connection-v1");

const dbCache = new Map();
let adminRegistryDb = null;
const portfolioUserRecordCache = new Map();
const portfolioUserRecordTtlMs = Math.max(
  1000,
  Math.min(60_000, Number(process.env.PORTFOLIO_USER_RECORD_TTL_MS) || 5000)
);
const portfolioUserRecordCacheMaxEntries = 4096;
let portfolioUserRecordCacheHits = 0;
let portfolioUserRecordWrites = 0;
const portfolioConnectionRecoveryTtlMs = Math.max(
  60_000,
  Math.min(
    60 * 60_000,
    Number(process.env.PORTFOLIO_CONNECTION_RECOVERY_MS) || 15 * 60_000
  )
);

function encryptionSecret() {
  const secret = process.env.PORTFOLIO_CREDENTIALS_KEY || process.env.SUPABASE_JWT_SECRET || "";
  if (!secret) {
    throw new Error("PORTFOLIO_CREDENTIALS_KEY is not configured for encrypted portfolio connections.");
  }
  return secret;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(encryptionSecret()).digest();
}

function userHash(userId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("Authenticated user id is required.");
  const secret = process.env.PORTFOLIO_CREDENTIALS_KEY || process.env.SUPABASE_JWT_SECRET || "local-user-hash";
  return crypto.createHmac("sha256", secret).update(id).digest("hex").slice(0, 40);
}

function userIdFromUser(user) {
  return String(user?.id || user?.sub || "").trim();
}

function cleanPortfolioHash(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(text) ? text : "";
}

function userHashFromUser(user) {
  const adminHash = cleanPortfolioHash(user?.adminPortfolioHash);
  if (adminHash) return adminHash;
  return userHash(userIdFromUser(user));
}

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function parsePayload(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function userDbPath(user) {
  const hash = userHashFromUser(user);
  return path.join(userPortfolioRoot, hash, "portfolio.sqlite");
}

function userDbPathForHash(hash) {
  const cleaned = cleanPortfolioHash(hash);
  if (!cleaned) throw new Error("Portfolio user hash is invalid.");
  return path.join(userPortfolioRoot, cleaned, "portfolio.sqlite");
}

function openAdminRegistryDb() {
  if (adminRegistryDb) return adminRegistryDb;
  fs.mkdirSync(userPortfolioRoot, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(adminRegistryDbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS portfolio_user_registry (
      user_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT,
      name TEXT,
      avatar TEXT,
      provider TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_user_registry_email
      ON portfolio_user_registry (email);
  `);
  adminRegistryDb = db;
  return db;
}

function initUserDb(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS portfolio_connections (
      provider TEXT PRIMARY KEY,
      status TEXT,
      encrypted_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_connected_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS portfolio_connection_recovery (
      provider TEXT PRIMARY KEY,
      encrypted_json TEXT NOT NULL,
      connection_created_at TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_connection_recovery_expires_at
      ON portfolio_connection_recovery (expires_at);

    CREATE TABLE IF NOT EXISTS portfolio_nav_points (
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      nav REAL NOT NULL,
      cash REAL,
      source TEXT,
      source_date TEXT,
      payload_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_user_portfolio_nav_points_account_date
      ON portfolio_nav_points (account_id, date);
  `);
}

function openUserDb(user) {
  const dbPath = userDbPath(user);
  const cached = dbCache.get(dbPath);
  if (cached) return cached;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  initUserDb(db);
  dbCache.set(dbPath, db);
  return db;
}

function encryptJson(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(encryptionAad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptJson(value) {
  const [ivText, tagText, ciphertextText] = String(value || "").split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored connection payload is malformed.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAAD(encryptionAad);
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizedNow(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Portfolio recovery timestamp is invalid.");
  return parsed;
}

function purgeExpiredPortfolioConnectionRecovery(db, now = new Date()) {
  const nowIso = normalizedNow(now).toISOString();
  return db.prepare(`
    DELETE FROM portfolio_connection_recovery
    WHERE expires_at <= ?
  `).run(nowIso).changes;
}

function activePortfolioConnectionRecovery(db, now = new Date()) {
  const nowIso = normalizedNow(now).toISOString();
  purgeExpiredPortfolioConnectionRecovery(db, nowIso);
  return db.prepare(`
    SELECT provider, deleted_at, expires_at
    FROM portfolio_connection_recovery
    WHERE provider = ? AND expires_at > ?
  `).get("ibkr_flex", nowIso);
}

function cleanToken(value) {
  return cleanString(value).replace(/\s+/g, "");
}

function cleanQueryId(value) {
  return cleanString(value).replace(/\s+/g, "");
}

function maskSecret(value) {
  const text = cleanString(value);
  if (!text) return "";
  const suffix = text.slice(-4);
  return `${"*".repeat(Math.max(8, Math.min(16, text.length - 4)))}${suffix}`;
}

function accountIdFor(input = {}) {
  const explicit = cleanString(input.id || input.accountId || input.connectionId).replace(/[^A-Za-z0-9_-]/g, "");
  if (explicit) return explicit.slice(0, 64);
  const queryId = cleanQueryId(input.ibkrFlexQueryId || input.queryId || input.portfolioQueryId);
  const token = cleanToken(input.ibkrFlexToken || input.flexToken || input.token || input.ibkrToken);
  const hash = crypto.createHash("sha256").update(`${queryId}:${token}`).digest("hex").slice(0, 16);
  return `ibkr_${hash}`;
}

function normalizePortfolioAccountInput(input = {}, index = 0) {
  const ibkrFlexToken = cleanToken(
    input.ibkrFlexToken || input.flexToken || input.token || input.ibkrToken
  );
  const ibkrFlexQueryId = cleanQueryId(
    input.ibkrFlexQueryId || input.queryId || input.portfolioQueryId
  );
  const ibkrFlexHistoryQueryId = cleanQueryId(
    input.ibkrFlexHistoryQueryId || input.historyQueryId || input.navHistoryQueryId
  );

  if (!/^[A-Za-z0-9_-]{12,256}$/.test(ibkrFlexToken)) {
    throw new Error("IBKR token format looks invalid.");
  }
  if (!/^\d{4,20}$/.test(ibkrFlexQueryId)) {
    throw new Error("IBKR portfolio Query ID must be numeric.");
  }
  if (ibkrFlexHistoryQueryId && !/^\d{4,20}$/.test(ibkrFlexHistoryQueryId)) {
    throw new Error("IBKR historical NAV Query ID must be numeric.");
  }

  const now = new Date().toISOString();
  return {
    id: accountIdFor(input),
    label: cleanString(input.label || input.accountLabel || input.name) || `IBKR account ${index + 1}`,
    provider: "ibkr_flex",
    ibkrFlexToken,
    ibkrFlexQueryId,
    ibkrFlexHistoryQueryId,
    ibkrFlexBaseUrl: "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService",
    createdAt: cleanString(input.createdAt) || now,
    updatedAt: cleanString(input.updatedAt) || now
  };
}

export function portfolioConnectionAccounts(connection = null) {
  if (!connection) return [];
  const rawAccounts = Array.isArray(connection.accounts)
    ? connection.accounts
    : connection.ibkrFlexToken && connection.ibkrFlexQueryId
      ? [
          {
            id: connection.id || connection.accountId,
            label: connection.label || connection.accountLabel || "IBKR account 1",
            ibkrFlexToken: connection.ibkrFlexToken,
            ibkrFlexQueryId: connection.ibkrFlexQueryId,
            ibkrFlexHistoryQueryId: connection.ibkrFlexHistoryQueryId,
            ibkrFlexBaseUrl: connection.ibkrFlexBaseUrl,
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt
          }
        ]
      : [];
  return rawAccounts.map((account, index) => normalizePortfolioAccountInput(account, index));
}

export function normalizePortfolioConnectionInput(input = {}) {
  const provider = cleanString(input.provider || "ibkr_flex");
  if (provider !== "ibkr_flex") {
    throw new Error("Only IBKR Third-Party Reports / Flex tokens are enabled for user connections right now.");
  }

  const accounts = Array.isArray(input.accounts)
    ? input.accounts.map((account, index) => normalizePortfolioAccountInput(account, index))
    : [normalizePortfolioAccountInput(input, 0)];

  if (!accounts.length) throw new Error("At least one IBKR/Yodlee account is required.");
  const first = accounts[0];
  return {
    provider,
    accounts,
    ibkrFlexToken: first.ibkrFlexToken,
    ibkrFlexQueryId: first.ibkrFlexQueryId,
    ibkrFlexHistoryQueryId: first.ibkrFlexHistoryQueryId,
    ibkrFlexBaseUrl: first.ibkrFlexBaseUrl
  };
}

function publicConnectionStatus(row, connection = null, recovery = null) {
  const accounts = portfolioConnectionAccounts(connection);
  if (!row) {
    if (recovery) {
      return {
        registered: false,
        configured: false,
        provider: "IBKR Third-Party Reports",
        institution: "Interactive Brokers",
        status: "disconnected_recoverable",
        message: "Connection disconnected. Encrypted recovery is available for a limited time.",
        storage: "per_user_encrypted_sqlite",
        accountCount: 0,
        accounts: [],
        recoverable: true,
        disconnectedAt: recovery.deleted_at,
        undoUntil: recovery.expires_at
      };
    }
    return {
      registered: false,
      configured: false,
      provider: "IBKR Third-Party Reports",
      institution: "Interactive Brokers",
      status: "not_configured",
      message: "Connect your IBKR Third-Party Reports token to load your own portfolio.",
      storage: "per_user_encrypted_sqlite",
      accountCount: 0,
      accounts: []
    };
  }

  const first = accounts[0] || {};
  return {
    registered: true,
    configured: true,
    provider: "IBKR Third-Party Reports",
    institution: "Interactive Brokers",
    status: row.status || "configured",
    message: row.last_error
      ? "Connection is saved but the latest sync failed. Check the token/query ids."
      : "Connection is saved in your encrypted user portfolio database.",
    storage: "per_user_encrypted_sqlite",
    updatedAt: row.updated_at,
    lastConnectedAt: row.last_connected_at || "",
    lastError: row.last_error || "",
    accountCount: accounts.length,
    tokenPreview: first.ibkrFlexToken ? maskSecret(first.ibkrFlexToken) : "",
    queryId: first.ibkrFlexQueryId || "",
    accounts: accounts.map((account, index) => ({
      id: account.id,
      label: account.label || `IBKR account ${index + 1}`,
      provider: "IBKR Third-Party Reports",
      institution: "Interactive Brokers",
      tokenPreview: maskSecret(account.ibkrFlexToken),
      queryId: account.ibkrFlexQueryId,
      updatedAt: account.updatedAt || row.updated_at
    }))
  };
}

export function readPortfolioConnection(user) {
  const db = openUserDb(user);
  const row = db.prepare(`
    SELECT provider, status, encrypted_json, created_at, updated_at, last_connected_at, last_error
    FROM portfolio_connections
    WHERE provider = ?
  `).get("ibkr_flex");
  if (!row) {
    const recovery = activePortfolioConnectionRecovery(db);
    return {
      configured: false,
      status: publicConnectionStatus(null, null, recovery),
      config: null
    };
  }
  const config = decryptJson(row.encrypted_json);
  return {
    configured: true,
    config,
    status: publicConnectionStatus(row, config)
  };
}

export function readPortfolioConnectionStatus(user) {
  return readPortfolioConnection(user).status;
}

export function savePortfolioConnection(user, input = {}) {
  const config = normalizePortfolioConnectionInput(input);
  const db = openUserDb(user);
  const now = new Date().toISOString();
  const existing = db.prepare(`
    SELECT created_at FROM portfolio_connections WHERE provider = ?
  `).get(config.provider);
  const encryptedJson = encryptJson(config);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO portfolio_connections (
        provider,
        status,
        encrypted_json,
        created_at,
        updated_at,
        last_connected_at,
        last_error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        status = excluded.status,
        encrypted_json = excluded.encrypted_json,
        updated_at = excluded.updated_at,
        last_error = excluded.last_error
    `).run(
      config.provider,
      "configured",
      encryptedJson,
      existing?.created_at || now,
      now,
      "",
      ""
    );
    db.prepare("DELETE FROM portfolio_connection_recovery WHERE provider = ?")
      .run(config.provider);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readPortfolioConnectionStatus(user);
}

export function addPortfolioAccount(user, input = {}) {
  const db = openUserDb(user);
  const existing = readPortfolioConnection(user);
  const accounts = existing.config ? portfolioConnectionAccounts(existing.config) : [];
  const nextAccount = normalizePortfolioAccountInput(input, accounts.length);
  const nextAccounts = accounts.filter((account) => account.id !== nextAccount.id);
  nextAccounts.push(nextAccount);
  const status = savePortfolioConnection(user, {
    provider: "ibkr_flex",
    accounts: nextAccounts
  });
  db.prepare(`
    UPDATE portfolio_connections
    SET last_connected_at = COALESCE(last_connected_at, '')
    WHERE provider = ?
  `).run("ibkr_flex");
  return status;
}

export function markPortfolioConnectionSync(user, { ok, error = "" } = {}) {
  const db = openUserDb(user);
  db.prepare(`
    UPDATE portfolio_connections
    SET status = ?,
        last_connected_at = ?,
        last_error = ?,
        updated_at = ?
    WHERE provider = ?
  `).run(
    ok ? "linked" : "error",
    ok ? new Date().toISOString() : "",
    ok ? "" : cleanString(error).slice(0, 500),
    new Date().toISOString(),
    "ibkr_flex"
  );
}

export function deletePortfolioConnection(user, {
  now = new Date(),
  gracePeriodMs = portfolioConnectionRecoveryTtlMs
} = {}) {
  const db = openUserDb(user);
  const nowDate = normalizedNow(now);
  const nowIso = nowDate.toISOString();
  const safeGracePeriodMs = Math.max(
    60_000,
    Math.min(60 * 60_000, Number(gracePeriodMs) || portfolioConnectionRecoveryTtlMs)
  );
  const expiresAt = new Date(nowDate.getTime() + safeGracePeriodMs).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    purgeExpiredPortfolioConnectionRecovery(db, nowIso);
    const connection = db.prepare(`
      SELECT provider, encrypted_json, created_at
      FROM portfolio_connections
      WHERE provider = ?
    `).get("ibkr_flex");
    if (!connection) {
      const recovery = activePortfolioConnectionRecovery(db, nowIso);
      db.exec("COMMIT");
      return {
        deleted: false,
        recoverable: Boolean(recovery),
        undoUntil: recovery?.expires_at || ""
      };
    }
    db.prepare(`
      INSERT INTO portfolio_connection_recovery (
        provider,
        encrypted_json,
        connection_created_at,
        deleted_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        encrypted_json = excluded.encrypted_json,
        connection_created_at = excluded.connection_created_at,
        deleted_at = excluded.deleted_at,
        expires_at = excluded.expires_at
    `).run(
      connection.provider,
      connection.encrypted_json,
      connection.created_at,
      nowIso,
      expiresAt
    );
    db.prepare("DELETE FROM portfolio_connections WHERE provider = ?")
      .run(connection.provider);
    db.exec("COMMIT");
    return { deleted: true, recoverable: true, undoUntil: expiresAt };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function restorePortfolioConnection(user, { now = new Date() } = {}) {
  const db = openUserDb(user);
  const nowIso = normalizedNow(now).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    purgeExpiredPortfolioConnectionRecovery(db, nowIso);
    const existing = db.prepare(`
      SELECT provider FROM portfolio_connections WHERE provider = ?
    `).get("ibkr_flex");
    if (existing) {
      db.prepare("DELETE FROM portfolio_connection_recovery WHERE provider = ?")
        .run("ibkr_flex");
      db.exec("COMMIT");
      return { restored: false, reason: "connection_exists" };
    }
    const recovery = db.prepare(`
      SELECT provider, encrypted_json, connection_created_at, expires_at
      FROM portfolio_connection_recovery
      WHERE provider = ? AND expires_at > ?
    `).get("ibkr_flex", nowIso);
    if (!recovery) {
      db.exec("COMMIT");
      return { restored: false, reason: "recovery_unavailable" };
    }
    db.prepare(`
      INSERT INTO portfolio_connections (
        provider,
        status,
        encrypted_json,
        created_at,
        updated_at,
        last_connected_at,
        last_error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      recovery.provider,
      "configured",
      recovery.encrypted_json,
      recovery.connection_created_at || nowIso,
      nowIso,
      "",
      ""
    );
    db.prepare("DELETE FROM portfolio_connection_recovery WHERE provider = ?")
      .run(recovery.provider);
    db.exec("COMMIT");
    return { restored: true, reason: "restored" };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function writeUserPortfolioNavPoint(user, point) {
  const db = openUserDb(user);
  const accountId = cleanString(point?.accountId || "portfolio") || "portfolio";
  const date = cleanString(point?.date || "");
  const nav = Number(point?.nav);
  if (!date || !Number.isFinite(nav) || nav <= 0) return;

  db.prepare(`
    INSERT INTO portfolio_nav_points (
      account_id,
      date,
      nav,
      cash,
      source,
      source_date,
      payload_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, date) DO UPDATE SET
      nav = excluded.nav,
      cash = excluded.cash,
      source = excluded.source,
      source_date = excluded.source_date,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(
    accountId,
    date,
    nav,
    Number.isFinite(Number(point.cash)) ? Number(point.cash) : null,
    cleanString(point.source || ""),
    cleanString(point.sourceDate || ""),
    JSON.stringify(point.payload || {}),
    new Date().toISOString()
  );
}

export function readUserPortfolioNavPoints(user, accountId = "portfolio", limit = 5000) {
  const db = openUserDb(user);
  const normalizedAccountId = cleanString(accountId || "portfolio") || "portfolio";
  const rowLimit = Math.max(1, Math.min(10000, Number(limit) || 5000));
  return db.prepare(`
    SELECT account_id, date, nav, cash, source, source_date, updated_at, payload_json
    FROM (
      SELECT account_id, date, nav, cash, source, source_date, updated_at, payload_json
      FROM portfolio_nav_points
      WHERE account_id = ?
      ORDER BY date DESC
      LIMIT ?
    )
    ORDER BY date ASC
  `).all(normalizedAccountId, rowLimit).map((row) => ({
    accountId: row.account_id,
    date: row.date,
    value: row.nav,
    nav: row.nav,
    cash: row.cash,
    source: row.source || "",
    sourceDate: row.source_date || "",
    updatedAt: row.updated_at,
    payload: parsePayload(row.payload_json) || {}
  }));
}

export function recordPortfolioUser(user) {
  const userId = userIdFromUser(user);
  if (!userId) return null;
  const email = cleanString(user?.email).toLowerCase();
  const name = cleanString(user?.name || user?.fullName || user?.user_metadata?.full_name);
  const avatar = cleanString(user?.avatar || user?.picture);
  const provider = cleanString(user?.provider);
  const signature = JSON.stringify([userId, email, name, avatar, provider]);
  const nowMs = Date.now();
  const cached = portfolioUserRecordCache.get(userId);
  if (
    cached?.signature === signature &&
    nowMs - cached.recordedAt < portfolioUserRecordTtlMs
  ) {
    portfolioUserRecordCacheHits += 1;
    portfolioUserRecordCache.delete(userId);
    portfolioUserRecordCache.set(userId, cached);
    return cached.result;
  }

  const hash = userHash(userId);
  const now = new Date(nowMs).toISOString();
  const db = openAdminRegistryDb();
  db.prepare(`
    INSERT INTO portfolio_user_registry (
      user_hash,
      user_id,
      email,
      name,
      avatar,
      provider,
      first_seen_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_hash) DO UPDATE SET
      user_id = excluded.user_id,
      email = excluded.email,
      name = excluded.name,
      avatar = excluded.avatar,
      provider = excluded.provider,
      last_seen_at = excluded.last_seen_at
  `).run(hash, userId, email, name, avatar, provider, now, now);
  const result = { userHash: hash, userId, email, name, avatar, provider };
  portfolioUserRecordWrites += 1;
  portfolioUserRecordCache.delete(userId);
  portfolioUserRecordCache.set(userId, {
    signature,
    recordedAt: nowMs,
    result
  });
  while (portfolioUserRecordCache.size > portfolioUserRecordCacheMaxEntries) {
    portfolioUserRecordCache.delete(portfolioUserRecordCache.keys().next().value);
  }
  return result;
}

export function portfolioUserRecordCacheStats() {
  return {
    entries: portfolioUserRecordCache.size,
    hits: portfolioUserRecordCacheHits,
    writes: portfolioUserRecordWrites,
    ttlMs: portfolioUserRecordTtlMs,
    maxEntries: portfolioUserRecordCacheMaxEntries
  };
}

export function resetPortfolioUserRecordCacheForTests() {
  portfolioUserRecordCache.clear();
  portfolioUserRecordCacheHits = 0;
  portfolioUserRecordWrites = 0;
}

function readRegistryRows() {
  const db = openAdminRegistryDb();
  return db.prepare(`
    SELECT user_hash, user_id, email, name, avatar, provider, first_seen_at, last_seen_at
    FROM portfolio_user_registry
    ORDER BY last_seen_at DESC
  `).all();
}

function listPortfolioHashes() {
  if (!fs.existsSync(userPortfolioRoot)) return [];
  return fs.readdirSync(userPortfolioRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && cleanPortfolioHash(entry.name))
    .map((entry) => entry.name.toLowerCase());
}

function readPortfolioSummaryForHash(hash, registryRow = null) {
  const cleaned = cleanPortfolioHash(hash);
  if (!cleaned) return null;
  const dbPath = userDbPathForHash(cleaned);
  const exists = fs.existsSync(dbPath);
  const base = {
    userHash: cleaned,
    userId: cleanString(registryRow?.user_id),
    email: cleanString(registryRow?.email),
    name: cleanString(registryRow?.name),
    avatar: cleanString(registryRow?.avatar),
    provider: cleanString(registryRow?.provider),
    firstSeenAt: cleanString(registryRow?.first_seen_at),
    lastSeenAt: cleanString(registryRow?.last_seen_at),
    databaseExists: exists,
    databaseUpdatedAt: "",
    connection: {
      registered: false,
      configured: false,
      status: exists ? "not_configured" : "no_database",
      message: exists ? "No saved IBKR/Yodlee connection." : "No user portfolio database yet.",
      accountCount: 0,
      accounts: []
    },
    nav: {
      latestDate: "",
      latestValue: 0,
      pointCount: 0,
      accountCount: 0
    }
  };

  if (!exists) return base;

  try {
    const stats = fs.statSync(dbPath);
    base.databaseUpdatedAt = stats.mtime.toISOString();
  } catch {}

  try {
    const db = openUserDb({ adminPortfolioHash: cleaned });
    const row = db.prepare(`
      SELECT provider, status, encrypted_json, created_at, updated_at, last_connected_at, last_error
      FROM portfolio_connections
      WHERE provider = ?
    `).get("ibkr_flex");
    if (row) {
      try {
        const config = decryptJson(row.encrypted_json);
        base.connection = publicConnectionStatus(row, config);
      } catch (error) {
        base.connection = {
          registered: true,
          configured: false,
          status: "decrypt_error",
          message: "Saved connection exists, but the admin key cannot decrypt it.",
          lastError: error.message,
          accountCount: 0,
          accounts: []
        };
      }
    }

    const navLatest = db.prepare(`
      SELECT account_id, date, nav, cash, updated_at
      FROM portfolio_nav_points
      ORDER BY date DESC, updated_at DESC
      LIMIT 1
    `).get();
    const navStats = db.prepare(`
      SELECT COUNT(*) AS point_count, COUNT(DISTINCT account_id) AS account_count
      FROM portfolio_nav_points
    `).get();
    base.nav = {
      latestDate: cleanString(navLatest?.date),
      latestValue: Number(navLatest?.nav || 0),
      cash: Number(navLatest?.cash || 0),
      pointCount: Number(navStats?.point_count || 0),
      accountCount: Number(navStats?.account_count || 0),
      updatedAt: cleanString(navLatest?.updated_at)
    };
  } catch (error) {
    base.connection = {
      ...base.connection,
      status: "read_error",
      message: error.message
    };
  }

  return base;
}

export function listAdminPortfolioUsers() {
  const rows = readRegistryRows();
  const rowsByHash = new Map(rows.map((row) => [cleanPortfolioHash(row.user_hash), row]));
  const hashes = new Set([...rowsByHash.keys()].filter(Boolean));
  for (const hash of listPortfolioHashes()) hashes.add(hash);
  const users = [...hashes]
    .map((hash) => readPortfolioSummaryForHash(hash, rowsByHash.get(hash)))
    .filter(Boolean)
    .sort((left, right) => {
      const rankDiff = portfolioUserSortRank(right) - portfolioUserSortRank(left);
      if (rankDiff !== 0) return rankDiff;
      const timeDiff = portfolioUserSortTime(right) - portfolioUserSortTime(left);
      if (timeDiff !== 0) return timeDiff;
      return cleanString(left.email || left.name || left.userHash)
        .localeCompare(cleanString(right.email || right.name || right.userHash));
    });
  const summary = users.reduce((acc, user) => {
    const accountCount = Number(user.connection?.accountCount || 0);
    const nav = Number(user.nav?.latestValue || 0);
    acc.users += 1;
    acc.accounts += accountCount;
    acc.linked += user.connection?.status === "linked" ? 1 : 0;
    acc.errors += String(user.connection?.status || "").includes("error") ? 1 : 0;
    acc.latestNav += Number.isFinite(nav) ? nav : 0;
    return acc;
  }, { users: 0, accounts: 0, linked: 0, errors: 0, latestNav: 0 });
  return {
    generatedAt: new Date().toISOString(),
    summary,
    users
  };
}

function portfolioUserSortRank(user) {
  const connection = user?.connection || {};
  const status = cleanString(connection.status);
  const accountCount = Number(connection.accountCount || 0);
  if (status === "linked" && accountCount > 0) return 4;
  if (accountCount > 0) return 3;
  if (connection.configured || connection.registered) return 2;
  if (status.includes("error")) return 1;
  return 0;
}

function portfolioUserSortTime(user) {
  const candidates = [
    user?.nav?.updatedAt,
    user?.nav?.latestDate,
    user?.connection?.lastConnectedAt,
    user?.connection?.updatedAt,
    user?.databaseUpdatedAt,
    user?.lastSeenAt
  ];
  for (const value of candidates) {
    const timestamp = Date.parse(cleanString(value));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function portfolioUserForAdminHash(hash) {
  const cleaned = cleanPortfolioHash(hash);
  if (!cleaned) return null;
  const rowsByHash = new Map(readRegistryRows().map((row) => [cleanPortfolioHash(row.user_hash), row]));
  const row = rowsByHash.get(cleaned) || null;
  const summary = readPortfolioSummaryForHash(cleaned, row);
  if (!summary) return null;
  return {
    publicUser: summary,
    user: {
      id: cleanString(row?.user_id) || `admin-portfolio-${cleaned}`,
      email: cleanString(row?.email),
      name: cleanString(row?.name) || cleanString(row?.email) || `Portfolio ${cleaned.slice(0, 8)}`,
      avatar: cleanString(row?.avatar),
      provider: cleanString(row?.provider),
      adminPortfolioHash: cleaned
    }
  };
}

export function userPortfolioInfo(user) {
  const dbPath = userDbPath(user);
  const hash = userHashFromUser(user);
  return {
    userHash: hash,
    path: dbPath,
    exists: fs.existsSync(dbPath)
  };
}

export function isCashTicker(value) {
  return normalizeTicker(value).startsWith("CASH");
}
