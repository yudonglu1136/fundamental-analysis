import {comparisonPricesEqual} from './valuationComparisonPrice.js';

export function confirmedDailyRows(payload,confirmation,symbol,start,end) {
 const parse=p=>{
  const c=p.chart?.result?.[0];
  if(p.chart?.error||c?.meta?.symbol!==symbol||c.meta.currency!=='USD'||!['EQUITY','ETF'].includes(c.meta.instrumentType))throw Error('source_identity_unverified');
  const q=c.indicators?.quote?.[0],a=c.indicators?.adjclose?.[0]?.adjclose;
  const rows=(c.timestamp??[]).map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),open:q?.open?.[i],high:q?.high?.[i],low:q?.low?.[i],close:q?.close?.[i],adjustedClose:a?.[i],volume:q?.volume?.[i]})).filter(p=>p.date>=start&&p.date<=end);
  if(new Set(rows.map(p=>p.date)).size!==rows.length||rows.at(-1)?.date!==end)throw Error('daily_history_incomplete');
  for(const r of rows)if(![r.open,r.high,r.low,r.close,r.adjustedClose].every(x=>Number.isFinite(x)&&x>0)||r.low>r.high||r.close<r.low-1e-5||r.close>r.high+1e-5)throw Error('invalid_daily_ohlc');
  return {rows,firstTradeDate:c.meta.firstTradeDate?new Date(c.meta.firstTradeDate*1000).toISOString().slice(0,10):null,dividends:Object.values(c.events?.dividends??{}).map(d=>new Date(d.date*1000).toISOString().slice(0,10))};
 };
 const result=parse(payload),second=parse(confirmation);
 if(JSON.stringify(result.rows.map(r=>r.date))!==JSON.stringify(second.rows.map(r=>r.date)))throw Error('confirmation_session_mismatch');
 for(let i=0;i<result.rows.length;i++)for(const key of ['open','high','low','close','adjustedClose'])if(!comparisonPricesEqual(result.rows[i][key],second.rows[i][key]))throw Error('confirmation_price_mismatch');
 return result;
}

// Two archived, matching full daily responses permit recovery of a truncated
// source cache or a young listing. This is not a lower backtest coverage gate:
// every actual holding still requires a price on every benchmark session.
export function reconcileRecoveredSeries(existing,fresh,{dividends=[],firstTradeDate=null}={}) {
 const prices=new Map(fresh.map(p=>[p.date,p])),dates=[...new Set(existing.map(p=>p.date))].sort(),last=dates.at(-1),ratios=[];
 for(const p of existing){
  const n=prices.get(p.date);if(!n)throw Error('existing_session_not_confirmed');
  if(!comparisonPricesEqual(p.close,n.close)&&p.date!==last)throw Error('interior_close_conflict');
  if(p.date!==last&&p.adjusted_close>0)ratios.push(p.adjusted_close/n.adjustedClose);
 }
 if(new Set(existing.map(p=>p.date)).size<2||ratios.length<2)throw Error('insufficient_boundary_evidence');
 ratios.sort((a,b)=>a-b);const scale=ratios[Math.floor(ratios.length/2)];
 const corrections=[];
 for(const p of existing){
  const n=prices.get(p.date),expected=n.adjustedClose*scale;
  const closeChanged=!comparisonPricesEqual(p.close,n.close);
  const adjustmentChanged=!(p.adjusted_close>0)||Math.abs(p.adjusted_close/expected-1)>1e-5;
  if(!closeChanged&&!adjustmentChanged)continue;
  if(adjustmentChanged&&!closeChanged){
   // Only a recent, explicitly observed cash dividend can explain mixed
   // adjustment vintages at the end of an otherwise constant-scale history.
   // A newly published dividend vintage also restates observations immediately
   // before its ex-date. Require the event on either side of this small tail,
   // not an invented payout or a general tolerance for interior disagreement.
   if(dates.indexOf(p.date)<dates.length-5||!dividends.some(d=>Math.abs(Date.parse(p.date)-Date.parse(d))<=10*86400000)||Math.abs(p.adjusted_close/n.adjustedClose-1)>1e-5)throw Error('unexplained_adjustment_conflict');
  }
  corrections.push({old:p,fresh:{...n,adjustedClose:expected},reason:closeChanged?'confirmed_terminal_daily_close':'confirmed_recent_dividend_vintage'});
 }
 const oldDates=new Set(existing.map(p=>p.date)),rows=fresh.filter(p=>!oldDates.has(p.date)).map(p=>({...p,adjustedClose:p.adjustedClose*scale}));
 return {rows,corrections,adjustmentScale:scale,overlap:dates.length,firstTradeDate,policy:'full_daily_source_recovery; all_existing_sessions_reconciled; no_synthetic_sessions'};
}
