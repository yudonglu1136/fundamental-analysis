import assert from 'node:assert/strict';
import {signature} from '../server/investmentMath.js';

const day=86400000;
export function yearsBefore(cutoff,years) {
 const date=new Date(cutoff+'T00:00:00Z');
 const month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()-years);
 if(date.getUTCMonth()!==month)date.setUTCDate(0);
 return date.toISOString().slice(0,10);
}

// Exhaust every manager × integer Top N × offered horizon. Interaction runs
// then cover every manager pair and every parameter level. Continuous sliders,
// arbitrary dates and all subsets of up to ten managers are NOT exhaustive.
export function strategyRegressionCases(ids,cutoff) {
 assert.equal(new Set(ids).size,ids.length,'duplicate manager population');
 const common={topN:5,valuationEnabled:false,maxPremium:.3,excludedAllocation:'redistribute',
  cta:'none',ctaWeight:0,costBps:10,asOf:cutoff,end:cutoff,
  leverage:{multiple:1,annualRate:.04,reset:'filing'}};
 const cases=[],add=(kind,managers,years,options={})=>{
  const rules={...common,managers:[...managers].sort(),start:yearsBefore(cutoff,years),...options};
  cases.push({id:signature({kind,rules}),kind,rules});
 };
 const variants=[
  {valuationEnabled:true,maxPremium:0},
  {valuationEnabled:true,maxPremium:.15},
  {valuationEnabled:true,maxPremium:.3},
  {valuationEnabled:true,maxPremium:1},
  {valuationEnabled:true,maxPremium:.15,excludedAllocation:'cash'},
  {valuationEnabled:true,maxPremium:.3,excludedAllocation:'cash'},
  ...['KMLM','DBMF'].flatMap(cta=>[.3,.5,.8].map(ctaWeight=>({cta,ctaWeight,valuationEnabled:true}))),
  ...[1.25,1.5,2].map(multiple=>({valuationEnabled:true,cta:'KMLM',ctaWeight:.3,leverage:{multiple,annualRate:.04,reset:'filing'}})),
  {costBps:0},{costBps:100},
 ];
 for(const id of ids) {
  for(const years of [1,3,5,10]) {
   for(let topN=1;topN<=10;topN++)add('manager_top_horizon',[id],years,{topN});
   for(const variant of variants)add('parameter_interaction',[id],years,variant);
  }
 }
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++) {
  add('every_manager_pair',[ids[i],ids[j]],1,{valuationEnabled:true,cta:'KMLM',ctaWeight:.3});
 }
 // Wider baskets exercise duplicate merging, asynchronous filing dates and the
 // ten-manager API bound without a handpicked list of known successful names.
 for(let i=0;i<ids.length;i++)for(const size of [3,10]) {
  if(ids.length<size)continue;
  add('rotating_multi_manager',Array.from({length:size},(_,j)=>ids[(i+j)%ids.length]),3,
   {topN:10,valuationEnabled:true,maxPremium:.15,cta:'DBMF',ctaWeight:.5,leverage:{multiple:1.5,annualRate:.04,reset:'filing'}});
 }
 return cases;
}

const sum=xs=>xs.reduce((s,x)=>s+x,0);
const near=(a,b,message,tolerance=1e-8)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,message);

export function verifyStrategyResult(result,data,rules) {
 assert.deepEqual(result.requested,{start:rules.start,end:rules.end},'requested range changed');
 assert.equal(result.ruleHash,signature(rules),'rule hash does not match executed rules');
 for(const row of result.ledger??[]) {
  near(sum(row.holdings.map(h=>h.targetWeight))+row.cashWeight+row.ctaWeight,1,'allocation not conserved');
  assert.ok(row.filings.every(f=>f.publicDate<row.executionDate),'look-ahead filing');
  assert.ok(row.holdings.every(h=>!h.modelDate||h.modelDate<=row.decisionDate),'look-ahead valuation');
  if(rules.excludedAllocation==='fully_invested'){
   assert.equal(result.strictGuruReplication,false,'subset mislabeled as strict');
   assert.equal(result.selectionBasis,'eligible_subset_full_investment');
   near(row.cashWeight,0,'full investment left cash');
   const eligible=row.holdings.filter(h=>h.status==='included');
   assert.ok(eligible.length,'no eligible stocks');
   for(const h of eligible)near(h.targetWeight,(1-rules.ctaWeight)/eligible.length,'eligible stocks not equal-weighted');
  } else assert.ok(row.coverage>=.9-1e-12,'execution gate lowered');
  assert.ok(row.holdings.every(h=>h.targetWeight>=0&&Number.isFinite(h.targetWeight)),'invalid allocation');
 }
 const expectedDates=data.dates.filter(d=>d>=rules.start&&d<=rules.end);
 for(const [name,curve] of Object.entries(result.results??{})) {
  if(curve.status!=='ready') {
   assert.ok(curve.failure?.code,`${name}: unclassified failure`);
   assert.equal(curve.equity?.length??0,0,`${name}: blocked result has a complete-looking curve`);
   continue;
  }
  assert.deepEqual(curve.equity.map(r=>r.date),expectedDates,`${name}: incomplete requested range`);
  const values=curve.equity.map(r=>r.value);
  assert.ok(values.length>=20&&values.every(v=>Number.isFinite(v)&&v>0),`${name}: invalid equity`);
  assert.ok(expectedDates.every((d,i)=>!i||d>expectedDates[i-1]),'duplicate or unsorted sessions');
  const last=values.at(-1),elapsed=(Date.parse(expectedDates.at(-1))-Date.parse(expectedDates[0]))/day;
  near(curve.metrics.totalReturn,last-1,`${name}: total return`);
  near(curve.metrics.cagr,Math.pow(last,365.25/elapsed)-1,`${name}: CAGR`);
  let high=1,drawdown=0;for(const value of values){high=Math.max(high,value);drawdown=Math.min(drawdown,value/high-1);}
  near(curve.metrics.maxDrawdown,drawdown,`${name}: drawdown`);
  const returns=values.slice(1).map((v,i)=>v/values[i]-1),average=sum(returns)/returns.length;
  const variance=sum(returns.map(v=>(v-average)**2))/(returns.length-1);
  near(curve.metrics.volatility,Math.sqrt(252*variance),`${name}: volatility`);
  if(variance>0)near(curve.metrics.sharpeZeroRf,average/Math.sqrt(variance)*Math.sqrt(252),`${name}: Sharpe`);
  else assert.equal(curve.metrics.sharpeZeroRf,null,`${name}: flat Sharpe must be null`);
 }
 if(result.status==='ready') {
  const final=rules.leverage.multiple>1?result.results?.leveraged:result.results?.blend;
  assert.equal(final?.status,'ready','ready without requested final curve');
  assert.equal(result.failure,null,'ready with failure');
  if(!rules.valuationEnabled)assert.deepEqual(result.results.filtered,result.results.guru,'disabled filter changed stocks');
  if(rules.cta==='none')assert.deepEqual(result.results.blend,result.results.filtered,'disabled CTA changed stocks');
  assert.equal(result.holdingSnapshots.length,result.ledger.length,'incomplete holdings snapshots');
  for(const snap of result.holdingSnapshots){
   near(sum(snap.positions.map(h=>h.weight))+snap.cashWeight,1,'snapshot allocation');
   near(snap.stockWeight+snap.ctaWeight+snap.cashWeight,1,'snapshot asset classes');
   assert.ok(snap.positions.every(h=>h.weight>0),'snapshot includes excluded stocks');
   assert.ok(snap.filings.every(f=>f.publicDate<snap.date),'snapshot filing look-ahead');
   for(const h of snap.positions)near(h.exposureWeight,h.weight*rules.leverage.multiple,'snapshot leverage');
   near(snap.nav,final.equity.find(row=>row.date===snap.date).value,'snapshot NAV');
  }
 } else assert.ok(result.failure?.code,'unclassified blocked result');
}

export function regressionGate(rows,expectedCases) {
 const expected=new Set(expectedCases.map(c=>c.id)),actual=new Set(rows.map(c=>c.id));
 const missing=[...expected].filter(id=>!actual.has(id)),unexpected=[...actual].filter(id=>!expected.has(id));
 const blocked=rows.filter(c=>c.status==='blocked').length,errors=rows.filter(c=>c.status==='error').length;
 const invalid=rows.filter(c=>!['ready','blocked','error'].includes(c.status)).length;
 const duplicates=rows.length-actual.size;
 return {status:!expected.size||expected.size!==expectedCases.length||missing.length||unexpected.length||duplicates||blocked||errors||invalid?'fail':'pass',
  expected:expected.size,completed:actual.size,ready:rows.filter(c=>c.status==='ready').length,
  blocked,errors,invalid,duplicates,missing,unexpected};
}
