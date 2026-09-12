import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const fail = code => {throw Object.assign(new Error(code), {code});};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{40}$/;
const safeCodes = new Set(['invalid_arguments','production_environment_required','private_storage_required',
  'inventory_unavailable','inventory_count_mismatch','owner_identity_unverified','owner_mapping_mismatch',
  'duplicate_owner','connection_unreadable','connection_changed','report_not_current','report_not_persisted']);
const safeCode = error => safeCodes.has(error?.code) ? error.code : 'broker_or_storage_failure';

// Runs only through an explicitly authorized operator command, never an HTTP
// impersonation route. All owners are checked before the first broker request.
// Injected dependencies let tests exercise this with no real users or network.
export async function primeUserPortfolioReports(deps, {expectedConnected,expectedUsers}={}) {
  if (!Number.isSafeInteger(expectedConnected) || expectedConnected<1 ||
    (expectedUsers!==undefined && (!Number.isSafeInteger(expectedUsers)||expectedUsers<expectedConnected))) fail('invalid_arguments');
  const inventory = await deps.listUsers();
  if (!Array.isArray(inventory?.users)) fail('inventory_unavailable');
  const rows=inventory.users;
  if (rows.some(r=>['decrypt_error','read_error'].includes(r.connection?.status))) fail('connection_unreadable');
  const connected=rows.filter(r=>r.connection?.configured===true);
  if (connected.length!==expectedConnected || (expectedUsers!==undefined && rows.length!==expectedUsers)) fail('inventory_count_mismatch');
  const ids=new Set(),hashes=new Set(),targets=[];
  for (const row of connected) {
    // Supabase is the site's production identity source. No dev identity,
    // orphan-directory fallback, email guess, or adminPortfolioHash override.
    if (!uuid.test(row.userId||'') || row.provider==='local-dev' || row.isAnonymous===true || !hash.test(row.userHash||'')) fail('owner_identity_unverified');
    if (ids.has(row.userId)||hashes.has(row.userHash)) fail('duplicate_owner');
    ids.add(row.userId);hashes.add(row.userHash);
    const user={id:row.userId};
    const info=await deps.userInfo(user);
    if (!info?.exists || info.userHash!==row.userHash || deps.ownerHash(row.userId)!==row.userHash) fail('owner_mapping_mismatch');
    const connection=await deps.readConnection(user);
    if (!connection?.configured || connection.config?.provider!=='ibkr_flex' || !connection.revision) fail('connection_unreadable');
    targets.push({user,revision:connection.revision});
  }
  const result={status:'complete',usersObserved:rows.length,connected:targets.length,attempted:0,persisted:0,
    failed:0,reportDates:[],failures:{}};
  const dates=new Set();
  for (const {user,revision} of targets) {
    result.attempted++;
    try {
      const connection=await deps.readConnection(user);
      if (connection?.revision!==revision) fail('connection_changed');
      deps.clearCache(user);
      // Operator priming persists the broker report, not a rewrite of existing
      // NAV history. Regular user sync retains its normal NAV capture behavior.
      const payload=await deps.loadDashboard({user,forceRefresh:true,captureNav:false});
      if (payload?.freshness?.status!=='current_report' || !['live','multi_account_live'].includes(payload.source?.mode)) fail('report_not_current');
      const saved=await deps.readReport(user);
      const after=await deps.readConnection(user);
      if (after?.revision!==revision) fail('connection_changed');
      if (!saved || saved.reportAsOf!==payload.freshness.reportAsOf ||
        saved.retrievedAt!==payload.freshness.retrievedAt || saved.payload?.source?.asOf!==saved.reportAsOf) fail('report_not_persisted');
      result.persisted++;dates.add(saved.reportAsOf);
    } catch(error) {
      result.failed++;const code=safeCode(error);result.failures[code]=(result.failures[code]||0)+1;
    } finally {deps.clearCache(user);}
  }
  result.reportDates=[...dates].sort();
  if (result.failed) result.status='incomplete';
  return result;
}

async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{apply:{type:'boolean'},
    'expected-connected':{type:'string'},'expected-users':{type:'string'}}});
  const expectedConnected=Number(values['expected-connected']);
  const expectedUsers=values['expected-users']===undefined?undefined:Number(values['expected-users']);
  if (!values.apply || positionals.length) fail('invalid_arguments');
  const secret=process.env.PORTFOLIO_CREDENTIALS_KEY||process.env.SUPABASE_JWT_SECRET;
  if (process.env.NODE_ENV!=='production'||process.env.API_AUTH_DEV_BYPASS==='true'||!secret) fail('production_environment_required');
  if (![process.env.SQLITE_DB_PATH,process.env.USER_PORTFOLIO_DATA_DIR,process.env.USER_DATA_ROOT].some(v=>v&&path.isAbsolute(v))) fail('private_storage_required');
  const {resolveUserDataPaths}=await import('../server/userDataPaths.js');
  const locations=resolveUserDataPaths();
  if (!fs.existsSync(locations.portfolios)||!fs.existsSync(locations.registry)) fail('private_storage_required');
  const store=await import('../server/userPortfolioStore.js');
  const client=await import('../server/portfolioClient.js');
  try {
    const result=await primeUserPortfolioReports({listUsers:store.listAdminPortfolioUsers,
      userInfo:store.userPortfolioInfo,readConnection:store.readPortfolioConnection,
      ownerHash:id=>crypto.createHmac('sha256',secret).update(id).digest('hex').slice(0,40),
      loadDashboard:client.loadPortfolioDashboard,readReport:store.readUserPortfolioReport,
      clearCache:client.clearPortfolioCache},{expectedConnected,expectedUsers});
    // Intentionally exclude owner IDs/hashes, emails, account numbers, NAV,
    // holdings, credentials and raw exception messages from the receipt.
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode=1;
  } finally {store.closeUserPortfolioStores();}
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(JSON.stringify({status:'failed',error:safeCode(error)}));process.exitCode=1;});
}
