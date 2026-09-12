import test from 'node:test';
import a from 'node:assert/strict';
import {calculateStrategyHedge,attachStrategyHedge,strategyHedgeRules} from './strategyHedge.js';
import {strategyRules} from './strategyLab.js';
const hedge={type:'put_spread',date:'2026-09-09',expiry:'2026-10-16',capital:100000,coverage:.5,beta:1,ctaReturn:0};
const rules={managers:['fixture'],topN:5,valuationEnabled:true,maxPremium:.3,excludedAllocation:'cash',cta:'KMLM',ctaWeight:.3,costBps:10,
 start:'2025-08-28',end:'2026-08-28',asOf:'2026-08-28',hedge};
const data={date:hedge.date,spot:100,chain:[['put',95,3],['put',85,1],['call',105,2]].map(([type,strike,close])=>({
 ticker:`O:QQQ261016${type==='put'?'P':'C'}${String(strike*1000).padStart(8,'0')}`,type,strike,close,date:hedge.date,expiry:hedge.expiry,volume:100,multiplier:100,standard:1,provider:'synthetic_test_only'}))};
const at=(r,key,move)=>r.results.find(x=>x.strategy===key).scenarios.find(x=>x.move===move).pnl;
test('fourth-step sizing excludes CTA, floors whole contracts, charges each leg exactly once',()=>{
 const r=calculateStrategyHedge(rules,data);a.equal(r.equityNotional,70000);a.equal(r.ctaNotional,30000);a.equal(r.contracts,3);
 a.equal(r.coveredNotional,30000);a.equal(r.actualCoverage,3/7);
 a.ok(Math.abs(r.netDebit-663.9)<1e-8);a.ok(Math.abs(at(r,'unhedged',-.2)+14000)<1e-8);
 a.ok(Math.abs(at(r,'put_spread',-.2)-(-14000+3000-663.9))<1e-8);
 a.equal(r.durationDays,37);a.equal(r.assumptions.valuationFilterCashApplied,false);
 a.equal(r.totalInitialCapital,100663.9);
});
test('CTA weight and scenario return change allocations, not manufactured CTA price paths',()=>{
 const r=calculateStrategyHedge({...rules,ctaWeight:.5,hedge:{...hedge,ctaReturn:.1}},data);
 a.equal(r.ctaNotional,50000);a.equal(r.contracts,2);a.equal(at(r,'unhedged',0),5000);
 a.ok(Math.abs(at(r,'unhedged',-.2)+5000)<1e-8);
});
test('proxy collar does not claim a covered portfolio floor or bounded maximum loss',()=>{
 const r=calculateStrategyHedge({...rules,hedge:{...hedge,type:'collar',beta:0}},data);
 a.ok(r.warnings.includes('QQQ_short_call_not_covered_by_Guru_stocks'));
 a.equal(r.maxLoss,undefined);a.equal(at(r,'unhedged',.5),0);a.ok(at(r,'collar',.5)<-10000);
});
test('missing data never invents a hedge curve or changes baseline history',()=>{
 const base={status:'ready',results:{blend:{equity:[{date:'2026-08-28',value:1.2}]}}},copy=JSON.stringify(base);
 const source={catalog:()=>{throw Object.assign(new Error('hedge_underlying_missing'),{status:422});}};
 const r=attachStrategyHedge(base,rules,{source});a.equal(r.hedge.status,'unavailable');a.equal(r.historicalCurvesIncludeHedge,false);
 a.equal(JSON.stringify(base),copy);a.deepEqual(r.results,base.results);
 a.equal(attachStrategyHedge(base,{...rules,hedge:{type:'none'}},{source}),base);
});
test('rule validation preserves complete fourth-step settings and rejects malformed dates and risks',()=>{
 const r=strategyRules(rules,[{id:'fixture'}]);a.deepEqual(r.hedge,hedge);
 for(const patch of [{type:'bogus'},{date:'2026-02-30'},{expiry:'2026-01-01'},{capital:0},{coverage:2},{beta:Infinity},{ctaReturn:-2}])a.throws(()=>strategyHedgeRules({...hedge,...patch}));
 a.throws(()=>calculateStrategyHedge({...rules,hedge:{...hedge,capital:10000,coverage:.25}},data),/below_one_contract/);
 a.throws(()=>calculateStrategyHedge(rules,{...data,date:'2026-09-08'}),/observation_unavailable/);
});
test('all overlay choices are deterministic and keep future observation outside historical curves',()=>{
 for(const type of ['collar','put_spread','protective_put']){
  const r={...rules,hedge:{...hedge,type}};const x=attachStrategyHedge({rules:r},r,{source:{catalog:()=>data}});
  a.deepEqual(x,attachStrategyHedge({rules:r},r,{source:{catalog:()=>data}}));
  a.equal(x.hedge.status,'scenario_only');a.equal(x.historicalCurvesIncludeHedge,false);
  a.ok(x.hedge.date>x.rules.end);a.equal(x.hedge.historicalOverlay.status,'not_calculated');
 }
});
