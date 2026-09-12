import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {auditEarlyGroupCurrencyInference as audit} from './eventEarlyGroupCurrencyInferenceAudit.js';
const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/event-guidance-early-group-currency.json',import.meta.url),'utf8'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const original of cases) {
 const ticker=original.ticker;
 test(ticker+' full dated group inference passes',()=>assert.equal(audit(structuredClone(original)),null));
 test(ticker+' bare dollar or subsidiary sentence alone fails',()=>{
  for(const q of ['Our revenue is earned in USD.','Our subsidiary functional currency is the U.S. Dollar.','All figures in dollars.']) {const f=structuredClone(original);f.proof.quotes[0]=q;assert.ok(audit(f));}
 });
 test(ticker+' group consolidation and confirmation are mandatory',()=>{
  for(const i of [1,2]){const f=structuredClone(original);f.proof.quotes[i]='';assert.ok(audit(f));}
 });
 test(ticker+' cannot claim direct statement or use another quarter',()=>{
  const f=structuredClone(original);f.proof.inference=false;assert.ok(audit(f));
  const g=structuredClone(original);g.observedAt='2013-01-30';assert.ok(audit(g));
 });
 test(ticker+' rehashed false filing date and CIK still fail',()=>{
  for(const replacement of [original.proof.availableAt,original.proof.cik]) {
   const f=structuredClone(original);const h=f.proof.filingDateEvidence;h.headerText=h.headerText.replaceAll(replacement,'2030-01-01');h.headerTextSha256=sha(h.headerText);f.reviewed.filingDateEvidence={...h};assert.ok(audit(f));
  }
 });
 test(ticker+' altered filed URL or unreviewed classification fails',()=>{
  const f=structuredClone(original);f.proof.sourceUrl='https://example.com/filing.htm';assert.ok(audit(f));
  const g=structuredClone(original);g.reviewed.reviewClassification='direct_primary_statement';assert.ok(audit(g));
 });
}
