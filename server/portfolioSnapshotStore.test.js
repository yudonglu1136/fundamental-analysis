import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {importOwnerReport,localOwnerPortfolio} from './portfolioSnapshotStore.js';
import {reportAnalysisAccounts} from './portfolioReport.js';
import {analysePortfolio} from './investmentPortfolio.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-portfolio-tests-'));
const report={FlexStatement:{toDate:20260909,AccountInformation:{currency:'USD',primaryEmail:'fixture@example.test',name:'Synthetic owner'},
  EquitySummaryByReportDateInBase:{reportDate:20260909,total:890,cash:-100,dividendAccruals:1,interestAccruals:-1},
  OpenPosition:[{symbol:'AAA',assetCategory:'STK',currency:'USD',position:10,markPrice:100,positionValue:1000},
    {symbol:'AAA CALL',assetCategory:'OPT',currency:'USD',position:-1,markPrice:.1,multiplier:100,positionValue:-10}],
  CashReportCurrency:[{currency:'BASE_SUMMARY',endingCash:-100},{currency:'USD',endingCash:-100}]}};
const metadata={source:'synthetic test report',retrievedAt:'2026-09-10',sha256:'a'.repeat(64)};
test('normalized reports preserve options, negative cash and accruals without double count',()=>{
  const accounts=reportAnalysisAccounts(report),r=analysePortfolio({source:{mode:'live',userScoped:true},connection:{status:'linked'},analysisAccounts:accounts},{asOf:'2026-09-10'});
  assert.equal(r.groups[0].reportedNav,890);assert.equal(r.groups[0].netValue,890);assert.equal(r.groups[0].reconciliation,0);
  assert.equal(r.groups[0].positions.filter(p=>p.kind==='cash').length,1);assert.equal(r.groups[0].longValue,1000);assert.equal(accounts[0].positions[1].multiplier,100);
});
test('absent numbers stay null while numeric zero is retained',()=>{
  const r=structuredClone(report);delete r.FlexStatement.OpenPosition[0].markPrice;r.FlexStatement.OpenPosition[0].positionValue=0;
  const p=reportAnalysisAccounts(r)[0].positions[0];assert.equal(p.price,null);assert.equal(p.localValue,0);
});
test('invalid report dates do not roll forward to another month',()=>{
  const r=structuredClone(report);r.FlexStatement.toDate='20260230';
  assert.equal(reportAnalysisAccounts(r)[0].reportDate,null);
});
test('import verifies every account owner and never replaces an existing file',()=>{
  assert.throws(()=>importOwnerReport({report,file:path.join(dir,'bad.sqlite'),expectedEmail:'not-owner@test',metadata}),/owner_not_verified/);
  assert.equal(fs.existsSync(path.join(dir,'bad.sqlite')),false);
  const file=path.join(dir,'owner.sqlite'),m=importOwnerReport({report,file,expectedEmail:'fixture@example.test',metadata});
  assert.equal(m.integrity,'ok');assert.throws(()=>importOwnerReport({report,file,expectedEmail:'fixture@example.test',metadata}),/exists/);
  const db=new DatabaseSync(file,{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM positions').get().n,5);db.close();
});
test('local snapshot requires explicit matching owner AND dev-only configuration',()=>{
  const file=path.join(dir,'guard.sqlite'),m=importOwnerReport({report,file,expectedEmail:'fixture@example.test',metadata});
  const env={API_AUTH_DEV_BYPASS:'true',INVESTMENT_WORKFLOW_ENABLED:'true',LOCAL_OWNER_PORTFOLIO_DB:file,LOCAL_OWNER_PORTFOLIO_HASH:m.ownerHash};
  assert.equal(localOwnerPortfolio({id:'local-dev-user'},env).analysisAccounts.length,1);
  for(const e of [{...env,NODE_ENV:'production'},{...env,API_AUTH_DEV_BYPASS:'false'},{...env,LOCAL_OWNER_PORTFOLIO_HASH:''}])assert.equal(localOwnerPortfolio({id:'local-dev-user'},e),null);
  assert.equal(localOwnerPortfolio({id:'another-user'},env),null);
  assert.throws(()=>localOwnerPortfolio({id:'local-dev-user'},{...env,LOCAL_OWNER_PORTFOLIO_HASH:'wrong'}),/owner_mismatch/);
});
test('private v2 round-trip retains cost basis and dated instrument MTM without credentials',()=>{
  const r=structuredClone(report);r.FlexStatement.fromDate=20260909;
  r.FlexStatement.OpenPosition[0].costBasisMoney=800;
  r.FlexStatement.MTMPerformanceSummaryInBase={MTMPerformanceSummaryUnderlying:{symbol:'AAA',conid:'123',assetCategory:'STK',total:12}};
  const file=path.join(dir,'v2.sqlite'),m=importOwnerReport({report:r,file,expectedEmail:'fixture@example.test',metadata});
  const env={API_AUTH_DEV_BYPASS:'true',INVESTMENT_WORKFLOW_ENABLED:'true',LOCAL_OWNER_PORTFOLIO_DB:file,LOCAL_OWNER_PORTFOLIO_HASH:m.ownerHash};
  const p=localOwnerPortfolio({id:'local-dev-user'},env),g=analysePortfolio(p,{asOf:'2026-08-28'}).groups[0];
  assert.equal(g.home.daily.pnl,12);assert.equal(g.home.unrealized.rows[0].pnl,200);
  assert.ok(!JSON.stringify(p).includes('fixture@example.test'));
  const db=new DatabaseSync(file);db.exec("UPDATE snapshot SET version='owner-portfolio-v1'");db.close();
  const legacy=localOwnerPortfolio({id:'local-dev-user'},env);
  assert.equal(legacy.analysisAccounts[0].dailyMtm,null);assert.equal(legacy.analysisAccounts[0].positions[0].costBasisMoney,null);
});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
