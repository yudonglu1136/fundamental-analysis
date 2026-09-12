import crypto from "node:crypto";

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");

/** Independent reading of the two original issuer declarations and dated SEC
 * headers. No reporting currency is inferred from a subsidiary or sales mix.
 */
export function auditExactDirectReportingCurrency({ ticker, sourceId, observedAt, proof, reviewed }) {
  const fail = "exact_group_reporting_currency_evidence_mismatch";
  if (!["GEV", "NWSA"].includes(ticker) || proof.inference !== false || proof.quotes?.length !== 2) return fail;
  const gev = ticker === "GEV";
  if (sourceId !== (gev ? "99db92ac9e105e032d544068" : "b16468d693c7d2867723e024") ||
      observedAt !== (gev ? "2024-04-25" : "2013-11-11") ||
      proof.cik !== (gev ? "0001996810" : "0001564708") ||
      proof.availableAt !== (gev ? "2024-03-05" : "2013-09-20") ||
      proof.form !== (gev ? "10-12B/A" : "10-K") ||
      proof.accession !== (gev ? "0001193125-24-059354" : "0001193125-13-373501")) return fail;
  const [declaration, owner] = proof.quotes;
  if (gev) {
    if (!/^Additionally, we are subject to foreign exchange translation risk due to changes in the value of foreign currencies in relation to our reporting currency, the U\.S\. Dollar\.$/.test(declaration) ||
        owner !== "General Electric Company (“GE”) of its wholly-owned subsidiary, GE Vernova LLC (together with its subsidiaries, “GE Vernova,” the “Company,” “we,” “us,” or “our”)") return fail;
  } else if (!/^Foreign currency translation risk is the risk that exchange rate gains or losses arise from translating foreign entities’ statements of earnings and balance sheets from functional currency to the Company’s reporting currency \(the U\.S\. dollar\) for consolidation purposes\.$/.test(declaration) ||
      owner !== "NEWS CORPORATION (Exact Name of Registrant as Specified in its Charter)") return fail;
  const header = proof.filingDateEvidence, expected = reviewed?.filingDateEvidence;
  if (!header || !expected || !["sourceUrl", "documentSha256", "headerTextSha256"].every(k => header[k] === expected[k]) ||
      typeof header.headerText !== "string" || hash(header.headerText) !== header.headerTextSha256) return "original_filing_header_binding_mismatch";
  const prefix = `https://www.sec.gov/Archives/edgar/data/${Number(proof.cik)}/${proof.accession.replaceAll("-", "")}/`;
  if (header.sourceUrl !== prefix + proof.accession + (gev ? "-index-headers.html" : "-index.html") ||
      proof.sourceUrl !== prefix + (gev ? "d542465dex991.htm" : "d581644d10k.htm")) return fail;
  const text = header.headerText;
  if (gev) {
    const captured = [text.match(/ACCESSION NUMBER:\s*(\d{10}-\d{2}-\d{6})/), text.match(/CONFORMED SUBMISSION TYPE:\s*(\S+)/),
      text.match(/FILED AS OF DATE:\s*(\d{8})\b/), text.match(/CENTRAL INDEX KEY:\s*(\d{10})\b/), text.match(/COMPANY CONFORMED NAME:\s*(GE Vernova LLC)\b/)];
    if (captured.some(m => !m) || captured[0][1] !== proof.accession || captured[1][1] !== proof.form ||
        captured[2][1] !== proof.availableAt.replaceAll("-", "") || captured[3][1] !== proof.cik) return "original_filing_header_semantic_mismatch";
  } else if (!text.includes(`SEC Accession No. ${proof.accession}`) || text.match(/Filing Date (\d{4}-\d{2}-\d{2})\b/)?.[1] !== proof.availableAt ||
      !/Form 10-K - Annual report/.test(text) || !/NEWS CORP \(Filer\) CIK : 0001564708\b/.test(text) || !/10-K d581644d10k\.htm 10-K/.test(text)) return "original_filing_header_semantic_mismatch";
  return null;
}
