import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioHome} from './portfolioHome.js';
import {reportAnalysisAccounts} from './portfolioReport.js';
import {analysePortfolio} from './investmentPortfolio.js';

// Fabricated unit-test accounts only; never loaded by the application.
const account=(overrides={})=>({currency:'USD',reportDate:'2026-09-09',reportedNav:1100,
  navHistory:[{date:'2026-09-08',nav:1000},{date:'2026-09-09',nav:1100}],...overrides});
const home=(accounts,positions=[])=>portfolioHome(accounts,positions,'USD');
const xml=(extra={})=>({FlexStatement:{accountId:'FIXTURE',fromDate:'20260909',toDate:'20260909',currency:'USD',
  EquitySummaryByReportDateInBase:{reportDate:'20260909',total:1100},...extra}});
const mtm=rows=>({MTMPerformanceSummaryInBase:{MTMPerformanceSummaryUnderlying:rows}});

test('one real balance remains one point, never an invented performance curve',()=>{
  const h=home([account({navHistory:[{date:'2026-09-09',nav:1100}]})]);
  assert.equal(h.nav.status,'single_observation');assert.equal(h.nav.rows.length,1);
  assert.equal(h.daily.pnl,null);assert.equal(h.daily.status,'daily_mtm_required');
});
test('NAV growth is not labelled return or used to infer daily P&L',()=>{
  const h=home([account()]);assert.equal(h.nav.status,'ready');assert.match(h.nav.basis,/not_cash_flow_adjusted_return/);
  assert.equal(h.daily.pnl,null);assert.equal(h.return,undefined);
});
test('multiple accounts use common exact dates without carrying or partial sums',()=>{
  const h=home([account(),account({reportedNav:2200,navHistory:[{date:'2026-09-07',nav:2000},{date:'2026-09-09',nav:2200}]})]);
  assert.equal(h.accountValue,3300);assert.deepEqual(h.nav.rows,[{date:'2026-09-09',nav:3300}]);
});
test('different account report dates do not produce a current total or daily ranking',()=>{
  const h=home([account(),account({reportDate:'2026-09-08'})]);
  assert.equal(h.reportDate,null);assert.equal(h.accountValue,null);assert.equal(h.daily.pnl,null);
});
test('future dates, missing values, invalid dates and conflicting NAV duplicates are excluded',()=>{
  const h=home([account({navHistory:[{date:'2026-09-09',nav:1000},{date:'2026-09-09',nav:1100},
    {date:'2026-09-10',nav:1200},{date:'2026-02-30',nav:100},{date:'2026-09-08',nav:null}]})]);
  assert.deepEqual(h.nav.rows,[]);
  assert.equal(portfolioHome([account()],[],null).accountValue,null);
});
test('raw daily instrument MTM includes zero and negative and ranks dollar contribution',()=>{
  const a=reportAnalysisAccounts(xml(mtm([{symbol:'AAA',conid:'1',assetCategory:'STK',total:25},
    {symbol:'BBB',conid:'2',assetCategory:'STK',total:-10},{symbol:'CCC',conid:'3',assetCategory:'STK',total:0}])));
  const h=home(a);assert.equal(h.daily.status,'ready');assert.equal(h.daily.pnl,15);
  assert.deepEqual(h.daily.rows.map(r=>r.pnl),[25,0,-10]);assert.match(h.daily.basis,/not_whole_account_return/);
});
test('monthly, undated, incomplete and duplicate MTM are never day P&L',()=>{
  for(const report of [xml({...mtm([{symbol:'AAA',total:999}]),fromDate:'20260901'}),
    xml({...mtm([{symbol:'AAA',total:999}]),fromDate:undefined}),xml(mtm([{symbol:'AAA',total:''}])),
    xml(mtm([{symbol:'AAA',total:20},{symbol:'AAA',total:30}]))]) {
    assert.equal(home(reportAnalysisAccounts(report)).daily.pnl,null);
  }
});
test('missing one account daily report blocks combined day totals and rankings',()=>{
  const a=reportAnalysisAccounts(xml(mtm([{symbol:'AAA',total:10}])))[0];
  assert.equal(home([a,account()]).daily.pnl,null);assert.deepEqual(home([a,account()]).daily.rows,[]);
});
test('equity and option instrument identities are not collapsed to one stock',()=>{
  const a=reportAnalysisAccounts(xml(mtm([{symbol:'AAA',conid:'1',assetCategory:'STK',total:25},
    {symbol:'AAA CALL',conid:'2',assetCategory:'OPT',total:-10}])));
  assert.equal(home(a).daily.rows.length,2);
});
test('history query joins only exact account and currency, not ordering',()=>{
  const history=xml({EquitySummaryByReportDateInBase:{reportDate:'20260908',total:1000}});
  assert.equal(reportAnalysisAccounts(xml(),{historyParsed:history})[0].navHistory.length,2);
  for(const other of [xml({accountId:'FOREIGN'}),xml({currency:'EUR'}),xml({accountId:undefined})])
    assert.equal(reportAnalysisAccounts(xml(),{historyParsed:other})[0].navHistory.length,1);
});
test('unrealized P&L uses verified equity marks minus reported cost, with report FX',()=>{
  const accounts=reportAnalysisAccounts(xml({OpenPosition:[{symbol:'AAA',assetCategory:'STK',currency:'EUR',position:10,markPrice:100,positionValue:1000,costBasisMoney:800,fxRateToBase:1.2},
    {symbol:'BBB',assetCategory:'STK',currency:'USD',position:10,markPrice:100,positionValue:1000},
    {symbol:'AAA CALL',assetCategory:'OPT',currency:'USD',position:1,markPrice:1,positionValue:100,costBasisMoney:50}]}));
  const g=analysePortfolio({source:{mode:'live',userScoped:true},connection:{status:'linked'},analysisAccounts:accounts},{asOf:'2026-08-28'}).groups[0];
  assert.equal(g.home.unrealized.rows[0].pnl,240);assert.equal(g.home.unrealized.covered,1);assert.equal(g.home.unrealized.total,2);
  assert.equal(g.home.daily.pnl,null);assert.equal(g.home.reportDate,'2026-09-09');
});
