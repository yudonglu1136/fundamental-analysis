import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('isolated Flutter builds refuse an existing output without touching dist', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-build-isolation-'));
  try {
    fs.mkdirSync(path.join(cwd, 'bin')); fs.mkdirSync(path.join(cwd, 'dist'));
    fs.writeFileSync(path.join(cwd, 'dist', 'keep.txt'), 'existing preview');
    fs.writeFileSync(path.join(cwd, 'bin', 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    const result = spawnSync('bash', [new URL('./flutter-build.sh', import.meta.url).pathname], {
      cwd, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(cwd, 'bin')}:${process.env.PATH}`,
        AUTH_DEV_BYPASS: 'false', SUPABASE_URL: 'https://synthetic.example.invalid', SUPABASE_ANON_KEY: 'synthetic-key',
        FLUTTER_BUILD_OUTPUT: path.join(cwd, 'dist') }
    });
    assert.equal(result.status, 1); assert.match(result.stderr, /refusing to overwrite/);
    assert.equal(fs.readFileSync(path.join(cwd, 'dist', 'keep.txt'), 'utf8'), 'existing preview');
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
