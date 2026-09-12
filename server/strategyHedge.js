import {HedgeSource, hedgeExperiment} from './hedgeLab.js';
import {signature} from './investmentMath.js';

const check=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{status:422});};
export function strategyHedgeRules(value){
 if(value==null||value.type==='none')return {type:'none'};
 check(['protective_put','put_spread','collar'].includes(value.type),'invalid_hedge_type');
 const r={type:value.type,date:String(value.date??''),expiry:String(value.expiry??''),
  coverage:Number(value.coverage),capital:Number(value.capital),beta:Number(value.beta),ctaReturn:Number(value.ctaReturn)};
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 check(valid(r.date)&&valid(r.expiry)&&r.expiry>r.date,'invalid_hedge_date');
 check(Number.isFinite(r.coverage)&&r.coverage>0&&r.coverage<=1,'invalid_hedge_coverage');
 check(Number.isFinite(r.capital)&&r.capital>=10000&&r.capital<=100000000,'invalid_hedge_capital');
 check(Number.isFinite(r.beta)&&r.beta>=0&&r.beta<=3,'invalid_hedge_beta');
 check(Number.isFinite(r.ctaReturn)&&r.ctaReturn>=-1&&r.ctaReturn<=2,'invalid_hedge_cta_return');
 return r;
}

// An explicitly dated allocation stress experiment, NOT a historical overlay.
// QQQ movement and equity beta are scenario inputs, not fitted Guru exposures.
export function calculateStrategyHedge(rules,data){
 const h=strategyHedgeRules(rules.hedge);
 if(h.type==='none')return {status:'off'};
 check(data.date===h.date&&data.spot>0,'hedge_observation_unavailable');
 const equityWeight=1-rules.ctaWeight, equityNotional=h.capital*equityWeight;
 const contracts=Math.floor(equityNotional*h.coverage/(data.spot*100));
 check(contracts>=1,'hedge_notional_below_one_contract');
 const chain=data.chain.filter(c=>c.expiry===h.expiry);
 const nearest=(type,target,predicate)=>chain.filter(c=>c.type===type&&predicate(c.strike))
  .sort((a,b)=>Math.abs(a.strike-target)-Math.abs(b.strike-target)||a.strike-b.strike)[0];
 const put=nearest('put',data.spot*.95,k=>k<=data.spot);
 const lower=nearest('put',data.spot*.85,k=>k<(put?.strike??0));
 const call=nearest('call',data.spot*1.05,k=>k>=data.spot);
 check(put&&lower&&call,'hedge_expiry_incomplete');
 const local=hedgeExperiment({date:h.date,expiry:h.expiry,shares:contracts*100,coverage:1,fee:.65,slippage:.05,
  putTicker:put.ticker,shortPutTicker:lower.ticker,callTicker:call.ticker},chain,data.spot);
 const overlay=local.results.find(x=>x.strategy===h.type);
 const basePnl=price=>equityNotional*Math.max(-1,h.beta*(price/data.spot-1))+h.capital*rules.ctaWeight*h.ctaReturn;
 const optionPnl=price=>overlay.legs.reduce((sum,l)=>sum+l.side*contracts*100*Math.max(0,l.type==='put'?l.strike-price:price-l.strike),0)-overlay.netDebit;
 const results=['unhedged',h.type].map(strategy=>{
  const pnl=price=>basePnl(price)+(strategy==='unhedged'?0:optionPnl(price));
  return {strategy,curve:overlay.curve.map(p=>({price:p.price,pnl:pnl(p.price)})),
   scenarios:overlay.scenarios.map(p=>({move:p.move,price:p.price,pnl:pnl(p.price)}))};
 });
 return {status:'scenario_only',version:'strategy-qqq-allocation-stress-v1',rules:h,
  strategyContext:{managers:rules.managers,topN:rules.topN,valuationEnabled:rules.valuationEnabled,cta:rules.cta,ctaWeight:rules.ctaWeight,start:rules.start,end:rules.end},
  date:h.date,expiry:h.expiry,durationDays:Math.round((Date.parse(h.expiry)-Date.parse(h.date))/86400000),
  spot:data.spot,equityNotional,ctaNotional:h.capital*rules.ctaWeight,contracts,
  coveredNotional:contracts*100*data.spot,actualCoverage:contracts*100*data.spot/equityNotional,
  premium:overlay.premium,costs:overlay.costs,netDebit:overlay.netDebit,
  totalInitialCapital:h.capital+overlay.netDebit,legs:overlay.legs,results,
  historicalOverlay:{status:'not_calculated',reason:'verified_historical_option_paths_unavailable'},
  // No hard portfolio floor / max-loss claim: proxy mismatch and uncovered QQQ calls.
  assumptions:{equityBeta:h.beta,ctaReturn:h.ctaReturn,stockWeight:equityWeight,cashWeight:0,slippage:.05,fee:.65,
   allocationBasis:'configured_target_not_realized_holdings',funding:'net_debit_is_additional_capital',
   valuationFilterCashApplied:false,earlyAssignmentModelled:false,dividendsModelled:false},
  sourceHash:signature({rules,optionSourceHash:local.sourceHash}),
  warnings:['proxy_basis_risk','not_historical_backtest','daily_closes_not_executable_quotes',
   ...(h.type==='collar'?['QQQ_short_call_not_covered_by_Guru_stocks']:[])]};
}

export function attachStrategyHedge(result,rules,{file=process.env.HEDGE_DB_PATH,source=null}={}){
 if(!rules.hedge||rules.hedge.type==='none')return result;
 let own;
 try{
  const s=source??(own=new HedgeSource(file));
  return {...result,hedge:calculateStrategyHedge(rules,s.catalog(rules.hedge.date)),historicalCurvesIncludeHedge:false};
 }catch(e){return {...result,hedge:{status:'unavailable',reason:e.status?e.message:'hedge_data_unavailable'},historicalCurvesIncludeHedge:false};}
 finally{own?.close();}
}
