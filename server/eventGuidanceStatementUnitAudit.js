import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const hash = text => crypto.createHash("sha256").update(text).digest("hex");
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false });
const parse = raw => parser.parse(raw);
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];

/** Independent interpretation of reviewed original statement units. Does not
 * import the producer, infer USD from quotes, or borrow an LP/segment context.
 */
export function auditStatementUnitCurrencyEvidence({ ticker, observedAt, proof, reviewed }) {
  try {
    if (proof.evidenceType === "explicit_consolidated_statement_currency_units") {
      if (ticker !== "BG" || observedAt !== "2024-02-07" || proof.availableAt !== observedAt || proof.cik !== "0001996862" || proof.form !== "8-K" || proof.quotes.length !== 3) return "statement_owner_or_date_mismatch";
      if (!/Consolidated Earnings Data[^]*\(US\$ in millions, except per share data\)/.test(proof.quotes[0]) ||
          !/Condensed Consolidated Balance Sheets[^]*\(US\$ in millions\)/.test(proof.quotes[1])) return "missing_consolidated_usd_captions";
      if (!["On November 1, 2023 Bunge Global SA completed", "Bermuda to Switzerland", "Each common share of Bunge Limited was cancelled in exchange for an equal number and par value of registered shares of Bunge Global SA"].every(text => proof.quotes[2].includes(text))) return "missing_dated_bunge_issuer_continuity";
      return null;
    }
    if (ticker !== "MAA" || observedAt !== "2019-05-02" || proof.availableAt !== "2019-02-21" || proof.cik !== "0000912595" || proof.form !== "10-K") return "xbrl_parent_owner_or_date_mismatch";
    const xml = proof.xbrlStatementEvidence, expected = reviewed.xbrlStatementEvidence;
    if (!xml || !expected || xml.sourceUrl !== "https://www.sec.gov/Archives/edgar/data/912595/000091259519000015/maa-20181231.xml" ||
        xml.sourceUrl !== expected.sourceUrl || xml.documentSha256 !== expected.documentSha256 ||
        !Array.isArray(xml.fragments) || xml.fragments.length !== 8 || new Set(xml.fragments.map(f => f.key)).size !== 8 ||
        xml.fragments.some((f, i) => hash(f.raw) !== xml.fragmentsSha256?.[i] || hash(f.raw) !== expected.fragmentsSha256?.[i])) return "original_xbrl_fragment_binding_mismatch";
    const fragments = new Map(xml.fragments.map(f => [f.key, parse(f.raw)]));
    const unit = fragments.get("unit:usd")?.["xbrli:unit"];
    const shareUnit = fragments.get("unit:usdPerShare")?.["xbrli:unit"];
    if (unit?.["@_id"] !== "usd" || unit["xbrli:measure"] !== "iso4217:USD" || unit["xbrli:divide"] != null ||
        shareUnit?.["@_id"] !== "usdPerShare" || shareUnit["xbrli:divide"]?.["xbrli:unitNumerator"]?.["xbrli:measure"] !== "iso4217:USD" ||
        shareUnit["xbrli:divide"]?.["xbrli:unitDenominator"]?.["xbrli:measure"] !== "xbrli:shares") return "original_xbrl_currency_or_share_unit_mismatch";
    const instant = "FI2018Q4_srt_ConsolidatedEntitiesAxis_srt_ParentCompanyMember";
    const annual = "FD2018Q4YTD_srt_ConsolidatedEntitiesAxis_srt_ParentCompanyMember";
    for (const id of [instant, annual]) {
      const context = fragments.get(`context:${id}`)?.["xbrli:context"];
      const entity = context?.["xbrli:entity"];
      const members = asArray(entity?.["xbrli:segment"]?.["xbrldi:explicitMember"]);
      if (context?.["@_id"] !== id || entity?.["xbrli:identifier"]?.["#text"] !== "0000912595" ||
          entity?.["xbrli:identifier"]?.["@_scheme"] !== "http://www.sec.gov/CIK" || members.length !== 1 ||
          members[0]["@_dimension"] !== "srt:ConsolidatedEntitiesAxis" || members[0]["#text"] !== "srt:ParentCompanyMember" ||
          entity?.["xbrli:segment"]?.["xbrldi:typedMember"] != null || context["xbrli:scenario"] != null) return "xbrl_not_exact_parent_consolidated_context";
      const period = context["xbrli:period"];
      if (id === instant ? period?.["xbrli:instant"] !== "2018-12-31" : period?.["xbrli:startDate"] !== "2018-01-01" || period?.["xbrli:endDate"] !== "2018-12-31") return "xbrl_statement_period_mismatch";
    }
    for (const name of ["Assets", "Revenues", "NetCashProvidedByUsedInOperatingActivities", "EarningsPerShareDiluted"]) {
      const fact = fragments.get(`fact:${name}`)?.[`us-gaap:${name}`];
      if (!fact || fact["@_contextRef"] !== (name === "Assets" ? instant : annual) ||
          fact["@_unitRef"] !== (name === "EarningsPerShareDiluted" ? "usdPerShare" : "usd") ||
          !/^-?\d+(?:\.\d+)?$/.test(fact["#text"])) return "xbrl_parent_monetary_or_per_share_fact_mismatch";
    }
    return null;
  } catch { return "invalid_statement_unit_proof"; }
}
