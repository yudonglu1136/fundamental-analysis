import {comparisonPricesEqual} from './valuationComparisonPrice.js';

// Only the final stored observation may have been captured during its session.
// Reconcile it against a second daily response and an otherwise matching history.
// Never use this to forgive interior gaps, splits or a changed historical basis.
export function terminalCloseCorrection({existing,fresh,confirmation,minimumOverlap=60}) {
 const last=existing.map(r=>r.date).sort().at(-1),prices=new Map(fresh.map(r=>[r.date,r]));
 const confirmations=new Map(confirmation.map(r=>[r.date,r]));
 const conflicts=existing.filter(r=>prices.has(r.date)&&!comparisonPricesEqual(r.close,prices.get(r.date).close));
 if(!conflicts.length)return [];
 if(conflicts.some(r=>r.date!==last))throw Error('interior_price_conflict');
 const matches=new Set(existing.filter(r=>r.date!==last&&prices.has(r.date)&&comparisonPricesEqual(r.close,prices.get(r.date).close)).map(r=>r.date));
 if(matches.size<minimumOverlap)throw Error('insufficient_correction_overlap');
 const p=prices.get(last),other=confirmations.get(last);
 if(!p||!other||!comparisonPricesEqual(p.close,other.close)||!(p.close>0))throw Error('terminal_close_not_confirmed');
 for(const field of ['open','high','low','adjustedClose'])if(p[field]!=null&&(!comparisonPricesEqual(p[field],other[field])||!(p[field]>0)))throw Error('terminal_ohlc_not_confirmed');
 if(p.low!=null&&p.high!=null&&(p.low>p.high||p.close<p.low||p.close>p.high))throw Error('terminal_ohlc_invalid');
 return conflicts.map(old=>({old,fresh:p,evidence:'two_provider_daily_responses; all_prior_overlaps_match',overlap:matches.size}));
}

// Comparison prices are close, not total-return adjusted close. Provider,
// currency and vintage must agree before extending a previously audited series.
export function verifiedComparisonExtension({existing, fresh, end, minimumOverlap=20}) {
 const old=new Map();
 for(const p of existing){
  if(old.has(p.date)&&!comparisonPricesEqual(old.get(p.date),p.close))throw Error('existing_comparison_conflict');
  old.set(p.date,p.close);
 }
 const seen=new Set(),overlaps=[];
 for(const p of fresh){
  if(p.date>end)throw Error('future_provider_observation');
  if(seen.has(p.date))throw Error('duplicate_provider_session');
  seen.add(p.date);
  if(!(Number.isFinite(p.close)&&p.close>0))throw Error('invalid_provider_close');
  if(old.has(p.date))overlaps.push(comparisonPricesEqual(p.close,old.get(p.date)));
 }
 if(overlaps.length<minimumOverlap)throw Error('insufficient_comparison_overlap');
 if(overlaps.some(x=>!x))throw Error('comparison_basis_mismatch');
 const last=[...old.keys()].sort().at(-1);
 return {overlap:overlaps.length,rows:fresh.filter(p=>p.date>last)};
}

export function assertStrategyFreshness(catalog,rules) {
 const cutoff=catalog.storage?.cutoff;
 if(cutoff&&rules.end>cutoff)throw Object.assign(Error('strategy_database_cutoff_exceeded'),{status:422});
 const etf=catalog.etfs?.find(e=>e.ticker===rules.cta);
 if(rules.ctaWeight>0&&etf?.last&&rules.end>etf.last)throw Object.assign(Error('strategy_etf_cutoff_exceeded'),{status:422});
}
