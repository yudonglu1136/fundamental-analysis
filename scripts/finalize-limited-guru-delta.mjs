#!/usr/bin/env node
// Producer-only companion. Build and fully validate a local COW candidate;
// transfer only guru-delta.sqlite and its bounded manifest to the operator.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { applyGuruDelta, guruDeltaTables } from './investment-guru-delta.mjs';
import { fileSha256 } from './build-limited-guru-delta.mjs';
import { INVESTMENT_ALLOWED_SOURCE_TABLES } from '../server/investmentRuntimeConfig.js';

const fail=code=>{throw Error(code);};
const requireThat=(ok,code)=>{if(!ok)fail(code);};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sig=file=>{const s=fs.statSync(file);return JSON.stringify([s.dev,s.ino,s.size,s.mtimeMs]);};

function semanticProof(file,contract) {
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-8192; BEGIN');
    const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    requireThat(schema.filter(s=>s.type==='table').every(s=>INVESTMENT_ALLOWED_SOURCE_TABLES.includes(s.name)),
      'nonpublic_source_table_forbidden');
    const tables={};
    for(const {name} of schema.filter(s=>s.type==='table')) {
      requireThat(/^[a-z][a-z0-9_]*$/.test(name),'unsafe_table_name');
      const columns=db.prepare(`PRAGMA table_info(${name})`).all().map(c=>c.name);
      const h=crypto.createHash('sha256');let rows=0;
      const operations=contract.tables[name]?.operations;
      const excluded=new Set((operations??[]).map(o=>JSON.stringify(o.key)));
      for(const row of db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).iterate()) {
        if(excluded.has(JSON.stringify(name.startsWith('guru_backtest')?[row.guru_id,row.years]:[row.guru_id])))continue;
        // Rows stream one at a time; provider data never enters this receipt.
        h.update(JSON.stringify(columns.map(c=>row[c]),(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');rows++;
      }
      tables[name]={rows,sha256:h.digest('hex')};
    }
    return {schemaSha256:crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex'),tables,
      pageSize:db.prepare('PRAGMA page_size').get().page_size,sqliteVersion:db.prepare('SELECT sqlite_version() version').get().version};
  }finally{db.close();}
}

export async function finalizeLimitedGuruDelta({base,directory}) {
  const manifestFile=path.join(directory,'guru-delta-manifest.json'),delta=path.join(directory,'guru-delta.sqlite');
  const contract=read(manifestFile),candidate=path.join(directory,'research.candidate.sqlite');
  requireThat(!fs.existsSync(candidate),'candidate_must_not_exist');
  const beforeFingerprint=sig(base);
  requireThat(await fileSha256(base)===contract.baseResearch.sha256&&fs.statSync(base).size===contract.baseResearch.bytes,'base_hash_mismatch');
  requireThat(await fileSha256(delta)===contract.delta.sha256,'delta_hash_mismatch');
  console.log('Reading bounded-memory original semantic proof.');
  const before=semanticProof(base,contract);
  fs.copyFileSync(base,candidate,fs.constants.COPYFILE_EXCL|fs.constants.COPYFILE_FICLONE);
  fs.chmodSync(candidate,0o600);
  let measuredJournalBytes=0;
  const sample=()=>{try{measuredJournalBytes=Math.max(measuredJournalBytes,fs.statSync(candidate+'-journal').size);}catch(error){if(error.code!=='ENOENT')throw error;}};
  const timer=setInterval(sample,5);
  let childOutput='';
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--apply-child',candidate,delta,manifestFile],{stdio:['ignore','pipe','pipe']});
      child.stdout.on('data',b=>{childOutput+=b;});child.stderr.on('data',b=>process.stderr.write(b));
      child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`delta_apply_child_failed_${code}`)));
    });
  }finally{sample();clearInterval(timer);}
  requireThat(measuredJournalBytes>0,'journal_peak_not_observed');
  console.log(`Exact row delta applied; sampled rollback journal peak ${measuredJournalBytes} bytes.`);
  const after=semanticProof(candidate,contract);
  requireThat(JSON.stringify(before)===JSON.stringify(after),'non_target_semantics_changed');
  console.log('Non-target rows/schema unchanged. Running full local SQLite checks.');
  const db=new DatabaseSync(candidate,{readOnly:true});let tables;
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-8192');
    requireThat(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','candidate_full_integrity_failed');
    requireThat(db.prepare('PRAGMA foreign_key_check').all().length===0,'candidate_foreign_keys_failed');
    tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
    requireThat(db.prepare('PRAGMA journal_mode').get().journal_mode==='delete','candidate_not_self_contained');
  }finally{db.close();}
  const bytes=fs.statSync(candidate).size,sha256=await fileSha256(candidate);
  requireThat(sig(base)===beforeFingerprint,'base_modified');
  // A repeat operator invocation must be byte-stable and perform zero writes.
  const repeated=applyGuruDelta(candidate,delta,contract);
  requireThat(repeated.status==='already_applied'&&await fileSha256(candidate)===sha256,'delta_not_idempotent');
  const verifiedAt=new Date().toISOString();
  contract.research={bytes,sha256,tables,producerValidation:{version:'sqlite-full-validation-v1',bytes,sha256,
    integrityCheck:'ok',foreignKeyCheck:'ok',schema:'pass',privateDataExcluded:true,verifiedAt,
    nonGuruTablesUnchanged:true,nonTargetGuruRowsUnchanged:true,baseResearchSha256:contract.baseResearch.sha256,
    deltaSha256:contract.delta.sha256}};
  contract.measurements={measuredJournalBytes,pageSize:after.pageSize,sqliteVersion:after.sqliteVersion,nodeVersion:process.version,
    journalSampleMilliseconds:5,idempotent:true,applyResult:JSON.parse(childOutput.trim()),
    nonTargetSemanticProof:after};
  fs.writeFileSync(manifestFile,JSON.stringify(contract,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:'limited_candidate_verified_not_deployed',candidate,research:contract.research,
    delta:contract.delta,measuredJournalBytes,manifestFile},null,2));
  return contract;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try {
    if(process.argv[2]==='--apply-child') {
      const [, , ,candidate,delta,manifest]=process.argv;
      console.log(JSON.stringify(applyGuruDelta(candidate,delta,read(manifest))));
    }else {
      const args=Object.fromEntries(process.argv.slice(2).reduce((p,x,i,a)=>x.startsWith('--')?[...p,[x.slice(2),a[i+1]]]:p,[]));
      await finalizeLimitedGuruDelta({base:args.base,directory:args.directory});
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
