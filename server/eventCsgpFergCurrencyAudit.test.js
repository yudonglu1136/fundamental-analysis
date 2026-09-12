import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { auditCsgpFergCurrency } from './eventCsgpFergCurrencyAudit.js';

const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function fixture(ticker) {
  const csgp=ticker==='CSGP';
  const proof={cik:csgp?'0001057352':'0001832433',availableAt:csgp?'2011-02-25':'2023-09-26',
    accession:csgp?'0001057352-11-000012':'0001832433-23-000066',form:'10-K',inference:false,
    quotes:csgp?['Our financial reporting currency is the U.S. dollar.','COSTAR GROUP, INC. CONSOLIDATED STATEMENTS OF OPERATIONS']:
      ['The consolidated financial statements are presented in U.S. dollars.','Ferguson plc Consolidated Statements of Earnings']};
  const name=csgp?'form_10-k.htm':'ferg-20230731.htm';
  const prefix=`https://www.sec.gov/Archives/edgar/data/${Number(proof.cik)}/${proof.accession.replaceAll('-','')}/`;
  proof.sourceUrl=prefix+name;
  const headerText=`SEC Accession No. ${proof.accession} Filing Date ${proof.availableAt} Form 10-K CIK : ${proof.cik} 10-K ${name}`;
  proof.filingDateEvidence={sourceUrl:prefix+proof.accession+'-index.html',documentSha256:'f'.repeat(64),headerText,headerTextSha256:hash(headerText)};
  const reviewed={filingDateEvidence:{...proof.filingDateEvidence}};
  return {ticker,sourceId:csgp?'108d93324ecc6a14a270bf4f':'deea2ad2293cb843d4e728f7',observedAt:csgp?'2011-04-27':'2023-12-05',proof,reviewed};
}
for(const ticker of ['CSGP','FERG']) {
  test(`${ticker} exact current declaration/parent/date accepted`,()=>assert.equal(auditCsgpFergCurrency(fixture(ticker)),null));
  test(`${ticker} subsidiary/revenue/bare dollar/another issuer rejected`,()=>{
    for(const quote of ['Our revenue is earned in U.S. dollars.','Our subsidiary functional currency is USD.','All amounts in dollars.']) {
      const f=fixture(ticker); f.proof.quotes[0]=quote;assert.ok(auditCsgpFergCurrency(f));
    }
    const f=fixture(ticker);f.proof.quotes[1]='Another Company Consolidated Statements';assert.ok(auditCsgpFergCurrency(f));
  });
  test(`${ticker} old/current-issuer substitution and other date rejected`,()=>{
    for(const [k,v]of [['cik','0002011641'],['availableAt','2026-01-01'],['form','8-K'],['inference',true]]) {
      const f=fixture(ticker);f.proof[k]=v;assert.ok(auditCsgpFergCurrency(f));
    }
    const f=fixture(ticker);f.observedAt='2026-01-01';assert.ok(auditCsgpFergCurrency(f));
  });
  test(`${ticker} rehashed false index date rejected independently`,()=>{
    const f=fixture(ticker);const h=f.proof.filingDateEvidence;h.headerText=h.headerText.replace(f.proof.availableAt,'2030-01-01');h.headerTextSha256=hash(h.headerText);f.reviewed.filingDateEvidence={...h};assert.ok(auditCsgpFergCurrency(f));
  });
  test(`${ticker} changed original index or URL rejected`,()=>{
    const f=fixture(ticker);f.proof.filingDateEvidence.headerText+=' changed';assert.ok(auditCsgpFergCurrency(f));
    const g=fixture(ticker);g.proof.sourceUrl='https://example.com/statement.htm';assert.ok(auditCsgpFergCurrency(g));
  });
}
