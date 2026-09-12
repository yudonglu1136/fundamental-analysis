import crypto from "node:crypto";
import fs from "node:fs";
import { independentGuidanceCurrencyMismatch, independentGuidanceMidpointMismatch } from "./guidanceEvidenceAudit.js";
import { independentPerShareEvidence } from "./guidancePerShareEvidenceAudit.js";
import { auditStatementUnitCurrencyEvidence } from "./eventGuidanceStatementUnitAudit.js";
import { auditExactDirectReportingCurrency } from "./eventDirectReportingCurrencyAudit.js";
import { auditCsgpFergCurrency } from "./eventCsgpFergCurrencyAudit.js";
import { auditAvavStatementCurrency } from "./eventAvavStatementCurrencyAudit.js";
import { auditEarlyGroupCurrencyInference } from "./eventEarlyGroupCurrencyInferenceAudit.js";
import { auditLegacyParentStatementCurrency } from "./eventLegacyParentStatementCurrencyAudit.js";

const VERSION = "event-specific-official-currency-v1-2026-09-06";
const REGISTRY = JSON.parse(fs.readFileSync(new URL("./config/guidance-currency-reviewed-documents.json", import.meta.url), "utf8"));
const hash = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");
const close = (left, right) => Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= 1e-7;
const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const declarations = [
  /(?:functional and )?reporting currency of the Company(?: and its subsidiaries)? is (?:the )?(?:U\.?S\.?|United States) dollar/i,
  /Our reporting currency and the functional currency of our wholly owned foreign subsidiaries is the U\.S\. dollar/i,
  /Shopify reports in U\.S\. dollars and in accordance with U\.S\. GAAP/i,
  /(?:Bunge's|Our) reporting currency is the U\.S\. dollar/i
];

/** Independent event-level evidence audit. No issuer financial currency override.
 * Registry entries bind the exact reviewed primary document/paragraph hashes and
 * event IDs. The applier separately verifies those paragraphs against whole
 * frozen HTML bytes; this auditor independently reconstructs meaning and dates.
 * Absent contracts are not approved or rejected here: the ordinary currency
 * audit remains responsible for all other rows.
 */
export function auditEventGuidanceCurrencyEvidence({ ticker, sourceId, observedAt, evidence, currency, contract,
  amount, unit, metricName, fiscalPeriod, perShareValue }) {
  if (contract == null) return null;
  const fail = (reason, details = {}) => ({ reason: `guidance_official_event_currency_${reason}`, details });
  try {
    if (typeof contract !== "object" || Array.isArray(contract) || contract.version !== VERSION) return fail("invalid_contract");
    const proof = contract.proof;
    if (!proof || contract.ticker !== ticker || contract.sourceId !== sourceId || contract.observedAt !== observedAt ||
        contract.originalQuoteSha256 !== hash(evidence)) return fail("original_owner_or_quote_mismatch");
    if (contract.originalQuotedCurrency !== null || contract.reportingCurrencyOverride !== false ||
        contract.resolvedCurrency !== "USD" || currency !== "USD" || proof.currency !== "USD") return fail("currency_or_scope_mismatch");
    if (!validDate(observedAt) || !validDate(proof.availableAt) || proof.availableAt > observedAt) return fail("future_or_invalid_source_date");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(proof.accession || "") || !/^\d{10}$/.test(proof.cik || "")) return fail("invalid_filing_identity");
    const expectedUrl = new RegExp(`^https://www\\.sec\\.gov/Archives/edgar/data/${Number(proof.cik)}/${proof.accession.replaceAll("-", "")}/[^/]+\\.htm$`);
    if (!expectedUrl.test(proof.sourceUrl || "")) return fail("issuer_accession_url_mismatch");
    const reviewed = REGISTRY.documents[proof.documentSha256];
    if (!reviewed || reviewed.ticker !== ticker || reviewed.cik !== proof.cik || reviewed.sourceUrl !== proof.sourceUrl ||
        reviewed.accession !== proof.accession || reviewed.availableAt !== proof.availableAt ||
        reviewed.evidenceType !== contract.evidenceType || proof.evidenceType !== contract.evidenceType ||
        !reviewed.sourceIds.includes(sourceId)) return fail("unreviewed_document_or_event");
    if (!Array.isArray(proof.quotes) || proof.quotes.length !== reviewed.paragraphSha256.length ||
        proof.quotes.some((quote, index) => hash(quote) !== reviewed.paragraphSha256[index] || hash(quote) !== proof.paragraphSha256?.[index])) {
      return fail("original_primary_paragraph_hash_mismatch");
    }
    if (proof.documentVerification !== "frozen_original_html_sha256_and_exact_normalized_paragraphs_verified" ||
        !/^[a-f0-9]{64}$/.test(contract.sourceLedgerSha256 || "") || !/^[a-f0-9]{64}$/.test(contract.preEnrichmentPayloadSha256 || "")) {
      return fail("missing_original_document_verification");
    }
    const eps = contract.unit === "currency_per_share";
    if (unit !== contract.unit || !metricName || metricName !== contract.metricName || !fiscalPeriod || fiscalPeriod !== contract.fiscalPeriod ||
        (eps ? metricName !== "eps_guidance" || amount !== null || contract.amountM !== null || !Number.isFinite(perShareValue) || !Number.isFinite(contract.perShareValue) || !close(perShareValue, contract.perShareValue)
          : contract.unit !== "reported millions" || contract.amountM == null || !Number.isFinite(contract.amountM) || amount == null || !Number.isFinite(amount) || !close(amount, contract.amountM))) return fail("original_metric_unit_or_amount_mismatch");
    const conflict = eps ? independentPerShareEvidence({ evidence, value: perShareValue, unit, currency: "USD" })
      : independentGuidanceCurrencyMismatch({ amount: contract.amountM, evidence, currency: "USD" });
    if (conflict) return fail("original_quote_currency_conflict", conflict);
    const midpoint = eps ? null : independentGuidanceMidpointMismatch({ amount: contract.amountM, evidence });
    if (midpoint) return fail("original_quote_amount_mismatch", midpoint);
    const primary = proof.quotes[0];
    if (contract.evidenceType === "explicit_same_event_guidance_currency") {
      if (ticker !== "TSM" || contract.metricName !== "revenue_guidance" || proof.availableAt !== observedAt || proof.form !== "6-K") return fail("wrong_same_event_owner");
      const range = primary.match(/performance for (?:the )?(first|second|third|fourth) quarter (20\d{2}) to be as follows:\s*(?:[•◼-]\s*)?Revenue is expected to be between US\$([\d.]+) billion and US\$([\d.]+) billion/i);
      if (!range) return fail("missing_explicit_primary_usd_revenue_range");
      const q = { first: 1, second: 2, third: 3, fourth: 4 }[range[1].toLowerCase()];
      const year = Number(range[2]);
      const low = Number(range[3]) * 1000;
      const high = Number(range[4]) * 1000;
      const sourcePeriod = contract.fiscalPeriod.match(/^Q([1-4])(20\d{2})$/);
      if (!sourcePeriod) return fail("invalid_source_period");
      const expectedQ = Number(sourcePeriod[1]) % 4 + 1;
      const expectedYear = Number(sourcePeriod[2]) + (sourcePeriod[1] === "4" ? 1 : 0);
      const originalQ = String(evidence).match(/\b(first|second|third|fourth) quarter revenue\b|\bQ([1-4]) revenue\b/i);
      const originalQuarter = originalQ?.[2] ? Number(originalQ[2]) : { first: 1, second: 2, third: 3, fourth: 4 }[originalQ?.[1]?.toLowerCase()];
      if (q !== expectedQ || year !== expectedYear || originalQuarter !== q || low <= 0 || high < low ||
          !close((low + high) / 2, contract.amountM) || !close(proof.primaryGuidance?.lowM, low) ||
          !close(proof.primaryGuidance?.highM, high) || proof.primaryGuidance?.quarter !== q || proof.primaryGuidance?.year !== year) return fail("primary_range_or_quarter_mismatch");
    } else if (contract.evidenceType === "explicit_company_reporting_currency_declaration") {
      if (["GEV", "NWSA", "CSGP", "FERG", "APA"].includes(ticker)) {
        const validator = ["CSGP", "FERG", "APA"].includes(ticker) ? auditCsgpFergCurrency : auditExactDirectReportingCurrency;
        const mismatch = validator({ ticker, sourceId, observedAt, proof, reviewed });
        if (mismatch) return fail(mismatch);
      } else if (!proof.quotes.some((quote) => declarations.some((pattern) => pattern.test(quote))) || proof.inference === true) return fail("missing_direct_company_declaration");
      if (ticker === "BG" && (proof.cik !== "0001144519" || observedAt >= "2023-11-01" || proof.form !== "10-K" ||
          (Date.parse(observedAt) - Date.parse(proof.availableAt)) / 86400000 > 400)) return fail("dated_predecessor_identity_mismatch");
    } else if (["explicit_consolidated_statement_currency_units", "dated_parent_statement_xbrl_currency"].includes(contract.evidenceType)) {
      const mismatch = proof.xbrlStatementEvidence?.schemaVersion === "avav-original-parent-statement-currency-v1"
        ? auditAvavStatementCurrency({ ticker, sourceId, observedAt, proof, reviewed })
        : proof.xbrlStatementEvidence?.schemaVersion === "whole-entity-original-statement-xbrl-v1"
        ? auditLegacyParentStatementCurrency({ ticker, observedAt, proof, reviewed })
        : auditStatementUnitCurrencyEvidence({ ticker, observedAt, proof, reviewed });
      if (mismatch) return fail(mismatch);
    } else if (contract.evidenceType === "issuer_reviewed_consolidation_presentation_inference") {
      if (["TSLA", "ABBV"].includes(ticker)) {
        const mismatch = auditEarlyGroupCurrencyInference({ ticker, sourceId, observedAt, proof, reviewed });
        return mismatch ? fail(mismatch) : null;
      }
      if (!proof.inference || !proof.reasoning || !proof.limitations || !proof.issuerConsolidatedStatementsTitle || proof.form !== "424B4" ||
          reviewed.reviewClassification !== "analyst_inference" || proof.quotes.length !== (ticker === "GDDY" ? 3 : 2) ||
          !/consolidated financial statements/i.test(proof.quotes[1]) || !/subsidiaries/i.test(proof.quotes[1])) return fail("missing_consolidation_review");
      const balanceSheet = ticker === "GDDY" ? /Assets denominated in foreign currencies/i.test(primary) : /assets and liabilities/i.test(primary);
      const translatedUsd = /(?:translated|translates|re-?measured).{0,160}(?:into|to) U\.S\. [Dd]ollars/.test(primary);
      const revenueExpenses = /revenue and (?:costs and )?expenses/i.test(primary) || ticker === "GDDY" && /revenue and expense transactions/i.test(primary);
      const operationsOrOci = /(?:comprehensive income|consolidated statements of operations|stockholders’ equity)/i.test(primary);
      if (!balanceSheet || !translatedUsd || !revenueExpenses || !operationsOrOci) return fail("subsidiary_functional_sentence_insufficient");
      if (ticker === "GDDY" && (!/Our functional currency, and the functional currency of each of our subsidiaries, is the U\.S\. dollar/.test(primary) ||
          !/GoDaddy Inc\. will consolidate Desert Newco/.test(proof.quotes[2]) || !/non-controlling interest/.test(proof.quotes[2]))) return fail("missing_predecessor_consolidation_link");
      if (ticker === "GDDY") {
        const support = proof.supportingDocuments;
        if (support?.length !== 1 || reviewed.supportingDocuments?.length !== 1) return fail("missing_predecessor_closing_confirmation");
        const current = support[0]; const expected = reviewed.supportingDocuments[0];
        if (!["availableAt", "sourceUrl", "documentSha256", "cik", "accession", "form"].every((key) => current[key] === expected[key]) ||
            !validDate(current.availableAt) || current.availableAt > observedAt || current.cik !== proof.cik ||
            current.quotes?.length !== 2 || current.quotes.some((quote, index) => hash(quote) !== expected.paragraphSha256[index] || hash(quote) !== current.paragraphSha256?.[index]) ||
            !/successfully closed its initial public offering/.test(current.quotes[0]) || !/predecessor of GoDaddy Inc\. for financial reporting purposes/.test(current.quotes[1])) return fail("predecessor_closing_confirmation_mismatch");
      }
    } else return fail("unsupported_evidence_type");
    return null;
  } catch (error) {
    return fail("invalid_contract", { error: String(error.message || error) });
  }
}
