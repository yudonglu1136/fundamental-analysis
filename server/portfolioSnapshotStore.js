import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {reportAnalysisAccounts,reportRows} from './portfolioReport.js';

// Private normalized local copy. Credentials, contacts and broker IDs excluded.
export function importOwnerReport({report,historyParsed=null,file,expectedEmail,metadata}) {
  const accounts=[...reportRows(report,'AccountInformation'),...reportRows(historyParsed,'AccountInformation')];
  if(!expectedEmail||!accounts.length||!accounts.every(a=>String(a.primaryEmail||'').toLowerCase()===expectedEmail.toLowerCase()))throw new Error('report_owner_not_verified');
  const parsed=reportAnalysisAccounts(report,{historyParsed});
  if(!parsed.length)throw new Error('report_accounts_missing');
  if(fs.existsSync(file))throw new Error('snapshot_exists_use_new_file');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const ownerHash=crypto.createHash('sha256').update(expectedEmail.toLowerCase()).digest('hex');
  // Exclusive creation and owner-only permissions before any private row lands.
  fs.closeSync(fs.openSync(file,'wx',0o600));
  const db=new DatabaseSync(file);
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE snapshot(id INTEGER PRIMARY KEY CHECK(id=1),version TEXT NOT NULL,owner_hash TEXT NOT NULL,source TEXT NOT NULL,retrieved_at TEXT NOT NULL,source_sha256 TEXT NOT NULL) STRICT;
      CREATE TABLE accounts(id INTEGER PRIMARY KEY,currency TEXT NOT NULL,report_date TEXT,reported_nav REAL,performance_basis TEXT NOT NULL) STRICT;
      CREATE TABLE positions(account_id INTEGER REFERENCES accounts(id),ordinal INTEGER,ticker TEXT,name TEXT,asset_category TEXT,currency TEXT,quantity REAL,price REAL,local_value REAL,fx_rate REAL,multiplier REAL,strike REAL,expiry TEXT,cusip TEXT,isin TEXT,identity_basis TEXT,PRIMARY KEY(account_id,ordinal)) STRICT;
      CREATE TABLE nav_observations(account_id INTEGER REFERENCES accounts(id),date TEXT,nav REAL,PRIMARY KEY(account_id,date)) STRICT; BEGIN;`);
    db.exec('ALTER TABLE positions ADD COLUMN cost_basis_money REAL; CREATE TABLE daily_mtm(account_id INTEGER REFERENCES accounts(id),date TEXT,instrument_id TEXT,ticker TEXT,name TEXT,asset_category TEXT,pnl REAL,PRIMARY KEY(account_id,date,instrument_id,asset_category)) STRICT;');
    db.exec(`CREATE TABLE history_coverage(account_id INTEGER PRIMARY KEY REFERENCES accounts(id),from_date TEXT,to_date TEXT,trade_status TEXT,cash_status TEXT,basis TEXT) STRICT;
      CREATE TABLE realized_pnl(account_id INTEGER REFERENCES accounts(id),event_key TEXT,date TEXT,ticker TEXT,name TEXT,asset_category TEXT,pnl REAL,PRIMARY KEY(account_id,event_key)) STRICT;
      CREATE TABLE cash_flows(account_id INTEGER REFERENCES accounts(id),event_key TEXT,date TEXT,type TEXT,amount REAL,PRIMARY KEY(account_id,event_key)) STRICT;`);
    db.exec(`ALTER TABLE history_coverage ADD COLUMN income_status TEXT;
      CREATE TABLE income_events(account_id INTEGER REFERENCES accounts(id),event_key TEXT,date TEXT,ticker TEXT,asset_category TEXT,category TEXT,source_currency TEXT,source_amount REAL,fx_rate REAL,amount REAL,PRIMARY KEY(account_id,event_key)) STRICT;`);
    db.prepare('INSERT INTO snapshot VALUES(1,?,?,?,?,?)').run('owner-portfolio-v4',ownerHash,metadata.source,metadata.retrievedAt,metadata.sha256);
    for(const [i,a] of parsed.entries()) {
      db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(i+1,a.currency,a.reportDate,a.reportedNav,a.performanceBasis);
      for(const [j,p] of a.positions.entries())db.prepare('INSERT INTO positions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(i+1,j,p.ticker,p.name,p.assetCategory,p.currency,p.quantity,p.price,p.localValue,p.fxRateToBase,p.multiplier??null,p.strike??null,p.expiry??null,p.cusip??null,p.isin??null,p.identity??'report',p.costBasisMoney??null);
      const navValues=new Map();
      for(const v of a.navHistory) {
        if(navValues.has(v.date)&&navValues.get(v.date)!==v.nav)throw new Error('conflicting_nav_observations');
        navValues.set(v.date,v.nav);
      }
      for(const [date,nav] of navValues)db.prepare('INSERT INTO nav_observations VALUES(?,?,?)').run(i+1,date,nav);
      for(const r of a.dailyMtm?.rows??[])db.prepare('INSERT INTO daily_mtm VALUES(?,?,?,?,?,?,?)').run(i+1,a.dailyMtm.date,r.instrumentId,r.ticker,r.name,r.assetCategory,r.pnl);
      if(a.historyEvidence) {
        const h=a.historyEvidence;
        db.prepare('INSERT INTO history_coverage VALUES(?,?,?,?,?,?,?)').run(i+1,h.fromDate,h.toDate,h.tradeStatus,h.cashStatus,h.performanceBasis,h.incomeStatus);
        for(const r of h.realized)db.prepare('INSERT INTO realized_pnl VALUES(?,?,?,?,?,?,?)').run(i+1,r.eventKey,r.date,r.ticker,r.name,r.assetCategory,r.pnl);
        for(const r of h.cashFlows)db.prepare('INSERT INTO cash_flows VALUES(?,?,?,?,?)').run(i+1,r.eventKey,r.date,r.type,r.amount);
        for(const r of h.income)db.prepare('INSERT INTO income_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(i+1,r.eventKey,r.date,r.ticker,r.assetCategory,r.category,r.sourceCurrency,r.sourceAmount,r.fxRateToBase,r.amount);
      }
    }
    db.exec('COMMIT');fs.chmodSync(file,0o600);
    return {ownerHash,accounts:parsed.length,positions:parsed.reduce((n,a)=>n+a.positions.length,0),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check};
  }finally{db.close();}
}
export function localOwnerPortfolio(user,env=process.env) {
  if(env.NODE_ENV==='production'||env.API_AUTH_DEV_BYPASS!=='true'||env.INVESTMENT_WORKFLOW_ENABLED!=='true'||user?.id!=='local-dev-user'||!env.LOCAL_OWNER_PORTFOLIO_DB||!env.LOCAL_OWNER_PORTFOLIO_HASH)return null;
  const db=new DatabaseSync(env.LOCAL_OWNER_PORTFOLIO_DB,{readOnly:true});
  try {
    const meta=db.prepare('SELECT * FROM snapshot WHERE id=1').get();
    if(!['owner-portfolio-v1','owner-portfolio-v2','owner-portfolio-v3','owner-portfolio-v4'].includes(meta?.version)||meta.owner_hash!==env.LOCAL_OWNER_PORTFOLIO_HASH)throw new Error('local_portfolio_owner_mismatch');
    const analysisAccounts=db.prepare('SELECT * FROM accounts ORDER BY id').all().map(a=>({currency:a.currency,reportDate:a.report_date,reportedNav:a.reported_nav,
      performanceBasis:a.performance_basis,navHistory:db.prepare('SELECT date,nav FROM nav_observations WHERE account_id=? ORDER BY date').all(a.id),
      dailyMtm:meta.version!=='owner-portfolio-v1'?{date:a.report_date,basis:'ibkr_instrument_mtm_in_base',rows:db.prepare('SELECT instrument_id instrumentId,ticker,name,asset_category assetCategory,pnl FROM daily_mtm WHERE account_id=? AND date=?').all(a.id,a.report_date)}:null,
      historyEvidence:['owner-portfolio-v3','owner-portfolio-v4'].includes(meta.version)?{
        ...db.prepare('SELECT from_date fromDate,to_date toDate,trade_status tradeStatus,cash_status cashStatus,basis performanceBasis FROM history_coverage WHERE account_id=?').get(a.id),
        ...(meta.version==='owner-portfolio-v4'?{
          incomeStatus:db.prepare('SELECT income_status status FROM history_coverage WHERE account_id=?').get(a.id)?.status,
          income:db.prepare('SELECT date,ticker,asset_category assetCategory,category,source_currency sourceCurrency,source_amount sourceAmount,fx_rate fxRateToBase,amount FROM income_events WHERE account_id=? ORDER BY date').all(a.id),
        }:{}),
        realized:db.prepare('SELECT date,ticker,name,asset_category assetCategory,pnl FROM realized_pnl WHERE account_id=? ORDER BY date').all(a.id),
        cashFlows:db.prepare('SELECT date,type,amount FROM cash_flows WHERE account_id=? ORDER BY date').all(a.id)}:null,
      positions:db.prepare(`SELECT ticker,name,asset_category assetCategory,currency,quantity,price,local_value localValue,fx_rate fxRateToBase,multiplier,strike,expiry,cusip,isin,${meta.version!=='owner-portfolio-v1'?'cost_basis_money':'NULL'} costBasisMoney FROM positions WHERE account_id=? ORDER BY ordinal`).all(a.id)}));
    return {source:{mode:'live',userScoped:true,localOwnerSnapshot:true,label:meta.source,retrievedAt:meta.retrieved_at},connection:{status:'linked'},analysisAccounts};
  }finally{db.close();}
}
