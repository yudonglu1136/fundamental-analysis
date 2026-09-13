#!/usr/bin/env node
// Explicitly scoped synchronization acceptance, NOT the full publication gate.
// Keeps the two known John Stamas failures visible; never certifies all data.
// node scripts/verify-guru-cache-sync-scope.mjs --db /release/research.sqlite --as-of YYYY-MM-DD
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { auditInvestmentGuruFile, inspectInvestmentGuruReadiness } from './audit-investment-guru-readiness.mjs';
import { InvestmentSource } from '../server/investmentSource.js';
import { opportunityBooks } from '../server/investmentOpportunities.js';

export const addedGuruIds = Object.freeze(['william-heard','evan-mcgoff','michael-cuggino','john-stamas']);
export const deferredFilingErrors = Object.freeze([
  {reportDate:'2022-03-31',accessionNumber:'0001766929-22-000002',code:'reported_value_error',nextQuarter:'2022-06-30'},
  {reportDate:'2025-09-30',accessionNumber:'0001766929-25-000005',code:'invalid_13f_identifier',nextQuarter:'2025-12-31'},
]);
const economicFields = ['reported13fValue','reported13fTableValue','commonLongValue','optionsNotional',
  'callOptionsNotional','putOptionsNotional','otherReportedValue','previous13fValue','previousCommonLongValue',
  'valueChange','valueChangePct','positionCount','reportedRowCount','optionPositionCount','otherReportedPositionCount',
  'newPositions','increasedPositions','reducedPositions','soldOutPositions','turnoverProxy','verifiedTradeSignals',
  'top10Weight','topHoldingWeight','concentrationHhi'];
const comparisonFields = ['previous13fValue','previousCommonLongValue','valueChange','valueChangePct',
  'newPositions','increasedPositions','reducedPositions','soldOutPositions','turnoverProxy','verifiedTradeSignals'];
const empty = value => Array.isArray(value)&&value.length===0;
const stat = file => {const s=fs.statSync(file);return {device:s.dev,inode:s.ino,bytes:s.size,mtimeMs:s.mtimeMs};};
const read = (db,table,id,years) => {
  const rows=db.prepare(`SELECT payload_json FROM ${table} WHERE guru_id=?${years===undefined?'':' AND years=?'}`)
    .all(...(years===undefined?[id]:[id,years]));
  if(rows.length!==1)return null;
  try{return JSON.parse(rows[0].payload_json);}catch{return null;}
};

function inspectScope(db,full) {
  const failures=[],knownFailures=[],quarantinedFilings=[],readerEvidence=[];
  const add=(reason,detail={})=>failures.push({reason,...detail});
  if(full.structuralFailures.length)add('public_source_structure_failed');
  if(full.profiles.failures.length)add('guru_profiles_not_complete');
  for(const id of addedGuruIds)if(!full.profiles.rows.some(p=>p.guruId===id&&!p.failures.length))add('added_guru_not_ready',{guruId:id});
  const expected = new Set(full.population.enabledManagerIds.flatMap(id=>full.population.requiredWindows.map(y=>`${id}:${y}`)));
  const deferredKeys = new Set(['john-stamas:5','john-stamas:10']);
  if([...deferredKeys].some(k=>!expected.has(k)))add('deferred_scope_not_in_enabled_catalog');
  if(full.curves.rows.length!==expected.size||new Set(full.curves.rows.map(r=>`${r.guruId}:${r.years}`)).size!==expected.size)
    add('required_curve_population_mismatch');
  for(const row of full.curves.rows) {
    const key=`${row.guruId}:${row.years}`;
    if(!expected.has(key)){add('unexpected_curve',{guruId:row.guruId,years:row.years});continue;}
    if(!deferredKeys.has(key)) {
      if(!row.displayable||row.failures.length)add('nondeferred_curve_not_compatible',{guruId:row.guruId,years:row.years,failures:row.failures});
      continue;
    }
    // Match the actual retained fail-closed computation, not any arbitrary
    // unavailable Stamas payload or a ready curve disguised as an exception.
    const p=read(db,'guru_backtests',row.guruId,row.years),q=p?.dataQuality?.proxyFailure;
    const proxy=read(db,'guru_backtest_proxies',row.guruId,row.years);
    const age=Date.parse(full.checkedAt)-Date.parse(p?.generatedAt);
    const known=p?.guru?.id==='john-stamas'&&p.status==='insufficient_data'&&empty(p.equity)
      &&p.summary&&Object.keys(p.summary).length===0&&p.method?.version===full.identity.strict
      &&p.method?.securityMasterVersion===full.identity.security&&Number(p.method?.years)===row.years
      &&p.method?.benchmark==='SPY'&&p.method?.minimumExecutionCoverage===.9
      &&p.dataQuality?.failurePolicy==='fail_closed'&&q?.code==='proxy_coverage_below_minimum'
      &&q.reportDate==='2022-03-31'&&q.executionDate==='2022-04-25'&&q.minimumCoverage===.3
      // Faulty filing values are redacted, not copied into the explanation.
      // Native status/time/identity remain intact; no return is recalculated.
      &&q.status==='source_error'&&q.sourceErrorCodes?.includes('reported_value_error')
      &&q.coveragePct===null&&empty(q.topExcludedHoldings)
      &&deferredFilingErrors.every(e=>p.dataQuality.sourceErrors?.some(x=>
        x.code===e.code&&x.reportDate===e.reportDate&&x.accessionNumber===e.accessionNumber))
      &&Number.isFinite(age)&&age>=-300000&&age<=48*3600000
      &&row.failures.length===1&&row.failures[0]==='missing_or_invalid_proxy_cache'&&!proxy;
    if(!known)add('deferred_failure_fingerprint_mismatch',{guruId:row.guruId,years:row.years});
    else knownFailures.push({guruId:row.guruId,years:row.years,status:p.status,generatedAt:p.generatedAt,
      reason:q.code,reportDate:q.reportDate,executionDate:q.executionDate,curvePresent:false});
  }
  if(full.curves.displayable!==expected.size-deferredKeys.size)add('compatible_curve_count_mismatch');
  if(full.comparison.managers!==full.population.enabledManagerIds.length-1
    ||full.comparison.failures.some(f=>f!=='study_population_incomplete')||full.comparison.commonObservations<3)
    add('common_history_comparison_failed');
  const exposure=read(db,'guru_exposure_snapshots','john-stamas');
  for(const item of deferredFilingErrors) {
    const h=(exposure?.history??[]).find(h=>h.accessionNumber===item.accessionNumber);
    const next=(exposure?.history??[]).filter(h=>h.reportDate===item.nextQuarter).at(-1);
    const present=h?.reportDate===item.reportDate&&h.status==='source_error'&&h.sourceErrorCodes?.includes(item.code)
      &&economicFields.every(k=>h[k]===null)&&empty(h.topHoldings)&&empty(h.largestChanges)
      &&exposure.meta?.blockedReportDates?.includes(item.reportDate)
      &&exposure.meta?.errors?.some(e=>e.code===item.code&&e.reportDate===item.reportDate&&e.accessionNumber===item.accessionNumber);
    if(!present)add('deferred_filing_not_explicitly_quarantined',{reportDate:item.reportDate});
    if(!next||next.status==='source_error'||next.comparisonStatus!=='previous_source_error'
      ||!next.topHoldings?.length||!comparisonFields.every(k=>next[k]===null)||!empty(next.largestChanges))
      add('post_gap_quarter_changes_not_suppressed',{reportDate:item.nextQuarter});
    if(present)quarantinedFilings.push({...item,status:h.status});
  }
  // No silently expanded exception list: any other quarantined profile/quarter
  // needs a separately reviewed deployment scope, not this command.
  for(const id of full.population.managerIds) {
    const p=read(db,'guru_exposure_snapshots',id);
    for(const h of p?.history??[])if(h.status==='source_error'&&
      !(id==='john-stamas'&&deferredFilingErrors.some(e=>e.accessionNumber===h.accessionNumber&&e.reportDate===h.reportDate)))
      add('unexpected_quarantined_filing',{guruId:id,reportDate:h.reportDate});
  }
  // Exercise the actual catalog/detail/matrix read adapters without creating
  // their server, private store, or another SQLite connection. The scatter's
  // pure audit is above; importing its backtest module would initialize legacy DB.
  const source=Object.assign(Object.create(InvestmentSource.prototype),{db});
  for(const id of addedGuruIds)try {
    const detail=source.guruDetail(id,full.asOf),latest=detail.latest;
    const book=opportunityBooks(source,full.asOf,latest?.reportDate).books.find(b=>b.guru.id===id);
    if(!detail.guru.name||!detail.guru.entityName||!detail.guru.avatar
      ||!detail.history.length||!latest?.topHoldings?.length||!book?.full||!book.holdings.length)
      add('added_guru_reader_not_compatible',{guruId:id});
    readerEvidence.push({guruId:id,name:detail.guru.name,entityName:detail.guru.entityName,
      avatar:detail.guru.avatar,availableFilings:detail.history.length,latestReportDate:latest?.reportDate,
      latestAccession:latest?.accessionNumber,fullCurrentBook:book?.full===true,commonHoldings:book?.holdings.length??0});
  }catch{add('added_guru_reader_not_compatible',{guruId:id});}
  return {auditVersion:'guru-cache-sync-scoped-v1',status:failures.length?'failed':'scoped_compatibility_pass_with_known_failures',
    scope:'Four added Guru profiles and compatible cached simulations. Exactly John Stamas 5Y/10Y remain unavailable; two source-error quarters stay visible. Not a full data release certificate.',
    fullDataReady:false,strictReleasePass:false,fullReadinessStatus:full.status,
    asOf:full.asOf,checkedAt:full.checkedAt,identity:full.identity,
    population:{profiles:full.profiles.expected,enabledManagers:full.population.enabledManagerIds.length,
      expectedCurves:expected.size,compatibleCurves:full.curves.displayable,deferredCurves:knownFailures.length},
    profiles:full.profiles,comparison:full.comparison,readerEvidence,knownFailures,quarantinedFilings,failures,
    attestation:'Existing computation timestamps are preserved. No root refresh generation is asserted or synthesized.',
    ...(full.source?{source:full.source}:{})};
}

export function inspectGuruCacheSyncScope(db,options) {
  return inspectScope(db,inspectInvestmentGuruReadiness(db,{...options,refreshGeneration:'',notBefore:''}));
}
export function verifyGuruCacheSyncFile(file,options) {
  const full=auditInvestmentGuruFile(file,{...options,refreshGeneration:'',notBefore:''});
  const before=stat(file);
  for(const key of Object.keys(before))if(before[key]!==full.source[key])throw Error('source_changed_during_audit');
  // The strict wrapper already rejected WAL/private schemas before opening.
  // Recheck its header before the second read-only transaction as well.
  const fd=fs.openSync(file,'r'),header=Buffer.alloc(20);
  try{fs.readSync(fd,header,0,20,0);}finally{fs.closeSync(fd);}
  if(header.toString('utf8',0,16)!=='SQLite format 3\0'||header[18]!==1||header[19]!==1
    ||fs.existsSync(`${file}-wal`)||fs.existsSync(`${file}-shm`))throw Error('public_database_not_self_contained');
  const db=new DatabaseSync(file,{readOnly:true});
  try{db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-8192; PRAGMA mmap_size=0; BEGIN;');return inspectScope(db,full);}
  finally{db.close();if(JSON.stringify(before)!==JSON.stringify(stat(file)))throw Error('source_changed_during_audit');}
}
export function parseScopedGuruArgs(argv) {
  const options={};
  for(let i=0;i<argv.length;i++) {
    const [key,inline]=argv[i].split(/=(.*)/s),name={'--db':'db','--as-of':'asOf'}[key];
    if(!name||options[name]!==undefined)throw Error('unknown_or_duplicate_argument');
    const value=inline??argv[++i];if(!value||value.startsWith('--'))throw Error('missing_argument_value');options[name]=value;
  }
  if(!options.db||!options.asOf)throw Error('explicit_research_db_and_as_of_required');return options;
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])) {
  try{const {db,...options}=parseScopedGuruArgs(process.argv.slice(2)),report=verifyGuruCacheSyncFile(db,options);
    console.log(JSON.stringify(report,null,2));if(report.status==='failed')process.exitCode=1;
  }catch(e){console.error(JSON.stringify({status:'failed',error:String(e.message).slice(0,180)}));process.exitCode=1;}
}
