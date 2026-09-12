import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildValueFlow, valueFlowTaxonomy } from './investmentValueFlow.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function fixture(t) {
  const db=new DatabaseSync(':memory:'); t.after(()=>db.close());
  db.exec(`CREATE TABLE valuation_pit_model_runs(ticker TEXT,as_of_date TEXT,model_version TEXT,fiscal_period TEXT,financial_available_at TEXT,guidance_max_observed_at TEXT,input_json TEXT,output_json TEXT);
    CREATE TABLE valuation_ticker_snapshots(ticker TEXT,payload_json TEXT); CREATE TABLE guru_snapshots(guru_id TEXT,payload_json TEXT);`);
  const source={db,guruCatalog:()=>[]};
  for(const ticker of ['NVDA','AMD']) {
    for(const [date,period,growth,fair] of [['2026-02-01','2026-Q1',10,100],['2026-05-01','2026-Q2',30,120],['2026-08-01','2026-Q3',70,220]]) {
      const input={sourceRecord:{currency:'USD',reportperiod:date,dataset:'SYNTHETIC TEST ONLY'},financial:{revenue_growth_pct:ticker==='AMD'?-growth:growth},trailingTwelveMonths:{revenue_m:100,operating_income_m:20,fcf_after_capex_m:10},valuationSemantics:{fairValueFormula:'test'},guidance:{}};
      db.prepare('INSERT INTO valuation_pit_model_runs VALUES(?,?,?,?,?,?,?,?)').run(ticker,date,'v1',period,date,null,JSON.stringify(input),JSON.stringify({fairValue:fair}));
    }
    db.prepare('INSERT INTO valuation_ticker_snapshots VALUES(?,?)').run(ticker,JSON.stringify({name:ticker,currency:'USD',priceHistory:[{date:'2026-05-30',close:100},{date:'2026-08-28',close:200}]}));
  }
  const taxonomy={version:'test',source:'synthetic',layers:[{id:'chips',name:{en:'Chips',zh:'芯片'}}],companies:['NVDA','AMD','MISS'].map(ticker=>({ticker,layer:'chips'}))};
  return {source,db,taxonomy,run:(d='2026-06-01')=>buildValueFlow(source,d,taxonomy)};
}
test('historical financial/model/price observations never use future endpoints',t=>{
  const {run}=fixture(t),old=run(),now=run('2026-08-28');
  const n=old.companies[0];assert.equal(n.availableAt,'2026-05-01');assert.equal(n.price.value,100);assert.equal(n.valuation.fairValue,120);near(n.modelGap,.2);near(n.changes.revenueGrowth,.2);near(n.valuation.change,.2);
  assert.equal(now.companies[0].valuation.fairValue,220);assert.equal(now.companies[0].price.value,200);
});
test('coverage, signed medians and breadth use known observations, not missing zeros',t=>{
  const {run}=fixture(t),r=run(),l=r.layers[0];assert.equal(l.total,3);assert.equal(l.financialCount,2);assert.equal(l.positiveGrowth,1);near(l.medianGrowth,0);assert.equal(l.comparableCount,2);
  const missing=r.companies[2];assert.equal(missing.status,'no_model');assert.equal(missing.metrics.revenueGrowth,null);assert.equal(missing.modelGap,null);
});
test('currency mismatch withholds gap without suppressing the source valuation',t=>{
  const {db,run}=fixture(t);db.exec(`UPDATE valuation_ticker_snapshots SET payload_json=json_set(payload_json,'$.currency','GBP') WHERE ticker='NVDA'`);
  const n=run().companies[0];assert.equal(n.status,'currency_unverified');assert.equal(n.valuation.fairValue,120);assert.equal(n.modelGap,null);
});
test('latest invalid nested lineage fails closed rather than borrowing prior model',t=>{
  const {db,run}=fixture(t);db.exec(`UPDATE valuation_pit_model_runs SET input_json=json_set(input_json,'$.sourceRecord.datekey','2026-09-01') WHERE ticker='NVDA' AND as_of_date='2026-05-01'`);
  const n=run().companies[0];assert.equal(n.status,'invalid_lineage');assert.equal(n.valuation.fairValue,null);assert.equal(n.source,null);
});
test('same-period revisions cannot become a previous-quarter change',t=>{
  const {db,run}=fixture(t);const r=db.prepare("SELECT * FROM valuation_pit_model_runs WHERE ticker='NVDA' AND as_of_date='2026-05-01'").get();
  db.prepare('INSERT INTO valuation_pit_model_runs VALUES(?,?,?,?,?,?,?,?)').run(r.ticker,'2026-05-02',r.model_version,r.fiscal_period,'2026-05-01',null,r.input_json,r.output_json);
  assert.equal(run().companies[0].previousDate,'2026-02-01');
});
test('unmatched model version disables change attribution',t=>{
  const {db,run}=fixture(t);db.exec(`UPDATE valuation_pit_model_runs SET model_version='v2' WHERE as_of_date='2026-05-01'`);
  const n=run().companies[0];assert.equal(n.valuation.change,null);assert.equal(n.changes.revenueGrowth,null);assert.equal(n.previousDate,null);
});
test('unavailable Guru subsystem is explicit and does not break valid valuations',t=>{
  const {source,taxonomy}=fixture(t);source.guruCatalog=()=>{throw Error('offline');};
  const r=buildValueFlow(source,'2026-06-01',taxonomy);assert.equal(r.guruCoverage,null);assert.equal(r.companies[0].holderCount,null);assert.equal(r.companies[0].valuation.fairValue,120);
});
test('price absent at date and null value remain distinct',t=>{
  const {db,run}=fixture(t);assert.equal(run('2026-02-02').companies[0].status,'no_price');
  db.exec(`UPDATE valuation_pit_model_runs SET output_json='{"fairValue":null}' WHERE ticker='NVDA' AND as_of_date='2026-05-01'`);
  const n=run().companies[0];assert.equal(n.status,'no_value');assert.equal(n.modelGap,null);
});
test('taxonomy is unique, bilingual and complete; invalid dates rejected',t=>{
  const {run}=fixture(t);assert.throws(()=>run('2026-02-30'));
  assert.equal(valueFlowTaxonomy.layers.length,8);assert.equal(valueFlowTaxonomy.companies.length,74);
  assert.equal(new Set(valueFlowTaxonomy.companies.map(c=>c.ticker)).size,74);
  for(const c of valueFlowTaxonomy.companies){assert.ok(c.role.en&&c.role.zh);assert.ok(valueFlowTaxonomy.layers.some(l=>l.id===c.layer));}
});
