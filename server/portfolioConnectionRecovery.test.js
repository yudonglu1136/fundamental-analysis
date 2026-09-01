import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-recovery-test-"));
process.env.USER_PORTFOLIO_DATA_DIR = path.join(tempDir, "user-portfolios");
process.env.PORTFOLIO_CREDENTIALS_KEY = "portfolio-recovery-test-key";

const {
  deletePortfolioConnection,
  readPortfolioConnection,
  readPortfolioConnectionStatus,
  restorePortfolioConnection,
  savePortfolioConnection,
  userPortfolioInfo
} = await import("./userPortfolioStore.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function connectionInput(token, queryId) {
  return {
    provider: "ibkr_flex",
    ibkrFlexToken: token,
    ibkrFlexQueryId: queryId
  };
}

test("disconnect preserves only an encrypted, time-bounded recovery copy and restores it", () => {
  const user = { id: "recoverable-user" };
  const token = "TOKEN_secret_123456";
  savePortfolioConnection(user, connectionInput(token, "123456"));

  const startedAt = new Date();
  const deletion = deletePortfolioConnection(user, {
    now: startedAt,
    gracePeriodMs: 15 * 60_000
  });
  assert.equal(deletion.deleted, true);
  assert.equal(deletion.recoverable, true);
  assert.equal(
    Date.parse(deletion.undoUntil) - startedAt.getTime(),
    15 * 60_000
  );

  const status = readPortfolioConnectionStatus(user);
  assert.equal(status.configured, false);
  assert.equal(status.recoverable, true);
  assert.equal(status.undoUntil, deletion.undoUntil);
  assert.equal("tokenPreview" in status, false);
  assert.equal("queryId" in status, false);
  assert.equal(JSON.stringify(status).includes(token), false);

  const db = new DatabaseSync(userPortfolioInfo(user).path, { readOnly: true });
  const recovery = db.prepare(`
    SELECT encrypted_json, expires_at
    FROM portfolio_connection_recovery
    WHERE provider = ?
  `).get("ibkr_flex");
  db.close();
  assert.ok(recovery.encrypted_json);
  assert.equal(recovery.encrypted_json.includes(token), false);
  assert.equal(recovery.expires_at, deletion.undoUntil);

  const restoration = restorePortfolioConnection(user, {
    now: new Date(startedAt.getTime() + 60_000)
  });
  assert.deepEqual(restoration, { restored: true, reason: "restored" });
  assert.equal(readPortfolioConnection(user).config.ibkrFlexToken, token);
});

test("expired recovery data is purged and cannot be restored", () => {
  const user = { id: "expired-user" };
  savePortfolioConnection(
    user,
    connectionInput("TOKEN_expired_123456", "234567")
  );
  const startedAt = new Date("2026-09-01T12:00:00Z");
  deletePortfolioConnection(user, {
    now: startedAt,
    gracePeriodMs: 60_000
  });

  const restoration = restorePortfolioConnection(user, {
    now: new Date("2026-09-01T12:01:01Z")
  });
  assert.deepEqual(restoration, {
    restored: false,
    reason: "recovery_unavailable"
  });

  const db = new DatabaseSync(userPortfolioInfo(user).path, { readOnly: true });
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM portfolio_connection_recovery
  `).get();
  db.close();
  assert.equal(row.count, 0);
  assert.equal(readPortfolioConnection(user).configured, false);
});

test("saving a new connection discards the previous recovery copy", () => {
  const user = { id: "replacement-user" };
  savePortfolioConnection(
    user,
    connectionInput("TOKEN_previous_123456", "345678")
  );
  deletePortfolioConnection(user);
  savePortfolioConnection(
    user,
    connectionInput("TOKEN_replacement_123456", "456789")
  );

  assert.deepEqual(restorePortfolioConnection(user), {
    restored: false,
    reason: "connection_exists"
  });
  assert.equal(
    readPortfolioConnection(user).config.ibkrFlexToken,
    "TOKEN_replacement_123456"
  );
});
