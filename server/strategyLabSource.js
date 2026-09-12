import fs from 'node:fs';
import crypto from 'node:crypto';
import { gurus } from './gurus.js';
import { tickerResolutionForHolding, priceSymbolResolutionForHolding, holdingResolutionVersion } from './cusipOverrides.js';
import { assertLineage } from './investmentSource.js';
import { activeCashAcquisition, activeStockConversion, compactCashAcquisitionResolution, compactStockConversionResolution,
  preExecutionCashAcquisition, preExecutionStockConversion, manager13fCorporateActionCatalogVersion } from './corporateActions.js';
import { knownNonPublicExecutionLimitation, knownPrivateRolloverTransition } from './backtestReplicability.js';
import { signature, finite } from './investmentMath.js';
import { valuationComparisonPriceContract, comparisonPricesEqual } from './valuationComparisonPrice.js';
import { originalStrategyHistory,strategyFilingArtifact } from './strategyFilings.js';
import { storedStrategyCatalog,loadStoredStrategyData } from './strategyDatabase.js';
import {strategyModelTickers} from './strategyValuationLinks.js';
import {linkedStrategyComparisonPrices} from './strategyCompositionPrices.js';

const parse=r=>r?JSON.parse(r.payload_json):null;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const positive=v=>finite(v)&&v>0;

// UI snapshots can be sampled. Backfill only actual daily rows from a matching
// provider/field/basis, corroborated at every overlap. Never interpolate or use
// dividend-adjusted closes to decide a price/fair-value premium.
export function strategyComparisonPrices(snapshot,raw,end) {
  const points=new Map(), accepted=new Map(), groups=new Map();
  for(const p of snapshot?.priceHistory??[]) {
    if(p.date>end||!positive(p.close))continue;
    const contract=valuationComparisonPriceContract(p.source??snapshot.priceSource);
    if(contract){points.set(p.date,p.close);accepted.set(p.date,{...contract,close:p.close});}
  }
  for(const r of raw) {
    const c=valuationComparisonPriceContract(r.source);
    if(!c||!positive(r.close)||r.date>end)continue;
    const key=[c.provider,c.field,c.basis].join('|');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...r,contract:c});
  }
  const audits=[];
  for(const [key,rows] of groups) {
    const overlaps=rows.filter(r=>{const p=accepted.get(r.date);return p&&[p.provider,p.field,p.basis].join('|')===key;});
    const conflicts=overlaps.filter(r=>!comparisonPricesEqual(r.close,accepted.get(r.date).close));
    // At least two corroborating observations, with the raw series bounded by
    // the verified snapshot dates. Unknown source/currency never becomes USD.
    const valid=overlaps.length>=2&&conflicts.length===0;
    const first=[...accepted.keys()].sort()[0],last=[...accepted.keys()].sort().at(-1);
    if(valid)for(const r of rows)if(!points.has(r.date)&&r.date>=first&&r.date<=last)points.set(r.date,r.close);
    audits.push({series:key,overlaps:overlaps.length,conflicts:conflicts.length,backfillAccepted:valid});
  }
  return {currency:snapshot?.currency??null,points,audits};
}
export function strategyEtfs(file=process.env.STRATEGY_ETF_INPUT_PATH) {
  if(!file)return {};
  const p=JSON.parse(fs.readFileSync(file,'utf8'));
  if(p.version!=='strategy-etfs-v1')throw new Error('invalid_etf_artifact');
  for(const [s,v] of Object.entries(p.series??{})) {
    if(!['KMLM','DBMF'].includes(s)||v.symbol!==s||v.currency!=='USD'||v.returnBasis!=='total_return_adjusted_close'||sha(JSON.stringify(v.points))!==v.pointsSha256)throw new Error('invalid_etf_artifact');
    let previous='';
    for(const r of v.points) {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date<=previous||r.date<v.inception||r.date>p.asOf||!positive(r.adjustedClose)||!positive(r.close))throw new Error('invalid_etf_observation');
      previous=r.date;
    }
  }
  return p.series??{};
}

export function strategyCatalog(source,asOf,etfFile) {
  if(process.env.STRATEGY_DATA_DB_PATH)return storedStrategyCatalog(process.env.STRATEGY_DATA_DB_PATH,asOf);
  const configured=new Map(gurus.filter(g=>g.type==='manager13f'&&!g.disableSimulation).map(g=>[g.id,g]));
  const catalog=source.guruCatalog().filter(g=>configured.has(g.id)).map(g=>{
    const h=source.guruHistory(g.id,asOf);
    return {...g,firstFiling:h[0]?.filingDate??null,lastFiling:h.at(-1)?.filingDate??null,
      quarters:h.length,publicProxy:g.id==='renaissance-technologies',topNLimit:10};
  });
  let etfs={};try{etfs=strategyEtfs(etfFile);}catch{/* Explicit unavailable state; calculation verifies again. */}
  return {version:'strategy-lab-catalog-v1',asOf,managers:catalog,topNLimit:10,
    etfs:['KMLM','DBMF'].map(ticker=>({ticker,available:!!etfs[ticker],first:etfs[ticker]?.first??null,last:etfs[ticker]?.last??null,
      source:etfs[ticker]?.source??null,returnBasis:etfs[ticker]?.returnBasis??null}))};
}

export function loadStrategyData(source,rules,etfFile) {
  if(process.env.STRATEGY_DATA_DB_PATH)return loadStoredStrategyData(process.env.STRATEGY_DATA_DB_PATH,rules,{comparisonPrices:strategyComparisonPrices,actionFor:strategyActionFor});
  const histories=new Map(), allHoldings=[];
  const originalFilings=strategyFilingArtifact();
  for(const id of rules.managers) {
    // Acceptance metadata enriches the exact matching accession only; no curve
    // values or already-pruned top-8 backtest weights enter selection.
    const stored=source.db.prepare('SELECT payload_json FROM guru_backtests WHERE guru_id=? ORDER BY years DESC').all(id).map(parse);
    const acceptance=new Map();
    for(const p of stored)for(const r of p.rebalances??[])if(r.filing?.accessionNumber && r.publicDate)acceptance.set(r.filing.accessionNumber,r.publicDate);
    const rows=originalStrategyHistory(source,id,rules.end,originalFilings).map(f=>{
      const publicDate=[f.filingDate,acceptance.get(f.accessionNumber)].filter(Boolean).sort().at(-1);
      const holdings=(f.topHoldings??[]).filter(h=>String(h.id??'').endsWith('-COMMON')).map(h=>{
        const input={...h,guruId:id,reportDate:f.reportDate,accessionNumber:f.accessionNumber};
        const resolution=tickerResolutionForHolding(input), price=priceSymbolResolutionForHolding(input);
        const identityResolved=resolution.status==='resolved'&&resolution.source!=='curated_issuer_override';
        // Exact-CUSIP audited continuity (for example HHC → HHH) outranks the
        // stale display symbol in an exposure extract; no issuer-name fallback.
        const row={...input,reportedTicker:h.ticker??null,ticker:identityResolved?resolution.ticker:h.ticker||null,
          priceSymbol:identityResolved?price.symbol||null:null,identityResolved,identitySource:resolution.source};
        allHoldings.push(row);return row;
      });
      return {reportDate:f.reportDate,publicDate,accession:f.accessionNumber,sourceUrl:f.filing?.secUrl??null,
        missingOriginal:f.missingOriginal===true,recoveredSourceHash:f.recoveredSourceHash??null,
        amendmentUnreviewed:/\/A$/i.test(f.filing?.form??''),
        complete:Number.isInteger(f.positionCount)&&f.positionCount<=holdings.length,holdings};
    });
    histories.set(id,rows);
  }
  const universe=[...new Set(allHoldings.flatMap(h=>[h.ticker,h.priceSymbol]).filter(Boolean))];
  const start=new Date(Date.parse(rules.start)-400*86400000).toISOString().slice(0,10);
  const prices=new Map(), priceQueries=source.db.prepare('SELECT date,adjusted_close value,source FROM price_points WHERE symbol=? AND date>=? AND date<=? ORDER BY date');
  const provenance={};
  // Include exact audited successor price symbols for corporate-action marks.
  for(const h of allHoldings){const a=activeStockConversion(h,{executionDate:rules.start});if(a?.consideration?.successorTicker)universe.push(a.consideration.successorTicker);}
  for(const symbol of new Set(['SPY',...universe])) {
    const rows=priceQueries.all(symbol,start,rules.end);
    prices.set(symbol,new Map(rows.filter(r=>positive(r.value)).map(r=>[r.date,r.value])));
    provenance[symbol]={rows:rows.length,valid:rows.filter(r=>positive(r.value)).length,first:rows[0]?.date??null,last:rows.at(-1)?.date??null,
      hash:signature(rows),sources:[...new Set(rows.map(r=>r.source))]};
  }
  // Keep every stored benchmark session in the calendar even if its adjustment
  // is missing, so it cannot disappear through an intersection join.
  const dates=priceQueries.all('SPY',start,rules.end).map(r=>r.date);
  let etfs={};try{etfs=strategyEtfs(etfFile);}catch{throw new Error('invalid_etf_artifact');}
  const etfProvenance={};
  for(const [ticker,e] of Object.entries(etfs)) {
    prices.set(ticker,new Map(e.points.filter(r=>r.date<=rules.end).map(r=>[r.date,r.adjustedClose])));
    etfProvenance[ticker]={first:e.first,last:e.last,source:e.source,url:e.url,hash:e.pointsSha256,downloadedAt:e.downloadedAt,returnBasis:e.returnBasis};
  }
  const valuations=new Map(), comparisonPrices=new Map();
  const nodeQuery=source.db.prepare(`SELECT as_of_date,model_version,financial_available_at,guidance_max_observed_at,input_json,
    json_extract(output_json,'$.fairValue') fairValue FROM valuation_pit_model_runs
    WHERE ticker=? AND as_of_date<=? AND financial_available_at<=as_of_date
    AND model_version=(SELECT model_version FROM valuation_pit_model_runs WHERE ticker=? AND as_of_date<=? ORDER BY as_of_date DESC,model_version DESC LIMIT 1)
    AND (guidance_max_observed_at IS NULL OR guidance_max_observed_at<=as_of_date)
    ORDER BY as_of_date,model_version`);
  const comparisonQuery=source.db.prepare(`SELECT json_extract(payload_json,'$.currency') currency,
    json_extract(payload_json,'$.priceSource') priceSource,
    json_extract(payload_json,'$.priceHistory') history FROM valuation_ticker_snapshots WHERE ticker=?`);
  const closeQuery=source.db.prepare('SELECT date,close,source FROM price_points WHERE symbol=? AND date>=? AND date<=? ORDER BY date');
  const valuationHashes={};
  if(rules.valuationEnabled)for(const ticker of strategyModelTickers(allHoldings.map(h=>h.ticker).filter(Boolean))) {
    const rows=nodeQuery.all(ticker,rules.end,ticker,rules.end), valid=[];
    for(const r of rows) {
      const input=JSON.parse(r.input_json);
      try{assertLineage(input,r.as_of_date);}catch{continue;}
      valid.push({date:r.as_of_date,version:r.model_version,currency:input.sourceRecord?.currency??null,fairValue:r.fairValue,sourceTicker:input.sourceRecord?.sourceTicker??null});
    }
    valuations.set(ticker,valid);valuationHashes[ticker]=signature(valid);
    const c=comparisonQuery.get(ticker);
    const compared=strategyComparisonPrices({...c,priceHistory:JSON.parse(c?.history??'[]')},closeQuery.all(ticker,start,rules.end),rules.end);
    comparisonPrices.set(ticker,compared);
    valuationHashes[ticker+'Prices']=signature({points:[...compared.points],audits:compared.audits});
  }
  const actionFor=strategyActionFor;
  const data={dates,priceMaps:prices,histories,valuations,comparisonPrices,actionFor,
    sources:{adapter:'strategy-source-v2-original-filings',filingPolicy:'original_quarterly_disclosures_only; later supplements are not applied',securityMaster:holdingResolutionVersion(),corporateActions:manager13fCorporateActionCatalogVersion,
      managers:rules.managers.map(id=>({id,name:gurus.find(g=>g.id===id)?.name??id})),
      holdings:signature([...histories]),prices:provenance,valuations:valuationHashes,etfs:etfProvenance}};
  return rules.valuationEnabled?linkedStrategyComparisonPrices(process.env.STRATEGY_COMPOSITION_PRICE_DB_PATH,data,rules.end):data;
}

export function strategyActionFor(h,date) {
    const privateAction=knownPrivateRolloverTransition({guruId:h.guruId,holding:h});
    if(knownNonPublicExecutionLimitation({guruId:h.guruId,reportDate:h.reportDate,executionDate:date,holding:h}))return {blocked:true};
    const context={reportDate:h.reportDate,executionDate:date,holderHasPrivateRollover:!!privateAction};
    if(preExecutionCashAcquisition(h,context))return {cash:true};
    // A pre-execution stock conversion changes the claim underlying valuation.
    // Keep this unsupported until the whole filter bridge is action-adjusted.
    if(preExecutionStockConversion(h,context))return {blocked:true};
    const cash=activeCashAcquisition(h,context), stock=activeStockConversion(h,context);
    return {corporateAction:privateAction??(cash?compactCashAcquisitionResolution(cash,h):stock?compactStockConversionResolution(stock,h):null)};
}
