import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { backupUserData,restoreUserData,discoverUserDatabases } from './userDataBackup.js';

const key='ab'.repeat(32);
function fixture(t) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-backup-test-'));
  const portfolios=path.join(temp,'live'),investment=path.join(temp,'investment.sqlite');
  fs.mkdirSync(portfolios);
  const dbs=[];
  for(const [n,nav] of [[1,100],[2,900]]) {
    const dir=path.join(portfolios,String(n).repeat(40));fs.mkdirSync(dir);
    const db=new DatabaseSync(path.join(dir,'portfolio.sqlite'));dbs.push(db);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE portfolio_nav_points(date TEXT PRIMARY KEY, nav REAL, payload_json TEXT)');
    db.prepare('INSERT INTO portfolio_nav_points VALUES(?,?,?)').run('2026-09-10',nav,'private-synthetic-amount');
    db.exec('CREATE TABLE portfolio_report_snapshots(provider TEXT, report_date TEXT, encrypted_json TEXT)');
    db.prepare('INSERT INTO portfolio_report_snapshots VALUES(?,?,?)').run('ibkr_flex','2026-09-10',`synthetic-report-${n}`);
  }
  // Raw SQLite fixture keeps private backup verification independent of any
  // unreleased investment-model or HTTP feature implementation.
  const store=new DatabaseSync(investment);
  store.exec('CREATE TABLE investment_events(id TEXT PRIMARY KEY, owner_id TEXT, payload_json TEXT); CREATE TRIGGER immutable_events_delete BEFORE DELETE ON investment_events BEGIN SELECT RAISE(ABORT, "immutable"); END;');
  const event={id:'event-a',owner_id:'synthetic-owner-a',payload_json:JSON.stringify({growth:.12})};
  store.prepare('INSERT INTO investment_events VALUES(?,?,?)').run(event.id,event.owner_id,event.payload_json);
  store.prepare('INSERT INTO investment_events VALUES(?,?,?)').run('event-b','synthetic-owner-b',JSON.stringify({note:'private-synthetic-note'}));
  const paths={portfolios,registry:path.join(portfolios,'portfolio-admin.sqlite'),login:path.join(portfolios,'login-activity.sqlite'),investment,research:path.join(temp,'research.sqlite')};
  t.after(()=>{dbs.forEach(db=>db.close());store.close();fs.rmSync(temp,{recursive:true,force:true});});
  return {temp,paths,dbs,store,event,output:path.join(temp,'encrypted')};
}
test('live WAL snapshot, encrypted export and isolated restore preserve owner events and NAV',async t=>{
  const f=fixture(t),before=fs.readFileSync(f.paths.investment);
  const result=await backupUserData({...f,key});assert.equal(result.databases,3);
  assert.equal(result.consistency,'per_database_online_snapshot');
  assert.deepEqual(fs.readFileSync(f.paths.investment),before);
  for(const file of fs.readdirSync(f.output)) {
    const blob=fs.readFileSync(path.join(f.output,file));
    assert.ok(!blob.includes(Buffer.from('private-synthetic')));
    assert.ok(!blob.includes(Buffer.from('synthetic-owner')));
    assert.equal(fs.statSync(path.join(f.output,file)).mode&0o777,0o600);
  }
  const dest=path.join(f.temp,'restored');
  assert.equal((await restoreUserData({input:f.output,output:dest,key})).status,'verified_isolated_restore');
  const store=new DatabaseSync(path.join(dest,'investment.sqlite'));
  try {
    assert.deepEqual({...store.prepare('SELECT * FROM investment_events WHERE owner_id=? AND id=?').get('synthetic-owner-a',f.event.id)},f.event);
    assert.equal(store.prepare('SELECT * FROM investment_events WHERE owner_id=? AND id=?').get('synthetic-owner-b',f.event.id),undefined);
    assert.equal(store.prepare('SELECT count(*) AS n FROM investment_events WHERE owner_id=?').get('synthetic-owner-a').n,1);
    assert.throws(()=>store.exec('DELETE FROM investment_events'),/immutable/);
    assert.throws(()=>store.prepare('INSERT INTO investment_events VALUES(?,?,?)').run(f.event.id,f.event.owner_id,'{}'),/UNIQUE/);
  } finally {store.close();}
  for(const [n,nav] of [[1,100],[2,900]]) {
    const db=new DatabaseSync(path.join(dest,'portfolios',String(n).repeat(40),'portfolio.sqlite'),{readOnly:true});
    assert.equal(db.prepare('SELECT nav FROM portfolio_nav_points').get().nav,nav);
    assert.equal(db.prepare('SELECT encrypted_json FROM portfolio_report_snapshots').get().encrypted_json,`synthetic-report-${n}`);
    db.close();
  }
});
test('wrong key and modified ciphertext fail without leaving a partial restore',async t=>{
  const f=fixture(t);await backupUserData({...f,key});
  const dest=path.join(f.temp,'rejected');
  await assert.rejects(restoreUserData({input:f.output,output:dest,key:'cd'.repeat(32)}));
  assert.ok(!fs.existsSync(dest));
  const file=path.join(f.output,'db-00001.enc'),blob=fs.readFileSync(file);blob[40]^=1;fs.writeFileSync(file,blob);
  await assert.rejects(restoreUserData({input:f.output,output:dest,key}));
  assert.ok(!fs.existsSync(dest));
});
test('never overwrite live/existing output or publish unknown data',async t=>{
  const f=fixture(t);await backupUserData({...f,key});
  await assert.rejects(backupUserData({...f,key}),/EEXIST/);
  await assert.rejects(restoreUserData({input:f.output,output:f.paths.portfolios,key}),/EEXIST/);
  f.dbs[0].exec('CREATE TABLE unexpected_private_data(id INTEGER)');
  const output=path.join(f.temp,'rejected');await assert.rejects(backupUserData({...f,output,key}),/Unexpected table/);
  assert.ok(!fs.existsSync(output));
  assert.equal(f.dbs[1].prepare('SELECT nav FROM portfolio_nav_points').get().nav,900);
});
test('inventory rejects symlinks, unknown files, empty and missing configured stores',t=>{
  const f=fixture(t);
  fs.symlinkSync(f.paths.investment,path.join(f.paths.portfolios,'link.sqlite'));
  assert.throws(()=>discoverUserDatabases(f.paths),/Symlinks/);
  fs.unlinkSync(path.join(f.paths.portfolios,'link.sqlite'));
  fs.writeFileSync(path.join(f.paths.portfolios,'oops.txt'),'test');
  assert.throws(()=>discoverUserDatabases(f.paths),/Unknown file/);
  fs.unlinkSync(path.join(f.paths.portfolios,'oops.txt'));
  assert.throws(()=>discoverUserDatabases({...f.paths,investment:path.join(f.temp,'missing')}),/missing/);
});
test('authenticated malicious manifest paths are still rejected',async t=>{
  const f=fixture(t);await backupUserData({...f,key});
  const file=path.join(f.output,'manifest.enc'),blob=fs.readFileSync(file),secret=Buffer.from(key,'hex');
  const aad=Buffer.from('thesisforge-user-data-manifest-v1');
  const decipher=crypto.createDecipheriv('aes-256-gcm',secret,blob.subarray(8,20));
  decipher.setAAD(aad);decipher.setAuthTag(blob.subarray(-16));
  const manifest=JSON.parse(Buffer.concat([decipher.update(blob.subarray(20,-16)),decipher.final()]));
  manifest.files[0].logical='../escaped.sqlite';
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(aad);
  const changed=Buffer.concat([cipher.update(JSON.stringify(manifest)),cipher.final()]);
  fs.writeFileSync(file,Buffer.concat([Buffer.from('TFUD0001'),iv,changed,cipher.getAuthTag()]));
  const dest=path.join(f.temp,'rejected');await assert.rejects(restoreUserData({input:f.output,output:dest,key}),/Unknown user database path/);
  assert.ok(!fs.existsSync(dest));assert.ok(!fs.existsSync(path.join(f.temp,'escaped.sqlite')));
});
test('missing backup key fails before creating files',async t=>{
  const f=fixture(t);await assert.rejects(backupUserData({...f,key:''}),/dedicated/);assert.ok(!fs.existsSync(f.output));
});
test('hard links and research aliases cannot duplicate or mix store identities',t=>{
  const f=fixture(t);
  fs.linkSync(f.paths.investment,f.paths.registry);
  assert.throws(()=>discoverUserDatabases(f.paths),/overlap/);
  fs.unlinkSync(f.paths.registry);
  fs.symlinkSync(f.paths.investment,f.paths.research);
  assert.throws(()=>discoverUserDatabases(f.paths),/Research data/);
});
