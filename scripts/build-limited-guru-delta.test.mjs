import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { quarantineDeferredHistory, quarantineDeferredFailure, validateLatestPair, collectCacheRows,
  deferredSourceErrors, guruDeltaTables, guruRowHash } from './build-limited-guru-delta.mjs';
import { guruDeltaRowSha256 } from './investment-guru-delta.mjs';

test('quarantine keeps dated failures, no fabricated zero book or carried holdings',()=>{
  const history=['2022-03-31','2022-06-30','2025-09-30','2025-12-31','2026-06-30'].map(date=>({
    reportDate:date,accessionNumber:deferredSourceErrors.find(e=>e.reportDate===date)?.accessionNumber??date,
    filingDate:date,reported13fValue:123,previous13fValue:100,valueChange:23,positionCount:3,
    topHoldings:[{ticker:date==='2025-09-30'?'COST':'AAPL',value:123}],largestChanges:[{action:'new'}],
    newPositions:1,increasedPositions:1,reducedPositions:0,soldOutPositions:0,turnoverProxy:.1}));
  const input={generatedAt:'2026-09-12T10:14:44.398Z',history,latest:history.at(-1),meta:{returnedQuarters:5,errors:[]}};
  const before=JSON.stringify(input),output=quarantineDeferredHistory(input);
  assert.equal(JSON.stringify(input),before);assert.equal(output.history.length,5);assert.equal(output.generatedAt,input.generatedAt);
  for(const index of [0,2]){const row=output.history[index];assert.equal(row.status,'source_error');assert.equal(row.reported13fValue,null);
    assert.equal(row.positionCount,null);assert.deepEqual(row.topHoldings,[]);assert.deepEqual(row.largestChanges,[]);}
  for(const index of [1,3]){const row=output.history[index];assert.equal(row.comparisonStatus,'previous_source_error');assert.equal(row.valueChange,null);
    assert.equal(row.newPositions,null);assert.equal(row.reported13fValue,123);assert.deepEqual(row.topHoldings,history[index].topHoldings);}
  assert.deepEqual(output.latest,input.latest);assert.equal(output.meta.errors.length,2);
});

test('quarantine refuses a different accession and never generally suppresses source problems',()=>{
  assert.throws(()=>quarantineDeferredHistory({history:[{reportDate:'2022-03-31',accessionNumber:'different'}]}),/quarantine_accession_mismatch/);
});

const failed=()=>({guru:{id:'john-stamas'},generatedAt:'2026-09-12T15:47:03.208Z',status:'insufficient_data',
  method:{version:'strict-v9',years:5,minimumExecutionCoverage:.9},summary:{},equity:[],rebalances:[],quarterContributions:[],
  dataQuality:{proxyFailure:{code:'proxy_coverage_below_minimum',reportDate:'2022-03-31',coveragePct:.203,topExcludedHoldings:[{value:628200000}]},
    coverageFailures:[{reportDate:'2022-03-31',executionDate:'2022-04-25',coveragePct:.203,unpricedPositions:[{value:628200000}]},
      {reportDate:'2021-12-31',coveragePct:.7,unpricedPositions:[]}]}});
test('Defender failure diagnostic redaction preserves time/identity/status, not economic results',()=>{
  const input=failed(),before=JSON.stringify(input),output=quarantineDeferredFailure(input);
  assert.equal(JSON.stringify(input),before);assert.equal(output.generatedAt,input.generatedAt);assert.deepEqual(output.method,input.method);
  assert.equal(output.status,'insufficient_data');assert.equal(output.dataQuality.proxyFailure.coveragePct,null);
  assert.deepEqual(output.dataQuality.proxyFailure.topExcludedHoldings,[]);assert.deepEqual(output.summary,{});
  assert.equal(output.dataQuality.coverageFailures[1].coveragePct,.7);assert.equal(output.dataQuality.sourceErrors.length,2);
});
test('limited waiver cannot suppress different manager, cause, or result-bearing failure',()=>{
  for(const mutate of [p=>p.guru.id='bill-ackman',p=>p.status='ready',p=>p.dataQuality.proxyFailure.code='anything',p=>p.equity=[{value:100}]]){
    const p=failed();mutate(p);assert.throws(()=>quarantineDeferredFailure(p));
  }
});

function pair(){
  const g={id:'william-heard',cik:'0001796409',entityName:'Heard Capital LLC'};
  const h={id:'037833100-COMMON',cusip:'037833100',ticker:'AAPL',issuer:'APPLE INC',title:'COM',shareType:'SH',value:100,shares:5,pctPortfolio:1};
  const filing={accessionNumber:'latest',filerCik:g.cik,reportDate:'2026-06-30',filingDate:'2026-08-11',acceptanceDateTime:'2026-08-11T17:02:28Z'};
  const latest={...filing,filing};
  const stage={snapshot:{...g,type:'manager13f',latestFiling:filing,previousFiling:{filerCik:g.cik},holdings:[h],
    activity:[{id:h.id,action:'increased',shares:5,prevShares:4,changeShares:1}],summary:{reportDate:filing.reportDate,filingDate:filing.filingDate,
      totalPositions:1,totalValue:100,previousValue:90,reported13fTableValue:100,newPositions:0,increasedPositions:1,reducedPositions:0,soldOutPositions:0,top10Weight:1}},
    exposure:{guru:g,latest,history:[latest]},history:[latest],validationErrors:[],duplicateAccessions:[],filingErrors:[],excludedFilings:[]};
  return {stage,official:{holdings:[h],reportedValue:100},previous:{holdings:[{...h,value:90,shares:4}]},g};
}
test('latest pair independently reconciles official values, shares, weights and full activity',()=>{
  const {stage,official,previous,g}=pair();assert.equal(validateLatestPair(stage,official,previous,g,'2026-09-10').holdings,1);
});
test('latest pair refuses wrong filer, activity, source amount or portfolio weight',()=>{
  for(const change of [s=>s.snapshot.cik='0001766929',s=>s.snapshot.holdings[0].pctPortfolio=.7,
    s=>s.snapshot.holdings[0].shares=10,s=>s.snapshot.activity[0].action='new',s=>s.snapshot.summary.increasedPositions=0]){
    const {stage,official,previous,g}=pair();const independent=structuredClone(official);change(stage);
    assert.throws(()=>validateLatestPair(stage,independent,previous,g,'2026-09-10'));
  }
});
test('row hashes bind literal payload JSON and match deployment operator contract',()=>{
  const table='guru_backtests',row={guru_id:'x',years:5,generated_at:'a',start_date:null,end_date:null,payload_json:'{"status":"ready"}'};
  assert.equal(guruRowHash(guruDeltaTables[table],row),guruDeltaRowSha256(table,row));
  assert.notEqual(guruRowHash(guruDeltaTables[table],row),guruRowHash(guruDeltaTables[table],{...row,payload_json:'{ "status":"ready"}'}));
  assert.equal(guruRowHash(guruDeltaTables[table],undefined),null);
});
test('cache export rejects an older security master rather than relabeling',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('CREATE TABLE guru_backtests(guru_id TEXT,years INTEGER,generated_at TEXT,payload_json TEXT)');
    const p={guru:{id:'x'},generatedAt:'2026-09-12T00:00:00Z',method:{version:'strict',securityMasterVersion:'old',years:5,benchmark:'SPY'}};
    db.prepare('INSERT INTO guru_backtests VALUES(?,?,?,?)').run('x',5,p.generatedAt,JSON.stringify(p));
    assert.throws(()=>collectCacheRows(db,{catalog:[{id:'x',type:'manager13f'}],versions:{strict:'strict',security:'new',proxy:'proxy'}}),/incompatible_strict_cache/);
    assert.equal(JSON.parse(db.prepare('SELECT payload_json FROM guru_backtests').get().payload_json).method.securityMasterVersion,'old');
  }finally{db.close();}
});
