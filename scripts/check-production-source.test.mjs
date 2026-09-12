import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { checkProductionSource } from './check-production-source.mjs';

test('production source gate rejects dirty, untracked and non-trunk checkouts', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-release-source-'));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-release-remote-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init', '--initial-branch=trunk');
    execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
    git('remote', 'add', 'origin', remote);
    git('-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'synthetic baseline');
    assert.equal(checkProductionSource(cwd).status, 'blocked');
    git('push', 'origin', 'trunk');
    assert.equal(checkProductionSource(cwd).status, 'pass');
    fs.writeFileSync(path.join(cwd, 'new-module.js'), '// synthetic\n');
    assert.equal(checkProductionSource(cwd).untrackedFiles, 1);
    git('add', 'new-module.js');
    assert.equal(checkProductionSource(cwd).trackedChanges, 1);
    git('-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'synthetic module');
    assert.equal(checkProductionSource(cwd).status, 'blocked');
    git('push', 'origin', 'trunk');
    assert.equal(checkProductionSource(cwd).status, 'pass');
    fs.appendFileSync(path.join(cwd, 'new-module.js'), '// local-only\n');
    assert.equal(checkProductionSource(cwd).status, 'blocked');
    git('switch', '-c', 'candidate');
    assert.ok(checkProductionSource(cwd).failures.some(x => x.includes('trunk')));
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); fs.rmSync(remote, { recursive: true, force: true }); }
});

test('production source gate does not trust a stale tracking ref or unreachable remote', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-release-stale-'));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-release-stale-remote-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git('init', '--initial-branch=trunk');
    execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
    git('remote', 'add', 'origin', remote);
    git('-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'baseline');
    git('push', 'origin', 'trunk');
    const baseline = git('rev-parse', 'HEAD');
    git('-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'unpublished');
    git('update-ref', 'refs/remotes/origin/trunk', git('rev-parse', 'HEAD'));
    const result = checkProductionSource(cwd);
    assert.equal(result.status, 'blocked');
    assert.equal(result.publishedCommit, baseline);
    git('remote', 'set-url', 'origin', path.join(remote, 'does-not-exist'));
    assert.match(checkProductionSource(cwd).failures.join(' '), /could not be verified/);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); fs.rmSync(remote, { recursive: true, force: true }); }
});

test('AWS packaging checks provenance before touching the output archive', () => {
  const script = fs.readFileSync(new URL('./package-aws-backend.sh', import.meta.url), 'utf8');
  assert.ok(script.indexOf('node scripts/check-production-source.mjs') < script.indexOf('rm -f "$zip_path"'));
  assert.ok(script.indexOf('node scripts/check-production-source.mjs') < script.indexOf('\ngit archive'));
});
