import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reportAnalysisAccounts} from './portfolioReport.js';
import {portfolioHome} from './portfolioHome.js';
import {importOwnerReport,localOwnerPortfolio} from './portfolioSnapshotStore.js';

const statement = () => ({accountId:'TEST-OWNER',fromDate:'20260901',toDate:'20260903',
  AccountInformation:{accountId:'TEST-OWNER',currency:'USD',primaryEmail:'synthetic@example.test'},
  EquitySummaryByReportDateInBase:[{reportDate:20260901,total:1000},{reportDate:20260902,total:1600},{reportDate:20260903,total:1550}],
  Trades:{Trade:[{tradeID:'t1',tradeDate:20260902,symbol:'AAA',assetCategory:'STK',currency:'USD',fifoPnlRealized:10},
    {tradeID:'t2',tradeDate:20260903,symbol:'AAA CALL',assetCategory:'OPT',currency:'GBP',fxRateToBase:1.25,fifoPnlRealized:-20}]},
  CashTransactions:{CashTransaction:[{dateTime:'20260902;090000',type:'Deposits/Withdrawals',amount:500,currency:'USD'},
    {dateTime:'20260903;090000',type:'Dividends',amount:10,currency:'USD'}]},
});
const home = s => portfolioHome(reportAnalysisAccounts({FlexStatement:s}),[],'USD');
test('true broker NAV, FIFO realised P&L and cash-adjusted estimate remain distinct',()=>{
  const h=home(statement());
  assert.equal(h.nav.rows.length,3);
  assert.equal(h.history.realized.total,-15);
  assert.deepEqual(h.history.realized.rows.map(r=>r.cumulativePnl),[0,10,-15]);
  assert.deepEqual(h.history.cashAdjusted.rows.map(r=>r.pnl),[0,100,-50]);
  assert.equal(h.history.cashAdjusted.total,50); // deposit excluded; dividend stays in change
  assert.equal(h.history.cashAdjusted.status,'estimate');
  assert.equal(h.daily.pnl,null); // never turn trade-only MTM or NAV changes into instrument MTM
  assert.equal(h.history.realized.byInstrument.length,2);
});
test('missing sections never become zero; explicit empty sections do',()=>{
  const s=statement();delete s.Trades;delete s.CashTransactions;
  assert.equal(home(s).history.realized.total,null);assert.equal(home(s).history.cashAdjusted.total,null);
  s.Trades={};s.CashTransactions={};
  assert.equal(home(s).history.realized.total,0);assert.equal(home(s).history.cashAdjusted.total,550);
});
test('duplicate trades, invalid dates, absent FX and missing P&L block realized totals',()=>{
  for(const mutate of [s=>s.Trades.Trade.push(s.Trades.Trade[0]),s=>delete s.Trades.Trade[1].fxRateToBase,
    s=>s.Trades.Trade[0].tradeDate='20260230',s=>delete s.Trades.Trade[0].fifoPnlRealized]){
    const s=statement();mutate(s);assert.equal(home(s).history.realized.total,null);
  }
});
test('unknown cash types, invalid dates and absent foreign FX block the estimate',()=>{
  for(const mutate of [s=>s.CashTransactions.CashTransaction[0].type='UNCLASSIFIED TRANSFER',
    s=>s.CashTransactions.CashTransaction[0].dateTime='20260230;120000',s=>s.CashTransactions.CashTransaction[0].currency='GBP']){
    const s=statement();mutate(s);assert.equal(home(s).history.cashAdjusted.total,null);
  }
});
test('history joins exactly once by owner account and currency, never by list ordering',()=>{
  const history=statement(),current={...statement(),fromDate:20260903};current.Trades={};current.CashTransactions={};
  current.EquitySummaryByReportDateInBase=[history.EquitySummaryByReportDateInBase.at(-1)];
  const a=reportAnalysisAccounts({FlexStatement:current},{historyParsed:{FlexStatement:[{...history,accountId:'OTHER'},history]}});
  assert.equal(portfolioHome(a,[],'USD').history.realized.total,-15);
  const foreign={...history,AccountInformation:{...history.AccountInformation,currency:'EUR'}};
  assert.equal(reportAnalysisAccounts({FlexStatement:current},{historyParsed:{FlexStatement:foreign}})[0].navHistory.length,1);
});
test('multi-account history uses a shared period; incomplete inputs cannot claim a combined P&L',()=>{
  const a=reportAnalysisAccounts({FlexStatement:statement()})[0],b=structuredClone(a);
  const full=portfolioHome([a,b],[],'USD');assert.equal(full.history.realized.total,-30);assert.equal(full.history.cashAdjusted.total,100);
  b.historyEvidence.cashStatus='cash_section_missing';
  assert.equal(portfolioHome([a,b],[],'USD').history.cashAdjusted.total,null);
  b.historyEvidence.tradeStatus='trades_section_missing';assert.equal(portfolioHome([a,b],[],'USD').history.realized.total,null);
});
test('v3 private SQLite round-trips complete history; rejects another owner and keeps broker IDs private',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-history-test-'));
  try {
    const report={FlexStatement:statement()},file=path.join(dir,'owner.sqlite');
    const metadata={source:'synthetic test',retrievedAt:'2026-09-04',sha256:'a'.repeat(64)};
    const imported=importOwnerReport({report,file,expectedEmail:'synthetic@example.test',metadata});
    const env={API_AUTH_DEV_BYPASS:'true',INVESTMENT_WORKFLOW_ENABLED:'true',LOCAL_OWNER_PORTFOLIO_DB:file,LOCAL_OWNER_PORTFOLIO_HASH:imported.ownerHash};
    const payload=localOwnerPortfolio({id:'local-dev-user'},env);
    const h=portfolioHome(payload.analysisAccounts,[],'USD');
    assert.equal(h.nav.rows.length,3);assert.equal(h.history.realized.total,-15);assert.equal(h.history.cashAdjusted.total,50);
    assert.ok(!JSON.stringify(payload).includes('TEST-OWNER'));assert.ok(!JSON.stringify(payload).includes('synthetic@example.test'));
    assert.equal(localOwnerPortfolio({id:'different-user'},env),null);
    assert.throws(()=>importOwnerReport({report,historyParsed:{FlexStatement:{...statement(),AccountInformation:{primaryEmail:'other@example.test'}}},file:path.join(dir,'foreign.sqlite'),expectedEmail:'synthetic@example.test',metadata}),/owner_not_verified/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
