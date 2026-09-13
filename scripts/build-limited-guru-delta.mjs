#!/usr/bin/env node
// Offline, explicitly limited release. No SEC/API calls, source repairs, DB
// initializer, curve recomputation, identity relabeling, or production writes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { XMLParser } from 'fast-xml-parser';
import { gurus, requiredGuruCurveWindows, manager13fPublicProxyAllowed } from '../server/gurus.js';
import { tickerForHolding } from '../server/cusipOverrides.js';
import { is13fCommonLongHolding } from '../server/thirteenF.js';
import { auditManager13fStrictReadyPayload } from '../server/backtestStrictAudit.js';
import { auditPublicHoldingsProxyPayload } from '../server/backtestProxyAudit.js';
import { auditPayload } from '../server/guruTurnoverMath.js';
import { currentGuruAuditIdentity } from './audit-investment-guru-readiness.mjs';

export const addedGuruIds = Object.freeze(['william-heard','evan-mcgoff','michael-cuggino','john-stamas']);
export const guruDeltaTables = Object.freeze({
  guru_snapshots:['guru_id','cik','type','generated_at','payload_json'],
  guru_exposure_snapshots:['guru_id','generated_at','payload_json'],
  guru_backtests:['guru_id','years','generated_at','start_date','end_date','payload_json'],
  guru_backtest_proxies:['guru_id','years','generated_at','start_date','end_date','method_version','payload_json']
});
export const deferredSourceErrors = Object.freeze([
  {code:'reported_value_error',reportDate:'2022-03-31',accessionNumber:'0001766929-22-000002',cusip:'60471A101',
    reason:'Original reported value is erroneous. A later restatement exists; it is not backdated or substituted in this limited release.'},
  {code:'invalid_13f_identifier',reportDate:'2025-09-30',accessionNumber:'0001766929-25-000005',cusip:'000000NAN',
    reason:'The original table repeats a placeholder CUSIP across unrelated issuers. Holdings and economic results are unavailable, not zero.'}
]);
const fail = code => { throw new Error(code); };
const requireThat = (ok,code) => {if(!ok)fail(code);};
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const close = (a,b) => typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10;
const keyFor = (table,row) => table.includes('backtest')?[row.guru_id,row.years]:[row.guru_id];
export const guruRowHash = (columns,row) => row?hash(JSON.stringify(columns.map(c=>row[c]))):null;
const readJson = file => JSON.parse(fs.readFileSync(file,'utf8'));
const fingerprint = file => {const s=fs.statSync(file);return {bytes:s.size,device:s.dev,inode:s.ino,mtimeMs:s.mtimeMs};};
export async function fileSha256(file) {const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}

const comparisonFields = ['previous13fValue','previousCommonLongValue','valueChange','valueChangePct',
  'newPositions','increasedPositions','reducedPositions','soldOutPositions','turnoverProxy','verifiedTradeSignals'];
const metadataFields = new Set(['accessionNumber','reportDate','filingDate','acceptanceDateTime','quarterLabel',
  'filing','valueSemantics','turnoverProxyBasis','topHoldings','largestChanges']);

export function quarantineDeferredHistory(exposure) {
  const output=clone(exposure);
  const bad=new Map(deferredSourceErrors.map(x=>[x.reportDate,x]));
  const following=new Set(['2022-06-30','2025-12-31']);
  for(const row of output.history??[]) {
    const issue=bad.get(row.reportDate);
    if(issue) {
      requireThat(row.accessionNumber===issue.accessionNumber,'quarantine_accession_mismatch');
      // Keep a dated failure node, never carry the previous book or remove the
      // date. All economic scalars are unknown, not zero/empty-book evidence.
      for(const key of Object.keys(row))if(!metadataFields.has(key))row[key]=null;
      row.topHoldings=[];row.largestChanges=[];
      row.status='source_error';row.sourceErrorCodes=[issue.code];
    } else if(following.has(row.reportDate)) {
      for(const key of comparisonFields)row[key]=null;
      row.largestChanges=[];row.comparisonStatus='previous_source_error';
    }
  }
  output.meta={...output.meta,blockedReportDates:[...new Set([...(output.meta?.blockedReportDates??[]),...bad.keys()])],
    errors:[...(output.meta?.errors??[]),...deferredSourceErrors.map(clone)]};
  output.latest=output.history.at(-1)??null;
  return output;
}

export function quarantineDeferredFailure(payload) {
  requireThat(payload.guru?.id==='john-stamas'&&payload.status==='insufficient_data','unexpected_deferred_failure');
  requireThat(payload.dataQuality?.proxyFailure?.code==='proxy_coverage_below_minimum'
    &&payload.dataQuality.proxyFailure.reportDate==='2022-03-31','unexpected_stamas_failure_identity');
  requireThat(!payload.equity?.length&&!payload.rebalances?.length&&!payload.quarterContributions?.length
    &&Object.keys(payload.summary??{}).length===0,'failed_cache_contains_returns');
  const output=clone(payload);
  // This is redaction of known untrustworthy failure diagnostics, NOT a new
  // simulation. Original generation/time/method remain untouched and are bound
  // to their original row digest in the operator manifest.
  output.dataQuality.sourceErrors=deferredSourceErrors.map(clone);
  output.dataQuality.coverageFailures=(output.dataQuality.coverageFailures??[]).map(row=>
    deferredSourceErrors.some(e=>e.reportDate===row.reportDate)
      ?{reportDate:row.reportDate,executionDate:row.executionDate,status:'source_error',
        coveragePct:null,unpricedPositions:[],sourceErrorCodes:deferredSourceErrors.filter(e=>e.reportDate===row.reportDate).map(e=>e.code)}:row);
  const p=output.dataQuality.proxyFailure;
  output.dataQuality.proxyFailure={...p,coveragePct:null,topExcludedHoldings:[],status:'source_error',sourceErrorCodes:['reported_value_error']};
  return output;
}

function cachedTable(stageDirectory,filing) {
  const url=filing.xmlUrl;
  requireThat(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/.+\.xml$/i.test(url??''),'official_table_required');
  const file=path.join(stageDirectory,'sec-sources',hash(url)+'.json'),receipt=readJson(file);
  requireThat(receipt.url===url&&receipt.status===200&&hash(receipt.body)===receipt.sha256,'official_receipt_mismatch');
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseTagValue:false,removeNSPrefix:true,trimValues:true});
  const parsed=parser.parse(receipt.body),raw=parsed.informationTable?.infoTable;
  const rows=Array.isArray(raw)?raw:raw?[raw]:[];
  requireThat(rows.length>0,'official_table_empty');
  const num=x=>{const n=Number(String(x??'').replaceAll(',',''));requireThat(Number.isFinite(n)&&n>=0,'invalid_source_number');return n;};
  const holdings=rows.map(r=>({cusip:String(r.cusip??'').toUpperCase(),issuer:r.nameOfIssuer,title:r.titleOfClass,
    shareType:r.shrsOrPrnAmt?.sshPrnamtType,putCall:String(r.putCall??'').toUpperCase(),
    value:num(r.value),shares:num(r.shrsOrPrnAmt?.sshPrnamt)}));
  // This bounded verifier checks only the new managers' 2026 latest/prior
  // modern-USD filings. It is not a second historical parser/unit heuristic.
  requireThat(filing.reportDate>='2026-01-01','modern_latest_pair_required');
  for(const h of holdings)requireThat(/^[0-9A-Z*@#]{9}$/.test(h.cusip)&&!/^0+(NAN|NULL)$/.test(h.cusip),'invalid_latest_cusip');
  const grouped=new Map();
  for(const h of holdings.filter(is13fCommonLongHolding)) {
    const key=h.cusip,prior=grouped.get(key);
    if(prior){prior.value+=h.value;prior.shares+=h.shares;}else grouped.set(key,{...h,id:`${h.cusip}-COMMON`});
  }
  return {holdings:[...grouped.values()].sort((a,b)=>b.value-a.value),receipt:{url,sha256:receipt.sha256,fetchedAt:receipt.fetchedAt},
    reportedRows:rows.length,reportedValue:holdings.reduce((a,h)=>a+h.value,0)};
}

export function validateLatestPair(stage,official,previousOfficial,catalogGuru,asOf) {
  const s=stage.snapshot,e=stage.exposure;
  requireThat(s?.id===catalogGuru.id&&e?.guru?.id===catalogGuru.id&&s.type==='manager13f','snapshot_identity_mismatch');
  for(const p of [s,e.guru])requireThat(p.cik===catalogGuru.cik&&p.entityName===catalogGuru.entityName,'profile_filer_mismatch');
  requireThat(s.latestFiling?.filerCik===catalogGuru.cik&&s.previousFiling?.filerCik===catalogGuru.cik,'filing_cik_mismatch');
  requireThat(s.summary.reportDate===e.latest?.reportDate&&s.latestFiling.accessionNumber===e.latest?.accessionNumber
    &&s.summary.filingDate<=asOf&&s.latestFiling.acceptanceDateTime?.slice(0,10)<=asOf,'latest_surface_mismatch');
  requireThat(stage.validationErrors.length===0&&stage.duplicateAccessions.length===0,'staging_validation_failed');
  const seen=new Set();
  for(const h of e.history) {requireThat(!seen.has(h.accessionNumber),'duplicate_history_accession');seen.add(h.accessionNumber);
    requireThat(h.filing?.filerCik===catalogGuru.cik&&h.reportDate<=h.filingDate&&h.filingDate<=asOf,'history_pit_identity_mismatch');}
  const holdings=s.holdings,source=official.holdings,previous=previousOfficial.holdings;
  const sourceById=new Map(source.map(h=>[h.id,h])),previousById=new Map(previous.map(h=>[h.id,h]));
  requireThat(holdings.length===source.length&&s.summary.totalPositions===source.length,'latest_position_count_mismatch');
  const total=source.reduce((a,h)=>a+h.value,0),previousTotal=previous.reduce((a,h)=>a+h.value,0);
  requireThat(close(total,s.summary.totalValue)&&close(previousTotal,s.summary.previousValue)
    &&close(official.reportedValue,s.summary.reported13fTableValue),'latest_value_reconciliation_failed');
  for(let i=0;i<holdings.length;i++) {
    const h=holdings[i],raw=sourceById.get(h.id);
    requireThat(raw&&close(h.value,raw.value)&&close(h.shares,raw.shares)&&close(h.pctPortfolio,raw.value/total),'holding_source_mismatch');
    requireThat(!i||holdings[i-1].value>=h.value,'holding_rank_mismatch');
    requireThat(h.ticker===tickerForHolding(h,{guruId:s.id,reportDate:s.summary.reportDate,accessionNumber:s.latestFiling.accessionNumber}),'latest_security_master_mismatch');
  }
  const expected=new Map();
  for(const id of new Set([...sourceById.keys(),...previousById.keys()])) {
    const a=sourceById.get(id),b=previousById.get(id),delta=(a?.shares??0)-(b?.shares??0);
    const action=!b?'new':!a?'sold_out':delta>0?'increased':delta<0?'reduced':'unchanged';
    if(action!=='unchanged')expected.set(id,{action,shares:a?.shares??0,prevShares:b?.shares??0,changeShares:delta});
  }
  requireThat(s.activity.length===expected.size,'latest_activity_count_mismatch');
  const activitySeen=new Set();
  for(const a of s.activity){const b=expected.get(a.id);requireThat(b&&!activitySeen.has(a.id),'latest_activity_identity_mismatch');activitySeen.add(a.id);
    requireThat(a.action===b.action&&close(a.shares,b.shares)&&close(a.prevShares,b.prevShares)&&close(a.changeShares,b.changeShares),'latest_activity_source_mismatch');}
  for(const [field,action] of Object.entries({newPositions:'new',increasedPositions:'increased',reducedPositions:'reduced',soldOutPositions:'sold_out'}))
    requireThat(s.summary[field]===[...expected.values()].filter(x=>x.action===action).length,'activity_summary_mismatch');
  requireThat(close(s.summary.top10Weight,source.slice(0,10).reduce((a,h)=>a+h.value,0)/total),'concentration_mismatch');
  return {guruId:s.id,cik:s.cik,entityName:s.entityName,reportDate:s.summary.reportDate,filingDate:s.summary.filingDate,
    accession:s.latestFiling.accessionNumber,holdings:holdings.length,activity:s.activity.length,
    generatedAt:s.generatedAt,exposureGeneratedAt:e.generatedAt,historyRows:e.history.length,
    parsedAvailableQuarters:stage.history.length,olderParseFailures:stage.filingErrors.length,
    excludedAmendments:stage.excludedFilings.length,latestSource:official.receipt,previousSource:previousOfficial.receipt,
    validation:'latest_current_sm_official_values_shares_rank_weight_activity_pass'};
}

function curveIdentity(p,id,years,versions,proxy=false) {
  return p?.guru?.id===id&&p.method?.version===versions.strict&&p.method?.securityMasterVersion===versions.security
    &&p.method?.years===years&&p.method?.benchmark==='SPY'&&(!proxy||(p.method.variant===versions.proxy
      &&p.proxy?.methodVersion===versions.proxy&&p.proxy.securityMasterVersion===versions.security));
}

export function collectCacheRows(db,{catalog=gurus,versions=currentGuruAuditIdentity()}={}) {
  const rows={guru_backtests:[],guru_backtest_proxies:[]},audit=[];
  for(const g of catalog.filter(g=>g.type==='manager13f'&&!g.disableSimulation))for(const years of requiredGuruCurveWindows) {
    const r=db.prepare('SELECT * FROM guru_backtests WHERE guru_id=? AND years=?').get(g.id,years);
    requireThat(r,'required_strict_cache_missing');const s=JSON.parse(r.payload_json);
    requireThat(curveIdentity(s,g.id,years,versions)&&s.generatedAt===r.generated_at,'incompatible_strict_cache');
    const sourceHash=guruRowHash(guruDeltaTables.guru_backtests,r);
    let basis=null,selected=null,proxyRow=null;
    if(s.status==='ready') {requireThat(auditManager13fStrictReadyPayload(s).ok,'strict_audit_failed');selected=s;basis='strict';}
    else if(s.status==='insufficient_data') {
      proxyRow=db.prepare('SELECT * FROM guru_backtest_proxies WHERE guru_id=? AND years=?').get(g.id,years);
      if(proxyRow) {
        const p=JSON.parse(proxyRow.payload_json);
        requireThat(manager13fPublicProxyAllowed(g.id,years)&&curveIdentity(p,g.id,years,versions,true)
          &&p.status==='proxy_ready'&&p.generatedAt===s.generatedAt&&proxyRow.generated_at===p.generatedAt
          &&p.proxy.strictFailureGeneratedAt===s.generatedAt&&p.refreshGeneration===s.refreshGeneration,'incompatible_linked_proxy');
        requireThat(auditPublicHoldingsProxyPayload(p).ok,'proxy_audit_failed');selected=p;basis='proxy';
      } else {
        requireThat(g.id==='john-stamas','unapproved_missing_curve');
        r.payload_json=JSON.stringify(quarantineDeferredFailure(s));basis='deferred_source_error';
      }
    } else fail('unexpected_strict_status');
    if(selected)auditPayload(selected);
    rows.guru_backtests.push(r);if(proxyRow)rows.guru_backtest_proxies.push(proxyRow);
    audit.push({guruId:g.id,years,basis,generatedAt:s.generatedAt,refreshGeneration:s.refreshGeneration??null,
      securityMasterVersion:s.method.securityMasterVersion,strictStatus:s.status,
      sourceStrictRowSha256:sourceHash,outputStrictRowSha256:guruRowHash(guruDeltaTables.guru_backtests,r),
      ...(proxyRow?{sourceProxyRowSha256:guruRowHash(guruDeltaTables.guru_backtest_proxies,proxyRow)}:{}),
      endDate:selected?.window?.end??s.window?.end,displayable:!!selected});
  }
  return {rows,audit,versions};
}

export async function buildLimitedGuruDelta({base,cacheDb,staging,output,asOf,waiver}) {
  requireThat(waiver==='limited-guru-release-2026-09-13','explicit_limited_release_waiver_required');
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(asOf??'')&&Number.isFinite(Date.parse(asOf)),'as_of_required');
  requireThat(!fs.existsSync(output),'output_must_not_exist');
  const initial={base:fingerprint(base),cache:fingerprint(cacheDb)};
  const baseDb=new DatabaseSync(base,{readOnly:true}),cache=new DatabaseSync(cacheDb,{readOnly:true});
  baseDb.exec('BEGIN');cache.exec('BEGIN');
  const profiles=[],profileRows={guru_snapshots:[],guru_exposure_snapshots:[]},stageProof=[];
  let cacheResult;
  try {
    for(const id of addedGuruIds) {
      const file=path.join(staging,id+'.json'),sourceText=fs.readFileSync(file,'utf8'),stage=JSON.parse(sourceText);
      const g=gurus.find(g=>g.id===id);requireThat(g,'catalog_guru_missing');
      profiles.push(validateLatestPair(stage,cachedTable(staging,stage.snapshot.latestFiling),cachedTable(staging,stage.snapshot.previousFiling),g,asOf));
      const snapshot=clone(stage.snapshot);let exposure=clone(stage.exposure);
      delete exposure.cache;if(exposure.source)delete exposure.source.localDatabase;
      exposure.meta={...exposure.meta,errors:[...(exposure.meta?.errors??[]),...stage.filingErrors.map(e=>({
        code:e.message,reportDate:e.reportDate,accessionNumbers:e.accessionNumbers,
        reason:'Older original filing could not be parsed; historical coverage is incomplete.'}))]};
      if(id==='john-stamas') {
        exposure=quarantineDeferredHistory(exposure);
        snapshot.dataQuality={...snapshot.dataQuality,blockedReportDates:deferredSourceErrors.map(e=>e.reportDate),
          errors:[...(snapshot.dataQuality?.errors??[]),...deferredSourceErrors.map(clone)]};
      }
      profileRows.guru_snapshots.push({guru_id:id,cik:g.cik,type:g.type,generated_at:snapshot.generatedAt,payload_json:JSON.stringify(snapshot)});
      profileRows.guru_exposure_snapshots.push({guru_id:id,generated_at:exposure.generatedAt,payload_json:JSON.stringify(exposure)});
      stageProof.push({guruId:id,stageFileSha256:hash(sourceText),stagedAt:stage.stagedAt});
    }
    cacheResult=collectCacheRows(cache);
    fs.mkdirSync(output,{recursive:false});
    const deltaPath=path.join(output,'guru-delta.sqlite'),delta=new DatabaseSync(deltaPath);
    const manifest={version:'investment-guru-delta-v1',createdAt:new Date().toISOString(),asOf,
      authorization:{scope:waiver,userInstruction:'四个新guru和缓存 同步 发布上线 申报错误不要管了',
        status:'limited_release_with_deferred_source_errors',full13fRefreshSuccess:false,fullMatrixPass:false,
        waived:['single_root_refresh_generation','all_enabled_curves_displayable','source_filing_repairs'],
        retained:['current_method_and_security_master','strict_and_proxy_coverage_floors','real_source_generation_times','public_only_exact_row_delta']},
      scope:{snapshotGuruIds:[...addedGuruIds].sort(),cacheGuruIds:gurus.filter(g=>g.type==='manager13f'&&!g.disableSimulation).map(g=>g.id).sort(),years:[...requiredGuruCurveWindows]},
      baseResearch:{bytes:initial.base.bytes,sha256:await fileSha256(base)},tables:{},
      sourceProof:{stages:stageProof,curveIdentity:cacheResult.versions,curveRows:cacheResult.audit},
      profiles,deferredSourceErrors:deferredSourceErrors.map(clone),limitations:[
        'No filing source or security-master repair was performed.',
        'The two Defender windows remain insufficient_data; no curve, proxy, or zero return is substituted.',
        'Two corrupt Defender quarter nodes retain dates/source metadata with unknown economic data. Next-quarter comparisons are unavailable.',
        'Older unparsed originals and excluded amendments remain explicit; this is not a complete historical backfill.',
        'Valid caches preserve their original payload JSON, method identity, generatedAt, and refreshGeneration; no new computation is claimed.',
        'No price, financial, strategy-warehouse, portfolio, user, credential, or dashboard rows are in this delta.']};
    try {
      delta.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE');
      const allRows={...profileRows,...cacheResult.rows};
      for(const [table,columns] of Object.entries(guruDeltaTables)) {
        const sql=baseDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql;
        requireThat(sql,'base_table_missing');delta.exec(sql);
        const actual=delta.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);
        requireThat(JSON.stringify(actual)===JSON.stringify(columns),'source_table_schema_mismatch');
        const rows=allRows[table],after=new Map(rows.map(r=>[JSON.stringify(keyFor(table,r)),r]));
        const keys=table.includes('backtest')?manifest.scope.cacheGuruIds.flatMap(id=>manifest.scope.years.map(y=>[id,y])):manifest.scope.snapshotGuruIds.map(id=>[id]);
        const operations=[];
        const insert=delta.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
        const beforeStmt=baseDb.prepare(`SELECT * FROM ${table} WHERE guru_id=?${table.includes('backtest')?' AND years=?':''}`);
        for(const key of keys.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:1)) {
          const row=after.get(JSON.stringify(key)),before=beforeStmt.get(...key);
          operations.push({key,beforeSha256:guruRowHash(columns,before),afterSha256:guruRowHash(columns,row)});
          if(row)insert.run(...columns.map(c=>row[c]));
        }
        requireThat(rows.length===operations.filter(o=>o.afterSha256!==null).length,'surprise_delta_row');
        manifest.tables[table]={columns,operations};
      }
      delta.exec('COMMIT');
      requireThat(delta.prepare('PRAGMA integrity_check').get().integrity_check==='ok','delta_integrity_failed');
      requireThat(delta.prepare('PRAGMA foreign_key_check').all().length===0,'delta_foreign_key_failed');
    }finally{delta.close();}
    manifest.delta={bytes:fs.statSync(deltaPath).size,sha256:await fileSha256(deltaPath),file:'guru-delta.sqlite'};
    requireThat(JSON.stringify(initial.base)===JSON.stringify(fingerprint(base))&&JSON.stringify(initial.cache)===JSON.stringify(fingerprint(cacheDb)),'source_changed_during_build');
    fs.writeFileSync(path.join(output,'guru-delta-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    return manifest;
  }finally{baseDb.close();cache.close();}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,x,i,all)=>x.startsWith('--')?[...pairs,[x.slice(2),all[i+1]]]:pairs,[]));
  try {const m=await buildLimitedGuruDelta({base:args.base,cacheDb:args['cache-db'],staging:args.staging,output:args.output,asOf:args['as-of'],waiver:args.waiver});
    console.log(JSON.stringify({status:'limited_delta_built_not_deployed',delta:m.delta,profiles:m.profiles.map(p=>({guruId:p.guruId,holdings:p.holdings,historyRows:p.historyRows})),
      cacheSlots:m.sourceProof.curveRows.length,displayable:m.sourceProof.curveRows.filter(r=>r.displayable).length,output:args.output},null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
