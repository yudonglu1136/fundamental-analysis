import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedPriceGaps} from './strategyPriceGapRepair.js';
function sample() {
  const dates=Array.from({length:65},(_,i)=>new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  const close=dates.map((_,i)=>100+i),adjusted=close.map(v=>v*.9);
  return {symbol:'TEST',start:dates[0],end:dates.at(-1),sessions:new Set(dates),
    existing:dates.slice(2,63).map((date,i)=>({date,close:close[i+2],adjusted_close:adjusted[i+2]*1.02})),
    response:{chart:{result:[{meta:{symbol:'TEST',currency:'USD',instrumentType:'EQUITY'},timestamp:dates.map(d=>Date.parse(d)/1000),
      indicators:{quote:[{close}],adjclose:[{adjclose:adjusted}]}}]}}};
}
test('fills only real missing rows, reconciles constant adjustment level, leaves existing prices unchanged',()=>{
  const s=sample(),before=structuredClone(s.existing),r=verifiedPriceGaps(s);
  assert.equal(r.rows.length,4);assert.equal(r.overlap,61);assert.equal(r.remainingMissing.length,0);
  assert.equal(r.adjustmentScale,1.02);assert.deepEqual(s.existing,before);
  assert.ok(r.rows.every(r=>!before.some(x=>x.date===r.date)));
});
test('does not fill missing upstream observations or non-session dates',()=>{
  const s=sample();s.response.chart.result[0].indicators.quote[0].close[0]=null;
  s.sessions.delete(s.end);const r=verifiedPriceGaps(s);
  assert.equal(r.rows.length,2);assert.deepEqual(r.remainingMissing,[s.start]);
});
test('recovers an explicitly NULL adjustment with independent overlap; zero and conflicting closes still fail',()=>{
 const s=sample();s.existing[2].adjusted_close=null;
 const r=verifiedPriceGaps(s);assert.equal(r.rows.length,5);assert.equal(r.overlap,60);
 assert.equal(s.existing[2].adjusted_close,null);
 const repaired=r.rows.find(r=>r.date===s.existing[2].date);
 s.existing.push({date:repaired.date,close:repaired.close,adjusted_close:repaired.adjustedClose});
 assert.equal(verifiedPriceGaps(s).rows.length,4);
 s.existing[2].adjusted_close=0;
 assert.throws(()=>verifiedPriceGaps(s),/existing_provider_conflict|invalid_existing_price/);
});
test('rejects split/close mismatch, nonconstant adjustment, identity mismatch and inadequate overlap',()=>{
  for(const [change,error] of [
    [s=>{s.existing[0].close*=2;},'close_basis_mismatch'],
    [s=>{s.existing[20].adjusted_close*=1.1;},'adjusted_return_basis_mismatch'],
    [s=>{s.response.chart.result[0].meta.symbol='NEW';},'provider_identity_or_currency_mismatch'],
    [s=>{s.existing=s.existing.slice(0,10);},'insufficient_independent_overlap'],
    [s=>{s.existing.push({...s.existing[0],adjusted_close:1});},'existing_provider_conflict']]) {
    const s=sample();change(s);assert.throws(()=>verifiedPriceGaps(s),new RegExp(error));
  }
});
test('rejects duplicate upstream sessions and unavailable/delisted histories',()=>{
  const s=sample();s.response.chart.result[0].timestamp[1]=s.response.chart.result[0].timestamp[0];
  assert.throws(()=>verifiedPriceGaps(s),/duplicate_provider_session/);
  assert.throws(()=>verifiedPriceGaps({...sample(),response:{chart:{error:{code:'Not Found'}}}}),/provider_history_unavailable/);
});
