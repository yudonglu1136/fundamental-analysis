import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tf-portfolio-report-test-'));
process.env.SQLITE_DB_PATH=path.join(folder,'source.sqlite');
process.env.USER_PORTFOLIO_DATA_DIR=path.join(folder,'users');
const {normalizeIbkrFlexPortfolio}=await import('./portfolioClient.js');
const {analysePortfolio}=await import('./investmentPortfolio.js');
// No provider connections, tokens, remote calls or real user databases.
const xml=(position,extra={})=>({FlexStatement:{toDate:'20260827',currency:'USD',AccountInformation:{currency:'USD'},EquitySummaryByReportDateInBase:{total:1000},OpenPositions:{OpenPosition:position},...extra}});
const normalize=x=>normalizeIbkrFlexPortfolio(x,{user:{id:'synthetic-test-owner'}});
test('raw account report survives legacy quantity heuristics unchanged',()=>{
  const p=normalize(xml({symbol:'AAA',description:'Synthetic fixture',assetCategory:'STK',currency:'USD',quantity:1000,markPrice:100,positionValue:1000}));
  const raw=p.analysisAccounts[0].positions[0];assert.equal(raw.quantity,1000);assert.equal(raw.price,100);assert.equal(raw.localValue,1000);assert.equal(p.analysisAccounts[0].reportDate,'2026-08-27');
  const result=analysePortfolio(p,{asOf:'2026-08-28',valuations:new Map([['AAA',{fairValue:120,currency:'USD',date:'2026-07-20'}]])});
  assert.equal(result.groups[0].positions[0].modelStatus,'units_or_fx_unverified');
});
test('absent currency and report FX are not replaced with default USD or FX=1',()=>{
  const p=normalize(xml({symbol:'AAA',assetCategory:'STK',quantity:10,markPrice:100,positionValue:1000}));
  const raw=JSON.parse(JSON.stringify(p.analysisAccounts[0].positions[0]));assert.equal(raw.currency,'');assert.equal(raw.fxRateToBase,null);
  const g=analysePortfolio(p,{asOf:'2026-08-28'}).groups[0];assert.equal(g.netValue,null);assert.equal(g.unpriced,1);
});
test('normal report produces account-isolated contribution without user credential fields',()=>{
  const p=normalize(xml({symbol:'AAA',assetCategory:'STK',currency:'USD',quantity:10,markPrice:100,positionValue:1000,cusip:'FIXTURE'}));
  const r=analysePortfolio(p,{asOf:'2026-08-28',valuations:new Map([['AAA',{fairValue:120,currency:'USD',date:'2026-07-20'}]])});
  assert.equal(r.groups[0].valuation.delta,200);assert.equal(r.groups[0].netValue,1000);assert.equal(r.groups[0].positions[0].cusip,'FIXTURE');
  assert.ok(!JSON.stringify(r).includes('synthetic-test-owner'));assert.equal(r.connection,undefined);
});
test('raw missing base currency fails closed even if legacy display defaults to USD',()=>{
  const p=normalize({FlexStatement:{toDate:'20260827',OpenPosition:{symbol:'AAA',assetCategory:'STK',currency:'USD',quantity:10,markPrice:100,positionValue:1000}}});
  assert.equal(p.analysisAccounts[0].currency,'');assert.equal(analysePortfolio(p,{asOf:'2026-08-28'}).groups[0].netValue,null);
});
test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
