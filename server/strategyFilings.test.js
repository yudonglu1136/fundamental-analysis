import test from 'node:test';
import a from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signature } from './investmentMath.js';
import { canonicalStrategyFilings, originalStrategyHistory, parseStrategyInfoTable, strategyFilingArtifact } from './strategyFilings.js';

const row=(cusip,value,title='COM',putCall='')=>`<infoTable><nameOfIssuer>Example</nameOfIssuer><titleOfClass>${title}</titleOfClass><cusip>${cusip}</cusip><value>${value}</value><shrsOrPrnAmt><sshPrnamt>2</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>${putCall}</putCall></infoTable>`;
const holding={id:'111111111-COMMON',cusip:'111111111',value:100,shares:2,title:'COM',shareType:'SH',putCall:''};
const documents=[{url:'https://www.sec.gov/Archives/edgar/data/1/original.xml',hash:'a'.repeat(64)}];
const original={reportDate:'2023-12-31',publicDate:'2024-02-14',commonLongValue:100,filing:{form:'13F-HR',accessionNumber:'original'}};
const recovered=()=>({guruId:'manager',accessionNumber:'original',reportDate:original.reportDate,publicDate:original.publicDate,
  commonLongValue:100,documents,sourceHash:signature(documents),holdings:[{...holding}]});
const fakeSource=(exposure=[],rebalances=[original])=>({
  db:{prepare:()=>({all:()=>[{payload_json:JSON.stringify({rebalances})}]})},
  guruHistory:(_id,end)=>exposure.filter(f=>f.filingDate<=end),
});

test('SEC parsing aggregates exact common claims and excludes options and debt',()=>{
  const xml='<informationTable>'+row('111111111',10)+row('111111111',20)+row('111111111',90,'COM','CALL')+row('222222222',80,'CONV NOTE')+'</informationTable>';
  a.deepEqual(parseStrategyInfoTable(xml).map(h=>[h.id,h.value,h.shares]),[['111111111-COMMON',30,4]]);
  a.throws(()=>parseStrategyInfoTable('<html>error</html>'),/missing_information/);
  a.throws(()=>parseStrategyInfoTable('<informationTable>'+row('111111111','NaN')+'</informationTable>'),/invalid_13f_row/);
});

test('original calendar never substitutes a later amendment or future disclosure',()=>{
  const later={...original,publicDate:'2024-05-15',filing:{form:'13F-HR/A',accessionNumber:'amended'}};
  const source=fakeSource([], [later,original]);
  a.deepEqual(canonicalStrategyFilings(source,'manager','2024-05-20'),[original]);
  a.deepEqual(canonicalStrategyFilings(source,'manager','2024-02-13'),[]);
});

test('missing original creates an explicit gap on its actual disclosure date, not a delayed rebalance',()=>{
  const amendment={reportDate:original.reportDate,filingDate:'2024-05-15',accessionNumber:'amended',topHoldings:[{ticker:'WRONG'}]};
  const history=originalStrategyHistory(fakeSource([amendment]),'manager','2024-06-01',new Map());
  a.equal(history.length,1);a.equal(history[0].filingDate,'2024-02-14');
  a.equal(history[0].missingOriginal,true);a.deepEqual(history[0].topHoldings,[]);
});

test('recovered full CUSIP book restores the original date without hindsight ticker inference',()=>{
  const artifact=new Map([['manager:original',recovered()]]);
  const history=originalStrategyHistory(fakeSource(),'manager','2024-06-01',artifact);
  a.equal(history[0].filingDate,'2024-02-14');a.equal(history[0].positionCount,1);
  a.deepEqual(history[0].topHoldings,[holding]);a.equal(history[0].topHoldings[0].ticker,undefined);
  a.deepEqual(originalStrategyHistory(fakeSource(),'manager','2024-02-13',artifact),[]);
  artifact.get('manager:original').publicDate='2024-05-15';
  a.equal(originalStrategyHistory(fakeSource(),'manager','2024-06-01',artifact)[0].missingOriginal,true);
});

test('matching original stored exposure is preserved; unseen-quarter amendment stays visibly unreviewed',()=>{
  const full={accessionNumber:'original',reportDate:original.reportDate,filingDate:original.publicDate,topHoldings:[holding]};
  const amendment={accessionNumber:'later',reportDate:'2024-03-31',filingDate:'2024-05-15',filing:{form:'13F-HR/A'}};
  const history=originalStrategyHistory(fakeSource([full,amendment]),'manager','2024-06-01',new Map());
  a.deepEqual(history,[full,amendment]);
});

test('verified original metadata restores a quarter absent from the cached backtest calendar',()=>{
  const record={...recovered(),originalFiling:{form:'13F-HR',accessionNumber:'original',reportDate:original.reportDate,filingDate:original.publicDate}};
  const amendment={accessionNumber:'amended',reportDate:original.reportDate,filingDate:'2024-05-15',filing:{form:'13F-HR/A'}};
  const source=fakeSource([amendment],[]),artifact=new Map([['manager:original',record]]);
  const h=originalStrategyHistory(source,'manager','2024-06-01',artifact);
  a.equal(h.length,1);a.equal(h[0].accessionNumber,'original');a.equal(h[0].filingDate,'2024-02-14');
  a.equal(h[0].positionCount,1);a.deepEqual(h[0].topHoldings,[holding]);
  a.deepEqual(originalStrategyHistory(source,'manager','2024-02-13',artifact),[]);
});

test('filing artifact verifies record hash, values, claim type, source documents and duplicate keys',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'strategy-filing-test-')),file=path.join(dir,'filings.json');
  const write=(records,hash=signature(records))=>fs.writeFileSync(file,JSON.stringify({version:'strategy-original-filings-v1',records,recordsHash:hash}));
  try {
    write([recovered()]);a.equal(strategyFilingArtifact(file).size,1);
    write([recovered()],'wrong');a.throws(()=>strategyFilingArtifact(file),/invalid_filing/);
    for(const mutate of [r=>r.holdings[0].value=99,r=>r.holdings[0].putCall='PUT',r=>r.sourceHash='wrong',r=>r.reportDate='2025-01-01']) {
      const r=recovered();mutate(r);write([r]);a.throws(()=>strategyFilingArtifact(file),/invalid_filing/);
    }
    write([recovered(),recovered()]);a.throws(()=>strategyFilingArtifact(file),/invalid_filing/);
    const r=recovered();r.documents[0]={...r.documents[0],accessionNumber:'original'};
    r.sourceHash=signature(r.documents);r.coverDocuments=[{accessionNumber:'original'}];
    r.originalFiling={form:'13F-HR',cik:'0000000001',accessionNumber:'original',reportDate:r.reportDate,filingDate:r.publicDate,xmlUrl:r.documents[0].url};
    write([r]);a.equal(strategyFilingArtifact(file).size,1);
    for(const mutate of [x=>x.originalFiling.form='13F-HR/A',x=>x.originalFiling.filingDate='2024-05-15',
      x=>x.originalFiling.accessionNumber='amended',x=>x.originalFiling.xmlUrl='https://example.org/wrong.xml',x=>x.coverDocuments=[]]) {
      const bad=structuredClone(r);mutate(bad);write([bad]);a.throws(()=>strategyFilingArtifact(file),/invalid_original_filing/);
    }
  } finally {fs.unlinkSync(file);fs.rmdirSync(dir);}
});
