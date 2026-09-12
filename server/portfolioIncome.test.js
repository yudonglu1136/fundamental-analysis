import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {reportAnalysisAccounts} from './portfolioReport.js';
import {portfolioIncome} from './portfolioIncome.js';
import {importOwnerReport, localOwnerPortfolio} from './portfolioSnapshotStore.js';

const receipt = (type, amount, symbol, extra = {}) => ({type, amount, symbol, currency:'USD', dateTime:'20260105;120000', ...extra});
const statement = () => ({accountId:'test-owner-only', fromDate:'20260101', toDate:'20260131',
  AccountInformation:{currency:'USD', primaryEmail:'synthetic@example.test'},
  CashTransactions:{CashTransaction:[receipt('Dividends',100,'AAA'),receipt('Bond Interest Received',80,'BOND'),
    receipt('Broker Interest Received',5,''),receipt('Payment In Lieu Of Dividends',15,'BBB'),
    receipt('Dividends',-2,'AAA'),receipt('Withholding Tax',-15,'AAA'),receipt('Broker Interest Paid',-20,''),
    receipt('Bond Interest Paid',-4,'BOND'),receipt('Deposits/Withdrawals',1000,''),receipt('Other Fees',-3,'')]},
  // These are deliberately unrelated to actual received income.
  ChangeInDividendAccruals:{amount:9999}, OpenPosition:{symbol:'NOT_INCOME',positionValue:50000},
});
const accounts = s => reportAnalysisAccounts({FlexStatement:s});
test('income is the positive cash receipt distribution, not accruals, NAV, P&L or net yield',()=>{
  const result = portfolioIncome(accounts(statement()));
  assert.equal(result.status,'ready');assert.equal(result.grossReceived,200);assert.equal(result.reversals,-2);
  assert.equal(result.eventCount,5);assert.equal(result.byInstrument.length,4);
  assert.deepEqual(result.byType.map(r=>r.amount),[100,80,5,15]);
  assert.equal(result.byInstrument.reduce((s,r)=>s+r.weight,0),1);
  assert.ok(result.byInstrument.every(r=>r.amount>0));
});
test('income FX is transaction-date reported FX, never an assumed current rate',()=>{
  const s=statement();s.CashTransactions.CashTransaction=[receipt('Dividends',20,'AAA',{currency:'GBP',fxRateToBase:1.25})];
  assert.equal(portfolioIncome(accounts(s)).grossReceived,25);
  const e=accounts(s)[0].historyEvidence.income[0];
  assert.equal(e.sourceAmount,20);assert.equal(e.sourceCurrency,'GBP');assert.equal(e.fxRateToBase,1.25);
  delete s.CashTransactions.CashTransaction[0].fxRateToBase;
  assert.equal(portfolioIncome(accounts(s)).grossReceived,null);
});
test('missing sections, unknown categories, invalid dates/amounts/currencies and duplicates fail closed',()=>{
  for(const mutate of [s=>delete s.CashTransactions,
    s=>s.CashTransactions.CashTransaction.push(receipt('Unrecognized income',4,'AAA')),
    s=>s.CashTransactions.CashTransaction.push({...s.CashTransactions.CashTransaction[0]}),
    s=>s.CashTransactions.CashTransaction[0].dateTime='20260230',
    s=>s.CashTransactions.CashTransaction[0].dateTime='20260201',
    s=>s.CashTransactions.CashTransaction[0].amount='',
    s=>s.CashTransactions.CashTransaction[0].currency='',
    s=>s.CashTransactions.CashTransaction[0].symbol='']) {
    const s=statement();mutate(s);const result=portfolioIncome(accounts(s));
    assert.equal(result.grossReceived,null);assert.deepEqual(result.byInstrument,[]);
  }
});
test('explicit empty, zero and negative-only receipt histories do not invent a pie',()=>{
  for(const cash of [[],[receipt('Dividends',0,'AAA')],[receipt('Dividends',-10,'AAA')]]) {
    const s=statement();s.CashTransactions={CashTransaction:cash};const result=portfolioIncome(accounts(s));
    assert.equal(result.status,'ready');assert.equal(result.grossReceived,0);assert.deepEqual(result.byInstrument,[]);
  }
});
test('multi-account income uses a common report period, preserves same receipts across different accounts',()=>{
  const a=accounts(statement())[0],b=structuredClone(a);
  assert.equal(portfolioIncome([a,b]).grossReceived,400);
  b.historyEvidence.fromDate='2026-01-06';assert.equal(portfolioIncome([a,b]).grossReceived,0);
  b.historyEvidence.incomeStatus='cash_section_missing';assert.equal(portfolioIncome([a,b]).grossReceived,null);
});
test('v4 stores income structurally with provenance; pre-income snapshots stay readable and explicitly unavailable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'income-test-'));
  try {
    const file=path.join(dir,'test.sqlite');
    const imported=importOwnerReport({report:{FlexStatement:statement()},file,expectedEmail:'synthetic@example.test',
      metadata:{source:'synthetic fixture',retrievedAt:'2026-02-01',sha256:'a'.repeat(64)}});
    const env={API_AUTH_DEV_BYPASS:'true',INVESTMENT_WORKFLOW_ENABLED:'true',LOCAL_OWNER_PORTFOLIO_DB:file,LOCAL_OWNER_PORTFOLIO_HASH:imported.ownerHash};
    const loaded=localOwnerPortfolio({id:'local-dev-user'},env);
    assert.equal(portfolioIncome(loaded.analysisAccounts).grossReceived,200);
    assert.ok(!JSON.stringify(loaded).includes('synthetic@example.test'));
    assert.ok(!JSON.stringify(loaded).includes('test-owner-only'));
    const db=new DatabaseSync(file);assert.equal(db.prepare('select count(*) n from income_events').get().n,5);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    db.exec("UPDATE snapshot SET version='owner-portfolio-v3'; DROP TABLE income_events;");db.close();
    assert.equal(portfolioIncome(localOwnerPortfolio({id:'local-dev-user'},env).analysisAccounts).grossReceived,null);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
