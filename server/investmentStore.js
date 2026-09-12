import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assert, signature, canonical } from './investmentMath.js';
import { verifiedInvestmentOwner } from './investmentRuntimeConfig.js';

// A separate database, never attached to the paid financial/production DB.
// Append-only SQL triggers also protect against accidental future UPDATE paths.
export class InvestmentStore {
  constructor(file,clock=()=>new Date().toISOString(),{verifiedOwnersOnly=false}={}) {
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file);this.clock=clock;this.verifiedOwnersOnly=verifiedOwnersOnly;
    if(verifiedOwnersOnly) {
      try {
        const tables=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
        assert(tables.every(name=>['investment_events','sqlite_sequence'].includes(name)),'investment_private_store_schema_conflict');
        if(tables.includes('investment_events'))assert(this.db.prepare('SELECT DISTINCT owner FROM investment_events').all().every(row=>verifiedInvestmentOwner(row.owner)),'investment_private_store_unverified_owner');
      }catch(error){this.db.close();throw error;}
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS investment_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        owner TEXT NOT NULL, kind TEXT NOT NULL, ticker TEXT NOT NULL,
        operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
        recorded_at TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
        UNIQUE(owner,operation_id));
      CREATE INDEX IF NOT EXISTS investment_owner_kind ON investment_events(owner,kind,seq);
      CREATE TRIGGER IF NOT EXISTS investment_immutable_update BEFORE UPDATE ON investment_events BEGIN SELECT RAISE(ABORT,'immutable investment event'); END;
      CREATE TRIGGER IF NOT EXISTS investment_immutable_delete BEFORE DELETE ON investment_events BEGIN SELECT RAISE(ABORT,'immutable investment event'); END;`);
    fs.chmodSync(file,0o600);
  }
  close(){this.db.close();}
  decode(row) {
    if(!row)return null;
    const payload=JSON.parse(row.payload_json);assert(signature(payload)===row.payload_hash,'snapshot_integrity_failure');
    return {id:row.id,sequence:row.seq,kind:row.kind,ticker:row.ticker,recordedAt:row.recorded_at,hash:row.payload_hash,...payload};
  }
  list(owner,kind=null) {
    return this.db.prepare('SELECT * FROM investment_events WHERE owner=? AND (? IS NULL OR kind=?) ORDER BY seq').all(owner,kind,kind).map(r=>this.decode(r));
  }
  get(owner,id,kind=null) {
    const row=this.db.prepare('SELECT * FROM investment_events WHERE owner=? AND id=?').get(owner,id);
    assert(row && (!kind || row.kind===kind),'record_not_found');return this.decode(row);
  }
  write(owner,kind,ticker,operationId,request,build) {
    assert(typeof owner==='string'&&owner.length>0,'unauthorized');
    assert(!this.verifiedOwnersOnly||verifiedInvestmentOwner(owner),'unauthorized');
    assert(typeof operationId==='string'&&/^[a-zA-Z0-9_-]{12,100}$/.test(operationId),'operation_id_required');
    const requestHash=signature({kind,ticker,request});
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous=this.db.prepare('SELECT * FROM investment_events WHERE owner=? AND operation_id=?').get(owner,operationId);
      if(previous) {assert(previous.request_hash===requestHash,'operation_id_conflict');this.db.exec('COMMIT');return this.decode(previous);}
      const payload=canonical(build()),id=crypto.randomUUID(),recordedAt=this.clock();
      const hash=signature(payload);
      this.db.prepare('INSERT INTO investment_events(id,owner,kind,ticker,operation_id,request_hash,recorded_at,payload_json,payload_hash) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id,owner,kind,ticker,operationId,requestHash,recordedAt,JSON.stringify(payload),hash);
      const result=this.get(owner,id);this.db.exec('COMMIT');return result;
    } catch(error) {this.db.exec('ROLLBACK');throw error;}
  }
}
