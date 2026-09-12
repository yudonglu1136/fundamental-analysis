import test from 'node:test';
import assert from 'node:assert/strict';
import {reportAnalysisAccounts} from './portfolioReport.js';

const statement = (accountId='SYNTHETIC-A', currency='USD') => ({
  accountId, fromDate:'20260908', toDate:'20260909',
  AccountInformation:{accountId,currency},
  EquitySummaryByReportDateInBase:{reportDate:'20260909',total:1200,cash:0},
  OpenPositions:{OpenPosition:{symbol:'AAA',assetCategory:'STK',currency,
    quantity:10,markPrice:120,positionValue:1200}},
});

test('raw report units and report dates are retained without display guesses',()=>{
  const s=statement();s.OpenPositions.OpenPosition.quantity=1000;
  const [r]=reportAnalysisAccounts({FlexStatement:s});
  assert.equal(r.reportDate,'2026-09-09');assert.equal(r.reportedNav,1200);
  assert.equal(r.positions[0].quantity,1000);
  assert.equal(r.positions[0].price,120);assert.equal(r.positions[0].localValue,1200);
  assert.equal(r.positions[0].fxRateToBase,null);
  delete s.AccountInformation.currency;
  assert.equal(reportAnalysisAccounts({FlexStatement:s})[0].currency,'');
  s.toDate='20260230';assert.equal(reportAnalysisAccounts({FlexStatement:s})[0].reportDate,null);
});

test('history is joined by broker account and currency, never account order',()=>{
  const current=statement(),history=statement();history.fromDate='20260901';
  history.EquitySummaryByReportDateInBase=[{reportDate:'20260901',total:1000}];
  history.Trades={Trade:{tradeID:'SYNTHETIC-TRADE',tradeDate:'20260908',
    symbol:'AAA',assetCategory:'STK',currency:'USD',fifoPnlRealized:25}};
  history.CashTransactions={};
  const other=statement('SYNTHETIC-B'),foreign=statement('SYNTHETIC-A','EUR');
  const [r]=reportAnalysisAccounts({FlexStatement:current},
    {historyParsed:{FlexStatement:[other,foreign,history]}});
  assert.deepEqual(r.navHistory.map(x=>x.nav),[1000,1200]);
  assert.equal(r.historyEvidence.realized[0].pnl,25);
  assert.equal(r.historyEvidence.cashStatus,'ready');
  assert.equal(JSON.stringify(r).includes('SYNTHETIC-TRADE'),false);
});

test('period MTM is not relabeled as daily P&L; only an explicit daily report qualifies',()=>{
  const s=statement();s.MTMPerformanceSummaryInBase={MTMPerformanceSummaryUnderlying:
    {symbol:'AAA',conid:'SYNTHETIC-INSTRUMENT',assetCategory:'STK',total:25}};
  assert.equal(reportAnalysisAccounts({FlexStatement:s})[0].dailyMtm,null);
  s.fromDate=s.toDate;
  assert.equal(reportAnalysisAccounts({FlexStatement:s})[0].dailyMtm.rows[0].pnl,25);
});

test('missing cash or trade evidence is not converted to zero history',()=>{
  const [r]=reportAnalysisAccounts({FlexStatement:statement()});
  assert.equal(r.historyEvidence.tradeStatus,'trades_section_missing');
  assert.equal(r.historyEvidence.cashStatus,'cash_section_missing');
  assert.deepEqual(r.historyEvidence.realized,[]);
});
