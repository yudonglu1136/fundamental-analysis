import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {holdingRisk,returnStatistics,weightedValue,portfolioValuations} from './portfolioRisk.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const returns=Array.from({length:80},(_,i)=>.001+(i%4-1.5)*.002);
test('Beta covariance and arithmetic-excess Sharpe match independent formulas',()=>{
  const ys=returns.map(r=>2*r),rf=.04,r=returnStatistics(ys,returns,{riskFreeRate:rf});
  near(r.beta,2);near(r.correlation,1);
  const avg=ys.reduce((a,b)=>a+b)/ys.length,sd=Math.sqrt(ys.reduce((s,x)=>s+(x-avg)**2,0)/(ys.length-1));
  near(r.sharpe,(avg-((1+rf)**(1/252)-1))/sd*Math.sqrt(252));
  near(r.volatility,sd*Math.sqrt(252));
});
test('zero benchmark variance and constant sleeve are undefined, not infinity',()=>{
  const r=returnStatistics(Array(60).fill(0),Array(60).fill(0));assert.equal(r.beta,null);assert.equal(r.sharpe,null);
});
test('insufficient, invalid and misaligned return arrays cannot yield metrics',()=>{
  for(const [a,b] of [[returns.slice(0,59),returns.slice(0,59)],[returns,returns.slice(1)],[returns.map(()=>NaN),returns]])assert.notEqual(returnStatistics(a,b).status,'ready');
});
test('drawdown includes initial capital; negative first return is not lost',()=>{
  near(returnStatistics([-.2,.1],[.01,.02],{minObservations:2}).maxDrawdown,-.2);
});
const points=()=>{let v=100;return Array.from({length:81},(_,i)=>{v*=1+(returns[i-1]??0);return {date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),adjustedClose:v};});};
test('missing one interior observation excludes a whole security, never per-day reweights',()=>{
  const a=points(),b=a.filter((_,i)=>i!==40);
  const g={positions:[{ticker:'AAA',kind:'equity',currency:'USD',value:60},{ticker:'BBB',kind:'equity',currency:'USD',value:40}],longValue:100};
  const r=holdingRisk(g,new Map([['SPY',a],['AAA',a],['BBB',b]]),'2026-03-31');
  assert.equal(r.status,'ready');near(r.coverage,.6);assert.equal(r.included.length,1);near(r.included[0].weight,1);near(r.metrics.beta,1);
  assert.equal(r.excluded[0].missingSessions,1);assert.equal(r.notActualPerformance,true);
});
test('FX, shorts and options are not silently modelled as common-stock returns',()=>{
  const r=holdingRisk({positions:[{ticker:'GBP',kind:'equity',currency:'GBP',value:100},{ticker:'OPT',kind:'other',currency:'USD',value:10},{ticker:'SHORT',kind:'equity',currency:'USD',value:-5}],longValue:110},new Map([['SPY',points()]]),'2026-03-31');
  assert.equal(r.status,'no_complete_holding_history');assert.equal(r.excluded.length,3);assert.equal(r.metrics,undefined);
});
test('weighted valuation uses weight × dimensionless gap, not average dollar fair values',()=>{
  const m=new Map([['AAA',{fairValue:120,currency:'USD',date:'2026-01-01'}],['BBB',{fairValue:8,currency:'USD',date:'2026-01-01'}]]);
  const p=new Map([['AAA',{value:100,currency:'USD',date:'2026-01-02'}],['BBB',{value:10,currency:'USD',date:'2026-01-02'}]]);
  const r=weightedValue([{ticker:'AAA',weight:.6},{ticker:'BBB',weight:.4}],m,p,'2026-01-02');near(r.gap,.04);near(r.coverage,1);
});
test('weighted comparison retains missing denominator, rejects future models and mismatched price dates',()=>{
  const rows=[{ticker:'AAA',weight:.5},{ticker:'BBB',weight:.5}],m=new Map([['AAA',{fairValue:120,currency:'USD',date:'2026-01-01'}],['BBB',{fairValue:100,currency:'USD',date:'2027-01-01'}]]),p=new Map(rows.map(r=>[r.ticker,{value:100,currency:'USD',date:'2026-01-02'}]));
  const r=weightedValue(rows,m,p,'2026-01-02');near(r.coverage,.5);near(r.gap,.2);near(r.markedRemainderGap,.1);assert.equal(r.excluded[0].reason,'no_dated_model');
  p.get('AAA').date='2026-01-01';assert.equal(weightedValue(rows,m,p,'2026-01-02').gap,null);
});
test('an undated model cannot enter a weighted valuation',()=>{
  const r=weightedValue([{ticker:'AAA',weight:1}],new Map([['AAA',{fairValue:120,currency:'USD'}]]),new Map([['AAA',{value:100,currency:'USD',date:'2026-01-02'}]]),'2026-01-02');
  assert.equal(r.gap,null);assert.equal(r.excluded[0].reason,'no_dated_model');
});
test('public model cache reuses reads and invalidates after a database update',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE valuation_pit_model_runs(ticker TEXT,as_of_date TEXT,model_version TEXT,fiscal_period TEXT,financial_available_at TEXT,guidance_max_observed_at TEXT,input_json TEXT,output_json TEXT);
      INSERT INTO valuation_pit_model_runs VALUES('AAA','2026-01-01','test','FY2025','2026-01-01',NULL,'{"sourceRecord":{"currency":"USD"}}','{"fairValue":100}');`);
    const source={db},first=portfolioValuations(source,'2026-01-02');
    assert.strictEqual(portfolioValuations(source,'2026-01-02'),first);
    db.exec(`UPDATE valuation_pit_model_runs SET output_json='{"fairValue":110}'`);
    const second=portfolioValuations(source,'2026-01-02');
    assert.notStrictEqual(second,first);assert.equal(second.get('AAA').fairValue,110);
  } finally {db.close();}
});
