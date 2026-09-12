import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { verifyWorkflowArtifact } from './verify-workflow-artifact.mjs';

// Exercise the real build wrapper with a synthetic Flutter command. No publish,
// credentials, backend mutation or real Flutter build is involved here.
function runBuild(overrides = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-workflow-build-'));
  try {
    const bin = path.join(cwd, 'bin');
    fs.mkdirSync(bin);
    fs.symlinkSync(process.execPath, path.join(bin, 'node'));
    fs.mkdirSync(path.join(cwd, 'scripts'));
    fs.writeFileSync(path.join(cwd, 'scripts', 'build-public-research.mjs'), '// Synthetic reviewed page.\n');
    fs.copyFileSync(new URL('./verify-workflow-artifact.mjs', import.meta.url), path.join(cwd, 'scripts', 'verify-workflow-artifact.mjs'));
    fs.writeFileSync(path.join(bin, 'flutter'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
process.stdout.write(args.join('\\n'));
const output = args[args.indexOf('--output') + 1];
const enabled = process.env.FORCE_COMPILED_WORKFLOW === 'false' ? false : args.includes('--dart-define=INVESTMENT_WORKFLOW_ENABLED=true');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'main.dart.js'), 'synthetic artifact thesisforge-workflow-' + (enabled ? 'enabled' : 'disabled') + '-v1');
`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`,
      VERCEL_ENV: 'production', NODE_ENV: 'production',
      AUTH_DEV_BYPASS: 'false', SUPABASE_URL: 'https://fixture.supabase.co',
      SUPABASE_ANON_KEY: 'synthetic-public-key', FLUTTER_BUILD_OUTPUT: path.join(cwd, 'new-dist'),
    };
    delete env.INVESTMENT_WORKFLOW_ENABLED;
    delete env.VITE_INVESTMENT_WORKFLOW_ENABLED;
    Object.assign(env, overrides);
    const result = spawnSync('bash', [new URL('./flutter-build.sh', import.meta.url).pathname], {
      cwd, encoding: 'utf8', env,
    });
    const metadataPath = path.join(env.FLUTTER_BUILD_OUTPUT, 'thesisforge-build.json');
    return { ...result, metadata: fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : null };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('production workflow activation reaches the Flutter build without bypassing auth', () => {
  const result = runBuild({ VITE_INVESTMENT_WORKFLOW_ENABLED: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--dart-define=INVESTMENT_WORKFLOW_ENABLED=true/);
  assert.match(result.stdout, /--dart-define=AUTH_DEV_BYPASS=false/);
  assert.equal(result.metadata.investmentWorkflowEnabled, true);
});

test('workflow remains explicitly gated until the production backend is ready', () => {
  const result = runBuild();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--dart-define=INVESTMENT_WORKFLOW_ENABLED=false/);
  assert.equal(result.metadata.investmentWorkflowEnabled, false);
  const invalid = runBuild({ INVESTMENT_WORKFLOW_ENABLED: 'yes' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /must be true or false/);
});

test('production cannot publish a development-login bypass', () => {
  const result = runBuild({ AUTH_DEV_BYPASS: 'true', INVESTMENT_WORKFLOW_ENABLED: 'true' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Production builds must set AUTH_DEV_BYPASS=false/);
  assert.doesNotMatch(result.stdout, /--dart-define/);
});

test('the wrapper fails if Flutter did not compile the requested branch', () => {
  const result = runBuild({ INVESTMENT_WORKFLOW_ENABLED: 'true', FORCE_COMPILED_WORKFLOW: 'false' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Compiled workflow branch does not match/);
  assert.equal(result.metadata, null);
});

for (const enabled of [false, true]) {
  test(`artifact metadata proves the compiled workflow=${enabled} branch and exact bytes`, () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-artifact-proof-'));
    try {
      const entry = `const marker = 'thesisforge-workflow-${enabled ? 'enabled' : 'disabled'}-v1';`;
      fs.writeFileSync(path.join(output, 'main.dart.js'), entry);
      const metadata = verifyWorkflowArtifact(output, String(enabled));
      assert.deepEqual(metadata, {
        schemaVersion: 1,
        investmentWorkflowEnabled: enabled,
        mainDartJsSha256: createHash('sha256').update(entry).digest('hex'),
      });
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'thesisforge-build.json'), 'utf8')), metadata);
    } finally { fs.rmSync(output, { recursive: true, force: true }); }
  });
}

for (const entry of ['old unmarked artifact', 'thesisforge-workflow-enabled-v1 thesisforge-workflow-disabled-v1']) {
  test(`artifact verification rejects ${entry.startsWith('old') ? 'unmarked' : 'ambiguous'} compiled branches`, () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-artifact-proof-'));
    try {
      fs.writeFileSync(path.join(output, 'main.dart.js'), entry);
      for (const flag of ['true', 'false']) assert.throws(() => verifyWorkflowArtifact(output, flag), /Compiled workflow branch/);
      assert.throws(() => verifyWorkflowArtifact(output, ''), /must be true or false/);
      assert.equal(fs.existsSync(path.join(output, 'thesisforge-build.json')), false);
    } finally { fs.rmSync(output, { recursive: true, force: true }); }
  });
}
