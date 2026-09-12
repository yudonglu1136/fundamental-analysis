import test from 'node:test';
import a from 'node:assert/strict';
import {runStrategyLab,strategyRules,applyStrategyCosts} from './strategyLab.js';
import {signature} from './investmentMath.js';
import {verifyStrategyResult} from '../scripts/strategy-regression-matrix.mjs';

// Synthetic fixtures isolate the requested allocation policy from source repair.
const dates=Array.from({length:45},(_,i)=>new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10));
const h=(ticker,value=100)=>({ticker,priceSymbol:ticker,cusip:ticker+'-claim',issuer:ticker,value,identityResolved:true});
const filing=(name,holdings,pub=dates[0])=>({reportDate:'2025-12-31',publicDate:pub,accession:name,complete:true,holdings});
const rules=(extra={})=>strategyRules({managers:['a','b'],topN:5,valuationEnabled:true,maxPremium:.27,
 excludedAllocation:'fully_invested',cta:'KMLM',ctaWeight:.3,costBps:10,start:dates[1],end:dates.at(-1),asOf:dates.at(-1),...extra},[{id:'a'},{id:'b'}]);
function fixture(){
 const priceMaps=new Map(['A','B','C','SPY','KMLM','DBMF'].map((t,k)=>[t,new Map(dates.map((date,i)=>[date,100+i*(k+1)]))]));
 return {dates,priceMaps,histories:new Map([['a',[filing('a',[h('A',200),h('B')])]],['b',[filing('b',[h('C')],dates[12])]]]),
  valuations:new Map(['A','B','C'].map(t=>[t,[{date:dates[0],fairValue:100,currency:'USD',version:'fixture'}]])),
  comparisonPrices:new Map(['A','B','C'].map(t=>[t,{currency:'USD',points:new Map(dates.map(d=>[d,100]))}])),sources:{fixture:true}};
}
const near=(x,y)=>a.ok(Math.abs(x-y)<1e-9,`${x} != ${y}`);
test('missing manager reallocates to known books and joins only after publication; original dates stay fixed',()=>{
 const d=fixture(),r=rules(),out=runStrategyLab(d,r);
 a.equal(out.status,'ready');verifyStrategyResult(out,d,r);
 a.deepEqual(out.effective,{start:dates[1],end:dates.at(-1)});
 a.equal(out.selectionBasis,'eligible_subset_full_investment');a.equal(out.strictGuruReplication,false);
 a.equal(out.ledger[0].managerExclusions[0].guruId,'b');
 a.equal(out.ledger[0].holdings.length,2);out.ledger[0].holdings.forEach(row=>near(row.targetWeight,.35));
 a.equal(out.ledger[1].executionDate,dates[13]);a.equal(out.ledger[1].holdings.length,3);
 out.ledger[1].holdings.forEach(row=>near(row.targetWeight,.7/3));
 a.equal(runStrategyLab(d,rules({excludedAllocation:'redistribute'})).failure.code,'manager_history_unavailable');
});
test('missing models and expensive slots both allocate to remaining stocks, preserving CTA and no lower ranks',()=>{
 const d=fixture();d.valuations.delete('B');d.comparisonPrices.get('C').points=new Map(dates.map(date=>[date,128]));
 const r=rules(),out=runStrategyLab(d,r);a.equal(out.status,'ready');verifyStrategyResult(out,d,r);
 for(const row of out.ledger){near(row.cashWeight,0);near(row.holdings.find(h=>h.ticker==='A').targetWeight,.7);}
 a.deepEqual(out.holdingSnapshots[1].exclusions.map(h=>h.status),['no_model','expensive']);
 a.deepEqual(out.holdingSnapshots[1].positions.map(h=>h.ticker),['A','KMLM']);
});
test('snapshot exclusions retain contemporaneous prices, model and manager provenance independently for each rebalance',()=>{
 const d=fixture();d.valuations.delete('B');
 d.valuations.get('C').push({date:dates[20],fairValue:1000,currency:'USD',version:'later-not-known'});
 d.comparisonPrices.get('C').points=new Map(dates.map((date,i)=>[date,i<20?128:200]));
 const r=rules(),out=runStrategyLab(d,r);
 a.equal(out.status,'ready');a.equal(out.holdingSnapshots.length,2);
 const first=out.holdingSnapshots[0],last=out.holdingSnapshots[1];
 a.deepEqual(first.exclusions.map(h=>h.ticker),['B']);
 const excluded=last.exclusions.find(h=>h.ticker==='C');
 a.equal(excluded.status,'expensive');a.equal(excluded.price,128);a.equal(excluded.fairValue,100);
 a.equal(excluded.priceDate,last.decisionDate);a.equal(excluded.modelDate,dates[0]);
 a.equal(excluded.modelVersion,'fixture');near(excluded.premium,.28);a.equal(out.rules.maxPremium,.27);
 a.deepEqual(excluded.managers,['b']);a.equal(excluded.targetWeight,0);
 a.equal(last.exclusions.find(h=>h.ticker==='B').fairValue,undefined);
 a.deepEqual(last.positions.map(h=>h.ticker),['A','KMLM']);near(last.positions[0].weight,.7);
 const archived=JSON.stringify(out.holdingSnapshots);
 r.maxPremium=.15;d.comparisonPrices.get('C').points.set(last.decisionDate,999);
 a.equal(JSON.stringify(out.holdingSnapshots),archived);
});
test('missing execution prices can be excluded under the explicit subset policy, without changing strict 90% semantics',()=>{
 const d=fixture();d.histories.set('b',[]);d.priceMaps.delete('B');
 const r=rules({managers:['a']}),out=runStrategyLab(d,r);
 a.equal(out.status,'ready');near(out.ledger[0].coverage,.5);near(out.ledger[0].cashWeight,0);
 near(out.ledger[0].holdings.find(h=>h.ticker==='A').targetWeight,.7);verifyStrategyResult(out,d,r);
 a.equal(runStrategyLab(d,rules({managers:['a'],excludedAllocation:'redistribute'})).failure.code,'execution_coverage_below_90');
});
test('unverified book is excluded as a whole, not silently called a verified Top N',()=>{
 const d=fixture();d.histories.get('a')[0].sourceFailure='filing_classification_unverified';d.histories.get('b')[0].publicDate=dates[0];
 const out=runStrategyLab(d,rules());a.equal(out.status,'ready');
 a.deepEqual(out.holdingSnapshots[0].positions.map(h=>h.ticker),['C','KMLM']);
 a.equal(out.holdingSnapshots[0].managerExclusions[0].code,'filing_classification_unverified');
 a.equal(out.holdingSnapshots[0].filings.length,1);
});
test('all excluded or no managers known fails explicitly, never returns a cash-only or CTA-only completion',()=>{
 for(const change of [d=>d.valuations.clear(),d=>d.histories.clear(),d=>d.priceMaps.delete('A')&&d.priceMaps.delete('B')]){
  const d=fixture();change(d);const out=runStrategyLab(d,rules());
  a.equal(out.status,'blocked');a.equal(out.failure.code,'no_eligible_stocks');a.deepEqual(out.equity,[]);
  a.equal(out.holdingSnapshots?.length??0,0);
 }
});
test('an active price hole is not backfilled or used to exclude a stock retrospectively',()=>{
 const d=fixture();d.priceMaps.get('A').delete(dates[7]);const out=runStrategyLab(d,rules());
 a.equal(out.status,'blocked');a.equal(out.failure.code,'missing_active_price');a.deepEqual(out.holdingSnapshots,[]);
 near(out.ledger[0].holdings.find(h=>h.ticker==='A').targetWeight,.35);
});
test('snapshots reconcile allocation, leveraged exposure, dates, executed NAV and rule identity',()=>{
 const d=fixture(),r=rules({leverage:{multiple:1.5,annualRate:.04,reset:'filing'}}),out=runStrategyLab(d,r);
 a.equal(out.status,'ready');verifyStrategyResult(out,d,r);
 a.equal(out.holdingSnapshots.length,2);
 for(const snap of out.holdingSnapshots){
  near(snap.positions.reduce((s,h)=>s+h.weight,0),1);near(snap.borrowedWeight,.5);
  near(snap.positions.reduce((s,h)=>s+h.exposureWeight,0),1.5);
  near(snap.nav,out.results.leveraged.equity.find(row=>row.date===snap.date).value);
  a.ok(snap.filings.every(f=>f.publicDate<snap.date));a.equal(snap.cashWeight,0);
 }
 a.equal(out.holdingSnapshots[0].nextRebalanceDate,dates[13]);a.equal(out.holdingSnapshots[1].nextRebalanceDate,null);
 a.notEqual(out.holdingSnapshots[0].id,runStrategyLab(d,rules()).holdingSnapshots[0].id);
});
test('subset mode retains exact claims and rejects ambiguous cross-manager ticker identities',()=>{
 const d=fixture();d.histories.get('b')[0]=filing('b',[{...h('A'),cusip:'another-claim'}]);
 a.equal(runStrategyLab(d,rules()).failure.code,'conflicting_security_identity');
});
test('explicit premium boundary, filter off, no CTA and input immutability',()=>{
 const d=fixture();d.comparisonPrices.get('B').points=new Map(dates.map(date=>[date,127]));
 const before=signature(structuredClone(d));
 const r=rules({cta:'none',ctaWeight:0}),out=runStrategyLab(d,r);a.equal(out.status,'ready');
 near(out.holdingSnapshots[0].positions[1].weight,.5);near(out.holdingSnapshots[0].ctaWeight,0);
 a.equal(signature(structuredClone(d)),before);
 d.valuations.clear();const off=runStrategyLab(d,rules({valuationEnabled:false,cta:'none',ctaWeight:0}));
 a.equal(off.status,'ready');a.deepEqual(off.results.guru,off.results.filtered);a.deepEqual(off.results.blend,off.results.filtered);
});
test('cash-settled acquisition cannot silently leave a completed no-cash strategy in cash',()=>{
 const d=fixture();d.actionFor=h=>h.ticker==='A'?{corporateAction:{
  considerationType:'cash',effectiveDate:dates[7],terminalCashPrice:105,
  terminalCashEntitlementPerShare:105,currency:'USD',actionId:'fixture-cash'
 }}:{};
 const out=runStrategyLab(d,rules({valuationEnabled:false,managers:['a']}));
 a.equal(out.status,'blocked');a.equal(out.failure.code,'cash_settlement_requires_reinvestment');
 a.deepEqual(out.holdingSnapshots,[]);
});
test('separate sleeves with the same instrument aggregate in turnover and retain their snapshot identities',()=>{
 const gross={quarterContributions:[{contributions:[{ticker:'KMLM',endingWeight:.7},{ticker:'KMLM',endingWeight:.3}]}],
  equity:[{date:dates[1],value:1},{date:dates[13],value:1}]};
 const targets=[dates[1],dates[13]].map(executionDate=>({executionDate,weights:[{ticker:'KMLM',weight:.7},{ticker:'KMLM',weight:.3}]}));
 const net=applyStrategyCosts(gross,targets,10);near(net.trades[0].turnover,1);near(net.trades[1].turnover,0);
 const d=fixture();d.histories.set('a',[filing('a',[h('KMLM')])]);
 const out=runStrategyLab(d,rules({valuationEnabled:false,managers:['a']}));
 a.equal(out.status,'ready');verifyStrategyResult(out,d,out.rules);
 a.deepEqual(out.holdingSnapshots[0].positions.map(p=>p.kind),['stock','cta']);
 near(out.holdingSnapshots[0].stockWeight,.7);near(out.holdingSnapshots[0].ctaWeight,.3);
 a.deepEqual(out.holdingSnapshots[0].positions[1].managers,[]);
});
