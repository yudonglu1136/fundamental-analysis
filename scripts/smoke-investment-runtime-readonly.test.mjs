import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { inspectPublicSchema, cacheEvidence, smokeInvestmentRuntime } from './smoke-investment-runtime-readonly.mjs';

test('public schema smoke cannot change source bytes or create journal sidecars',t=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'tf-readonly-smoke-')));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'public.sqlite'),db=new DatabaseSync(file);
  db.exec("CREATE TABLE public_evidence(id TEXT PRIMARY KEY,value INTEGER); INSERT INTO public_evidence VALUES('example',1)");db.close();
  const digest=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=digest();
  assert.deepEqual(inspectPublicSchema(file,['public_evidence'],['public_evidence']),{tables:1,journal:'delete',queryOnly:true});
  assert.equal(digest(),before);assert.deepEqual(fs.readdirSync(dir),['public.sqlite']);
  const edit=new DatabaseSync(file);edit.exec('CREATE TABLE portfolio_nav_points(secret TEXT)');edit.close();
  assert.throws(()=>inspectPublicSchema(file,['public_evidence'],['public_evidence']),/unexpected_table/);
});

test('old/malformed cache identities are unavailable, never counted as ready',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE guru_backtests(guru_id TEXT, years INTEGER, payload_json TEXT)');
    const insert=db.prepare('INSERT INTO guru_backtests VALUES(?,?,?)');
    insert.run('bill-ackman',5,JSON.stringify({status:'ready',method:{years:5,version:'current',securityMasterVersion:'old'},equity:[{},{},{}]}));
    insert.run('li-lu',5,'malformed');
    const before=db.prepare('SELECT total_changes() n').get().n;
    const evidence=cacheEvidence(db,{strict:'current',proxy:'proxy',security:'current-sm'});
    assert.equal(evidence.windows['5Y'].readyUpperBound,0);
    assert.equal(evidence.windows['10Y'].readyUpperBound,0);
    assert.equal(evidence.windows['5Y'].reasons.incompatible_strict_identity,1);
    assert.equal(evidence.windows['5Y'].unavailable,evidence.windows['5Y'].expected);
    assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
    assert.match(evidence.scope,/not a publishable-curve claim/);
  }finally{db.close();}
});

test('import graph never initializes the legacy database and requires actual production activation',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('./smoke-investment-runtime-readonly.mjs',import.meta.url).href)}); console.log('readonly-import-ok')`],
    {encoding:'utf8',env:{...process.env,SQLITE_DB_PATH:'/dev/null/must-not-initialize.sqlite'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/readonly-import-ok/);
  assert.throws(()=>smokeInvestmentRuntime({NODE_ENV:'development'}),/production_activation_environment_required/);
  assert.throws(()=>smokeInvestmentRuntime({NODE_ENV:'production'}),/production_activation_environment_required/);
});
