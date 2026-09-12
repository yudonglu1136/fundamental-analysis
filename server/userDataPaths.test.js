import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveUserDataPaths } from './userDataPaths.js';

test('legacy locations and explicit overrides stay unchanged', () => {
  const p = resolveUserDataPaths({SQLITE_DB_PATH:'/var/app/data/guru-analysis.sqlite'});
  assert.equal(p.portfolios, '/var/app/data/user-portfolios');
  assert.equal(p.login, '/var/app/data/user-portfolios/login-activity.sqlite');
  assert.equal(p.investment, null);
  const q = resolveUserDataPaths({USER_DATA_ROOT:'/var/app/data/users-v1', USER_PORTFOLIO_DATA_DIR:'/var/app/data/old-users', INVESTMENT_DB_PATH:'/var/app/data/decisions.sqlite'});
  assert.equal(q.portfolios, '/var/app/data/old-users');
  assert.equal(q.investment, '/var/app/data/decisions.sqlite');
});
test('new root groups private domain stores; invalid/shared paths fail', () => {
  const p = resolveUserDataPaths({USER_DATA_ROOT:'/var/app/data/users-v1',SQLITE_DB_PATH:'/var/app/data/research.sqlite'});
  assert.equal(p.investment, '/var/app/data/users-v1/investment.sqlite');
  assert.equal(p.portfolios, '/var/app/data/users-v1/portfolios');
  for(const root of ['relative', '/', '/var/app/data', '/var/app/current/users', '/var/app/staging/users']) {
    assert.throws(()=>resolveUserDataPaths({USER_DATA_ROOT:root}));
  }
  assert.throws(()=>resolveUserDataPaths({SQLITE_DB_PATH:'/tmp/research.sqlite', INVESTMENT_DB_PATH:'/tmp/../tmp/research.sqlite'}));
  assert.throws(()=>resolveUserDataPaths({USER_PORTFOLIO_DATA_DIR:'/tmp/users', LOGIN_ACTIVITY_DB_PATH:'/tmp/users/portfolio-admin.sqlite'}));
});
test('changing root never silently hides an existing user directory', () => {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-root-test-'));
  try {
    fs.mkdirSync(path.join(tmp,'user-portfolios'));
    fs.writeFileSync(path.join(tmp,'user-portfolios/portfolio-admin.sqlite'),'synthetic placeholder');
    assert.throws(()=>resolveUserDataPaths({SQLITE_DB_PATH:path.join(tmp,'research.sqlite'),USER_DATA_ROOT:path.join(tmp,'new')}),/Legacy user data/);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
