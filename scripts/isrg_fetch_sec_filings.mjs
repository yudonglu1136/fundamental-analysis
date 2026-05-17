import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEC_DIR = path.join(ROOT, "data/local/isrg/sec");
const CIK = "0001035267";
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis-isrg-module contact@example.com";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function filingUrl(accession, primaryDocument) {
  const accessionNoDash = accession.replace(/-/g, "");
  const cikNoLeadingZeros = String(Number(CIK));
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accessionNoDash}/${primaryDocument}`;
}

await fs.mkdir(SEC_DIR, { recursive: true });

const submissionsUrl = `https://data.sec.gov/submissions/CIK${CIK}.json`;
const companyFactsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`;

const results = [];
try {
  const submissions = await fetchJson(submissionsUrl);
  await fs.writeFile(path.join(SEC_DIR, "sec_submissions.json"), JSON.stringify(submissions, null, 2));
  const recent = submissions.filings?.recent ?? {};
  const forms = recent.form ?? [];
  const accessionNumbers = recent.accessionNumber ?? [];
  const primaryDocuments = recent.primaryDocument ?? [];
  const filingDates = recent.filingDate ?? [];
  const acceptedDates = recent.acceptanceDateTime ?? [];
  const filings = forms
    .map((form, index) => ({
      form,
      accessionNumber: accessionNumbers[index],
      filingDate: filingDates[index],
      acceptedAt: acceptedDates[index],
      primaryDocument: primaryDocuments[index],
      url: accessionNumbers[index] && primaryDocuments[index] ? filingUrl(accessionNumbers[index], primaryDocuments[index]) : null,
    }))
    .filter((item) => ["10-K", "10-Q", "8-K", "DEF 14A"].includes(item.form))
    .slice(0, 40);
  await fs.writeFile(path.join(SEC_DIR, "recent_core_filings.json"), JSON.stringify({ ticker: "ISRG", cik: CIK, createdAt: new Date().toISOString(), filings }, null, 2));
  results.push({ id: "sec_submissions", status: "fetched", url: submissionsUrl, count: filings.length });
} catch (error) {
  results.push({ id: "sec_submissions", status: "failed", url: submissionsUrl, error: error instanceof Error ? error.message : String(error) });
}

try {
  const companyFacts = await fetchJson(companyFactsUrl);
  await fs.writeFile(path.join(SEC_DIR, "sec_companyfacts.json"), JSON.stringify(companyFacts, null, 2));
  results.push({ id: "sec_companyfacts", status: "fetched", url: companyFactsUrl });
} catch (error) {
  results.push({ id: "sec_companyfacts", status: "failed", url: companyFactsUrl, error: error instanceof Error ? error.message : String(error) });
}

await fs.writeFile(
  path.join(SEC_DIR, "sec_fetch_manifest.json"),
  JSON.stringify(
    {
      ticker: "ISRG",
      cik: CIK,
      fetchedAt: new Date().toISOString(),
      rule: "SEC data is official filing data, but XBRL facts still require duration/frame validation before promotion into actualData.",
      results,
    },
    null,
    2,
  ),
);

console.log(`ISRG SEC fetch complete: ${results.filter((item) => item.status === "fetched").length}/${results.length} source groups fetched.`);
