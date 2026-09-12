import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Public/licensed research only. In particular, never copy portfolio_nav_points,
// login/registry/credentials, background jobs, private research events, or any
// newly introduced table just because it happens to share the runtime file.
export const investmentResearchTables = Object.freeze([
  'price_points', 'guru_snapshots', 'guru_exposure_snapshots', 'guru_backtests',
  'guru_backtest_proxies', 'valuation_pit_source_metadata', 'valuation_pit_financials',
  'valuation_pit_guidance', 'valuation_pit_model_runs', 'valuation_pit_price_observations',
  'valuation_ticker_snapshots', 'valuation_snapshots', 'investment_quality_annual',
  'investment_quality_metadata',
]);
const quoted = name => `"${name.replaceAll('"', '""')}"`;
const exists = file => { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const fileHash = async file => {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { integer: String(v) }
  : v instanceof Uint8Array ? { blob: Buffer.from(v).toString('base64') } : v);
function fingerprint(db, schema, table) {
  const columns = db.prepare(`PRAGMA ${schema}.table_info(${quoted(table)})`).all();
  const keys = columns.filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => c.name);
  // The production allowlist has keys. Preserve a deterministic multiset for
  // legacy fixtures without one, rather than silently using insertion order.
  const order = keys.length ? keys : columns.map(c => c.name);
  const rows = db.prepare(`SELECT * FROM ${schema}.${quoted(table)} ORDER BY ${order.map(quoted).join(',')}`);
  rows.setReadBigInts(true);
  let count = 0; const digest = crypto.createHash('sha256');
  for (const row of rows.iterate()) { count++; digest.update(json(row)+'\n'); }
  return { rows: count, sha256: digest.digest('hex') };
}

export async function exportInvestmentResearch(sourceFile, outputFile) {
  if (![sourceFile, outputFile].every(file => typeof file === 'string' && path.isAbsolute(file))) throw Error('absolute_paths_required');
  sourceFile = path.resolve(sourceFile); outputFile = path.resolve(outputFile);
  if (!fs.lstatSync(sourceFile).isFile() || fs.realpathSync(sourceFile) !== sourceFile) throw Error('regular_source_required');
  if (sourceFile === outputFile || exists(outputFile) || exists(`${outputFile}.export.json`)) throw Error('new_output_required');
  if (fs.realpathSync(path.dirname(outputFile)) !== path.dirname(outputFile)) throw Error('canonical_output_parent_required');
  if (exists(`${sourceFile}-wal`) && fs.statSync(`${sourceFile}-wal`).size) throw Error('checkpointed_immutable_source_required');
  const sourceSha256 = await fileHash(sourceFile);
  const building = `${outputFile}.building-${crypto.randomUUID()}`;
  fs.closeSync(fs.openSync(building, 'wx', 0o600));
  const db = new DatabaseSync(building);
  let committed = false;
  const receipt = { version: 'investment-public-research-export-v1', generatedAt: new Date().toISOString(),
    sourceSha256, sourceWrites: 0, tables: {}, excludedTables: [],
    checks: { integrity: null, schema: null, content: null, privateDataExcluded: false },
    scope: 'An exact allowlisted research copy, not a refreshed financial model or a Guru curve-release attestation.' };
  try {
    db.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;');
    const sourceUri = pathToFileURL(sourceFile); sourceUri.searchParams.set('mode','ro');
    db.prepare('ATTACH DATABASE ? AS source').run(sourceUri.href);
    const objects = db.prepare("SELECT type,name,tbl_name,sql FROM source.sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
    const tables = objects.filter(o => o.type==='table');
    if (investmentResearchTables.some(name => !tables.some(t => t.name===name))) throw Error('required_research_table_missing');
    receipt.excludedTables = tables.filter(t => !investmentResearchTables.includes(t.name)).map(t => t.name);
    db.exec('BEGIN IMMEDIATE;');
    for (const name of investmentResearchTables) {
      db.exec(tables.find(t => t.name===name).sql);
      db.exec(`INSERT INTO main.${quoted(name)} SELECT * FROM source.${quoted(name)}`);
    }
    // Only explicit indexes belonging to allowlisted tables. Never triggers,
    // views, virtual tables, or operational cache-revision side effects.
    for (const index of objects.filter(o => o.type==='index' && investmentResearchTables.includes(o.tbl_name))) db.exec(index.sql);
    for (const name of investmentResearchTables) {
      const original = fingerprint(db,'source',name), copied = fingerprint(db,'main',name);
      if (json(original)!==json(copied)) throw Error(`research_content_mismatch:${name}`);
      receipt.tables[name] = copied;
    }
    const actualTables = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
    if (json(actualTables)!==json([...investmentResearchTables].sort())) throw Error('public_table_allowlist_mismatch');
    const unexpectedObjects = db.prepare("SELECT name FROM main.sqlite_master WHERE type IN ('trigger','view')").all();
    if (unexpectedObjects.length) throw Error('unexpected_export_objects');
    if (db.prepare('PRAGMA main.integrity_check').all().some(r=>r.integrity_check!=='ok')
      || db.prepare('PRAGMA main.foreign_key_check').all().length) throw Error('research_integrity_failed');
    db.exec('COMMIT;'); committed = true;
    db.exec('DETACH DATABASE source;');
    receipt.checks = { integrity:'ok', schema:'pass', content:'pass', privateDataExcluded:true };
  } catch (error) {
    if (!committed) { try { db.exec('ROLLBACK;'); } catch {} }
    throw Object.assign(error,{retainedCandidate:building});
  } finally { db.close(); }
  if (exists(`${sourceFile}-wal`) && fs.statSync(`${sourceFile}-wal`).size
    || sourceSha256 !== await fileHash(sourceFile)) throw Object.assign(Error('source_changed_during_export'),{retainedCandidate:building});
  receipt.bytes = fs.statSync(building).size;
  receipt.sha256 = await fileHash(building);
  // Link is atomic and no-clobber. Never overwrite an existing served file.
  fs.linkSync(building, outputFile); fs.unlinkSync(building);
  fs.writeFileSync(`${outputFile}.export.json`,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [source,output] = process.argv.slice(2);
  if (!source || !output) throw Error('Usage: node scripts/export-investment-research.mjs /absolute/source.sqlite /absolute/new-public.sqlite');
  const report = await exportInvestmentResearch(source,output);
  console.log(JSON.stringify({status:'exported',...report},null,2));
}
