import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gurus } from '../server/gurus.js';
import { performance } from '../server/guruTurnoverMath.js';
import { inspectInvestmentGuruReadiness } from './audit-investment-guru-readiness.mjs';
import { addedGuruIds, deferredFilingErrors, inspectGuruCacheSyncScope, verifyGuruCacheSyncFile, parseScopedGuruArgs } from './verify-guru-cache-sync-scope.mjs';

const versions={strict:'current-strict',proxy:'current-proxy',security:'current-security'};
const catalog=gurus.filter(g=>[...addedGuruIds,'bill-ackman'].includes(g.id));
const options={catalog,versions,asOf:'2026-09-13',now:Date.parse('2026-09-13T09:00:00Z')};
const numbers=['reported13fValue','reported13fTableValue','commonLongValue','optionsNotional','callOptionsNotional',
  'putOptionsNotional','otherReportedValue','previous13fValue','previousCommonLongValue','valueChange','valueChangePct',
  'positionCount','reportedRowCount','optionPositionCount','otherReportedPositionCount','newPositions','increasedPositions',
  'reducedPositions','soldOutPositions','turnoverProxy','verifiedTradeSignals','top10Weight','topHoldingWeight','concentrationHhi'];
const tables=['guru_exposure_snapshots','guru_snapshots','guru_backtests','guru_backtest_proxies'];
function put(db,table,id,p,y) {
  db.prepare(`INSERT INTO ${table} VALUES(${y===undefined?'?,?':'?,?,?'})`).run(...(y===undefined?[id,JSON.stringify(p)]:[id,y,JSON.stringify(p)]));
}
function mutate(db,table,id,fn,y) {
  const where=`guru_id=?${y===undefined?'':' AND years=?'}`,params=y===undefined?[id]:[id,y];
  const p=JSON.parse(db.prepare(`SELECT payload_json FROM ${table} WHERE ${where}`).get(...params).payload_json);
  fn(p);db.prepare(`UPDATE ${table} SET payload_json=? WHERE ${where}`).run(JSON.stringify(p),...params);
}
function curve(id,years) {
  const equity=[{date:'2025-09-10',value:1,benchmark:1},{date:'2026-01-05',value:1.1,benchmark:1.06},
    {date:'2026-06-01',value:1.3,benchmark:1.15},{date:'2026-09-10',value:1.4,benchmark:1.22}];
  return {guru:{id},status:'ready',generatedAt:'2026-09-12T16:00:00Z',
    method:{version:versions.strict,securityMasterVersion:versions.security,years,benchmark:'SPY',minimumExecutionCoverage:.9},
    equity,window:{start:equity[0].date,end:equity.at(-1).date},summary:{...performance(equity),averagePositions:1,averageCoverage:1},
    dataQuality:{minimumExecutionCoverage:.9,minimumObservedExecutionCoverage:1,attributionReconciliation:{difference:0}},
    rebalances:[{coveragePct:1,commonLongValue:100,selectedValue:100}],
    quarterContributions:equity.slice(0,-1).map((e,i)=>({executionDate:e.date,filingDate:`${Number(e.date.slice(0,4))-1}-12-31`,
      reportDate:'2026-06-30',endDate:equity[i+1].date,nextExecutionDate:equity[i+1].date,
      portfolioReturn:equity[i+1].value/e.value-1,attributionReconciliation:0,cashWeight:0,
      contributions:[{ticker:'FIXTURE',weight:1,endingWeight:1}]}))};
}
function fixture(db=new DatabaseSync(':memory:')) {
  for(const t of tables)db.exec(`CREATE TABLE ${t}(guru_id TEXT${t.includes('backtest')?',years INTEGER':''},payload_json TEXT)`);
  for(const g of catalog) {
    const filing={accessionNumber:`${g.cik}-26-000001`,reportDate:'2026-06-30',filingDate:'2026-08-14',cik:g.cik};
    const h={...filing,filing,topHoldings:[{id:'FIXTURE-COMMON',shares:1}],largestChanges:[]};
    const p={guru:{id:g.id,name:g.name,entityName:g.entityName,cik:g.cik},latest:h,history:[h],meta:{errors:[],blockedReportDates:[]}};
    if(g.id==='john-stamas')for(const item of deferredFilingErrors) {
      const f={...filing,reportDate:item.reportDate,filingDate:item.reportDate,accessionNumber:item.accessionNumber};
      p.history.push({...f,filing:f,status:'source_error',sourceErrorCodes:[item.code],
        ...Object.fromEntries(numbers.map(k=>[k,null])),topHoldings:[],largestChanges:[]});
      p.meta.errors.push({...item});p.meta.blockedReportDates.push(item.reportDate);
      const next={...filing,reportDate:item.nextQuarter,filingDate:item.nextQuarter,accessionNumber:`fixture-${item.nextQuarter}`};
      p.history.push({...next,filing:next,comparisonStatus:'previous_source_error',
        ...Object.fromEntries(numbers.map(k=>[k,null])),topHoldings:[{id:'FIXTURE-COMMON',shares:1}],largestChanges:[]});
    }
    put(db,'guru_exposure_snapshots',g.id,p);
    put(db,'guru_snapshots',g.id,{...p.guru,latestFiling:filing,summary:{reportDate:filing.reportDate,filingDate:filing.filingDate,totalPositions:1},holdings:[{id:'FIXTURE-COMMON'}],activity:[]});
    for(const y of [5,10]) {
      const c=curve(g.id,y);
      if(g.id==='john-stamas')Object.assign(c,{status:'insufficient_data',equity:[],summary:{},dataQuality:{failurePolicy:'fail_closed',
        sourceErrors:structuredClone(deferredFilingErrors),proxyFailure:{
        code:'proxy_coverage_below_minimum',reportDate:'2022-03-31',executionDate:'2022-04-25',minimumCoverage:.3,coveragePct:null,
        status:'source_error',sourceErrorCodes:['reported_value_error'],topExcludedHoldings:[]}}});
      put(db,'guru_backtests',g.id,c,y);
    }
  }
  return db;
}
function fails(fn,reason) {
  const db=fixture();try{fn(db);const r=inspectGuruCacheSyncScope(db,options);assert.equal(r.status,'failed');assert.ok(r.failures.some(f=>f.reason===reason),JSON.stringify(r.failures));}finally{db.close();}
}
test('scoped acceptance keeps full gate failing, original timestamps and exactly two unavailable curves',()=>{
  const db=fixture();try {
    const before=db.prepare('SELECT total_changes() n').get().n;
    const r=inspectGuruCacheSyncScope(db,options);
    assert.equal(r.status,'scoped_compatibility_pass_with_known_failures',JSON.stringify(r.failures));
    assert.equal(r.fullDataReady,false);assert.equal(r.strictReleasePass,false);
    assert.equal(r.fullReadinessStatus,'failed');assert.equal(inspectInvestmentGuruReadiness(db,options).status,'failed');
    assert.equal(r.population.expectedCurves,catalog.length*2);assert.equal(r.population.compatibleCurves,(catalog.length-1)*2);
    assert.deepEqual(r.knownFailures.map(f=>f.years),[5,10]);assert.equal(r.quarantinedFilings.length,2);
    assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
    assert.equal(JSON.stringify(r).includes('FIXTURE'),false);
  }finally{db.close();}
});
test('missing additions and any other stale/failed curve are not waived',()=>{
  fails(db=>db.prepare("DELETE FROM guru_snapshots WHERE guru_id='william-heard'").run(),'added_guru_not_ready');
  fails(db=>mutate(db,'guru_backtests','evan-mcgoff',p=>{p.method.securityMasterVersion='old';},5),'nondeferred_curve_not_compatible');
  fails(db=>mutate(db,'guru_backtests','michael-cuggino',p=>{p.status='insufficient_data';},10),'nondeferred_curve_not_compatible');
  fails(db=>mutate(db,'guru_backtests','bill-ackman',p=>{p.generatedAt='2026-08-01T00:00:00Z';},10),'nondeferred_curve_not_compatible');
});
test('exception rejects missing/old identity, changed cause, fabricated summary/equity/proxy and stale failures',()=>{
  for(const fn of [p=>{p.method.securityMasterVersion='old';},p=>{p.dataQuality.proxyFailure.code='unrelated_error';},
    p=>{p.dataQuality.proxyFailure.reportDate='2025-09-30';},p=>{p.summary={cagr:0};},p=>{p.equity=[{value:1}];},
    p=>{p.dataQuality.proxyFailure.coveragePct=.203;},p=>{p.dataQuality.sourceErrors=[];},
    p=>{p.generatedAt='2026-08-01T00:00:00Z';}])fails(db=>mutate(db,'guru_backtests','john-stamas',fn,5),'deferred_failure_fingerprint_mismatch');
  fails(db=>put(db,'guru_backtest_proxies','john-stamas',{status:'proxy_ready'},5),'deferred_failure_fingerprint_mismatch');
  fails(db=>db.prepare("DELETE FROM guru_backtests WHERE guru_id='john-stamas' AND years=10").run(),'deferred_failure_fingerprint_mismatch');
});
test('bad filing must be explicit with null values, not hidden or represented as empty portfolio',()=>{
  for(const fn of [p=>{p.history=p.history.filter(h=>h.reportDate!=='2022-03-31');},
    p=>{p.history.find(h=>h.reportDate==='2022-03-31').reported13fValue=0;},
    p=>{p.history.find(h=>h.reportDate==='2022-03-31').status='ready';},
    p=>{p.meta.errors=[];}])fails(db=>mutate(db,'guru_exposure_snapshots','john-stamas',fn),'deferred_filing_not_explicitly_quarantined');
  fails(db=>mutate(db,'guru_exposure_snapshots','john-stamas',p=>{p.history.find(h=>h.reportDate==='2022-06-30').valueChangePct=.5;}),'post_gap_quarter_changes_not_suppressed');
});
test('scope cannot silently expand to another manager or broken common benchmark',()=>{
  fails(db=>mutate(db,'guru_exposure_snapshots','william-heard',p=>{p.history[0].status='source_error';}),'unexpected_quarantined_filing');
  fails(db=>mutate(db,'guru_backtests','bill-ackman',p=>{p.equity[1].benchmark*=1.01;},5),'common_history_comparison_failed');
});
test('file check reads only isolated public data and CLI accepts no exception overrides',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tf-guru-sync-scope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'research.sqlite'),db=fixture(new DatabaseSync(file));db.close();
  const before=fs.readFileSync(file);
  assert.equal(verifyGuruCacheSyncFile(file,options).status,'scoped_compatibility_pass_with_known_failures');
  assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readdirSync(dir),['research.sqlite']);
  assert.deepEqual(parseScopedGuruArgs(['--db',file,'--as-of=2026-09-13']),{db:file,asOf:'2026-09-13'});
  for(const args of [[],['--allow-manager','other'],['--db','a','--db','b'],['--refresh-generation','fake']])assert.throws(()=>parseScopedGuruArgs(args));
});
