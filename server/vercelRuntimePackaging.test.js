import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/).map(x => x.trim());

test('remote Vercel uploads include the shared retirement module, not old Ontology validation', () => {
  assert.ok(ignored.includes('server/*'), 'Keep unrelated server and data files out of the frontend upload');
  assert.ok(ignored.includes('!server/retiredProductRoutes.js'));
  assert.ok(!ignored.includes('!server/ontologySnapshotValidation.js'));
  assert.ok(!ignored.includes('!server/*'), 'Never upload the entire server to fix a missing module');
});

test('every relative proxy runtime import survives the remote source upload boundary', () => {
  const pending = ['api/proxy.js'], visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert.ok(fs.existsSync(path.join(root, file)), file);
    if (file.startsWith('server/')) assert.ok(ignored.includes('!' + file), 'Remote upload excludes ' + file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      assert.ok(!target.startsWith('../'), 'Import leaves repository');
      pending.push(target);
    }
  }
  assert.ok(visited.has('server/retiredProductRoutes.js'));
});
