import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { auditEventGuidanceCurrencyEvidence as audit } from "./eventGuidanceCurrencyEvidenceAudit.js";
import { auditStatementUnitCurrencyEvidence } from "./eventGuidanceStatementUnitAudit.js";
import { auditExactDirectReportingCurrency } from "./eventDirectReportingCurrencyAudit.js";
import { auditLegacyParentStatementCurrency } from "./eventLegacyParentStatementCurrencyAudit.js";

const fixtures = [
  ...JSON.parse(fs.readFileSync(new URL("./fixtures/event-guidance-currency-evidence.json", import.meta.url), "utf8")),
  ...JSON.parse(fs.readFileSync(new URL("./fixtures/event-guidance-currency-evidence-next10.json", import.meta.url), "utf8"))
];
const example = (ticker) => structuredClone(fixtures.find((row) => row.ticker === ticker));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const nextBatch = JSON.parse(fs.readFileSync(new URL("./fixtures/event-guidance-currency-evidence-bg-maa.json", import.meta.url), "utf8"));
const registry = JSON.parse(fs.readFileSync(new URL("./config/guidance-currency-reviewed-documents.json", import.meta.url), "utf8"));
const directBatch = JSON.parse(fs.readFileSync(new URL("./fixtures/event-guidance-currency-evidence-gev-nwsa.json", import.meta.url), "utf8"));
const legacyData = JSON.parse(fs.readFileSync(new URL("./fixtures/event-guidance-currency-evidence-dis-ci.json", import.meta.url), "utf8"));
const legacyBatch = legacyData.events.map(row => ({ ...row, contract: { ...row.contract, proof: legacyData.documents[row.contract.proofDocumentSha256] } }));

test("all 34 exact historical currencies independently validate without financial identity changes", () => {
  assert.equal(fixtures.length, 34);
  assert.equal(fixtures.filter((row) => row.contract.proof.inference).length, 16);
  for (const row of fixtures) {
    assert.equal(audit(row), null, `${row.ticker}/${row.sourceId}`);
    assert.equal(row.contract.reportingCurrencyOverride, false);
    assert.equal(row.contract.originalQuotedCurrency, null);
  }
});

test("missing contract grants no independent approval and ordinary source auditing remains required", () => {
  assert.equal(audit({ ...example("TSM"), contract: null }), null);
});

test("wrong owner, changed original quote, later filing, ticker/CIK and non-reviewed documents fail", () => {
  const changes = [
    row => { row.ticker = "OTHER"; },
    row => { row.sourceId = "other-event"; },
    row => { row.evidence += " changed"; },
    row => { row.contract.proof.availableAt = "2030-01-01"; },
    row => { row.contract.proof.cik = "0000000001"; },
    row => { row.contract.proof.accession = "0001046179-24-000999"; },
    row => { row.contract.proof.documentSha256 = "0".repeat(64); },
    row => { row.contract.proof.sourceUrl = row.contract.proof.sourceUrl.replace("sec.gov", "example.com"); },
  ];
  for (const change of changes) {
    const row = example("TSM"); change(row);
    assert.ok(audit(row), String(change));
  }
});

test("inventing a new dollar paragraph cannot retain reviewed original-document status", () => {
  const row = example("DDOG");
  row.contract.proof.quotes[0] = "Our sales contracts are denominated in U.S. dollars.";
  row.contract.proof.paragraphSha256[0] = hash(row.contract.proof.quotes[0]);
  assert.match(audit(row).reason, /paragraph_hash_mismatch/);
});

test("TSM official revenue cannot be borrowed for another quarter, metric, currency or unit", () => {
  for (const change of [
    row => { row.metricName = "ebitda_guidance"; },
    row => { row.contract.metricName = row.metricName = "ebitda_guidance"; },
    row => { row.contract.fiscalPeriod = row.fiscalPeriod = "Q42020"; },
    row => { row.contract.proof.primaryGuidance.quarter = row.contract.proof.primaryGuidance.quarter % 4 + 1; },
    row => { row.contract.proof.primaryGuidance.lowM *= 1000; },
    row => { row.unit = "reported billions"; },
    row => { row.amount *= 1000; },
    row => { row.contract.amountM = row.amount = 1; },
    row => { row.currency = "TWD"; },
    row => { row.contract.reportingCurrencyOverride = true; },
  ]) {
    const row = example("TSM"); change(row);
    assert.ok(audit(row), String(change));
  }
});

test("inference must remain labeled and whole-note scoped, not subsidiary-functional-only", () => {
  for (const ticker of ["CRWD", "PLTR", "APP", "ZS", "GDDY"]) {
    for (const change of [
      row => { row.contract.proof.inference = false; },
      row => { delete row.contract.proof.reasoning; },
      row => { row.contract.evidenceType = "explicit_company_reporting_currency_declaration"; },
      row => { row.contract.proof.quotes.pop(); row.contract.proof.paragraphSha256.pop(); },
      row => { row.contract.proof.quotes[0] = "The functional currency of our foreign subsidiaries is the U.S. dollar."; },
    ]) {
      const row = example(ticker); change(row);
      assert.ok(audit(row), `${ticker} ${change}`);
    }
  }
});

test("malformed or invalid dates/contracts fail closed rather than throwing", () => {
  for (const value of [[], "USD", true, {}]) assert.ok(audit({ ...example("TSM"), contract: value }));
  const row = example("TSM"); row.contract.proof.availableAt = "2024-99-99";
  assert.ok(audit(row));
});

test("missing or null actual source fields cannot silently borrow values from the contract", () => {
  for (const field of ["amount", "unit", "metricName", "fiscalPeriod"]) {
    const row = example("TSM"); row[field] = null;
    assert.match(audit(row).reason, /original_metric_unit_or_amount_mismatch/, field);
    delete row[field];
    assert.match(audit(row).reason, /original_metric_unit_or_amount_mismatch/, field);
  }
});

test("GoDaddy inference also binds already-published IPO completion and predecessor ownership", () => {
  for (const change of [
    row => { delete row.contract.proof.supportingDocuments; },
    row => { row.contract.proof.supportingDocuments[0].availableAt = "2015-05-13"; },
    row => { row.contract.proof.supportingDocuments[0].documentSha256 = "f".repeat(64); },
    row => { row.contract.proof.supportingDocuments[0].quotes[1] = "Unrelated predecessor."; },
    row => { row.contract.proof.quotes[2] = "GoDaddy Inc. does not control Desert Newco."; },
  ]) {
    const row = example("GDDY"); change(row); assert.ok(audit(row), String(change));
  }
});

test("BG15 and MAA1 independently validate without changing EPS into monetary millions", () => {
  assert.equal(nextBatch.length, 16);
  assert.equal(nextBatch.filter(r => r.unit === "currency_per_share").length, 14);
  for (const row of nextBatch) {
    assert.equal(audit(row), null, `${row.ticker}/${row.sourceId}`);
    if (row.unit === "currency_per_share") {
      assert.equal(row.amount, null);
      assert.equal(row.contract.amountM, null);
      assert.equal(row.perShareValue, row.contract.perShareValue);
    }
  }
});

test("EPS missing/null scalar and a disguised million-unit amount always fail", () => {
  for (const change of [r=>{r.perShareValue=null;},r=>{delete r.perShareValue;},r=>{r.amount=2.31;},
    r=>{r.contract.amountM=2.31;},r=>{r.contract.perShareValue*=1000000;},r=>{r.metricName="revenue_guidance";},
    r=>{r.perShareValue=r.contract.perShareValue=99;}]) {
    const row = structuredClone(nextBatch.find(r=>r.ticker==="MAA")); change(row); assert.ok(audit(row),String(change));
  }
});

test("Bunge predecessor/current issuer identity cannot be crossed or used before publication", () => {
  for (const change of [r=>{r.contract.proof.cik="0001996862";},r=>{r.contract.proof.availableAt="2025-01-01";},
    r=>{r.contract.observedAt=r.observedAt="2024-02-07";}]) {
    const row=structuredClone(nextBatch.find(r=>r.ticker==="BG"&&r.observedAt<"2023-11-01"));change(row);assert.ok(audit(row));
  }
  const row=structuredClone(nextBatch.find(r=>r.ticker==="BG"&&r.observedAt==="2024-02-07"));
  row.contract.proof.quotes[2]="A different issuer bought some assets.";
  assert.ok(auditStatementUnitCurrencyEvidence({ticker:row.ticker,observedAt:row.observedAt,proof:row.contract.proof,reviewed:{}}));
});

test("MAA original fragments bind file/units/parent context, not LP or a generic dollar label", () => {
  for (const change of [p=>{p.xbrlStatementEvidence.documentSha256="f".repeat(64);},
    p=>{p.xbrlStatementEvidence.fragments[0].raw=p.xbrlStatementEvidence.fragments[0].raw.replace("iso4217:USD","iso4217:CAD");},
    p=>{p.xbrlStatementEvidence.fragments[2].raw=p.xbrlStatementEvidence.fragments[2].raw.replace(">srt:ParentCompanyMember<",">us-gaap:LimitedPartnerMember<");},
    p=>{p.xbrlStatementEvidence.fragments.pop();}]) {
    const row=structuredClone(nextBatch.find(r=>r.ticker==="MAA"));change(row.contract.proof);assert.ok(audit(row));
  }
});

test("independent XML unit oracle rejects semantic tampering even with recomputed fragment hashes", () => {
  for (const change of [f=>f.raw.replace("iso4217:USD","iso4217:CAD"),f=>f.raw.replace(">srt:ParentCompanyMember<",">us-gaap:LimitedPartnerMember<"),
    f=>f.raw.replace("2018-12-31","2019-12-31"),f=>f.raw.replace('unitRef="usdPerShare"','unitRef="usd"')]) {
    const row=structuredClone(nextBatch.find(r=>r.ticker==="MAA"));const proof=row.contract.proof;
    proof.xbrlStatementEvidence.fragments.forEach(f=>{f.raw=change(f);});
    proof.xbrlStatementEvidence.fragmentsSha256=proof.xbrlStatementEvidence.fragments.map(f=>hash(f.raw));
    const reviewed=structuredClone(registry.documents[proof.documentSha256]);
    reviewed.xbrlStatementEvidence.fragmentsSha256=[...proof.xbrlStatementEvidence.fragmentsSha256];
    assert.ok(auditStatementUnitCurrencyEvidence({ticker:row.ticker,observedAt:row.observedAt,proof,reviewed}));
  }
});

test("GEV and NWSA exact group reporting declarations and original filed headers independently pass", () => {
  assert.equal(directBatch.length, 2);
  for (const row of directBatch) assert.equal(audit(row), null, row.ticker);
});

test("GEV/NWSA header, issuer group, date and direct currency cannot be changed", () => {
  for (const original of directBatch) {
    for (const mutate of [
      p => { delete p.filingDateEvidence; }, p => { p.filingDateEvidence.documentSha256 = "0".repeat(64); },
      p => { p.filingDateEvidence.headerText += "changed"; }, p => { p.availableAt = "2030-01-01"; },
      p => { p.quotes[1] = "GE Aerospace consolidated group"; }, p => { p.inference = true; },
      p => { p.quotes[0] = "The subsidiary functional currency is USD."; },
      p => { p.quotes[0] = "Most revenue is invoiced in U.S. dollars."; },
    ]) {
      const row = structuredClone(original); mutate(row.contract.proof); assert.ok(audit(row), String(mutate));
    }
  }
});

test("direct header oracle rejects semantic tampering even when local header hashes are recomputed", () => {
  for (const original of directBatch) {
    for (const kind of ["date", "cik", "accession", "form"]) {
      const row = structuredClone(original), proof = row.contract.proof;
      const old = kind === "date" ? (row.ticker === "GEV" ? "20240305" : "2013-09-20") : proof[kind];
      proof.filingDateEvidence.headerText = proof.filingDateEvidence.headerText.replaceAll(old, "INVALID");
      proof.filingDateEvidence.headerTextSha256 = hash(proof.filingDateEvidence.headerText);
      const reviewed = structuredClone(registry.documents[proof.documentSha256]);
      reviewed.filingDateEvidence.headerTextSha256 = proof.filingDateEvidence.headerTextSha256;
      assert.ok(auditExactDirectReportingCurrency({ ...row, proof, reviewed }), `${row.ticker}/${kind}`);
    }
  }
});

test("DIS14 and CI4 original consolidated USD statement evidence independently pass", () => {
  assert.equal(legacyBatch.length, 18);
  assert.equal(Object.keys(legacyData.documents).length, 9);
  for (const row of legacyBatch) assert.equal(audit(row), null, `${row.ticker}/${row.sourceId}`);
});

test("old Disney and Cigna source CIK cannot cross corporate reorganization boundaries", () => {
  for (const ticker of ["DIS", "CI"]) {
    const row = structuredClone(legacyBatch.find(r => r.ticker === ticker));
    row.observedAt = row.contract.observedAt = ticker === "DIS" ? "2019-03-20" : "2018-12-20";
    assert.match(audit(row).reason, /historical_issuer_boundary/);
  }
});

test("legacy statement oracle rejects CAD, qualified segment, future period and lost categories with recomputed hashes", () => {
  for (const ticker of ["DIS", "CI"]) {
    for (const kind of ["currency", "segment", "period", "category", "cik"]) {
      const row = structuredClone(legacyBatch.find(r => r.ticker === ticker));
      const proof = row.contract.proof, xml = proof.xbrlStatementEvidence;
      if (kind === "category") xml.fragments.pop();
      else for (const f of xml.fragments) {
        if (kind === "currency") f.raw = f.raw.replaceAll("iso4217:USD", "iso4217:CAD");
        if (kind === "segment") f.raw = f.raw.replace(/<\/(xbrli:)?entity>/g, (_m,prefix="")=>`<${prefix}segment/></${prefix}entity>`);
        if (kind === "period") f.raw = f.raw.replaceAll(xml.periodEnd, "2099-12-31");
        if (kind === "cik") f.raw = f.raw.replaceAll(proof.cik, "0000000001");
      }
      xml.fragmentsSha256 = xml.fragments.map(f => hash(f.raw));
      const reviewed = structuredClone(registry.documents[proof.documentSha256]);
      reviewed.xbrlStatementEvidence.fragmentsSha256 = [...xml.fragmentsSha256];
      assert.ok(auditLegacyParentStatementCurrency({ ticker, observedAt: row.observedAt, proof, reviewed }), `${ticker}/${kind}`);
    }
  }
});

test("legacy header evidence and consolidated ownership are mandatory", () => {
  for (const mutate of [p=>{delete p.filingDateEvidence;}, p=>{p.quotes[0]="Subsidiary statement";},
    p=>{p.xbrlStatementEvidence.contextScope="segment";},p=>{p.xbrlStatementEvidence.rootOpenTagSha256="0".repeat(64);}]) {
    const row = structuredClone(legacyBatch[0]); mutate(row.contract.proof); assert.ok(audit(row));
  }
});
