// Operator-only compatibility evidence. No server startup, legacy initializer,
// account-store construction, network request, or source/cache update occurs.
// Run from the reviewed deployed code with its real production environment:
//   node scripts/smoke-investment-runtime-readonly.mjs
// The operator may supply the reviewed activation environment before activation.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveInvestmentRuntimeConfig, INVESTMENT_ALLOWED_SOURCE_TABLES, INVESTMENT_REQUIRED_SOURCE_TABLES } from '../server/investmentRuntimeConfig.js';
import { InvestmentSource } from '../server/investmentSource.js';
import { openStrategyDatabase, storedStrategyCatalog } from '../server/strategyDatabase.js';
import { enabledManager13fGurus, manager13fPublicProxyAllowed, requiredGuruCurveWindows } from '../server/gurus.js';
import { holdingResolutionVersion } from '../server/cusipOverrides.js';
import { auditManager13fStrictReadyPayload } from '../server/backtestStrictAudit.js';
import { auditPublicHoldingsProxyPayload } from '../server/backtestProxyAudit.js';

const strategyTables = ['corporate_actions','coverage_issues','document_holdings','etf_catalog','filing_holdings','filing_manifest','filings','financial_metrics','financial_records','guidance_events','holding_resolutions','manager_entities','managers','model_price_evidence','price_observations','price_series','security_identifiers','source_documents','valuation_metrics','valuation_nodes','warehouse_meta'];
const compositionTables = ['audit','prices','series','source_responses'];
const fail = message => { throw new Error(message); };
const fingerprint = file => {
  const s=fs.statSync(file); return {device:s.dev,inode:s.ino,bytes:s.size,mtimeMs:s.mtimeMs};
};
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);

export function inspectPublicSchema(file, required, allowed, {allowedViews=[]}={}) {
  const before=fingerprint(file), db=new DatabaseSync(file,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000;');
    const journal=db.prepare('PRAGMA journal_mode').get().journal_mode;
    if(journal!=='delete')fail('public_database_not_self_contained');
    if(fs.existsSync(`${file}-wal`)||fs.existsSync(`${file}-shm`))fail('public_database_sidecars_present');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
    if(required.some(t=>!tables.includes(t)))fail('public_database_required_table_missing');
    if(tables.some(t=>!allowed.includes(t)&&!['sqlite_stat1','sqlite_stat4'].includes(t)))fail('public_database_unexpected_table');
    if(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n)fail('public_database_unexpected_trigger');
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all().some(v=>!allowedViews.includes(v.name)))fail('public_database_unexpected_view');
    return {tables:tables.length,journal,queryOnly:db.prepare('PRAGMA query_only').get().query_only===1};
  } finally {
    db.close();if(!same(before,fingerprint(file)))fail('public_database_changed_during_smoke');
  }
}

// Read declarations without importing backtest.js: that module imports the
// legacy writable initializer. This diagnostic must never open the old DB.
function methodVersions() {
  const text=fs.readFileSync(new URL('../server/backtest.js',import.meta.url),'utf8');
  const read=name=>text.match(new RegExp(`export const ${name} = ["']([^"']+)["'];`))?.[1]??fail('backtest_method_declaration_not_recognized');
  return {strict:read('manager13fBacktestMethodVersion'),proxy:read('manager13fProxyMethodVersion'),security:holdingResolutionVersion()};
}

export function cacheEvidence(db, versions=methodVersions()) {
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  const read=table=>tables.has(table)?new Map(db.prepare(`SELECT guru_id,years,payload_json FROM ${table} WHERE years IN (5,10)`).all().map(r=>{
    let p=null;try{p=JSON.parse(r.payload_json);}catch{}return [`${r.guru_id}:${r.years}`,p];
  })):new Map();
  const strict=read('guru_backtests'),proxies=read('guru_backtest_proxies'),windows={};
  const identity=(p,y,id)=>p?.method?.version===versions.strict&&p?.method?.securityMasterVersion===versions.security
    &&String(p?.method?.years)===String(y)&&(!p?.guru?.id||p.guru.id===id);
  for(const years of requiredGuruCurveWindows) {
    const reasons={};let readyUpperBound=0;
    for(const g of enabledManager13fGurus) {
      const s=strict.get(`${g.id}:${years}`),p=proxies.get(`${g.id}:${years}`);let reason;
      if(!s)reason='missing_strict_cache';
      else if(!identity(s,years,g.id))reason='incompatible_strict_identity';
      else if(s.status==='ready'&&auditManager13fStrictReadyPayload(s).ok&&s.equity?.length>=3)readyUpperBound++;
      else if(s.status==='insufficient_data'&&manager13fPublicProxyAllowed(g.id,years)
        &&identity(p,years,g.id)&&p.status==='proxy_ready'&&p.method?.variant===versions.proxy
        &&p.proxy?.methodVersion===versions.proxy&&p.proxy?.securityMasterVersion===versions.security
        &&p.proxy?.strictFailureGeneratedAt===s.generatedAt
        &&(!(s.refreshGeneration||p.refreshGeneration)||(s.refreshGeneration&&s.refreshGeneration===p.refreshGeneration))
        &&auditPublicHoldingsProxyPayload(p).ok&&p.equity?.length>=3)readyUpperBound++;
      else reason='not_a_current_covered_ready_cache';
      if(reason)reasons[reason]=(reasons[reason]??0)+1;
    }
    windows[`${years}Y`]={expected:enabledManager13fGurus.length,readyUpperBound,unavailable:enabledManager13fGurus.length-readyUpperBound,reasons};
  }
  return {versions,windows,scope:'Necessary identity/coverage checks only. No freshness, common-date, turnover reconciliation or full-generation release certification. A zero upper bound proves no comparable study curves; a nonzero upper bound is not a publishable-curve claim.'};
}

export function smokeInvestmentRuntime(env=process.env) {
  if(env.NODE_ENV!=='production'||env.INVESTMENT_WORKFLOW_ENABLED!=='true')fail('production_activation_environment_required');
  const config=resolveInvestmentRuntimeConfig(env);
  const manifest=JSON.parse(fs.readFileSync(env.INVESTMENT_RELEASE_MANIFEST_PATH,'utf8'));
  const before=Object.fromEntries(['research','strategy','composition'].map(k=>[k,fingerprint(config[k])]));
  // Legacy contents and private rows remain outside the check. The runtime
  // resolver already validates collisions and private journal owner format.
  const schemas={
    research:inspectPublicSchema(config.research,INVESTMENT_REQUIRED_SOURCE_TABLES,INVESTMENT_ALLOWED_SOURCE_TABLES),
    strategy:inspectPublicSchema(config.strategy,strategyTables,strategyTables,{allowedViews:['coverage_summary','verified_common_holdings']}),
    composition:inspectPublicSchema(config.composition,compositionTables,compositionTables)
  };
  const warehouse=openStrategyDatabase(config.strategy);
  let generation;
  try {generation={manifest:warehouse.meta.manifest_hash,security:warehouse.meta.security_version,actions:warehouse.meta.action_version,cutoff:warehouse.meta.cutoff};}
  finally{warehouse.close();}
  const source=new InvestmentSource(config.research);
  let research,gurus;
  try {
    const catalog=source.guruCatalog(),profileIds=new Set(catalog.map(g=>g.id));
    research=['GOOGL','PLTR','AVGO'].map(ticker=>{
      const p=source.company(ticker,config.cutoff);
      if(p.snapshot.availableAt>config.cutoff||p.snapshot.source.availableAt>config.cutoff||p.snapshot.price.date>config.cutoff)fail('future_research_source');
      return {ticker,period:p.snapshot.period,availableAt:p.snapshot.availableAt,quoteDate:p.snapshot.price.date,historyNodes:p.history.length,scenarioAvailable:!!p.templates};
    });
    gurus={publicProfiles:catalog.length,missingEnabledProfiles:enabledManager13fGurus.filter(g=>!profileIds.has(g.id)).map(g=>g.id),cacheEvidence:cacheEvidence(source.db)};
  }finally{source.close();}
  const strategy=storedStrategyCatalog(config.strategy,config.cutoff);
  if(strategy.storage.generation!==generation.manifest)fail('strategy_generation_inconsistent');
  for(const key of ['research','strategy','composition'])if(!same(before[key],fingerprint(config[key])))fail('immutable_public_file_changed');
  return {status:'compatibility_pass',runtime:process.version,releaseId:config.releaseId,cutoff:config.cutoff,
    installedManifestVerified:true,fileChecks:Object.fromEntries(['research','strategy','composition'].map(key=>[key,{bytes:manifest.files[key].bytes,sha256:manifest.files[key].sha256,schema:schemas[key]}])),
    checksumScope:'Root-owned installer attestation; no repeat 8 GB hash scan in this smoke.',generation,research,gurus,
    strategy:{managers:strategy.managers.length,etfs:strategy.etfs.map(e=>({ticker:e.ticker,first:e.first,last:e.last}))},
    boundaries:{legacyDatabaseSelectedForHealth:env.SQLITE_DB_PATH,isolatedPublicResearch:config.research,legacyDatabaseOpenedBySmoke:false,privateStoreCreated:false,networkUsed:false,sourceUpdates:false},
    healthScope:'This is data/code compatibility, not full application readiness. /api/health still reads the preserved legacy database and enforces all current 5Y/10Y Guru outcomes plus freshness. Isolated UI data does not override that health baseline. Financial freshness and authenticated user-flow acceptance require separate checks.'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])) {
  try {console.log(JSON.stringify(smokeInvestmentRuntime(),null,2));}
  catch(error){console.error(JSON.stringify({status:'compatibility_failed',error:String(error.message).slice(0,180)}));process.exitCode=1;}
}
