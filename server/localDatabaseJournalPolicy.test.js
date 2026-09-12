import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("main database startup retains WAL with explicit checkpoint and retention settings", () => {
  const code = fs.readFileSync(new URL("./localDatabase.js", import.meta.url), "utf8");
  const policy = code.match(/const db = new DatabaseSync\(dbPath\);\s*db\.exec\(`([\s\S]*?)CREATE TABLE/)[1];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-journal-policy-"));
  const database = new DatabaseSync(path.join(dir, "test.sqlite"));
  try {
    database.exec(policy);
    assert.equal(database.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    assert.equal(database.prepare("PRAGMA wal_autocheckpoint").get().wal_autocheckpoint, 1000);
    assert.equal(database.prepare("PRAGMA journal_size_limit").get().journal_size_limit, 64 * 1024 * 1024);
    assert.equal(database.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    database.exec("CREATE TABLE fixture(id INTEGER PRIMARY KEY, value TEXT); BEGIN IMMEDIATE; INSERT INTO fixture VALUES (1,'preserved'); COMMIT;");
    const reader = new DatabaseSync(path.join(dir, "test.sqlite"), { readOnly: true });
    try { assert.equal(reader.prepare("SELECT value FROM fixture WHERE id=1").get().value, "preserved"); }
    finally { reader.close(); }
    database.exec("BEGIN IMMEDIATE; INSERT INTO fixture VALUES (2,'rolled back'); ROLLBACK;");
    assert.equal(database.prepare("SELECT count(*) AS n FROM fixture").get().n, 1);
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
