import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("backend packaging rejects a retired snapshot flag without replacing an archive or reading a database", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "retired-package-test-"));
  try {
    const archive = path.join(directory, "previous.zip");
    fs.writeFileSync(archive, "previous verified archive");
    const result = spawnSync("bash", [path.resolve("scripts/package-aws-backend.sh"), "fixture"], {
      cwd: directory, encoding: "utf8",
      env: { ...process.env, INCLUDE_ONTOLOGY_SNAPSHOT: "1", AWS_PACKAGE_PATH: archive,
        SQLITE_DB_PATH: "/must-not-open.sqlite", ONTOLOGY_SNAPSHOT_PATH: "/must-not-open-either.sqlite" }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Ontology is retired/);
    assert.equal(fs.readFileSync(archive, "utf8"), "previous verified archive");
    assert.deepEqual(fs.readdirSync(directory), ["previous.zip"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("production npm scripts and backend packaging cannot start, verify, or include the retired module", () => {
  const scripts = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).scripts;
  assert.equal(Object.entries(scripts).some(([key, value]) => /ontology/i.test(`${key} ${value}`)), false);
  const source = fs.readFileSync(path.resolve("scripts/package-aws-backend.sh"), "utf8");
  assert.doesNotMatch(source, /ontology_snapshot_path|verify-ontology|cp[^\n]*ontology|zip[^\n]*ontology/);
  assert.match(source, /check-production-source/);
  assert.match(source, /INCLUDE_PIT_MIGRATION/);
});
