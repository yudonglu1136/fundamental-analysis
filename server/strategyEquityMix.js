import {assert,finite} from './investmentMath.js';

export const EQUITY_COMPONENTS = ['guru','factors','QQQ','SPY','SCHD'];
export const FACTOR_KEYS = Object.freeze(['growth','operatingMargin','fcfMargin','roic']);
export const DEFAULT_FACTORS = Object.freeze({growth:.15,operatingMargin:.10,fcfMargin:.05,roic:.15,qualityYears:5,qualityPassYears:5,topN:10,enabled:FACTOR_KEYS,rankBy:'growth'});
export function factorRules(input={},requireEnabled=true) {
  assert(input && typeof input==='object' && !Array.isArray(input),'invalid_factor_rule');
  assert(Object.keys(input).every(k=>Object.hasOwn(DEFAULT_FACTORS,k)),'invalid_factor_rule');
  const factors={...DEFAULT_FACTORS,...input};
  assert(Array.isArray(factors.enabled)&&factors.enabled.every(k=>FACTOR_KEYS.includes(k))&&new Set(factors.enabled).size===factors.enabled.length,'invalid_enabled_factors');
  factors.enabled=FACTOR_KEYS.filter(k=>factors.enabled.includes(k));
  assert(!requireEnabled||factors.enabled.length>0,'select_at_least_one_factor');
  factors.rankBy=input.rankBy===undefined?(factors.enabled[0]??null):input.rankBy;
  assert(factors.enabled.length?factors.enabled.includes(factors.rankBy):factors.rankBy===null,'invalid_factor_ranking');
  for(const k of FACTOR_KEYS)assert(finite(factors[k])&&factors[k]>=0&&factors[k]<=1,'invalid_factor_threshold');
  assert(Number.isInteger(factors.qualityYears)&&factors.qualityYears>=3&&factors.qualityYears<=5,'invalid_quality_years');
  factors.qualityPassYears=input.qualityPassYears===undefined?factors.qualityYears:input.qualityPassYears;
  assert(Number.isInteger(factors.qualityPassYears)&&factors.qualityPassYears>=1&&factors.qualityPassYears<=factors.qualityYears,'invalid_quality_pass_years');
  assert(Number.isInteger(factors.topN)&&factors.topN>=1&&factors.topN<=10,'unsupported_factor_top_n');
  return factors;
}
export function equityMixRules(input) {
  if(input == null)return null;
  assert(input && typeof input==='object' && !Array.isArray(input),'invalid_equity_mix');
  const supplied=input.weights;
  assert(supplied && typeof supplied==='object' && !Array.isArray(supplied),'invalid_equity_mix');
  assert(Object.keys(supplied).every(k=>EQUITY_COMPONENTS.includes(k)),'invalid_equity_component');
  const weights=Object.fromEntries(EQUITY_COMPONENTS.map(k=>[k,supplied[k]??0]));
  assert(Object.values(weights).every(w=>finite(w)&&w>=0&&w<=1),'invalid_equity_weight');
  assert(Math.abs(Object.values(weights).reduce((a,b)=>a+b,0)-1)<1e-8,'equity_weights_must_total_100');
  return {weights,factors:factorRules(input.factors,weights.factors>0)};
}

// Same economic tests as Discover: no missing metric becomes zero or a pass.
export function assessFourFactors(row,date,rules=DEFAULT_FACTORS) {
  const reasons=[],m=row.metrics??{},q=row.quality??{},enabled=rules.enabled??FACTOR_KEYS;
  const years=enabled.includes('roic')?(q.years??[]).slice(0,rules.qualityYears):[];
  if(!enabled.length)reasons.push('no_enabled_factors');
  for(const [factor,key] of [['growth','revenueGrowth'],['operatingMargin','operatingMargin'],['fcfMargin','fcfMargin']]) {
    if(!enabled.includes(factor))continue;
    const minimum=rules[factor];
    if(!finite(m[key]))reasons.push(`${key}_missing`);
    else if(m[key]<minimum-1e-10)reasons.push(`${key}_below_threshold`);
  }
  let complete=q.status==='available'&&years.length===rules.qualityYears;
  years.forEach((y,i)=>{
    const end=Date.parse(y.periodEnd),available=Date.parse(y.availableAt);
    if(!Number.isFinite(end)||!Number.isFinite(available)||end>available||y.availableAt>date||!finite(y.roic)||(!i&&(Date.parse(date)-end)/86400000>550))complete=false;
    if(i){const gap=(Date.parse(years[i-1].periodEnd)-end)/86400000;if(years[i-1].year!==y.year+1||gap<300||gap>430)complete=false;}
  });
  const passingYears=complete?years.filter(y=>y.roic>=rules.roic-1e-10).length:null;
  if(enabled.includes('roic')) {
    if(!complete)reasons.push('quality_history_incomplete_or_stale');
    else if(passingYears<(rules.qualityPassYears??rules.qualityYears))reasons.push('roic_not_durable');
  }
  if(!row.availableAt||row.availableAt>date||!row.periodEnd||row.periodEnd>date)reasons.push('financial_not_public');
  if(row.price?.currency!=='USD')reasons.push('non_usd_quote');
  return {passes:!reasons.length,reasons,worstRoic:complete?Math.min(...years.map(y=>y.roic)):null,passingYears,years,enabled};
}
export function rankFactorCandidates(a,b,rules=DEFAULT_FACTORS) {
  const enabled=rules.enabled??FACTOR_KEYS,key=rules.rankBy??enabled[0];
  const metric=(row,k)=>k==='roic'?row.assessment.worstRoic:row.metrics[k==='growth'?'revenueGrowth':k];
  return metric(b,key)-metric(a,key)||
    (enabled.includes('roic')&&key!=='roic'?b.assessment.worstRoic-a.assessment.worstRoic:0)||
    a.ticker.localeCompare(b.ticker);
}
export function equityQuarterlySchedule(dates,rules) {
  const all=[...new Set(dates)].sort(),events=[];
  const quarter=d=>`${d.slice(0,4)}-${Math.floor((Number(d.slice(5,7))-1)/3)}`;
  for(let i=1;i<all.length;i++)if(all[i]>=rules.start&&all[i]<=rules.end&&(!events.length||quarter(all[i])!==quarter(all[i-1])))events.push({executionDate:all[i],decisionDate:all[i-1]});
  return events;
}
