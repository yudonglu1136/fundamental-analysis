import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledDbPath = path.join(__dirname, "data", "guru-analysis.sqlite");
const defaultDataDir = path.dirname(process.env.SQLITE_DB_PATH || bundledDbPath);
const userPortfolioRoot = process.env.USER_PORTFOLIO_DATA_DIR || path.join(defaultDataDir, "user-portfolios");
const encryptionAad = Buffer.from("thesisforge-portfolio-connection-v1");

const dbCache = new Map();

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
  const hash = userHash(userIdFromUser(user));
  return path.join(userPortfolioRoot, hash, "portfolio.sqlite");
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

function publicConnectionStatus(row, connection = null) {
  const accounts = portfolioConnectionAccounts(connection);
  if (!row) {
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
    return { configured: false, status: publicConnectionStatus(null), config: null };
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
    encryptJson(config),
    existing?.created_at || now,
    now,
    "",
    ""
  );
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

export function deletePortfolioConnection(user) {
  const db = openUserDb(user);
  db.prepare("DELETE FROM portfolio_connections WHERE provider = ?").run("ibkr_flex");
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

export function userPortfolioInfo(user) {
  const dbPath = userDbPath(user);
  return {
    userHash: userHash(userIdFromUser(user)),
    path: dbPath,
    exists: fs.existsSync(dbPath)
  };
}

export function isCashTicker(value) {
  return normalizeTicker(value).startsWith("CASH");
}
