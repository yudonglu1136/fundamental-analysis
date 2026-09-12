import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedComparisonExtension,assertStrategyFreshness,terminalCloseCorrection} from './strategyFreshness.js';
const fresh=Array.from({length:25},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,close:100+i}));
const existing=fresh.slice(0,20);
test('terminal correction requires matching prior history and second confirmation; never excuses interior conflict',()=>{
 const old=fresh.slice(0,21).map((p,i)=>({...p,close:p.close+(i===20?.4:0)}));
 const result=terminalCloseCorrection({existing:old,fresh,confirmation:fresh,minimumOverlap:20});
 assert.equal(result.length,1);assert.equal(result[0].fresh.close,120);assert.equal(old.at(-1).close,120.4);
 assert.throws(()=>terminalCloseCorrection({existing:old.map((r,i)=>i===5?{...r,close:1}:r),fresh,confirmation:fresh,minimumOverlap:20}),/interior_price_conflict/);
 assert.throws(()=>terminalCloseCorrection({existing:old,fresh,confirmation:[],minimumOverlap:20}),/not_confirmed/);
});
test('comparison refresh only appends source-matched real closes',()=>{
 const before=structuredClone(existing),r=verifiedComparisonExtension({existing,fresh,end:'2026-09-10'});
 assert.equal(r.overlap,20);assert.deepEqual(r.rows,fresh.slice(20));assert.deepEqual(existing,before);
});
test('comparison refresh rejects changed vintages, insufficient overlap, duplicates and future rows',()=>{
 for(const rows of [[{...fresh[0],close:99},...fresh.slice(1)],fresh.slice(1),[...fresh,fresh[0]],[...fresh,{date:'2026-09-11',close:10}]]){
  assert.throws(()=>verifiedComparisonExtension({existing,fresh:rows,end:'2026-09-10'}));
 }
});
test('freshness rejects stale DB/CTA before running and does not change dates',()=>{
 const rules={end:'2026-09-10',cta:'KMLM',ctaWeight:.3};
 assert.throws(()=>assertStrategyFreshness({storage:{cutoff:'2026-08-28'}},rules),/strategy_database_cutoff_exceeded/);
 assert.throws(()=>assertStrategyFreshness({storage:{cutoff:rules.end},etfs:[{ticker:'KMLM',last:'2026-08-28'}]},rules),/strategy_etf_cutoff_exceeded/);
 assert.doesNotThrow(()=>assertStrategyFreshness({storage:{cutoff:rules.end},etfs:[{ticker:'KMLM',last:rules.end}]},rules));
 assert.doesNotThrow(()=>assertStrategyFreshness({etfs:[{ticker:'KMLM',last:'2026-08-28'}]},{...rules,ctaWeight:0}));
 assert.equal(rules.end,'2026-09-10');
});
