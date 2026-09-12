import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { exportInvestmentResearch, investmentResearchTables } from './export-investment-research.mjs';

function fixture() {
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'investment-export-test-')));
  const source=path.join(dir,'source.sqlite'),output=path.join(dir,'public.sqlite');
  const db=new DatabaseSync(source);
  for(const table of investmentResearchTables) {
    db.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,value REAL,amount INTEGER,missing TEXT,payload_json TEXT)`);
    db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?)`).run('verified',1.125,9007199254740993n,null,'{"dated":"evidence"}');
  }
  db.exec("CREATE TABLE portfolio_nav_points(owner TEXT,balance REAL);INSERT INTO portfolio_nav_points VALUES('private-owner',123);CREATE TABLE arbitrary_future_private_table(secret TEXT);CREATE INDEX investment_quality_pit ON investment_quality_annual(value);CREATE TRIGGER private_side_effect AFTER INSERT ON investment_quality_annual BEGIN INSERT INTO arbitrary_future_private_table VALUES('do not export');END;");
  db.close();
  return {dir,source,output};
}
test('exact public allowlist export preserves economic values, schema/index and source bytes',async()=>{
  const f=fixture(),before=crypto.createHash('sha256').update(fs.readFileSync(f.source)).digest('hex');
  try {
    const result=await exportInvestmentResearch(f.source,f.output);
    assert.deepEqual(result.checks,{integrity:'ok',schema:'pass',content:'pass',privateDataExcluded:true});
    assert.equal(result.sourceSha256,before);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f.source)).digest('hex'),before);
    assert.ok(result.excludedTables.includes('portfolio_nav_points'));
    const db=new DatabaseSync(f.output,{readOnly:true});
    try {
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n,investmentResearchTables.length);
      assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,0);
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='investment_quality_pit'").get());
      const statement=db.prepare('SELECT * FROM investment_quality_annual');statement.setReadBigInts(true);
      assert.deepEqual({...statement.get()},{id:'verified',value:1.125,amount:9007199254740993n,missing:null,payload_json:'{"dated":"evidence"}'});
      assert.throws(()=>db.prepare('SELECT * FROM portfolio_nav_points'));
    }finally{db.close();}
    assert.equal(fs.statSync(f.output).mode&0o777,0o600);
    await assert.rejects(exportInvestmentResearch(f.source,f.output),/new_output_required/);
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('missing required research source blocks export, retaining original and not publishing output',async()=>{
  const f=fixture();try {
    const db=new DatabaseSync(f.source);db.exec('DROP TABLE guru_exposure_snapshots');db.close();
    await assert.rejects(exportInvestmentResearch(f.source,f.output),/required_research_table_missing/);
    assert.equal(fs.existsSync(f.output),false);assert.equal(fs.existsSync(f.source),true);
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('source alias, same file, and uncheckpointed source are rejected',async()=>{
  const f=fixture();try {
    await assert.rejects(exportInvestmentResearch(f.source,f.source),/new_output_required/);
    const alias=path.join(f.dir,'alias.sqlite');fs.symlinkSync(f.source,alias);
    await assert.rejects(exportInvestmentResearch(alias,f.output),/regular_source_required/);
    const db=new DatabaseSync(f.source);db.exec("PRAGMA journal_mode=WAL;INSERT INTO portfolio_nav_points VALUES('owner',5)");
    try{await assert.rejects(exportInvestmentResearch(f.source,f.output),/checkpointed_immutable_source_required/);}finally{db.close();}
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
