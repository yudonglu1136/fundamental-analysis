import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyRules,runStrategyLab} from './strategyLab.js';
import {verifyStrategyResult} from '../scripts/strategy-regression-matrix.mjs';

// Deliberately synthetic: isolates computation from real-source coverage.
// Real SEC / market-data coverage is tested separately by verify:strategy:matrix.
const dates=Array.from({length:70},(_,i)=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10))
 .filter(d=>![0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()));
const managers=Array.from({length:10},(_,i)=>({id:'fixture-manager-'+i}));
const symbols=Array.from({length:14},(_,i)=>'STOCK'+i);
const priceMaps=new Map([...symbols,'SPY','KMLM','DBMF'].map((t,k)=>[t,new Map(dates.map((d,i)=>
 [d,100*(1+.0005*(k+1)*i+.008*Math.sin(i/4+k))]))]));
const holding=(k,rank)=>({ticker:symbols[k],priceSymbol:symbols[k],cusip:'FIXTURE'+k,
 value:1000-rank,identityResolved:true,issuer:'Synthetic '+k});
const histories=new Map(managers.map(({id},k)=>[id,[0,22].map((di,f)=>({
 reportDate:f?'2026-01-15':'2025-12-31',publicDate:dates[di],complete:true,accession:`${id}-${f}`,
 holdings:Array.from({length:10},(_,rank)=>holding((k+rank+f)%symbols.length,rank))
}))]));
const valuations=new Map(symbols.filter((t,i)=>i%6!==0).map(t=>[t,[{date:dates[0],fairValue:100,currency:'USD',version:'fixture'}]]));
const comparisonPrices=new Map(symbols.map((t,k)=>[t,{currency:'USD',points:new Map(dates.map(d=>[d,100*(1+(k%5)*.15)]))}]));
const data={dates,priceMaps,histories,valuations,comparisonPrices,sources:{fixture:true}};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);

for(const count of [1,3,10])test(`synthetic full parameter cross-product, ${count} managers`,()=>{
 let cases=0;
 const ctas=[['none',0],['KMLM',.3],['KMLM',.5],['DBMF',.3],['DBMF',.5]];
 for(let topN=1;topN<=10;topN++)for(const premium of [null,0,.15,.3,1])
 for(const excludedAllocation of ['cash','redistribute','fully_invested'])for(const [cta,ctaWeight] of ctas)
 for(const multiple of [1,1.25,1.5,2])for(const costBps of [0,10,100]) {
  const rules=strategyRules({managers:managers.slice(0,count).map(g=>g.id),topN,
   valuationEnabled:premium!==null,maxPremium:premium??.3,excludedAllocation,cta,ctaWeight,costBps,
   start:dates[1],end:dates.at(-1),asOf:dates.at(-1),leverage:{multiple,annualRate:.04,reset:'filing'}},managers);
  const out=runStrategyLab(data,rules);
  if(excludedAllocation==='fully_invested'&&out.status==='blocked'){
   assert.equal(out.failure.code,'no_eligible_stocks');verifyStrategyResult(out,data,rules);cases++;continue;
  }
  assert.equal(out.status,'ready',JSON.stringify({rules,failure:out.failure}));
  verifyStrategyResult(out,data,rules);
  for(const event of out.ledger) {
   const slots=event.holdings.length;
   const eligible=event.holdings.filter(h=>h.status==='included');
   const expensive=event.holdings.filter(h=>h.status==='expensive');
   const expectedEligibleWeight=excludedAllocation==='fully_invested'?1/eligible.length:1/slots+(excludedAllocation==='redistribute'&&eligible.length?expensive.length/slots/eligible.length:0);
   for(const h of event.holdings)near(h.targetWeight,h.status==='included'?(1-ctaWeight)*expectedEligibleWeight:0,'stock target');
   near(event.cashWeight,1-ctaWeight-eligible.length*(1-ctaWeight)*expectedEligibleWeight,'cash target');
  }
  if(multiple>1) {
   const financed=out.results.leveraged;
   for(const trade of financed.trades) {
    near(trade.navBefore-trade.navAfter,trade.cost,'self-financing trade');
    near(trade.cost,trade.tradedNotional*costBps/10000,'actual trading cost');
    near(trade.borrowed,Math.max(0,trade.riskyWeight-1)*trade.navAfter,'cash offsets borrowing');
   }
   for(let i=1;i<financed.financing.rows.length;i++) {
    const previous=financed.financing.rows[i-1],row=financed.financing.rows[i];
    near(row.interest,previous.debt*.04*row.days/365,'calendar-day 4% financing');
   }
  }
  cases++;
 }
 assert.equal(cases,9000);
});
