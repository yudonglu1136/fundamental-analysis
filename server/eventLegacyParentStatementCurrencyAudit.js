import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const sha = raw => crypto.createHash("sha256").update(raw).digest("hex");
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false });
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];

/** Independently parse four complete-parent statement categories. Reviewed
 * original documents and event IDs remain required by the outer auditor.
 * These historical CIKs cannot approve post-reorganization guidance.
 */
export function auditLegacyParentStatementCurrency({ ticker, observedAt, proof: p, reviewed }) {
  try {
    const xml = p.xbrlStatementEvidence, expected = reviewed?.xbrlStatementEvidence;
    const fail = reason => `legacy_parent_statement_${reason}`;
    if (!["DIS", "CI"].includes(ticker) || p.cik !== (ticker === "DIS" ? "0001001039" : "0000701221") ||
        observedAt >= (ticker === "DIS" ? "2019-03-20" : "2018-12-20") || p.form !== "10-K" || p.inference !== false ||
        p.evidenceType !== "dated_parent_statement_xbrl_currency") return fail("historical_issuer_boundary_mismatch");
    const age = (Date.parse(observedAt) - Date.parse(p.availableAt)) / 86400000;
    if (!(age > 0 && age <= 400)) return fail("prior_annual_availability_required");
    const owner = ticker === "DIS" ? "The Walt Disney Company and Subsidiaries Consolidated Statements of Income" : "Cigna Corporation Consolidated Statements of Income";
    if (p.quotes?.length !== 1 || p.quotes[0].toLowerCase() !== owner.toLowerCase()) return fail("consolidated_parent_owner_missing");
    const keys = ["sourceUrl", "documentSha256", "schemaVersion", "periodEnd", "rootOpenTagSha256", "contextScope"];
    if (!xml || !expected || !keys.every(k => xml[k] === expected[k]) ||
        xml.schemaVersion !== "whole-entity-original-statement-xbrl-v1" || xml.contextScope !== "whole_entity_no_dimensions") return fail("original_contract_binding_mismatch");
    const prefix = `https://www.sec.gov/Archives/edgar/data/${Number(p.cik)}/${p.accession.replaceAll("-", "")}/`;
    if (xml.sourceUrl !== prefix + `${ticker.toLowerCase()}-${xml.periodEnd.replaceAll("-", "")}.xml` || xml.periodEnd >= p.availableAt) return fail("same_filing_period_mismatch");
    if (sha(xml.rootOpenTag) !== xml.rootOpenTagSha256 ||
        !/xmlns(?::xbrli)?="http:\/\/www\.xbrl\.org\/2003\/instance"/.test(xml.rootOpenTag) ||
        !/xmlns:us-gaap="http:\/\/(?:fasb\.org|xbrl\.us)\/us-gaap\/\d{4}-\d{2}-\d{2}"/.test(xml.rootOpenTag) ||
        !/xmlns:iso4217="http:\/\/www\.xbrl\.org\/2003\/iso4217"/.test(xml.rootOpenTag)) return fail("namespace_mismatch");
    if (!Array.isArray(xml.fragments) || xml.fragments.length !== 8 || new Set(xml.fragments.map(f => f.key)).size !== 8 ||
        xml.fragments.some((f,i) => sha(f.raw) !== xml.fragmentsSha256?.[i] || sha(f.raw) !== expected.fragmentsSha256?.[i])) return fail("original_fragment_binding_mismatch");
    const root = parser.parse(xml.rootOpenTag + xml.fragments.map(f => f.raw).join("") + xml.rootCloseTag).xbrl;
    const contexts = new Map(array(root.context).map(c => [c["@_id"], c]));
    const units = new Map(array(root.unit).map(u => [u["@_id"], u]));
    if (contexts.size !== 2 || units.size !== 2) return fail("incomplete_contexts_or_units");
    const decoded = [];
    for (const name of ["Assets", ticker === "DIS" ? "SalesRevenueNet" : "Revenues", "NetCashProvidedByUsedInOperatingActivities", "EarningsPerShareDiluted"]) {
      const facts = array(root[name]);
      if (facts.length !== 1) return fail("missing_or_duplicated_statement_category");
      const f = facts[0], context = contexts.get(f["@_contextRef"]), unit = units.get(f["@_unitRef"]);
      if (!context || !unit || context.entity?.identifier?.["#text"] !== p.cik || context.entity.identifier["@_scheme"] !== "http://www.sec.gov/CIK" ||
          context.entity.segment !== undefined || context.scenario !== undefined) return fail("not_whole_parent_no_dimensions");
      if (!/^-?\d+(?:\.\d+)?$/.test(f["#text"])) return fail("nonnumeric_statement_fact");
      if (name === "Assets") {
        if (context.period?.instant !== xml.periodEnd) return fail("balance_period_mismatch");
      } else {
        const days = (Date.parse(context.period?.endDate) - Date.parse(context.period?.startDate)) / 86400000;
        if (context.period?.endDate !== xml.periodEnd || !(days >= 330 && days <= 380)) return fail("annual_flow_period_mismatch");
      }
      if (name === "EarningsPerShareDiluted") {
        if (unit.divide?.unitNumerator?.measure !== "iso4217:USD" || !["shares", "xbrli:shares"].includes(unit.divide?.unitDenominator?.measure)) return fail("eps_not_usd_per_share");
      } else if (unit.measure !== "iso4217:USD" || unit.divide !== undefined) return fail("monetary_statement_not_usd");
      decoded.push({ concept: name, value: f["#text"], contextRef: f["@_contextRef"], unitRef: f["@_unitRef"] });
    }
    if (JSON.stringify(decoded) !== JSON.stringify(xml.reconstructedFacts)) return fail("independent_fact_reconstruction_mismatch");
    const header = p.filingDateEvidence, headerExpected = reviewed?.filingDateEvidence;
    if (!header || !headerExpected || !["sourceUrl", "documentSha256", "headerTextSha256"].every(k => header[k] === headerExpected[k]) ||
        sha(header.headerText) !== header.headerTextSha256 || header.sourceUrl !== prefix + p.accession + "-index.html") return fail("original_header_binding_mismatch");
    if (header.headerText.match(/Filing Date (\d{4}-\d{2}-\d{2})/)?.[1] !== p.availableAt ||
        !new RegExp(`CIK\\s*:\\s*${p.cik}\\b`).test(header.headerText) || !header.headerText.includes(p.accession) || !header.headerText.includes("Form 10-K")) return fail("original_header_semantic_mismatch");
    return null;
  } catch { return "legacy_parent_statement_invalid_original_proof"; }
}
