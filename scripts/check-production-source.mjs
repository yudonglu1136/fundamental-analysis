import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This checks source provenance only, not production/data readiness. In
// particular a clean checkout cannot override the investment production guard.
export function checkProductionSource(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const branch = git('branch', '--show-current');
  const commit = git('rev-parse', 'HEAD');
  const tracked = git('status', '--porcelain', '--untracked-files=no');
  const untracked = git('ls-files', '--others', '--exclude-standard');
  const failures = [];
  if (branch !== 'trunk') failures.push('Production packages must come from trunk.');
  if (tracked) failures.push('Tracked changes have not been committed and verified.');
  if (untracked) failures.push('Untracked files make the verified source set ambiguous.');
  let publishedCommit = null;
  // A cached origin/trunk ref can be stale. Verify the actual remote, without
  // fetching, changing the checkout or relying on a developer's upstream name.
  if (!failures.length) {
    try {
      const remote = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/trunk'], {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }).trim();
      publishedCommit = remote.split(/\s+/)[0] || null;
      if (publishedCommit !== commit) failures.push('HEAD is not the published origin/trunk commit.');
    } catch {
      failures.push('Published origin/trunk could not be verified.');
    }
  }
  return { status: failures.length ? 'blocked' : 'pass', branch, commit,
    publishedCommit,
    trackedChanges: tracked ? tracked.split('\n').length : 0,
    untrackedFiles: untracked ? untracked.split('\n').length : 0,
    failures, scope: 'Source provenance only; database, TLS, migrations and release acceptance are separate gates.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkProductionSource();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'pass') process.exitCode = 1;
  } catch {
    console.error('Source provenance could not be verified; no package should be created.');
    process.exitCode = 1;
  }
}
