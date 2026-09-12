import { assert, finite, isoDate } from './investmentMath.js';
import { tickerKey } from './investmentSource.js';

// Exact fiscal quarters only. A guidance target year must never choose a call.
export function earningsPeriod(value) {
  const s=String(value??'').toUpperCase().replace(/FY|[\s-]/g,'');
  const yq=s.match(/^(20\d{2})Q([1-4])$/), qy=s.match(/^Q([1-4])(20\d{2})$/);
  return yq?`${yq[1]}-Q${yq[2]}`:qy?`${qy[2]}-Q${qy[1]}`:null;
}
const dated=(v,cutoff)=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}/.test(v)
  && !Number.isNaN(Date.parse(v)) && v.slice(0,10)<=cutoff;
const array=v=>Array.isArray(v)?v:[];
const pick=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r?.[k]??null]));

export function visibleEarningsQa(youtube,ticker,period,asOf) {
  const c=youtube?.qaCoverage??{};
  const matching=(!c.ticker || c.ticker===ticker) && (!c.fiscalPeriod || earningsPeriod(c.fiscalPeriod)===period);
  const available=matching && dated(c.researchAvailableAt??c.callDate,asOf)
    && (!c.callDate || dated(c.callDate,asOf));
  const qa=available?array(youtube?.qa).filter(q=>
    q.ticker===ticker && earningsPeriod(q.fiscalPeriod)===period && dated(q.callDate,asOf)
    && (!q.researchAvailableAt || dated(q.researchAvailableAt,asOf))
    && typeof q.question==='string' && q.question.trim() && typeof q.answer==='string' && q.answer.trim()
  ).map(q=>pick(q,['question','answer','questionZh','answerZh','askedBy','askedByZh','speaker','callDate','title','titleZh','url','sourceId'])):[];
  return {qa,coverage:{
    status:!matching?'identity_mismatch':!available?'unavailable_at_cutoff':qa.length?'has_qa':c.status==='has_qa'?'qa_parse_miss':c.status??'transcript_not_in_source',
    callDate:available?c.callDate??null:null,
    researchAvailableAt:available?c.researchAvailableAt??c.callDate:null,
    url:available?c.url??null:null,
    qaCount:qa.length, researchOnly:true, includedInValuationInputs:false,
  }};
}

export function earningsResearch(source,ticker,asOf,requested=null) {
  ticker=tickerKey(ticker); isoDate(asOf);
  assert(!requested || earningsPeriod(requested),'invalid_earnings_period');
  const nodes=source.periods(ticker,asOf);
  const periods=new Map();
  for(const n of nodes) if(earningsPeriod(n.period)) periods.set(earningsPeriod(n.period),n);
  const rows=[...periods].map(([period,n])=>({period,availableAt:n.availableAt,periodEnd:n.periodEnd})).reverse();
  if(!rows.length)return {ticker,asOf,periods:[],selected:null};
  const period=requested?earningsPeriod(requested):rows[0].period;
  assert(periods.has(period),'earnings_period_unavailable');
  const node=periods.get(period),index=rows.findIndex(r=>r.period===period);
  const prior=periods.get(rows[index+1]?.period)??null;
  // Extract only the selected quarter's transcript object, not all transcript
  // blobs or the complete valuation snapshot into the API response.
  const candidates=source.db.prepare(`SELECT h.key AS position,
      json_extract(h.value,'$.fiscalYear') year,
      json_extract(h.value,'$.fiscalQuarter') quarter,
      json_extract(h.value,'$.asOfDate') available
    FROM valuation_ticker_snapshots s, json_each(s.payload_json,'$.history') h
    WHERE s.ticker=? AND json_extract(h.value,'$.asOfDate')<=?
    ORDER BY available DESC,h.key DESC`).all(ticker,asOf);
  const match=candidates.find(r=>earningsPeriod(`${r.year}${r.quarter}`)===period);
  const raw=match?source.db.prepare(`SELECT json_extract(payload_json,?) body
    FROM valuation_ticker_snapshots WHERE ticker=?`).get(`$.history[${match.position}].dataSnapshot.youtubeEarnings`,ticker)?.body:null;
  const {qa,coverage}=visibleEarningsQa(raw?JSON.parse(raw):{},ticker,period,asOf);
  const metrics=['revenueGrowth','operatingMargin','fcfMargin','capexIntensity'].map(key=>({
    key,value:node.metrics[key]??null,previous:prior?.metrics[key]??null,
    delta:finite(node.metrics[key])&&finite(prior?.metrics[key])?node.metrics[key]-prior.metrics[key]:null,
  }));
  const comparable=prior && node.source.modelVersion===prior.source.modelVersion && node.publishedFormula===prior.publishedFormula;
  const reviewedGuidance=source.reviewGuidance?.(ticker,node);
  return {ticker,asOf,periods:rows,selected:{period,availableAt:node.availableAt,periodEnd:node.periodEnd,
    previousPeriod:prior?.period??null,currency:node.input.sourceRecord?.currency??null,
    metrics,actual:node.actual,model:{value:node.publishedFairValue,previous:comparable?prior.publishedFairValue:null,
      delta:comparable&&finite(node.publishedFairValue)&&finite(prior.publishedFairValue)?node.publishedFairValue-prior.publishedFairValue:null,
      formula:node.publishedFormula,version:node.source.modelVersion},
    guidanceAudit:reviewedGuidance?.audit??null,
    guidance:reviewedGuidance?.evidence??array(node.guidance.evidence).filter(e=>dated(e.observedAt,node.availableAt)
      && (!e.fiscalPeriod || earningsPeriod(e.fiscalPeriod)===period)),
    qa,coverage,source:pick(node.source,['dataset','url','hash']),
    retrospective:true,includedInValuationInputs:false}};
}
