import test from 'node:test';
import a from 'node:assert/strict';
import {strategyRules} from './strategyLab.js';
import {FACTOR_KEYS,factorRules,equityMixRules,assessFourFactors,equityQuarterlySchedule} from './strategyEquityMix.js';
import {runStrategyComposition} from './strategyComposition.js';

// Explicitly synthetic execution fixtures, never ingested into serving data.
const dates=Array.from({length:125},(_,i)=>new Date(Date.UTC(2025,11,31+i)).toISOString().slice(0,10));
const rule=(weights,extra={})=>strategyRules({managers:weights.guru?['test-guru']:[],topN:2,valuationEnabled:true,maxPremium:.3,
  excludedAllocation:'fully_invested',cta:'none',ctaWeight:0,costBps:0,start:'2026-01-01',end:dates.at(-1),asOf:dates.at(-1),equityMix:{weights},...extra},[{id:'test-guru'}]);
const near=(x,y)=>a.ok(Math.abs(x-y)<1e-9,`${x} != ${y}`);
const h=ticker=>({ticker,priceSymbol:ticker,cusip:ticker,identityResolved:true,issuer:ticker,value:100});
function factor(ticker,growth=.3) {return {ticker,name:ticker,periodEnd:'2025-09-30',availableAt:'2025-11-15',price:{currency:'USD'},metrics:{revenueGrowth:growth,operatingMargin:.2,fcfMargin:.1},quality:{status:'available',years:Array.from({length:5},(_,i)=>({year:2024-i,periodEnd:`${2024-i}-12-31`,availableAt:`${2025-i}-02-15`,roic:.2}))}};}
function data() {
  const r=rule({QQQ:1});
  return {dates,priceMaps:new Map(['SPY','QQQ','SCHD','A','B','C','KMLM','DBMF'].map((t,j)=>[t,new Map(dates.map((d,i)=>[d,100+i*(j+1)/100]))])),
    histories:new Map([['test-guru',[{reportDate:'2025-09-30',publicDate:'2025-11-15',complete:true,holdings:[h('A'),h('B')]}]]]),
    valuations:new Map(['A','B','C'].map(t=>[t,[{date:'2025-11-15',currency:'USD',fairValue:100}]])),
    comparisonPrices:new Map(['A','B','C'].map(t=>[t,{currency:'USD',points:new Map(dates.map(d=>[d,t==='B'?140:100]))}])),
    factorPools:new Map(equityQuarterlySchedule(dates,r).map(e=>[e.decisionDate,[factor('A',.5),factor('B',.4),factor('C',.3)]])),sources:{fixture:true}};
}
test('mix validation accepts pure ETFs without managers, rejects invalid totals, thresholds and unknown components',()=>{
  a.equal(rule({QQQ:1}).managers.length,0);
  for(const v of [{QQQ:.9},{QQQ:NaN},{QQQ:-1,SPY:2},{BTC:1}])a.throws(()=>equityMixRules({weights:v}));
  a.throws(()=>rule({guru:1},{managers:[]}));
  a.throws(()=>rule({QQQ:1},{excludedAllocation:'cash'}));
  a.throws(()=>equityMixRules({weights:{factors:1},factors:{roic:null}}));
});
test('PIT quality rejects future publication, stale/short/discontinuous history, missing metrics and non-USD',()=>{
  const row=factor('A');a.equal(assessFourFactors(row,'2025-12-31').passes,true);
  for(const altered of [{...row,availableAt:'2026-01-01'},{...row,metrics:{}},{...row,price:{currency:'GBP'}},
    {...row,quality:{...row.quality,years:row.quality.years.slice(1)}},
    {...row,quality:{...row.quality,years:row.quality.years.map((y,i)=>i===2?{...y,roic:.1}:y)}}])a.equal(assessFourFactors(altered,'2025-12-31').passes,false);
});
test('all 15 nonempty factor subsets require only enabled metrics and preserve PIT checks',()=>{
  for(let mask=1;mask<16;mask++) {
    const enabled=FACTOR_KEYS.filter((_,i)=>mask&(1<<i)),r=factorRules({enabled}),row=factor('A');
    for(const [key,metric] of [['growth','revenueGrowth'],['operatingMargin','operatingMargin'],['fcfMargin','fcfMargin']])if(!enabled.includes(key))delete row.metrics[metric];
    if(!enabled.includes('roic'))delete row.quality;
    a.equal(assessFourFactors(row,'2025-12-31',r).passes,true,enabled.join(','));
    a.equal(assessFourFactors({...row,availableAt:'2026-01-01'},'2025-12-31',r).passes,false);
    for(const key of enabled) {
      const incomplete=structuredClone(row);
      if(key==='roic')delete incomplete.quality;
      else delete incomplete.metrics[key==='growth'?'revenueGrowth':key];
      a.equal(assessFourFactors(incomplete,'2025-12-31',r).passes,false,`missing ${key}`);
    }
  }
});
test('ROIC supports configured passing-year count but never incomplete or future history',()=>{
  const row=factor('A');row.quality.years[2].roic=.1;
  const r=factorRules({enabled:['roic'],qualityYears:5,qualityPassYears:4});
  a.equal(assessFourFactors(row,'2025-12-31',r).passes,true);
  a.equal(assessFourFactors(row,'2025-12-31',factorRules({enabled:['roic']})).passes,false);
  row.quality.years[2].roic=null;
  a.equal(assessFourFactors(row,'2025-12-31',r).passes,false);
  row.quality.years[2]={...row.quality.years[2],roic:.2,availableAt:'2026-01-01'};
  a.equal(assessFourFactors(row,'2025-12-31',r).passes,false);
});
test('legacy factor rules keep all four and all years; invalid or empty active configurations fail',()=>{
  a.deepEqual(factorRules({qualityYears:3}).enabled,FACTOR_KEYS);
  a.equal(factorRules({qualityYears:3}).qualityPassYears,3);
  a.equal(factorRules({enabled:['roic','fcfMargin']}).rankBy,'fcfMargin');
  for(const f of [{enabled:[]},{enabled:['unknown']},{enabled:['roic','roic']},{enabled:['roic'],rankBy:'growth'},{qualityPassYears:0},{qualityPassYears:6},{enabled:null},{rankBy:null}])a.throws(()=>factorRules(f));
  a.deepEqual(equityMixRules({weights:{QQQ:1},factors:{enabled:[]}}).factors.enabled,[]);
});
test('single-factor backtest ranks by that factor and ignores disabled growth and quality',()=>{
  const d=data();
  for(const [date,rows] of d.factorPools)d.factorPools.set(date,rows.map(row=>({...row,metrics:{fcfMargin:row.ticker==='C'?.4:.1},quality:null})));
  const out=runStrategyComposition(d,rule({factors:1},{valuationEnabled:false,equityMix:{weights:{factors:1},factors:{enabled:['fcfMargin'],rankBy:'fcfMargin',topN:1}}}));
  a.equal(out.status,'ready');
  a.ok(out.holdingSnapshots.every(s=>s.positions.length===1&&s.positions[0].ticker==='C'&&s.positions[0].weight===1&&s.cashWeight===0));
});
test('mid-quarter initial allocation then calendar-quarter reset, never daily reweighting',()=>{
  a.deepEqual(equityQuarterlySchedule(dates,{start:'2026-02-15',end:dates.at(-1)}).map(e=>e.executionDate),['2026-02-15','2026-04-01']);
});
test('pure index bypasses company DCF and retains exact allocations through all daily prices',()=>{
  const d=data();d.valuations.clear();d.comparisonPrices.clear();
  const r=rule({QQQ:.6,SCHD:.4}),out=runStrategyComposition(d,r);
  a.equal(out.status,'ready');a.equal(out.ledger.length,2);
  const first=out.holdingSnapshots[0];near(first.cashWeight,0);
  near(first.positions.find(h=>h.ticker==='QQQ').weight,.6);
  a.deepEqual(out.results.guru.equity,out.results.filtered.equity);
  const date='2026-03-01',start='2026-01-01';
  near(out.results.blend.equity.find(r=>r.date===date).value,.6*d.priceMaps.get('QQQ').get(date)/d.priceMaps.get('QQQ').get(start)+.4*d.priceMaps.get('SCHD').get(date)/d.priceMaps.get('SCHD').get(start));
});
test('mixed overlapping stocks net once, filters refill factor ranking, Guru budget stays within Guru, CTA unchanged',()=>{
  const d=data(),r=rule({guru:.4,factors:.3,QQQ:.3},{cta:'KMLM',ctaWeight:.3,equityMix:{weights:{guru:.4,factors:.3,QQQ:.3},factors:{topN:2}}});
  const out=runStrategyComposition(d,r);a.equal(out.status,'ready');
  const positions=out.holdingSnapshots[0].positions;
  a.equal(positions.filter(h=>h.ticker==='A').length,1);
  near(positions.find(h=>h.ticker==='A').weight,(.4+.15)*.7);
  near(positions.find(h=>h.ticker==='C').weight,.15*.7);
  near(positions.find(h=>h.ticker==='QQQ').weight,.3*.7);
  near(positions.find(h=>h.ticker==='KMLM').weight,.3);
  near(positions.reduce((v,h)=>v+h.weight,0),1);
  a.equal(positions.some(h=>h.ticker==='B'),false);
  a.ok(out.holdingSnapshots[0].exclusions.some(h=>h.ticker==='B'&&h.status==='expensive'));
  near(out.results.blend.trades[0].turnover,1);
});
test('missing active daily index price blocks; no interpolation or silent shorter duration',()=>{
  const d=data();d.priceMaps.get('SCHD').delete('2026-02-01');
  const out=runStrategyComposition(d,rule({QQQ:.6,SCHD:.4}));a.equal(out.status,'blocked');a.equal(out.holdingSnapshots.length,0);
});
test('empty component blocks instead of shifting its weight to another strategy or cash',()=>{
  const d=data();d.factorPools.clear();
  const out=runStrategyComposition(d,rule({factors:.2,QQQ:.8}));a.equal(out.status,'blocked');a.equal(out.failure.component,'factors');a.equal(out.failure.code,'no_eligible_factor_stocks');
});
test('an empty Guru component exposes every historical exclusion and does not loosen rules or fund another component',()=>{
  const d=data();d.valuations.delete('A');
  const r=rule({guru:.6,QQQ:.4}),out=runStrategyComposition(d,r);
  a.equal(out.status,'blocked');a.equal(out.failure.code,'no_eligible_stocks');
  a.equal(out.failure.date,'2026-01-01');a.equal(out.failure.decisionDate,'2025-12-31');
  a.deepEqual(out.failure.exclusions.map(h=>[h.ticker,h.status]),[['A','no_model'],['B','expensive']]);
  near(out.failure.exclusions[1].premium,.4);
  a.equal(out.failure.exclusions[1].modelDate,'2025-11-15');
  a.deepEqual(out.results,{});a.deepEqual(out.rules,r);a.equal(out.holdingSnapshots.length,0);
});
test('reviewed company model flows through Top N, CTA modes, mixed-source budgets and holding snapshots',()=>{
  for(const topN of [1,2,3,5,10])for(const ctaPolicy of [{mode:'hold'},{mode:'scheduled',frequency:'annually'},{mode:'tranches'}]) {
    const d=data(),goog={...h('GOOG'),cusip:'02079K107',value:200};
    d.histories.get('test-guru')[0].holdings=[goog,h('B')];
    d.priceMaps.set('GOOG',d.priceMaps.get('A'));
    d.comparisonPrices.set('GOOG',d.comparisonPrices.get('A'));
    d.valuations.set('GOOGL',[{date:'2025-11-15',currency:'USD',fairValue:100,sourceTicker:'GOOGL'}]);
    const r=rule({guru:.6,QQQ:.4},{topN,cta:'KMLM',ctaWeight:.3,ctaPolicy});
    const out=runStrategyComposition(d,r);a.equal(out.status,'ready',JSON.stringify({topN,ctaPolicy,failure:out.failure}));
    for(const event of out.ledger) {
      const row=event.holdings.find(h=>h.ticker==='GOOG');a.equal(row.status,'included');a.equal(row.modelTicker,'GOOGL');
      a.equal(row.priceSymbol,'GOOG');a.equal(event.cashWeight,0);
    }
    a.ok(out.holdingSnapshots.every(s=>s.positions.find(h=>h.ticker==='GOOG')?.modelTicker==='GOOGL'));
    a.equal(d.valuations.has('GOOG'),false);
  }
});
test('future factor filings cannot enter even when mistakenly supplied in a historical pool',()=>{
  const d=data();for(const [date] of d.factorPools)d.factorPools.set(date,[{...factor('C'),availableAt:'2026-12-31'}]);
  a.equal(runStrategyComposition(d,rule({factors:1})).failure.code,'no_eligible_factor_stocks');
});
test('a later conflicting Guru filing cannot invalidate an earlier quarterly decision',()=>{
  const d=data();
  d.histories.get('test-guru').push({reportDate:'2025-12-31',publicDate:'2026-02-01',complete:true,
    holdings:[h('A'),{...h('A'),cusip:'another-share-claim'}]});
  const out=runStrategyComposition(d,rule({guru:1}));
  a.equal(out.status,'blocked');
  a.equal(out.failure.code,'conflicting_security_identity');
  a.equal(out.failure.date,'2026-04-01');
  a.equal(out.ledger.length,1);
  a.equal(out.ledger[0].executionDate,'2026-01-01');
});
test('leverage uses same mixed targets, financing at 4%, original comparisons unchanged',()=>{
  const d=data(),base=runStrategyComposition(d,rule({QQQ:1}));
  const out=runStrategyComposition(d,rule({QQQ:1},{leverage:{multiple:1.5,annualRate:.04,reset:'filing'}}));
  a.equal(out.status,'ready');a.deepEqual(out.results.blend,base.results.blend);a.ok(out.results.leveraged.financing.interestPaid>0);
});
