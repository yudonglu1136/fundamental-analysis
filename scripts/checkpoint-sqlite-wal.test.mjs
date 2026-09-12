import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {checkpointSqliteWal,validateCheckpointRequest} from './checkpoint-sqlite-wal.mjs';

function fixture() {
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'tf-checkpoint-test-')));
  const file=path.join(dir,'fixture.sqlite'),db=new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records VALUES (1,'preserved');");
  return {dir,file,db,close(){db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
function execution(file) {
  const s=fs.statSync(file),generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  return {database:file,execute:true,expectedDevice:s.dev,expectedInode:s.ino,
    backupGeneration:generation,rollbackSnapshot:'snap-0123456789abcdef0',backupReceipt:{
      status:'verified_off_host_user_backup',capturedAt:new Date().toISOString(),generation,
      remoteRestore:true,offHostRestore:true,credentialRecoveryEnvelopeVerified:true,productionDatabasesWritten:false}};
}
test('operator defaults to NOOP inspection and preserves main/WAL bytes and rows',()=>{
  const f=fixture();
  try {
    const main=fs.readFileSync(f.file),wal=fs.readFileSync(f.file+'-wal');
    const result=checkpointSqliteWal({database:f.file});
    assert.equal(result.status,'read_only_wal_inspection');
    assert.equal(result.checkpoint,null);
    assert.deepEqual(fs.readFileSync(f.file),main);assert.deepEqual(fs.readFileSync(f.file+'-wal'),wal);
    assert.equal(f.db.prepare('SELECT value FROM records WHERE id=1').get().value,'preserved');
  } finally {f.close();}
});
test('execution refuses changed identity, missing/stale backup, or unacknowledged recovery snapshot',()=>{
  const f=fixture();
  try {
    const valid=execution(f.file);
    assert.throws(()=>validateCheckpointRequest({...valid,expectedInode:0}),/identity_changed/);
    assert.throws(()=>validateCheckpointRequest({...valid,backupReceipt:null}),/verified_user_backup/);
    assert.throws(()=>validateCheckpointRequest({...valid,backupReceipt:{...valid.backupReceipt,capturedAt:'2000-01-01'}}),/verified_user_backup/);
    assert.throws(()=>validateCheckpointRequest({...valid,rollbackSnapshot:''}),/snapshot_acknowledgement/);
    const alias=path.join(f.dir,'alias.sqlite');fs.symlinkSync(f.file,alias);
    assert.throws(()=>validateCheckpointRequest({...valid,database:alias}),/exact_regular/);
  } finally {f.close();}
});
test('approved TRUNCATE reclaims retained WAL without changing schema or application rows',()=>{
  const f=fixture();
  try {
    assert.ok(fs.statSync(f.file+'-wal').size>0);
    const result=checkpointSqliteWal(execution(f.file));
    assert.equal(result.status,'checkpoint_complete');
    assert.equal(result.after.wal.bytes,0);
    assert.equal(result.before.schemaSha256,result.after.schemaSha256);
    assert.deepEqual(f.db.prepare('SELECT * FROM records').all().map(r=>({...r})),[{id:1,value:'preserved'}]);
    f.db.exec("INSERT INTO records VALUES (2,'still writable')");
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM records').get().n,2);
  } finally {f.close();}
});
test('a pinned reader returns busy promptly and never removes its WAL or loses committed rows',()=>{
  const f=fixture(),reader=new DatabaseSync(f.file,{readOnly:true});
  try {
    reader.exec('BEGIN');reader.prepare('SELECT * FROM records').all();
    f.db.exec("INSERT INTO records VALUES (2,'committed after reader')");
    const started=Date.now(),result=checkpointSqliteWal(execution(f.file));
    assert.equal(result.status,'checkpoint_busy');assert.ok(Date.now()-started<5000);
    assert.ok(fs.statSync(f.file+'-wal').size>0);
    reader.exec('ROLLBACK');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM records').get().n,2);
  } finally {reader.close();f.close();}
});
