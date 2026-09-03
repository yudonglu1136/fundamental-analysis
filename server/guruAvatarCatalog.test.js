import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach } from "node:test";
import { fileURLToPath } from "node:url";

import {
  auditGuruAvatarDirectory,
  canonicalGuruAvatarUrl,
  installGuruAvatarCatalog
} from "./guruAvatarCatalog.js";
import { gurus } from "./gurus.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionAvatarDir = path.join(rootDir, "web", "guru-avatars");
const sourceAvatar = path.join(productionAvatarDir, "warren-buffett.png");
const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function temporaryAvatarDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guru-avatar-catalog-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function configuredGuru(id = "test-guru") {
  return { id, name: "Test Guru" };
}

test("the production avatar directory exactly covers every configured guru", () => {
  const report = auditGuruAvatarDirectory({ avatarDir: productionAvatarDir });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.expected, gurus.length);
  assert.equal(report.found, gurus.length);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.unexpected, []);
  assert.deepEqual(report.invalid, []);
});

test("canonical avatar fallback is limited to configured gurus", () => {
  assert.equal(canonicalGuruAvatarUrl("warren-buffett"), "/guru-avatars/warren-buffett.png");
  assert.equal(canonicalGuruAvatarUrl("not-a-configured-guru"), "");
  assert.equal(canonicalGuruAvatarUrl(""), "");
  assert.equal(canonicalGuruAvatarUrl("../warren-buffett"), "");
});

test("avatar audit rejects missing and unexpected files", () => {
  const avatarDir = temporaryAvatarDirectory();
  const guru = configuredGuru();

  const missing = auditGuruAvatarDirectory({ avatarDir, configuredGurus: [guru] });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["test-guru.png"]);

  fs.copyFileSync(sourceAvatar, path.join(avatarDir, "test-guru.png"));
  fs.writeFileSync(path.join(avatarDir, "extra.jpg"), "not an avatar");
  const unexpected = auditGuruAvatarDirectory({ avatarDir, configuredGurus: [guru] });
  assert.equal(unexpected.ok, false);
  assert.deepEqual(unexpected.unexpected, ["extra.jpg"]);
});

test("avatar audit rejects disguised non-PNG and non-144x144 files", () => {
  const avatarDir = temporaryAvatarDirectory();
  const guru = configuredGuru();
  const target = path.join(avatarDir, "test-guru.png");

  fs.writeFileSync(target, "not really a PNG");
  const invalidFormat = auditGuruAvatarDirectory({ avatarDir, configuredGurus: [guru] });
  assert.equal(invalidFormat.ok, false);
  assert.match(invalidFormat.invalid[0].reason, /not a PNG/i);

  const wrongSize = fs.readFileSync(sourceAvatar);
  wrongSize.writeUInt32BE(143, 16);
  fs.writeFileSync(target, wrongSize);
  const invalidDimensions = auditGuruAvatarDirectory({ avatarDir, configuredGurus: [guru] });
  assert.equal(invalidDimensions.ok, false);
  assert.match(invalidDimensions.invalid[0].reason, /expected 144x144, found 143x144/);
});

test("strict installation validates the complete catalog before writing any database rows", () => {
  const avatarDir = temporaryAvatarDirectory();
  const configuredGurus = [configuredGuru("first-guru"), configuredGuru("second-guru")];
  fs.copyFileSync(sourceAvatar, path.join(avatarDir, "first-guru.png"));
  const writes = [];

  assert.throws(
    () =>
      installGuruAvatarCatalog({
        avatarDir,
        rootDir,
        configuredGurus,
        writeAsset: (...args) => writes.push(args)
      }),
    /missing: second-guru\.png/
  );
  assert.deepEqual(writes, [], "a failed catalog audit must not partially update guru_assets");

  fs.copyFileSync(sourceAvatar, path.join(avatarDir, "second-guru.png"));
  const generatedAt = "2026-09-03T00:00:00.000Z";
  const report = installGuruAvatarCatalog({
    avatarDir,
    rootDir,
    configuredGurus,
    generatedAt,
    writeAsset: (...args) => writes.push(args)
  });
  assert.equal(report.installed, 2);
  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map(([guruId, asset]) => [guruId, asset.url, asset.generatedAt]),
    [
      ["first-guru", "/guru-avatars/first-guru.png", generatedAt],
      ["second-guru", "/guru-avatars/second-guru.png", generatedAt]
    ]
  );
});
