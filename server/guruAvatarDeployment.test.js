import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { installedGuruAvatarState } from "./guruAvatarDeployment.js";
import { installGuruAvatarCatalog } from "./guruAvatarCatalog.js";
import { gurus } from "./gurus.js";

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceDir = new URL("../web/guru-avatars/", import.meta.url);
function fixture(t, configuredGurus = [{ id: "fixture-guru", name: "Fixture Guru" }]) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "avatar-idempotence-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const avatarDir = path.join(rootDir, "web", "guru-avatars");
  fs.mkdirSync(avatarDir, { recursive: true });
  for (const guru of configuredGurus) fs.copyFileSync(new URL("warren-buffett.png", sourceDir), path.join(avatarDir, `${guru.id}.png`));
  const databasePath = path.join(rootDir, "fixture.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE guru_assets(guru_id TEXT,asset_type TEXT,url TEXT,local_path TEXT,style TEXT,prompt TEXT,generated_at TEXT,PRIMARY KEY(guru_id,asset_type));
    CREATE TABLE preserved_private_fixture(value TEXT); INSERT INTO preserved_private_fixture VALUES('synthetic, never a live account');`);
  installGuruAvatarCatalog({ avatarDir, rootDir, configuredGurus, generatedAt: "2026-09-01T00:00:00Z",
    writeAsset: (id, asset) => database.prepare("INSERT INTO guru_assets VALUES(?,?,?,?,?,?,?)")
      .run(id, asset.assetType, asset.url, asset.localPath, asset.style, asset.prompt, asset.generatedAt) });
  database.close();
  return { rootDir, avatarDir, databasePath, configuredGurus };
}

test("unchanged installed catalog skips without changing database bytes, schema, timestamps or source PNGs", t => {
  const f = fixture(t), before = hash(f.databasePath), png = hash(path.join(f.avatarDir, "fixture-guru.png"));
  assert.equal(installedGuruAvatarState(f).upToDate, true);
  assert.equal(installedGuruAvatarState(f).upToDate, true);
  assert.equal(hash(f.databasePath), before);
  assert.equal(hash(path.join(f.avatarDir, "fixture-guru.png")), png);
  assert.equal(fs.existsSync(`${f.databasePath}-wal`), false);
  const db = new DatabaseSync(f.databasePath, { readOnly: true });
  assert.equal(db.prepare("SELECT generated_at FROM guru_assets").get().generated_at, "2026-09-01T00:00:00Z");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n, 2);
  db.close();
});

test("missing or mismatched metadata requests the original installation without preflight writes", t => {
  for (const field of ["url", "local_path", "style", "prompt"]) {
    const f = fixture(t), db = new DatabaseSync(f.databasePath);
    db.prepare(`UPDATE guru_assets SET ${field}=?`).run("changed"); db.close();
    const before = hash(f.databasePath);
    assert.equal(installedGuruAvatarState(f).upToDate, false, field);
    assert.equal(hash(f.databasePath), before);
  }
  const f = fixture(t), db = new DatabaseSync(f.databasePath);
  db.exec("DELETE FROM guru_assets"); db.close();
  assert.equal(installedGuruAvatarState(f).reason, "catalog_changed");
});

test("first install and missing table do not create or initialize the database during preflight", t => {
  const f = fixture(t);
  const absent = path.join(f.rootDir, "absent.sqlite");
  assert.equal(installedGuruAvatarState({ ...f, databasePath: absent }).reason, "database_missing");
  assert.equal(fs.existsSync(absent), false);
  const db = new DatabaseSync(f.databasePath); db.exec("DROP TABLE guru_assets"); db.close();
  const before = hash(f.databasePath);
  assert.equal(installedGuruAvatarState(f).reason, "catalog_unavailable");
  assert.equal(hash(f.databasePath), before);
});

test("missing, invalid and symlink source files fail before any database initialization", t => {
  for (const mode of ["missing", "invalid", "symlink"]) {
    const f = fixture(t), file = path.join(f.avatarDir, "fixture-guru.png"), before = hash(f.databasePath);
    if (mode === "invalid") fs.writeFileSync(file, "invalid PNG");
    else { fs.unlinkSync(file); if (mode === "symlink") fs.symlinkSync(new URL("warren-buffett.png", sourceDir), file); }
    assert.throws(() => installedGuruAvatarState(f), /before database access/);
    assert.equal(hash(f.databasePath), before);
  }
});

test("actual installer skips without importing the schema initializer on an identical catalog", t => {
  const f = fixture(t, gurus), rootDir = path.resolve(new URL("..", import.meta.url).pathname);
  // Metadata is relative to the deployed application, not this fixture root.
  const before = hash(f.databasePath);
  const result = spawnSync(process.execPath, [path.join(rootDir, "server/installGuruAvatars.js")], {
    encoding: "utf8", env: { PATH: process.env.PATH, SQLITE_DB_PATH: f.databasePath,
      SYNC_BUNDLED_VALUATION_SNAPSHOTS: "false", SYNC_BUNDLED_GURU_BACKTESTS: "false",
      SYNC_BUNDLED_DIVIDEND_CALENDAR: "false", SYNC_BUNDLED_PODCAST_INSIGHTS: "false" }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unchanged .*no database writes/);
  assert.equal(hash(f.databasePath), before, "importing localDatabase would add dozens of tables");
});

test("actual installer preserves first-install and changed-metadata repair behavior", t => {
  for (const mode of ["first", "changed"]) {
    const f = fixture(t, gurus), rootDir = path.resolve(new URL("..", import.meta.url).pathname);
    const databasePath = mode === "first" ? path.join(f.rootDir, "new.sqlite") : f.databasePath;
    if (mode === "changed") {
      const db = new DatabaseSync(databasePath);
      db.prepare("UPDATE guru_assets SET url='outdated' WHERE guru_id=?").run(gurus[0].id); db.close();
    }
    const result = spawnSync(process.execPath, [path.join(rootDir, "server/installGuruAvatars.js")], {
      encoding: "utf8", env: { PATH: process.env.PATH, SQLITE_DB_PATH: databasePath,
        SYNC_BUNDLED_VALUATION_SNAPSHOTS: "false", SYNC_BUNDLED_GURU_BACKTESTS: "false",
        SYNC_BUNDLED_DIVIDEND_CALENDAR: "false", SYNC_BUNDLED_PODCAST_INSIGHTS: "false" }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /installed 42\/42/);
    const db = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM guru_assets").get().n, gurus.length);
    assert.equal(db.prepare("SELECT url FROM guru_assets WHERE guru_id=?").get(gurus[0].id).url, `/guru-avatars/${gurus[0].id}.png`);
    if (mode === "changed") assert.equal(db.prepare("SELECT COUNT(*) AS n FROM preserved_private_fixture").get().n, 1);
    db.close();
  }
});
