import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { is13fCommonLongHolding } from './thirteenF.js';
import { signature } from './investmentMath.js';

// Exact original filings referenced by the existing audited filing calendar.
// This strategy deliberately rebalances original quarterly disclosures, not
// later confidential-treatment supplements or hindsight restatements.
export function canonicalStrategyFilings(source,id,end) {
  const quarters=new Map();
  for(const row of source.db.prepare('SELECT payload_json FROM guru_backtests WHERE guru_id=? ORDER BY years DESC').all(id)) {
    for(const r of JSON.parse(row.payload_json).rebalances??[]) {
      if(r.filing?.form!=='13F-HR'||!r.publicDate||r.publicDate>end||r.reportDate>r.publicDate)continue;
      const old=quarters.get(r.reportDate);
      if(!old||r.publicDate<old.publicDate)quarters.set(r.reportDate,r);
    }
  }
  return [...quarters.values()].sort((a,b)=>a.publicDate.localeCompare(b.publicDate));
}

export function parseStrategyInfoTable(xml) {
  const parsed=new XMLParser({ignoreAttributes:false,parseTagValue:false,removeNSPrefix:true,trimValues:true}).parse(xml);
  const raw=parsed.informationTable?.infoTable;
  if(!raw)throw new Error('missing_information_table');
  const records=Array.isArray(raw)?raw:[raw],claims=new Map();
  for(const r of records) {
    const h={cusip:String(r.cusip??'').toUpperCase(),issuer:String(r.nameOfIssuer??''),title:String(r.titleOfClass??''),
      putCall:String(r.putCall??'').toUpperCase(),shareType:String(r.shrsOrPrnAmt?.sshPrnamtType??''),
      shares:Number(r.shrsOrPrnAmt?.sshPrnamt),value:Number(r.value)};
    if(!h.cusip||!Number.isFinite(h.value)||h.value<0||!Number.isFinite(h.shares)||h.shares<0)throw new Error('invalid_13f_row');
    if(!is13fCommonLongHolding(h))continue;
    h.id=h.cusip+'-COMMON';const p=claims.get(h.id);
    claims.set(h.id,p?{...p,value:p.value+h.value,shares:p.shares+h.shares}:h);
  }
  return [...claims.values()];
}

export function strategyFilingArtifact(file=process.env.STRATEGY_FILING_INPUT_PATH) {
  if(!file)return new Map();
  const p=JSON.parse(fs.readFileSync(file,'utf8'));
  if(p.version!=='strategy-original-filings-v1'||!Array.isArray(p.records)||signature(p.records)!==p.recordsHash)throw new Error('invalid_filing_artifact');
  const keys=new Set();
  for(const r of p.records) {
    const key=r.guruId+':'+r.accessionNumber;
    if(keys.has(key)||!r.guruId||!r.accessionNumber||!/^\d{4}-\d{2}-\d{2}$/.test(r.reportDate??'')||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.publicDate??'')||r.reportDate>r.publicDate||
      !Array.isArray(r.holdings)||!r.holdings.length||!Array.isArray(r.documents)||!r.documents.length||
      signature(r.documents)!==r.sourceHash||!Number.isFinite(r.commonLongValue)||r.commonLongValue<=0||
      r.holdings.some(h=>!h.cusip||h.id!==h.cusip+'-COMMON'||!is13fCommonLongHolding(h)||
        !Number.isFinite(h.value)||h.value<0||!Number.isFinite(h.shares)||h.shares<0)||
      Math.abs(r.holdings.reduce((n,h)=>n+h.value,0)-r.commonLongValue)>=1)
      throw new Error('invalid_filing_artifact');
    for(const d of r.documents) {
      if(!/^https:\/\/www\.sec\.gov\/Archives\/edgar\//.test(d.url??'')||!/^[a-f0-9]{64}$/.test(d.hash??''))
        throw new Error('invalid_filing_artifact');
    }
    if(r.originalFiling) {
      const f=r.originalFiling;
      if(f.form!=='13F-HR'||f.accessionNumber!==r.accessionNumber||f.reportDate!==r.reportDate||
        f.filingDate!==r.publicDate||!r.documents.some(d=>d.url===f.xmlUrl&&d.accessionNumber===f.accessionNumber)||
        !/^\d{10}$/.test(f.cik??'')||!r.coverDocuments?.some(d=>d.accessionNumber===f.accessionNumber))
        throw new Error('invalid_original_filing_metadata');
    }
    keys.add(key);
  }
  return new Map(p.records.map(r=>[r.guruId+':'+r.accessionNumber,r]));
}

export function originalStrategyHistory(source,id,end,artifact) {
  const exposure=source.guruHistory(id,end),canonical=canonicalStrategyFilings(source,id,end);
  // Some legacy snapshots retained only a later amendment, and the cached
  // backtest calendar omitted that quarter entirely. An independently verified
  // original can restore its actual publication date, never the amendment's.
  for(const r of artifact.values())if(r.guruId===id&&r.publicDate<=end&&r.originalFiling&&
    !canonical.some(f=>f.reportDate===r.reportDate)) {
    canonical.push({reportDate:r.reportDate,publicDate:r.publicDate,commonLongValue:r.commonLongValue,filing:r.originalFiling});
  }
  const byQuarter=new Map(canonical.map(r=>[r.reportDate,r])),byAccession=new Map(exposure.map(f=>[f.accessionNumber,f]));
  const history=exposure.filter(f=>!byQuarter.has(f.reportDate));
  for(const r of canonical) {
    const original=byAccession.get(r.filing.accessionNumber),recovered=artifact.get(id+':'+r.filing.accessionNumber);
    if(original)history.push(original);
    else if(recovered&&recovered.reportDate===r.reportDate&&recovered.publicDate===r.publicDate&&Math.abs(recovered.commonLongValue-r.commonLongValue)<1) {
      history.push({accessionNumber:r.filing.accessionNumber,reportDate:r.reportDate,filingDate:r.publicDate,
        filing:r.filing,positionCount:recovered.holdings.length,topHoldings:recovered.holdings,
        recoveredSourceHash:recovered.sourceHash});
    } else history.push({accessionNumber:r.filing.accessionNumber,reportDate:r.reportDate,filingDate:r.publicDate,
      filing:r.filing,topHoldings:[],missingOriginal:true});
  }
  return history.sort((a,b)=>a.filingDate.localeCompare(b.filingDate));
}
