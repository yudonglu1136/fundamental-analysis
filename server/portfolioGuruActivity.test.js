import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {portfolioGuruActivity,portfolioGuruContext,portfolioGuruBooks} from './portfolioGuruActivity.js';

const asOf='2026-09-10';
const holding=(shares=10,ticker='AAA',cusip='CLAIM')=>({id:cusip+'-COMMON',cusip,ticker,shares,value:shares*100,pctCommonLong:.1,holdingBucket:'common_long'});
const book=(id,action,shares,prevShares)=>({guru:{id,name:id},full:true,
  filing:{reportDate:'2026-06-30',filingDate:'2026-08-14',accessionNumber:id},
  holdings:shares?[holding(shares)]:[],activity:[{...holding(shares),action,prevShares,changeShares:shares-prevShares}]});
const position={kind:'equity',quantity:10,ticker:'AAA',cusip:'CLAIM'};
const run=books=>portfolioGuruActivity(position,portfolioGuruContext(books,asOf));

test('counts the full manager set once; exits are not holders; no monetary values leaked into activity',()=>{
  const books=[book('a','new',10,0),book('b','increased',12,10),book('c','reduced',8,10),book('d','sold_out',0,10),book('e','unchanged',10,10)];
  const r=run([...books,books[0]]);
  assert.deepEqual([r.holders,r.adds,r.trims,r.unchanged,r.unknown],[4,2,2,1,0]);
  assert.equal(r.balance,'balanced');assert.equal(r.rows.length,5);assert.equal(r.reportedManagers,5);
  assert.equal(r.rows.find(m=>m.guruId==='d').shareChange,-1);
  assert.ok(r.rows.every(m=>!('value' in m)&&!('shares' in m)));
});
test('claim mismatch, share classes, derivatives and unpriced equity are distinct',()=>{
  const b=book('a','increased',12,10),ctx=portfolioGuruContext([b],asOf);
  assert.equal(portfolioGuruActivity({...position,cusip:'OTHER'},ctx).status,'identity_unresolved');
  assert.equal(portfolioGuruActivity({...position,ticker:'AAB'},ctx).holders,0);
  assert.equal(portfolioGuruActivity({...position,kind:'other'},ctx).status,'outside_scope');
  assert.equal(portfolioGuruActivity({...position,value:null},ctx).holders,1);
});
test('one common quarter only, future filings excluded, no missing-as-zero comparison',()=>{
  const old=book('old','increased',12,10);old.filing.reportDate='2026-03-31';
  const future=book('future','increased',12,10);future.filing.filingDate='2026-09-11';
  const missing=book('unknown','increased',12,10);missing.activity=[];missing.full=false;
  const r=run([book('a','new',10,0),old,future,missing]);
  assert.equal(r.reportedManagers,2);assert.equal(r.adds,1);assert.equal(r.unknown,1);assert.equal(r.extractedBooks,1);
  assert.equal(run([]).holders,null);
});
test('duplicate source rows aggregate exact claim; conflicting share arithmetic is unknown',()=>{
  const b=book('a','increased',12,10);b.holdings=[holding(6),holding(6)];
  assert.equal(run([b]).adds,1);
  b.activity[0].changeShares=99;
  assert.equal(run([b]).adds,0);assert.equal(run([b]).unknown,1);
});

function warehouseFixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-guru-test-'));
  const file=path.join(dir,'warehouse.sqlite'),db=new DatabaseSync(file),runtime=new DatabaseSync(':memory:');
  t.after(()=>{db.close();runtime.close();fs.rmSync(dir,{recursive:true,force:true});});
  runtime.exec('CREATE TABLE guru_snapshots(guru_id TEXT,payload_json TEXT)');
  const h=holding(10);
  runtime.prepare('INSERT INTO guru_snapshots VALUES(?,?)').run('bill-ackman',JSON.stringify({summary:{reportDate:'2026-06-30',filingDate:'2026-08-14',totalPositions:2},latestFiling:{accessionNumber:'current'},holdings:[h],activity:[]}));
  const filing={reportDate:'2026-06-30',filingDate:'2026-08-14',accessionNumber:'current',topHoldings:[h]};
  const source={db:runtime,guruCatalog:()=>[{id:'bill-ackman',name:'Synthetic Guru'}],guruHistory:()=>[filing]};
  db.exec(`CREATE TABLE warehouse_meta(id INTEGER,state TEXT);INSERT INTO warehouse_meta VALUES(1,'complete');
    CREATE TABLE filings(id TEXT,manager_id TEXT,accession TEXT,report_date TEXT,public_date TEXT,form TEXT,book_scope TEXT,classification_status TEXT,row_count INTEGER,expected_position_count INTEGER,common_value_usd REAL,source_url TEXT);
    CREATE TABLE filing_holdings(filing_id TEXT,ordinal INTEGER,cusip TEXT,issuer TEXT,reported_shares REAL,value_usd REAL,claim_type TEXT,classification_status TEXT);
    CREATE TABLE holding_resolutions(filing_id TEXT,ordinal INTEGER,ticker TEXT,status TEXT);`);
  const add=(id,date,publicDate,shares)=>{
    db.prepare('INSERT INTO filings VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'bill-ackman',id,date,publicDate,'13F-HR','original_common_book','verified',2,2,shares*100+50,'https://www.sec.gov/Archives/edgar/synthetic');
    for(const [i,cusip,ticker,count,value] of [[0,'CLAIM','AAA',shares,shares*100],[1,'SMALL','TINY',1,50]]){
      db.prepare('INSERT INTO filing_holdings VALUES(?,?,?,?,?,?,?,?)').run(id,i,cusip,ticker,count,value,'common','verified');
      db.prepare('INSERT INTO holding_resolutions VALUES(?,?,?,?)').run(id,i,ticker,'resolved');
    }
  };
  add('prior','2026-03-31','2026-05-15',10);add('current','2026-06-30','2026-08-14',8);
  return {db,source,file};
}
test('warehouse restores small positions beyond UI extract and full prior-quarter share changes',t=>{
  const {source,file}=warehouseFixture(t),data=portfolioGuruBooks(source,asOf,file);
  const ctx=portfolioGuruContext(data.books,asOf,data);
  assert.equal(ctx.fullBooks,1);assert.equal(portfolioGuruActivity(position,ctx).trims,1);
  assert.equal(portfolioGuruActivity({...position,ticker:'TINY',cusip:'SMALL'},ctx).holders,1);
  assert.equal(portfolioGuruActivity({...position,ticker:'TINY',cusip:'SMALL'},ctx).unchanged,1);
});
test('invalid full-book totals and unavailable warehouse fall back to labelled partial evidence',t=>{
  const {source,file,db}=warehouseFixture(t);db.exec("UPDATE filings SET common_value_usd=999 WHERE id='current'");
  const data=portfolioGuruBooks(source,asOf,file);assert.equal(data.books[0].full,false);assert.equal(data.books[0].holdings.length,1);
  const unavailable=portfolioGuruBooks(source,asOf,file+'.missing');assert.equal(unavailable.warehouseStatus,'unavailable');assert.equal(unavailable.books[0].full,false);
});
test('no prior complete quarter means unknown, not a fabricated new holding',t=>{
  const {source,file,db}=warehouseFixture(t);db.exec("UPDATE filings SET public_date='2026-09-11' WHERE id='prior'");
  const data=portfolioGuruBooks(source,asOf,file),r=run(data.books);
  assert.equal(r.holders,1);assert.equal(r.adds,0);assert.equal(r.unknown,1);
});
