import test from 'node:test';
import a from 'node:assert/strict';
import {ctaPolicyRules,simulateFlexibleCta} from './strategyCta.js';
import {strategyRules,completeStrategyRun} from './strategyLab.js';

const near=(x,y)=>a.ok(Math.abs(x-y)<1e-9,`${x} != ${y}`);
function setup(prices=[100,116,126,136,120,110,100,100],extra={}) {
  const dates=prices.map((_,i)=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10));
  const priceMaps=new Map(['SPY','QQQ','A','KMLM','DBMF'].map(t=>[t,new Map(dates.map((d,i)=>[d,t==='KMLM'||t==='DBMF'?prices[i]:100]))]));
  const rules={cta:'KMLM',ctaWeight:.3,costBps:0,excludedAllocation:'fully_invested',...extra};
  rules.ctaPolicy=ctaPolicyRules({mode:'tranches',cooldownSessions:0,...extra.ctaPolicy},rules.ctaWeight,rules.excludedAllocation);
  const targets=[{executionDate:dates[0],weights:[{ticker:'QQQ',assetKind:'index',weight:1}],cashWeight:0}];
  return {rules,targets,dates,priceMaps};
}
test('rallies and drawdowns use previous close, execute once per stage, then reset the cycle',()=>{
  const d=setup(),r=simulateFlexibleCta(d);a.equal(r.status,'ready');
  a.deepEqual(r.ctaEvents.map(e=>e.reason),['initial_allocation','rally_trim','rally_trim','rally_trim','drawdown_buyback','drawdown_buyback','drawdown_buyback']);
  a.deepEqual(r.ctaEvents.slice(1).map(e=>e.date),d.dates.slice(2));
  r.ctaEvents.slice(1).forEach(e=>a.ok(e.signalDate<e.date));
  near(r.ctaEvents.at(-1).outstandingTranchesWeight,0);
  for(const e of r.ctaEvents)if(e.reason==='rally_trim')a.ok(e.ctaNotionalChange<0);else if(e.reason==='drawdown_buyback')a.ok(e.ctaNotionalChange>0);
  for(const s of r.snapshots){near(s.positions.reduce((n,p)=>n+p.weight,0),1);a.equal(s.cashWeight,0);}
});
test('equity rotations and leverage resets preserve CTA units in hold mode',()=>{
  for(const multiple of [1,1.25,1.5,2]) {
    const d=setup([100,110,120,90,100],{costBps:10,ctaPolicy:{mode:'hold'}});
    d.targets.push({executionDate:d.dates[2],weights:[{ticker:'A',weight:1}],cashWeight:0});
    const r=simulateFlexibleCta({...d,multiple});a.equal(r.status,'ready');
    for(const row of r.allocationHistory)near(row.ctaUnits,r.allocationHistory[0].ctaUnits);
    a.equal(r.ctaEvents.length,1);near(r.trades[1].ctaNotionalChange,0);
    for(const t of r.trades)near(t.navBefore-t.cost,t.navAfter);
    if(multiple>1)a.ok(r.financing.interestPaid>0);
  }
});
test('buy and hold matches independently calculated account units and no daily resets',()=>{
  const d=setup([100,110,90,130],{ctaPolicy:{mode:'hold'}});
  d.priceMaps.set('QQQ',new Map(d.dates.map((date,i)=>[date,100+10*i])));
  const r=simulateFlexibleCta(d);r.equity.forEach((p,i)=>near(p.value,.7*(1+.1*i)+.3*d.priceMaps.get('KMLM').get(p.date)/100));
});
test('monthly, quarterly and annual CTA schedules are independent of stock selection dates',()=>{
  for(const [frequency,count] of [['monthly',4],['quarterly',3],['annually',2]]) {
    const d=setup([100,110,120,130],{ctaPolicy:{mode:'scheduled',frequency}});
    const dates=['2025-12-30','2026-01-02','2026-02-02','2026-04-01'];
    d.priceMaps=new Map([...d.priceMaps].map(([ticker,m])=>[ticker,new Map(dates.map((date,i)=>[date,[...m.values()][i]]))]));
    d.dates=dates;d.targets[0].executionDate=dates[0];
    const r=simulateFlexibleCta(d);a.equal(r.ctaEvents.length,count);
    r.ctaEvents.forEach(e=>near(e.weightAfter,.3));
  }
});
test('no prior trim means no dip buy; cooldown and one tranche per close are enforced',()=>{
  a.equal(simulateFlexibleCta(setup([100,80,70,60])).ctaEvents.length,1);
  const r=simulateFlexibleCta(setup([100,160,160,160,160,160,160,160],{ctaPolicy:{cooldownSessions:2}}));
  a.deepEqual(r.ctaEvents.slice(1).map(e=>e.date),['2026-01-03','2026-01-06']);
});
test('future prices cannot affect earlier decisions, holdings or returns',()=>{
  const before=simulateFlexibleCta(setup()),d=setup();d.priceMaps.get('KMLM').set(d.dates.at(-1),999);
  const after=simulateFlexibleCta(d);
  a.deepEqual(after.ctaEvents.filter(e=>e.date<d.dates.at(-1)),before.ctaEvents.filter(e=>e.date<d.dates.at(-1)));
  a.deepEqual(after.equity.slice(0,-1),before.equity.slice(0,-1));
});
test('missing CTA or active equity observations fail closed',()=>{
  for(const ticker of ['KMLM','QQQ']){const d=setup();d.priceMaps.get(ticker).delete(d.dates[3]);a.equal(simulateFlexibleCta(d).status,'blocked');}
});
test('a crossed but directionally invalid tranche creates no phantom trade or snapshot',()=>{
  const d=setup([100,116,116,116,116,116]);
  d.priceMaps.set('QQQ',new Map(d.dates.map((date,i)=>[date,i?1000:100])));
  const r=simulateFlexibleCta(d);a.equal(r.status,'ready');a.equal(r.ctaEvents.length,1);
  a.equal(r.snapshots.length,1);a.equal(r.trades.length,1);
});
test('recovery peak freezes and equity-only turnover never consumes a CTA stage',()=>{
  const d=setup([100,116,126,136,120,135,119,110,100]);
  d.targets.push({executionDate:d.dates[6],weights:[{ticker:'A',weight:1}],cashWeight:0});
  const r=simulateFlexibleCta(d),buys=r.ctaEvents.filter(e=>e.reason==='drawdown_buyback');
  a.equal(buys.length,3);buys.forEach(e=>near(e.signalPeak,136));
  for(const t of r.trades.filter(t=>t.reason==='equity_rebalance'))near(t.ctaNotionalChange,0);
});
test('policy rejects invalid thresholds, unsupported modes and cash modes; legacy has no policy',()=>{
  a.equal(ctaPolicyRules(null,.3,'cash'),null);
  for(const patch of [{mode:'daily'},{frequency:'weekly'},{minWeight:.4},{trancheWeight:0},{trimThresholds:[.2,.1]},
    {buyThresholds:[.1]},{trimThresholds:[]},{cooldownSessions:-1},{cooldownSessions:1.5}])
    a.throws(()=>ctaPolicyRules({mode:'tranches',...patch},.3,'fully_invested'));
  a.throws(()=>ctaPolicyRules({mode:'hold'},.3,'cash'));
});
test('CTA-only snapshots rescale drifted component attribution to actual portfolio weights',()=>{
  const d=setup();d.targets[0].weights=[{ticker:'QQQ',weight:.5,components:{QQQ:.5}},
    {ticker:'A',weight:.5,components:{guru:.2,factors:.3}}];
  d.priceMaps.set('A',new Map(d.dates.map((date,i)=>[date,100+i*4])));
  const r=simulateFlexibleCta(d);a.equal(r.status,'ready');
  for(const s of r.snapshots)for(const p of s.positions.filter(p=>p.kind!=='cta'))near(sum(Object.values(p.components)),p.weight);
  function sum(xs){return xs.reduce((a,b)=>a+b,0);}
});
test('full shared result includes CTA-only historical snapshots and preserves separate equity comparisons',()=>{
  const d=setup(),rules=strategyRules({...d.rules,managers:[],topN:5,equityMix:{weights:{QQQ:1}},
    valuationEnabled:false,maxPremium:.3,start:d.dates[0],end:d.dates.at(-1),asOf:d.dates.at(-1)},[]);
  const targets={guru:d.targets,filtered:d.targets,blend:d.targets.map(t=>({...t,weights:[{ticker:'QQQ',weight:.7},{ticker:'KMLM',weight:.3}]}))};
  const ledger=[{executionDate:d.dates[0],decisionDate:'2025-12-31',holdings:[],filings:[],cashWeight:0,coverage:1,modelCoverage:1}];
  const out=completeStrategyRun({...d,sources:{fixture:true}},rules,{ruleHash:'fixture',calculationVersion:'test'},d.dates,targets,ledger);
  a.equal(out.status,'ready');a.equal(out.holdingSnapshots.length,7);a.equal(out.ledger.length,1);
  a.equal(out.holdingSnapshots.at(-1).ctaEvent.reason,'drawdown_buyback');
  a.equal(out.results.filtered.equity.at(-1).value,1);a.equal(out.results.spy.equity.at(-1).value,1);
});
