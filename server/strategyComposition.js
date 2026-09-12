import {signature} from './investmentMath.js';
import {buildFundamentals} from './investmentFundamentals.js';
import {loadStrategyData,strategyComparisonPrices,strategyActionFor} from './strategyLabSource.js';
import {loadStoredStrategyData} from './strategyDatabase.js';
import {compositionPrices} from './strategyCompositionPrices.js';
import {assessFourFactors,equityQuarterlySchedule,rankFactorCandidates} from './strategyEquityMix.js';
import {buildStrategySchedule,valuationDecision,completeStrategyRun,STRATEGY_LAB_VERSION,STRATEGY_CALCULATION_VERSION} from './strategyLab.js';

const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;

export function loadCompositionData(source,rules,etfFile) {
  if(!process.env.STRATEGY_DATA_DB_PATH)throw Error('composition_requires_structured_database');
  const initial=loadStrategyData(source,rules,etfFile);
  const factorPools=new Map(),extraSymbols=new Set(Object.entries(rules.equityMix.weights).filter(([k,v])=>v>0&&['QQQ','SPY','SCHD'].includes(k)).map(([k])=>k));
  if(rules.equityMix.weights.factors>0)for(const event of equityQuarterlySchedule(initial.dates,rules)) {
    const rows=buildFundamentals(source,event.decisionDate).companies.map(row=>({...row,assessment:assessFourFactors(row,event.decisionDate,rules.equityMix.factors)}));
    const eligible=rows.filter(row=>row.assessment.passes).sort((a,b)=>rankFactorCandidates(a,b,rules.equityMix.factors));
    factorPools.set(event.decisionDate,eligible);
    for(const row of eligible)extraSymbols.add(row.ticker);
  }
  const data=loadStoredStrategyData(process.env.STRATEGY_DATA_DB_PATH,rules,{comparisonPrices:strategyComparisonPrices,actionFor:strategyActionFor,extraSymbols:[...extraSymbols]});
  return compositionPrices(process.env.STRATEGY_COMPOSITION_PRICE_DB_PATH,{...data,factorPools,sources:{...data.sources,composition:{schedule:'initial_then_calendar_quarter',factors:'Configurable subset: quarterly growth, TTM margins, consecutive annual pre-tax ROIC; match all enabled',factorRules:rules.equityMix.factors,universe:'current stored operating-company coverage; not survivorship-free',valuationScope:'individual equities only; index ETFs exempt',selection:'filter full factor-qualified pool then configured ranking; Guru Top N survivors'}}},rules.end);
}

export function runStrategyComposition(data,rules) {
  const dates=[...new Set(data.dates)].filter(d=>d<=rules.end).sort();
  const base={version:STRATEGY_LAB_VERSION,calculationVersion:STRATEGY_CALCULATION_VERSION+'-composition-v2',rules,ruleHash:signature(rules),sources:data.sources??{},requested:{start:rules.start,end:rules.end},retrospective:true,selectionBasis:'quarterly_equity_mix_full_investment',strictGuruReplication:false};
  const ledger=[],targets={guru:[],filtered:[],blend:[]};
  const blocked=(code,detail={})=>({...base,status:'blocked',failure:{code,...detail},results:{},ledger,holdingSnapshots:[]});
  if(!dates.length||Date.parse(rules.end)-Date.parse(dates.at(-1))>5*86400000)return blocked('stale_benchmark',{lastDate:dates.at(-1)??null});
  const first=dates.findIndex(d=>d>=rules.start);
  if(first<1)return blocked('missing_decision_session');
  const activeDates=dates.slice(first);
  if(activeDates.length<20)return blocked('insufficient_observations');
  for(const event of equityQuarterlySchedule(dates,rules)) {
    const rows=[],books={},filings=[],managerExclusions=[];
    if(rules.equityMix.weights.guru>0) {
      // Only the initial book at this quarter's execution is consumed. Later
      // filings must not reset a quarterly mix in the middle of the quarter.
      const built=buildStrategySchedule({rules:{...rules,start:event.executionDate,end:event.executionDate},histories:data.histories,
        dates:dates.filter(date=>date<=event.executionDate)});
      if(built.failure)return blocked(built.failure.code,built.failure);
      const selected=built.schedule[0];
      books.guru=selected.holdings;filings.push(...selected.filings);managerExclusions.push(...selected.managerExclusions??[]);
    }
    if(rules.equityMix.weights.factors>0)books.factors=(data.factorPools.get(event.decisionDate)??[])
      .map(row=>({...row,assessment:assessFourFactors(row,event.decisionDate,rules.equityMix.factors)}))
      .filter(row=>row.assessment.passes).sort((a,b)=>rankFactorCandidates(a,b,rules.equityMix.factors)).map(row=>({ticker:row.ticker,issuer:row.name,priceSymbol:row.ticker,identityResolved:true,
        metrics:row.metrics,availableAt:row.availableAt,periodEnd:row.periodEnd,annualQuality:row.assessment.years,factorAssessment:row.assessment,source:row.source??null}));
    for(const ticker of ['QQQ','SPY','SCHD'])if(rules.equityMix.weights[ticker]>0)books[ticker]=[{ticker,priceSymbol:ticker,issuer:ticker,identityResolved:true,indexEtf:true}];
    const unfiltered=[],filtered=[];
    for(const [component,holdings] of Object.entries(books)) {
      const componentRows=holdings.map(h=>{
        const action=h.indexEtf?{}:data.actionFor?.(h,event.executionDate)??{};
        const symbol=action.priceSymbol??h.priceSymbol??h.ticker;
        const resolved=h.identityResolved&&!action.blocked&&!action.cash&&positive(data.priceMaps.get(symbol)?.get(event.executionDate));
        const v=h.indexEtf?{status:'index_exempt'}:rules.valuationEnabled?valuationDecision(h,event.decisionDate,data.valuations,data.comparisonPrices):{status:'filter_off'};
        const status=!resolved?'execution_unavailable':h.indexEtf||!rules.valuationEnabled?'included':v.status!=='comparable'?v.status:v.premium>rules.maxPremium+1e-12?'expensive':'included';
        return {...h,...v,status,resolved,component,priceSymbol:symbol,action,originalWeight:holdings.length?rules.equityMix.weights[component]/holdings.length:0,targetWeight:0};
      });
      const limit=component==='factors'?rules.equityMix.factors.topN:Infinity;
      const raw=componentRows.filter(h=>h.resolved).slice(0,limit),eligible=componentRows.filter(h=>h.status==='included').slice(0,limit);
      for(const h of componentRows)if(h.status==='included'&&!eligible.includes(h))h.status='below_top_n';
      rows.push(...componentRows);
      if(!eligible.length) {
        ledger.push({...event,filings,managerExclusions,holdings:rows.map(({action,...h})=>h),cashWeight:0});
        return blocked(component==='factors'?'no_eligible_factor_stocks':component==='guru'?'no_eligible_stocks':'index_history_missing',
          {component,ticker:component in rules.equityMix.weights&&['QQQ','SPY','SCHD'].includes(component)?component:null,date:event.executionDate,
            decisionDate:event.decisionDate,selected:holdings.length,managerExclusions,
            exclusions:componentRows.map(({action,...h})=>h)});
      }
      const add=(list,selected)=>{for(const h of selected)list.push({...h,weight:rules.equityMix.weights[component]/selected.length,assetKind:'stock',...(h.action.corporateAction?{corporateAction:h.action.corporateAction}:{})});};
      add(unfiltered,raw);add(filtered,eligible);
      for(const h of eligible)h.targetWeight=rules.equityMix.weights[component]/eligible.length*(1-rules.ctaWeight);
    }
    const combine=(selected,fraction)=>{
      const bySymbol=new Map();
      for(const h of selected){
        const old=bySymbol.get(h.priceSymbol),weight=h.weight*fraction;
        if(old&&(old.ticker!==h.ticker||signature(old.corporateAction??null)!==signature(h.corporateAction??null)))throw Error('conflicting_composition_identity');
        if(old){old.weight+=weight;old.components[h.component]=(old.components[h.component]??0)+weight;old.managers=[...new Set([...old.managers,...h.managers??[]])];}
        else bySymbol.set(h.priceSymbol,{ticker:h.ticker,priceSymbol:h.priceSymbol,issuer:h.issuer,weight,assetKind:'stock',managers:h.managers??[],components:{[h.component]:weight},...(h.corporateAction?{corporateAction:h.corporateAction}:{})});
      }
      return [...bySymbol.values()];
    };
    for(const kind of ['guru','filtered','blend']) {
      const weights=combine(kind==='guru'?unfiltered:filtered,kind==='blend'?1-rules.ctaWeight:1);
      if(kind==='blend'&&rules.ctaWeight>0)weights.push({ticker:rules.cta,issuer:rules.cta,weight:rules.ctaWeight,assetKind:'cta',components:{cta:rules.ctaWeight}});
      targets[kind].push({executionDate:event.executionDate,reportDate:event.decisionDate,weights,coveragePct:1,cashWeight:0});
    }
    ledger.push({...event,filings,managerExclusions,updatedManagers:[],holdings:rows.map(({action,...h})=>h),coverage:rows.length?rows.filter(h=>h.resolved).length/rows.length:1,
      modelCoverage:rules.valuationEnabled?rows.filter(h=>h.indexEtf||h.premium!=null).length/rows.length:null,
      included:rows.filter(h=>h.targetWeight>0).length,expensive:rows.filter(h=>h.status==='expensive').length,
      unknown:rows.filter(h=>!['included','expensive','below_top_n'].includes(h.status)).length,cashWeight:0,ctaWeight:rules.ctaWeight});
  }
  return completeStrategyRun(data,rules,base,activeDates,targets,ledger);
}
