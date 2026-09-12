import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {auditAvavStatementCurrency} from './eventAvavStatementCurrencyAudit.js';

const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const names=['Assets','RevenueFromContractWithCustomerIncludingAssessedTax','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations','EarningsPerShareDiluted'];
// Synthetic unit-test quantities. They are not issuer financial observations.
function fixture() {
  const prefix='https://www.sec.gov/Archives/edgar/data/1368622/000155837020007720/';
  const open='<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2020-01-31" xmlns:iso4217="http://www.xbrl.org/2003/iso4217">';
  const raw=[['unit:usd','<unit id="usd"><measure>iso4217:USD</measure></unit>'],['unit:eps','<unit id="eps"><divide><unitNumerator><measure>iso4217:USD</measure></unitNumerator><unitDenominator><measure>shares</measure></unitDenominator></divide></unit>']];
  for(const id of ['instant','annual'])raw.push(['context:'+id,`<context id="${id}"><entity><identifier scheme="http://www.sec.gov/CIK">0001368622</identifier></entity><period>${id==='instant'?'<instant>2020-04-30</instant>':'<startDate>2019-05-01</startDate><endDate>2020-04-30</endDate>'}</period></context>`]);
  const reconstructedFacts=names.map((name,i)=>({concept:name,value:'1',contextRef:i===0?'instant':'annual',unitRef:i===3?'eps':'usd'}));
  for(const f of reconstructedFacts)raw.push(['fact:'+f.concept,`<us-gaap:${f.concept} contextRef="${f.contextRef}" unitRef="${f.unitRef}">1</us-gaap:${f.concept}>`]);
  const xml={schemaVersion:'avav-original-parent-statement-currency-v1',sourceUrl:prefix+'avav-20200623x10k_htm.xml',documentSha256:'f'.repeat(64),periodEnd:'2020-04-30',contextScope:'whole_entity_no_dimensions',rootOpenTag:open,rootCloseTag:'</xbrl>',rootOpenTagSha256:hash(open),fragments:raw.map(([key,raw])=>({key,raw})),fragmentsSha256:raw.map(([_,raw])=>hash(raw)),reconstructedFacts};
  const headerText='SEC Accession No. 0001558370-20-007720 Filing Date 2020-06-24 Form 10-K CIK : 0001368622';
  const header={sourceUrl:prefix+'0001558370-20-007720-index.html',documentSha256:'a'.repeat(64),headerText,headerTextSha256:hash(headerText)};
  return {ticker:'AVAV',sourceId:'33ebc900d50cf6d3a1d43827',observedAt:'2021-06-22',proof:{cik:'0001368622',availableAt:'2020-06-24',form:'10-K',accession:'0001558370-20-007720',inference:false,quotes:['AEROVIRONMENT, INC.'],sourceUrl:prefix+'avav-20200623x10k.htm',xbrlStatementEvidence:xml,filingDateEvidence:header},reviewed:{xbrlStatementEvidence:structuredClone(xml),filingDateEvidence:structuredClone(header)}};
}
function rehash(f){const x=f.proof.xbrlStatementEvidence;x.fragmentsSha256=x.fragments.map(y=>hash(y.raw));f.reviewed.xbrlStatementEvidence=structuredClone(x);}
test('complete parent annual USD statements accepted',()=>assert.equal(auditAvavStatementCurrency(fixture()),null));
test('other source event, issuer and later date rejected',()=>{for(const[k,v]of[['sourceId','other'],['observedAt','2026-06-22'],['ticker','OTHER']])assert.ok(auditAvavStatementCurrency({...fixture(),[k]:v}));});
test('foreign/segment currency rejected even with rehashed fragments',()=>{for(const [before,after]of[['iso4217:USD','iso4217:CAD'],['</entity>','<segment>subsidiary</segment></entity>'],['2020-04-30','2021-04-30']]){let f=fixture();for(let r of f.proof.xbrlStatementEvidence.fragments)r.raw=r.raw.replaceAll(before,after);rehash(f);assert.ok(auditAvavStatementCurrency(f));}});
test('duplicate or missing statement categories rejected',()=>{let f=fixture();f.proof.xbrlStatementEvidence.fragments.pop();rehash(f);assert.ok(auditAvavStatementCurrency(f));});
test('shadowing namespace and fabricated fact prefix rejected',()=>{let f=fixture();f.proof.xbrlStatementEvidence.fragments[0].raw=f.proof.xbrlStatementEvidence.fragments[0].raw.replace('<unit ','<unit xmlns:iso4217="https://fake.invalid/" ');rehash(f);assert.ok(auditAvavStatementCurrency(f));});
test('rehashed header date still requires original availability',()=>{let f=fixture();let h=f.proof.filingDateEvidence;h.headerText=h.headerText.replace('2020-06-24','2021-07-01');h.headerTextSha256=hash(h.headerText);f.reviewed.filingDateEvidence=structuredClone(h);assert.ok(auditAvavStatementCurrency(f));});
