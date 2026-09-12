// Append-only recovery. Existing prices and security identities are immutable.
// A provider's adjusted-price level may change after dividends; accept only a
// single constant scale independently supported by every overlapping session.
export function verifiedPriceGaps({symbol, response, existing, sessions, start, end}) {
  const chart=response?.chart?.result?.[0];
  if(response?.chart?.error||!chart)throw Error('provider_history_unavailable');
  if(chart.meta?.symbol!==symbol||chart.meta.currency!=='USD'||
      !['EQUITY','ETF'].includes(chart.meta.instrumentType))throw Error('provider_identity_or_currency_mismatch');
  const timestamps=chart.timestamp, quote=chart.indicators?.quote?.[0], adjusted=chart.indicators?.adjclose?.[0]?.adjclose;
  if(!Array.isArray(timestamps)||!quote||!Array.isArray(adjusted)||timestamps.length!==adjusted.length)throw Error('invalid_provider_series');
  const positive=v=>Number.isFinite(v)&&v>0, available=new Map();
  for(let i=0;i<timestamps.length;i++) {
    const date=new Date(timestamps[i]*1000).toISOString().slice(0,10);
    if(date<start||date>end||!sessions.has(date))continue;
    if(available.has(date))throw Error('duplicate_provider_session');
    if(!positive(quote.close[i])||!positive(adjusted[i]))continue;
    available.set(date,{date,close:quote.close[i],adjustedClose:adjusted[i],
      open:quote.open?.[i]??null,high:quote.high?.[i]??null,low:quote.low?.[i]??null,volume:quote.volume?.[i]??null});
  }
  const old=new Map(), ratios=[];
  for(const r of existing) {
    const prior=old.get(r.date);
    if(prior&&(prior.close!==r.close||
      (prior.adjusted_close!=null&&r.adjusted_close!=null&&prior.adjusted_close!==r.adjusted_close)))throw Error('existing_provider_conflict');
    // NULL is a missing observation, not a conflicting price or zero return.
    // A separately sourced repaired observation never overwrites this raw row.
    old.set(r.date,positive(prior?.adjusted_close)?prior:r);
    const fresh=available.get(r.date);
    if(!fresh)continue;
    if(!positive(r.close)||(r.adjusted_close!=null&&!positive(r.adjusted_close)))throw Error('invalid_existing_price');
    if(Math.abs(r.close/fresh.close-1)>0.00001)throw Error('close_basis_mismatch');
    if(positive(r.adjusted_close))ratios.push(r.adjusted_close/fresh.adjustedClose);
  }
  if(ratios.length<60)throw Error('insufficient_independent_overlap');
  ratios.sort((a,b)=>a-b);
  const adjustmentScale=ratios[Math.floor(ratios.length/2)];
  const maxScaleDeviation=Math.max(...ratios.map(r=>Math.abs(r/adjustmentScale-1)));
  if(maxScaleDeviation>0.00001)throw Error('adjusted_return_basis_mismatch');
  const rows=[...available.values()].filter(r=>!positive(old.get(r.date)?.adjusted_close)).map(r=>({...r,adjustedClose:r.adjustedClose*adjustmentScale}));
  return {symbol,rows,overlap:ratios.length,adjustmentScale,maxScaleDeviation,
    remainingMissing:[...sessions].filter(d=>d>=start&&d<=end&&!positive(old.get(d)?.adjusted_close)&&!available.has(d))};
}
