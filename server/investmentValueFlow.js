import fs from 'node:fs';
import { finite, isoDate } from './investmentMath.js';
import { sourceNode } from './investmentSource.js';
import { buildOpportunities } from './investmentOpportunities.js';

export const valueFlowTaxonomy = JSON.parse(fs.readFileSync(new URL('./config/value-flow-taxonomy.json', import.meta.url), 'utf8'));
const caches = new WeakMap();
const median = values => {
  const a = values.filter(finite).sort((a,b)=>a-b);
  return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2 : null;
};

// Display classification is retrospective. All economic observations are dated.
// No dependency on the latest-only Ontology snapshot or per-company HTTP calls.
export function buildValueFlow(source, asOf, taxonomy = valueFlowTaxonomy) {
  isoDate(asOf);
  const generation = source.db.prepare('PRAGMA data_version').get().data_version;
  const cached = caches.get(source);
  if (taxonomy === valueFlowTaxonomy && cached?.generation === generation && cached.asOf === asOf && Date.now()-cached.at < 60_000) return structuredClone(cached.result);
  const tickers = [...new Set(taxonomy.companies.map(c=>c.ticker))];
  if (!tickers.length) return {version:'value-flow-v1',asOf,layers:[],companies:[],coverage:{total:0}};
  const placeholders = tickers.map(()=>'?').join(',');
  const rows = source.db.prepare(`WITH periods AS (
    SELECT *, ROW_NUMBER() OVER(PARTITION BY ticker,fiscal_period ORDER BY as_of_date DESC,model_version DESC) revision
    FROM valuation_pit_model_runs WHERE ticker IN (${placeholders}) AND as_of_date<=?
      AND financial_available_at<=as_of_date
      AND (guidance_max_observed_at IS NULL OR guidance_max_observed_at<=as_of_date)
  ), ranked AS (
    SELECT *,ROW_NUMBER() OVER(PARTITION BY ticker ORDER BY as_of_date DESC,fiscal_period DESC) n
    FROM periods WHERE revision=1
  ) SELECT * FROM ranked WHERE n<=2 ORDER BY ticker,n`).all(...tickers,asOf);
  const models = new Map();
  for (const row of rows) {
    const m = models.get(row.ticker) ?? [];
    try { m.push({node:sourceNode(row),currency:JSON.parse(row.input_json).sourceRecord?.currency ?? null}); }
    catch { m.push(null); } // Invalid latest lineage must not silently fall back to an older value.
    models.set(row.ticker,m);
  }
  const snapshots = new Map(source.db.prepare(`SELECT ticker,
    json_extract(payload_json,'$.name') name,json_extract(payload_json,'$.currency') currency,
    json_extract(payload_json,'$.priceSource') priceSource,json_extract(payload_json,'$.priceHistory') prices
    FROM valuation_ticker_snapshots WHERE ticker IN (${placeholders})`).all(...tickers).map(r=>[r.ticker,r]));
  let guruRows = new Map(), guruCoverage = null;
  try {
    const opportunities = buildOpportunities(source,asOf);
    guruRows = new Map(opportunities.rows.map(r=>[r.ticker,r]));
    guruCoverage = {...opportunities.coverage,reportDate:opportunities.reportDate};
  } catch { /* Optional disclosure coverage is explicitly unavailable, not zero. */ }
  const companies = taxonomy.companies.map(c=>{
    const model = models.get(c.ticker), m=model?.[0], prior=model?.[1], n=m?.node, prev=prior?.node;
    const snap=snapshots.get(c.ticker);
    const price=(JSON.parse(snap?.prices??'[]')).filter(p=>typeof p.date==='string' && p.date<=asOf && finite(p.close)&&p.close>0).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
    const valuationKnown=finite(n?.publishedFairValue)&&n.publishedFairValue>0;
    const comparable=valuationKnown && finite(price?.close) && !!m?.currency && m.currency===snap?.currency;
    const changeComparable=!!n && !!prev && !!m?.currency && m.currency===prior?.currency && n.source.modelVersion===prev.source.modelVersion && !!n.publishedFormula && n.publishedFormula===prev.publishedFormula && prev.availableAt<n.availableAt;
    const g=guruRows.get(c.ticker);
    const holders=g?.managers.filter(h=>finite(h.shares)&&h.shares>0).map(h=>({guruId:h.guruId,name:h.name,avatar:h.avatar,availableAt:h.availableAt,reportDate:h.reportDate,action:h.action,coverage:h.coverage}))??[];
    return {...c,name:snap?.name??c.ticker,period:n?.period??null,periodEnd:n?.periodEnd??null,availableAt:n?.availableAt??null,
      metrics:n?.metrics??{revenueGrowth:null,operatingMargin:null,fcfMargin:null,capexIntensity:null},
      changes:Object.fromEntries(['revenueGrowth','operatingMargin','fcfMargin'].map(k=>[k,changeComparable&&finite(n.metrics[k])&&finite(prev.metrics[k])?n.metrics[k]-prev.metrics[k]:null])),
      previousDate:changeComparable?prev.availableAt:null,
      valuation:{fairValue:valuationKnown?n.publishedFairValue:null,currency:m?.currency??null,date:n?.availableAt??null,formula:n?.publishedFormula??null,
        change:changeComparable&&finite(prev.publishedFairValue)&&prev.publishedFairValue>0&&valuationKnown?n.publishedFairValue/prev.publishedFairValue-1:null},
      price:{value:price?.close??null,date:price?.date??null,currency:snap?.currency??null,source:price?.source??snap?.priceSource??null},
      modelGap:comparable?n.publishedFairValue/price.close-1:null,
      status:!n?(model?.length?'invalid_lineage':'no_model'):!valuationKnown?'no_value':!price?'no_price':!comparable?'currency_unverified':'available',
      source:n?{dataset:n.source.dataset,dimension:n.source.dimension,modelVersion:n.source.modelVersion,availableAt:n.source.availableAt,hash:n.source.hash}:null,
      holders,holderCount:guruCoverage?holders.length:null};
  });
  const layers=taxonomy.layers.map(l=>{
    const members=companies.filter(c=>c.layer===l.id), known=members.filter(c=>finite(c.metrics.revenueGrowth));
    return {...l,total:members.length,financialCount:known.length,comparableCount:members.filter(c=>c.status==='available').length,
      medianGrowth:median(known.map(c=>c.metrics.revenueGrowth)),medianGap:median(members.map(c=>c.modelGap)),
      positiveGrowth:known.filter(c=>c.metrics.revenueGrowth>0).length};
  });
  const result={version:'value-flow-v1',asOf,taxonomy:{version:taxonomy.version,source:taxonomy.source,retrospective:true},layers,companies,guruCoverage,
    coverage:{total:companies.length,financial:companies.filter(c=>c.source).length,comparable:companies.filter(c=>c.status==='available').length,
      invalid:companies.filter(c=>c.status==='invalid_lineage').length}};
  if(taxonomy===valueFlowTaxonomy)caches.set(source,{generation,asOf,at:Date.now(),result});
  return structuredClone(result);
}
