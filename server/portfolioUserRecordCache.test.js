import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-user-cache-test-"));
process.env.USER_PORTFOLIO_DATA_DIR = path.join(tempDir, "user-portfolios");
process.env.PORTFOLIO_USER_RECORD_TTL_MS = "60000";

const {
  listAdminPortfolioUsers,
  portfolioUserRecordCacheStats,
  recordPortfolioUser,
  resetPortfolioUserRecordCacheForTests
} = await import("./userPortfolioStore.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("portfolio user presence writes are coalesced by user-profile version", () => {
  resetPortfolioUserRecordCacheForTests();
  const user = {
    id: "cache-test-user",
    email: "cache@example.com",
    name: "Cache Test",
    provider: "test"
  };

  const first = recordPortfolioUser(user);
  const hit = recordPortfolioUser(user);
  assert.strictEqual(hit, first);
  assert.deepEqual(portfolioUserRecordCacheStats(), {
    entries: 1,
    hits: 1,
    writes: 1,
    ttlMs: 60000,
    maxEntries: 4096
  });

  const changed = recordPortfolioUser({ ...user, name: "Changed Name" });
  assert.notStrictEqual(changed, first);
  assert.equal(changed.name, "Changed Name");
  assert.equal(portfolioUserRecordCacheStats().writes, 2);
  assert.equal(
    listAdminPortfolioUsers().users.find((row) => row.userId === user.id)?.name,
    "Changed Name"
  );
});
