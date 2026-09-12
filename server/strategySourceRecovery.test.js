import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileRecoveredSeries,confirmedDailyRows} from './strategySourceRecovery.js';
const fresh=Array.from({length:25},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,close:100+i,adjustedClose:100+i,open:100+i,high:100+i,low:100+i,volume:10}));
test('short complete source boundary can be extended without fabricating sessions',()=>{
 const existing=fresh.slice(5,17).map(p=>({...p,adjusted_close:p.adjustedClose}));
 const r=reconcileRecoveredSeries(existing,fresh);assert.equal(r.overlap,12);assert.equal(r.rows.length,13);assert.equal(r.corrections.length,0);
});
test('unexplained interior close and adjustment changes remain blocked',()=>{
 const existing=fresh.slice(0,20).map(p=>({...p,adjusted_close:p.adjustedClose}));
 assert.throws(()=>reconcileRecoveredSeries(existing.map((p,i)=>i===5?{...p,close:1}:p),fresh),/interior_close_conflict/);
 assert.throws(()=>reconcileRecoveredSeries(existing.map((p,i)=>i===5?{...p,adjusted_close:1}:p),fresh),/unexplained_adjustment/);
});
test('confirmed recent dividend vintage is reconciled only in a small terminal segment',()=>{
 const existing=fresh.slice(0,20).map((p,i)=>({...p,adjusted_close:p.adjustedClose*(i<18?1.02:1)}));
 const r=reconcileRecoveredSeries(existing,fresh,{dividends:['2026-08-19']});assert.equal(r.corrections.length,2);assert.equal(r.adjustmentScale,1.02);
 assert.equal(reconcileRecoveredSeries(existing,fresh,{dividends:['2026-08-21']}).corrections.length,2);
 assert.throws(()=>reconcileRecoveredSeries(existing,fresh,{dividends:['2026-06-01']}),/unexplained_adjustment/);
 assert.throws(()=>reconcileRecoveredSeries(existing,fresh),/unexplained_adjustment/);
});
test('confirmation validates identity, dates and every OHLC and adjusted value',()=>{
 const c={chart:{result:[{meta:{symbol:'TEST',currency:'USD',instrumentType:'EQUITY'},timestamp:fresh.map(p=>Date.parse(p.date)/1000),indicators:{quote:[Object.fromEntries(['open','high','low','close','volume'].map(k=>[k,fresh.map(p=>p[k])]))],adjclose:[{adjclose:fresh.map(p=>p.adjustedClose)}]}}]}};
 assert.equal(confirmedDailyRows(c,c,'TEST','2026-08-01','2026-08-25').rows.length,25);
 const bad=structuredClone(c);bad.chart.result[0].indicators.quote[0].close[0]=999;
 assert.throws(()=>confirmedDailyRows(c,bad,'TEST','2026-08-01','2026-08-25'));
 assert.throws(()=>confirmedDailyRows(c,c,'OTHER','2026-08-01','2026-08-25'),/identity/);
});
