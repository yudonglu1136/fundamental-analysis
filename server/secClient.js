import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { tickerForHolding } from "./cusipOverrides.js";
import { gurus } from "./gurus.js";
import { loadPriceSeries, nearestPoint } from "./marketData.js";
import {
  databaseInfo,
  readDashboardSnapshot,
  readGuruExposureSnapshot,
  readGuruAsset,
  readGuruAssets,
  readGuruSnapshot,
  writeDashboardSnapshot,
  writeGuruExposureSnapshot,
  writeGuruSnapshot
} from "./localDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "cache");
const cacheFile = path.join(cacheDir, "gurus.json");
const guruCacheDir = path.join(cacheDir, "gurus");
const cacheTtlMs = 1000 * 60 * 30;
const insiderForm4FilingLimit = Math.max(10, Math.min(80, Number(process.env.INSIDER_FORM4_FILINGS || 30)));
const secUserAgent =
  process.env.SEC_USER_AGENT || "guru-analysis-dashboard/0.1 contact@example.com";
const secRequestTimeoutMs = Math.max(
  5000,
  Math.min(120000, Number(process.env.SEC_REQUEST_TIMEOUT_MS || 30000))
);
const publicRequestTimeoutMs = Math.max(
  5000,
  Math.min(120000, Number(process.env.PUBLIC_REQUEST_TIMEOUT_MS || 30000))
);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class SecRequestError extends Error {
  constructor(message, { status, url }) {
    super(message);
    this.name = "SecRequestError";
    this.status = status;
    this.url = url;
  }
}

function requestTimeoutError(url, timeoutMs) {
  const error = new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
  error.name = "RequestTimeoutError";
  error.url = url;
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = secRequestTimeoutMs) {
  const externalSignal = options.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(requestTimeoutError(url, timeoutMs)), timeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : requestTimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function numberValue(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "object" && "value" in value) return numberValue(value.value);
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && "value" in value) return stringValue(value.value);
  return String(value).trim();
}

function dateValue(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function cikPath(cik) {
  return String(cik).replace(/^0+/, "");
}

function archiveBaseUrl(cik, accessionNumber) {
  return `https://www.sec.gov/Archives/edgar/data/${cikPath(cik)}/${String(
    accessionNumber
  ).replace(/-/g, "")}`;
}

async function secFetch(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      "User-Agent": secUserAgent,
      "Accept": options.accept || "application/json, text/xml, text/plain, */*",
      ...options.headers
    }
  }, Number(options.timeoutMs) || secRequestTimeoutMs);

  if (!response.ok) {
    throw new SecRequestError(`SEC request failed ${response.status}: ${url}`, {
      status: response.status,
      url
    });
  }

  await wait(250);
  return response;
}

async function getJson(url) {
  const response = await secFetch(url);
  return response.json();
}

async function getText(url) {
  const response = await secFetch(url, { accept: "text/xml, text/plain, */*" });
  return response.text();
}

async function getPublicText(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "guru-analysis-dashboard/0.1",
      "Accept": "text/html, application/json, text/plain, */*"
    }
  }, publicRequestTimeoutMs);

  if (!response.ok) {
    throw new Error(`Public source request failed ${response.status}: ${url}`);
  }

  return response.text();
}

function filingsFromRecentShape(recent = {}) {
  const forms = recent.form || [];

  return forms.map((form, index) => ({
    form,
    accessionNumber: recent.accessionNumber?.[index],
    filingDate: recent.filingDate?.[index],
    reportDate: recent.reportDate?.[index],
    primaryDocument: recent.primaryDocument?.[index],
    primaryDocDescription: recent.primaryDocDescription?.[index]
  }));
}

function recentFilings(submission) {
  return filingsFromRecentShape(submission?.filings?.recent || {});
}

async function allSubmissionFilings(submission) {
  const filings = recentFilings(submission);
  for (const file of toArray(submission?.filings?.files)) {
    const name = stringValue(file?.name);
    if (!name) continue;
    try {
      const archived = await getJson(`https://data.sec.gov/submissions/${name}`);
      filings.push(...filingsFromRecentShape(archived?.filings?.recent || archived?.recent || archived));
      await wait(80);
    } catch {
      // Archived submissions are additive. Keep the recent feed if an older shard is temporarily unavailable.
    }
  }

  const byAccession = new Map();
  for (const filing of filings) {
    const key = filing.accessionNumber || `${filing.form}-${filing.filingDate}-${filing.reportDate}`;
    if (key) byAccession.set(key, filing);
  }
  return [...byAccession.values()];
}

async function recentOrArchivedFilings(submission, {
  formPattern = null,
  minimum = 0
} = {}) {
  const recent = recentFilings(submission);
  const matches = (filing) => !formPattern || formPattern.test(filing.form || "");
  if (!minimum || recent.filter(matches).length >= minimum) return recent;
  return allSubmissionFilings(submission);
}

async function getSubmission(cik) {
  return getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
}

async function getFilingIndex(cik, accessionNumber) {
  return getJson(`${archiveBaseUrl(cik, accessionNumber)}/index.json`);
}

async function getFilingDocument(cik, filing, preferredName) {
  const baseUrl = archiveBaseUrl(cik, filing.accessionNumber);
  const index = await getFilingIndex(cik, filing.accessionNumber);
  const items = toArray(index?.directory?.item);
  const candidates = items.map((item) => item.name).filter(Boolean);
  const preferredBaseName = preferredName ? String(preferredName).split("/").pop() : "";
  const primaryBaseName = filing.primaryDocument ? String(filing.primaryDocument).split("/").pop() : "";
  const preferredFromIndex = candidates.find(
    (item) => item === preferredName || item === preferredBaseName
  );
  const is13f = /^13F-HR/.test(filing.form || "");
  const xmlCandidates = candidates.filter((item) => /\.xml$/i.test(item));
  const nonPrimaryXml = xmlCandidates.filter(
    (item) => item !== filing.primaryDocument && item !== primaryBaseName
  );

  const name =
    preferredFromIndex ||
    (is13f ? nonPrimaryXml.find((item) => /infotable|13f|q[1-4]/i.test(item)) : "") ||
    (is13f ? nonPrimaryXml[0] : "") ||
    xmlCandidates.find((item) => /infotable/i.test(item)) ||
    xmlCandidates.find((item) => /form13f/i.test(item)) ||
    xmlCandidates.find((item) => /ownership|form4|wk-form4/i.test(item)) ||
    nonPrimaryXml[0] ||
    filing.primaryDocument;

  if (!name) {
    throw new Error(`No XML document found for ${filing.accessionNumber}`);
  }

  return {
    url: `${baseUrl}/${name}`,
    name,
    text: await getText(`${baseUrl}/${name}`)
  };
}

function cleanIssuer(value) {
  return stringValue(value)
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function normalize13fHolding(raw) {
  const issuer = cleanIssuer(raw.nameOfIssuer);
  const title = stringValue(raw.titleOfClass);
  const cusip = stringValue(raw.cusip).toUpperCase();
  const sharesNode = raw.shrsOrPrnAmt || {};
  const shares = numberValue(sharesNode.sshPrnamt);
  const shareType = stringValue(sharesNode.sshPrnamtType);
  const reportedValue = numberValue(raw.value);
  const putCall = stringValue(raw.putCall).toUpperCase();

  return {
    id: `${cusip || issuer}-${putCall || "COMMON"}`,
    issuer,
    ticker: tickerForHolding({ issuer, cusip }),
    title,
    cusip,
    putCall,
    reportedValue,
    value: reportedValue,
    shares,
    shareType
  };
}

function isCommonValueScaleCandidate(holding) {
  if (holding.putCall || holding.shareType !== "SH" || holding.shares <= 0 || holding.value <= 0) return false;
  return /(^| )(ADS?|ADR|CL|COM|ORD|SHS?|STK|UNIT)( |$)/i.test(holding.title || "");
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function infer13fValueScale(holdings) {
  const ratios = holdings
    .filter(isCommonValueScaleCandidate)
    .map((holding) => holding.value / holding.shares)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
    .sort((a, b) => a - b);

  if (ratios.length < 5) return 1;
  const middleRatio = median(ratios);
  return middleRatio > 0 && middleRatio < 5 ? 1000 : 1;
}

function normalize13fValueScale(holdings) {
  const scale = infer13fValueScale(holdings);
  return holdings.map((holding) => ({
    ...holding,
    value: holding.value * scale,
    valueScale: scale
  }));
}

function aggregate13fHoldings(holdings) {
  const byId = new Map();
  for (const holding of holdings) {
    if (!holding.issuer) continue;
    const key = holding.id || `${holding.cusip || holding.issuer}-${holding.putCall || "COMMON"}`;
    const current = byId.get(key);
    if (!current) {
      byId.set(key, { ...holding, sourceRows: 1 });
      continue;
    }

    byId.set(key, {
      ...current,
      issuer: current.issuer || holding.issuer,
      ticker: current.ticker || holding.ticker,
      title: current.title || holding.title,
      cusip: current.cusip || holding.cusip,
      putCall: current.putCall || holding.putCall,
      value: (current.value || 0) + (holding.value || 0),
      reportedValue: (current.reportedValue || 0) + (holding.reportedValue || 0),
      shares: (current.shares || 0) + (holding.shares || 0),
      valueScale: Math.max(current.valueScale || 1, holding.valueScale || 1),
      sourceRows: (current.sourceRows || 1) + 1
    });
  }

  return [...byId.values()];
}

function parse13fInfoTable(xmlText) {
  const parsed = xmlParser.parse(xmlText);
  const root = parsed.informationTable || parsed.XML?.informationTable || parsed;
  const tables = toArray(root.infoTable);

  return aggregate13fHoldings(normalize13fValueScale(tables.map(normalize13fHolding)));
}

function classifyChange(current, previous) {
  if (!previous && current) return "new";
  if (previous && !current) return "sold_out";
  const delta = (current?.shares || 0) - (previous?.shares || 0);
  if (delta > 0) return "increased";
  if (delta < 0) return "reduced";
  return "unchanged";
}

function compare13fHoldings(currentHoldings, previousHoldings) {
  const previousMap = new Map(previousHoldings.map((holding) => [holding.id, holding]));
  const currentMap = new Map(currentHoldings.map((holding) => [holding.id, holding]));
  const ids = new Set([...previousMap.keys(), ...currentMap.keys()]);

  return [...ids]
    .map((id) => {
      const current = currentMap.get(id);
      const previous = previousMap.get(id);
      const shares = current?.shares || 0;
      const prevShares = previous?.shares || 0;
      const changeShares = shares - prevShares;
      const value = current?.value || 0;
      const previousValue = previous?.value || 0;
      const base = current || previous;

      return {
        ...base,
        shares,
        prevShares,
        value,
        previousValue,
        changeShares,
        changePct: prevShares ? changeShares / Math.abs(prevShares) : null,
        action: classifyChange(current, previous)
      };
    })
    .sort((a, b) => Math.abs(b.changeShares) - Math.abs(a.changeShares));
}

function quarterLabel(reportDate) {
  const date = new Date(reportDate);
  if (!Number.isFinite(date.getTime())) return reportDate || "";
  return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function concentrationStats(holdings, totalValue) {
  const positive = holdings
    .filter((holding) => (holding.value || 0) > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  const denominator = totalValue || positive.reduce((sum, holding) => sum + (holding.value || 0), 0);
  const topHoldings = positive.slice(0, 10).map((holding) => ({
    id: holding.id,
    issuer: holding.issuer,
    ticker: holding.ticker,
    cusip: holding.cusip,
    value: holding.value || 0,
    shares: holding.shares || 0,
    pctPortfolio: denominator ? (holding.value || 0) / denominator : 0
  }));
  const hhi = denominator
    ? positive.reduce((sum, holding) => {
        const weight = (holding.value || 0) / denominator;
        return sum + weight * weight;
      }, 0)
    : 0;

  return {
    topHoldings,
    top10Weight: denominator ? topHoldings.reduce((sum, holding) => sum + holding.value, 0) / denominator : 0,
    topHoldingWeight: topHoldings[0]?.pctPortfolio || 0,
    hhi
  };
}

function changeStats(currentHoldings, previousHoldings, totalValue, previousValue) {
  const changes = compare13fHoldings(currentHoldings, previousHoldings);
  const averageBook = (Math.abs(totalValue || 0) + Math.abs(previousValue || 0)) / 2;
  const grossChange = changes.reduce(
    (sum, change) => sum + Math.abs((change.value || 0) - (change.previousValue || 0)),
    0
  );

  return {
    changes,
    newPositions: changes.filter((item) => item.action === "new").length,
    increasedPositions: changes.filter((item) => item.action === "increased").length,
    reducedPositions: changes.filter((item) => item.action === "reduced").length,
    soldOutPositions: changes.filter((item) => item.action === "sold_out").length,
    turnoverProxy: averageBook ? grossChange / (2 * averageBook) : 0,
    largestChanges: changes
      .filter((item) => item.action !== "unchanged")
      .sort(
        (a, b) =>
          Math.abs((b.value || 0) - (b.previousValue || 0)) -
          Math.abs((a.value || 0) - (a.previousValue || 0))
      )
      .slice(0, 12)
      .map((change) => ({
        id: change.id,
        issuer: change.issuer,
        ticker: change.ticker,
        cusip: change.cusip,
        action: change.action,
        value: change.value || 0,
        previousValue: change.previousValue || 0,
        valueChange: (change.value || 0) - (change.previousValue || 0),
        shares: change.shares || 0,
        prevShares: change.prevShares || 0,
        changeShares: change.changeShares || 0,
        changePct: change.changePct
      }))
  };
}

function summarize13fExposureQuarter(guru, filing, filingUrl, holdings, previousHoldings = []) {
  const totalValue = holdings.reduce((sum, holding) => sum + (holding.value || 0), 0);
  const previousValue = previousHoldings.reduce((sum, holding) => sum + (holding.value || 0), 0);
  const concentration = concentrationStats(holdings, totalValue);
  const movement = changeStats(holdings, previousHoldings, totalValue, previousValue);

  return {
    accessionNumber: filing.accessionNumber,
    reportDate: filing.reportDate,
    filingDate: filing.filingDate,
    quarterLabel: quarterLabel(filing.reportDate),
    reported13fValue: totalValue,
    previous13fValue: previousValue,
    valueChange: totalValue - previousValue,
    valueChangePct: previousValue ? (totalValue - previousValue) / Math.abs(previousValue) : null,
    positionCount: holdings.length,
    newPositions: movement.newPositions,
    increasedPositions: movement.increasedPositions,
    reducedPositions: movement.reducedPositions,
    soldOutPositions: movement.soldOutPositions,
    turnoverProxy: movement.turnoverProxy,
    top10Weight: concentration.top10Weight,
    topHoldingWeight: concentration.topHoldingWeight,
    concentrationHhi: concentration.hhi,
    topHoldings: concentration.topHoldings,
    largestChanges: movement.largestChanges,
    filing: decorateFiling(guru, filing, filingUrl)
  };
}

function exposureCacheIsFresh(payload) {
  const generatedAt = payload?.generatedAt ? new Date(payload.generatedAt).getTime() : 0;
  return Number.isFinite(generatedAt) && Date.now() - generatedAt < 1000 * 60 * 60 * 24;
}

async function loadLatest13fHoldings(guru, filings) {
  if (!guru.preferLatestNonZero13f) {
    const latest = filings[0];
    const latestDoc = await getFilingDocument(guru.cik, latest);
    return {
      latest,
      latestDoc,
      currentHoldings: parse13fInfoTable(latestDoc.text),
      previous: filings[1] || null
    };
  }

  for (let index = 0; index < filings.length; index += 1) {
    const candidate = filings[index];
    const doc = await getFilingDocument(guru.cik, candidate);
    const holdings = parse13fInfoTable(doc.text);
    const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    if (holdings.length && totalValue > 0) {
      return {
        latest: candidate,
        latestDoc: doc,
        currentHoldings: holdings,
        previous: filings[index + 1] || null
      };
    }
  }

  const latest = filings[0];
  const latestDoc = await getFilingDocument(guru.cik, latest);
  return {
    latest,
    latestDoc,
    currentHoldings: parse13fInfoTable(latestDoc.text),
    previous: filings[1] || null
  };
}

async function load13fGuru(guru) {
  const submission = await getSubmission(guru.cik);
  const filings = recentFilings(submission)
    .filter((filing) => /^13F-HR/.test(filing.form))
    .filter((filing) => filing.accessionNumber)
    .sort((a, b) => {
      const dateCompare = String(b.reportDate || "").localeCompare(String(a.reportDate || ""));
      return dateCompare || String(b.filingDate || "").localeCompare(String(a.filingDate || ""));
    });

  if (!filings[0]) {
    return withGuruShell(guru, {
      status: "missing",
      summary: { message: "No recent 13F-HR filings found in SEC submissions." }
    });
  }

  const { latest, latestDoc, currentHoldings, previous } = await loadLatest13fHoldings(guru, filings);
  const previousDoc = previous ? await getFilingDocument(guru.cik, previous) : null;
  const previousHoldings = previousDoc ? parse13fInfoTable(previousDoc.text) : [];
  const changes = compare13fHoldings(currentHoldings, previousHoldings);
  const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
  const previousValue = previousHoldings.reduce((sum, holding) => sum + holding.value, 0);
  const concentration = concentrationStats(currentHoldings, totalValue);
  const movement = changeStats(currentHoldings, previousHoldings, totalValue, previousValue);

  const holdings = currentHoldings
    .map((holding) => ({
      ...holding,
      pctPortfolio: totalValue ? holding.value / totalValue : 0,
      action: changes.find((change) => change.id === holding.id)?.action || "unchanged",
      changeShares: changes.find((change) => change.id === holding.id)?.changeShares || 0,
      changePct: changes.find((change) => change.id === holding.id)?.changePct ?? null
    }))
    .sort((a, b) => b.value - a.value);

  const activity = changes
    .filter((change) => change.action !== "unchanged")
    .map((change) => ({
      ...change,
      pctPortfolio: totalValue ? change.value / totalValue : 0
    }))
    .sort((a, b) => {
      const actionRank = { new: 4, increased: 3, reduced: 2, sold_out: 1 };
      return (actionRank[b.action] || 0) - (actionRank[a.action] || 0) || b.value - a.value;
    });

  return withGuruShell(guru, {
    status: "live",
    disclosureKind: "13F-HR",
    latestFiling: decorateFiling(guru, latest, latestDoc.url),
    previousFiling: previous ? decorateFiling(guru, previous, previousDoc?.url) : null,
    summary: {
      reportDate: latest.reportDate,
      filingDate: latest.filingDate,
      previousReportDate: previous?.reportDate || null,
      totalValue,
      previousValue,
      valueChange: totalValue - previousValue,
      totalPositions: currentHoldings.length,
      newPositions: activity.filter((item) => item.action === "new").length,
      increasedPositions: activity.filter((item) => item.action === "increased").length,
      reducedPositions: activity.filter((item) => item.action === "reduced").length,
      soldOutPositions: activity.filter((item) => item.action === "sold_out").length,
      top10Weight: concentration.top10Weight,
      topHoldingWeight: concentration.topHoldingWeight,
      concentrationHhi: concentration.hhi,
      turnoverProxy: movement.turnoverProxy
    },
    holdings: holdings.slice(0, 80),
    activity: activity.slice(0, 80)
  });
}

function transactionCodeLabel(code) {
  const labels = {
    P: "buy",
    S: "sell",
    A: "award",
    M: "option_exercise",
    F: "tax_withholding",
    G: "gift",
    D: "disposed_to_issuer"
  };
  return labels[code] || "other";
}

function hasForm4Value(value) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "object" && "value" in value) return hasForm4Value(value.value);
  return true;
}

function parseForm4(xmlText, filing) {
  const parsed = xmlParser.parse(xmlText);
  const doc = parsed.ownershipDocument || parsed;
  const issuer = doc.issuer || {};
  const issuerName = cleanIssuer(issuer.issuerName);
  const issuerCik = stringValue(issuer.issuerCik);
  const ticker = stringValue(issuer.issuerTradingSymbol);

  const nonDerivativeTransactions = toArray(
    doc.nonDerivativeTable?.nonDerivativeTransaction
  );
  const derivativeTransactions = toArray(doc.derivativeTable?.derivativeTransaction);
  const nonDerivativeHoldings = toArray(doc.nonDerivativeTable?.nonDerivativeHolding);

  const transactions = [
    ...nonDerivativeTransactions.map((tx) => form4Transaction(tx, "equity")),
    ...derivativeTransactions.map((tx) => form4Transaction(tx, "derivative"))
  ].map((tx) => ({
    ...tx,
    issuer: issuerName,
    issuerCik,
    ticker,
    filingDate: filing.filingDate,
    accessionNumber: filing.accessionNumber
  }));

  const holdings = nonDerivativeHoldings.map((holding) => ({
    issuer: issuerName,
    ticker,
    securityTitle: stringValue(holding.securityTitle),
    sharesOwned: numberValue(holding.postTransactionAmounts?.sharesOwnedFollowingTransaction),
    ownership: stringValue(holding.ownershipNature?.directOrIndirectOwnership)
  }));

  return { issuer: issuerName, issuerCik, ticker, transactions, holdings };
}

function form4Transaction(transaction, securityType) {
  const code = stringValue(transaction.transactionCoding?.transactionCode);
  const shares = numberValue(transaction.transactionAmounts?.transactionShares);
  const price = numberValue(transaction.transactionAmounts?.transactionPricePerShare);
  const postSharesRaw = transaction.postTransactionAmounts?.sharesOwnedFollowingTransaction;
  const sharesOwned = numberValue(
    postSharesRaw
  );
  const acquiredDisposed = stringValue(
    transaction.transactionAmounts?.transactionAcquiredDisposedCode
  );

  return {
    id: `${stringValue(transaction.transactionDate)}-${code}-${securityType}-${shares}-${sharesOwned}`,
    transactionDate: stringValue(transaction.transactionDate),
    securityTitle: stringValue(transaction.securityTitle),
    securityType,
    code,
    action: transactionCodeLabel(code),
    shares,
    price,
    notional: shares * price,
    acquiredDisposed,
    sharesOwned,
    hasSharesOwned: hasForm4Value(postSharesRaw),
    ownership: stringValue(transaction.ownershipNature?.directOrIndirectOwnership),
    footnoteIds: toArray(transaction.footnoteId).map((footnote) => footnote.id).filter(Boolean)
  };
}

function buildInsiderPositionSummary(transactions, holdings) {
  const byTicker = new Map();

  const bucketFor = (ticker, issuer = "") => {
    const key = String(ticker || "").trim().toUpperCase();
    if (!key) return null;
    if (!byTicker.has(key)) {
      byTicker.set(key, {
        ticker: key,
        issuer: issuer || key,
        latestSharesOwned: 0,
        latestSharesDate: "",
        latestFilingDate: "",
        latestOwnership: "",
        cumulativeBoughtShares: 0,
        cumulativeBoughtValue: 0,
        cumulativeSoldShares: 0,
        cumulativeSoldValue: 0,
        cumulativeTaxWithheldShares: 0,
        cumulativeTaxWithheldValue: 0,
        transactionCount: 0,
        buyCount: 0,
        sellCount: 0,
        lastAction: "",
        lastTransactionDate: ""
      });
    }
    const bucket = byTicker.get(key);
    if (issuer && (!bucket.issuer || bucket.issuer === key)) bucket.issuer = issuer;
    return bucket;
  };

  for (const holding of holdings || []) {
    const bucket = bucketFor(holding.ticker, holding.issuer);
    if (!bucket) continue;
    if (holding.sharesOwned > 0 && (!bucket.latestSharesDate || !bucket.latestSharesOwned)) {
      bucket.latestSharesOwned = holding.sharesOwned;
      bucket.latestOwnership = holding.ownership || bucket.latestOwnership;
    }
  }

  for (const tx of transactions || []) {
    const bucket = bucketFor(tx.ticker, tx.issuer);
    if (!bucket) continue;
    const date = tx.transactionDate || tx.filingDate || "";
    bucket.transactionCount += 1;
    if (!bucket.lastTransactionDate || date > bucket.lastTransactionDate) {
      bucket.lastAction = tx.action || "";
      bucket.lastTransactionDate = date;
    }
    if (tx.hasSharesOwned && (!bucket.latestSharesDate || date >= bucket.latestSharesDate)) {
      bucket.latestSharesOwned = tx.sharesOwned;
      bucket.latestSharesDate = date;
      bucket.latestFilingDate = tx.filingDate || "";
      bucket.latestOwnership = tx.ownership || bucket.latestOwnership;
    }

    if (tx.action === "buy") {
      bucket.buyCount += 1;
      bucket.cumulativeBoughtShares += tx.shares || 0;
      bucket.cumulativeBoughtValue += tx.notional || 0;
    } else if (tx.action === "sell") {
      bucket.sellCount += 1;
      bucket.cumulativeSoldShares += tx.shares || 0;
      bucket.cumulativeSoldValue += tx.notional || 0;
    } else if (tx.action === "tax_withholding") {
      bucket.cumulativeTaxWithheldShares += tx.shares || 0;
      bucket.cumulativeTaxWithheldValue += tx.notional || 0;
    }
  }

  return [...byTicker.values()]
    .map((item) => ({
      ...item,
      estimatedNetShares:
        item.latestSharesOwned ||
        Math.max(0, item.cumulativeBoughtShares - item.cumulativeSoldShares - item.cumulativeTaxWithheldShares)
    }))
    .sort((left, right) =>
      right.latestSharesOwned - left.latestSharesOwned ||
      right.cumulativeSoldValue - left.cumulativeSoldValue ||
      String(left.ticker).localeCompare(String(right.ticker))
    );
}

async function loadInsiderGuru(guru) {
  const submission = await getSubmission(guru.cik);
  const filings = recentFilings(submission)
    .filter((filing) => /^4/.test(filing.form))
    .filter((filing) => filing.accessionNumber)
    .sort((a, b) => String(b.filingDate || "").localeCompare(String(a.filingDate || "")))
    .slice(0, insiderForm4FilingLimit);

  const parsedFilings = [];

  for (const filing of filings) {
    try {
      const doc = await getFilingDocument(guru.cik, filing, filing.primaryDocument);
      const parsed = parseForm4(doc.text, filing);
      parsedFilings.push({
        filing: decorateFiling(guru, filing, doc.url),
        ...parsed,
        transactions: parsed.transactions.map((tx) => ({ ...tx, formUrl: doc.url }))
      });
    } catch (error) {
      parsedFilings.push({
        filing: decorateFiling(guru, filing),
        error: error.message,
        transactions: [],
        holdings: []
      });
    }
  }

  const transactions = parsedFilings
    .flatMap((item) => item.transactions)
    .sort((a, b) => String(b.transactionDate || "").localeCompare(String(a.transactionDate || "")));
  const holdings = parsedFilings.flatMap((item) => item.holdings);
  const insiderPositions = buildInsiderPositionSummary(transactions, holdings);
  const latestTransactionWithShares = transactions.find((tx) => tx.sharesOwned > 0);
  const actionCounts = transactions.reduce((acc, tx) => {
    acc[tx.action] = (acc[tx.action] || 0) + 1;
    return acc;
  }, {});

  return withGuruShell(guru, {
    status: "live",
    disclosureKind: "Form 4",
    latestFiling: parsedFilings[0]?.filing || null,
    previousFiling: parsedFilings[1]?.filing || null,
    summary: {
      filingDate: parsedFilings[0]?.filing?.filingDate || null,
      reportDate: transactions[0]?.transactionDate || parsedFilings[0]?.filing?.filingDate || null,
      recentTransactions: transactions.length,
      buys: actionCounts.buy || 0,
      sells: actionCounts.sell || 0,
      awards: actionCounts.award || 0,
      optionExercises: actionCounts.option_exercise || 0,
      taxWithholding: actionCounts.tax_withholding || 0,
      latestSharesOwned: latestTransactionWithShares?.sharesOwned || 0,
      latestIssuer: latestTransactionWithShares?.issuer || parsedFilings[0]?.issuer || guru.focusIssuer,
      latestTicker: latestTransactionWithShares?.ticker || guru.focusTicker || "",
      trackedTickers: insiderPositions.length,
      totalLatestSharesOwned: insiderPositions.reduce((sum, item) => sum + (item.latestSharesOwned || 0), 0),
      cumulativeSoldShares: insiderPositions.reduce((sum, item) => sum + (item.cumulativeSoldShares || 0), 0),
      cumulativeSoldValue: insiderPositions.reduce((sum, item) => sum + (item.cumulativeSoldValue || 0), 0),
      cumulativeBoughtShares: insiderPositions.reduce((sum, item) => sum + (item.cumulativeBoughtShares || 0), 0),
      cumulativeBoughtValue: insiderPositions.reduce((sum, item) => sum + (item.cumulativeBoughtValue || 0), 0),
      form4FilingsLoaded: parsedFilings.length,
      form4WindowStart: parsedFilings.at(-1)?.filing?.filingDate || null,
      form4WindowEnd: parsedFilings[0]?.filing?.filingDate || null
    },
    insiderPositions: insiderPositions.slice(0, 30),
    holdings: holdings.slice(0, 25),
    transactions: transactions.slice(0, 80),
    filings: parsedFilings.map((item) => item.filing).slice(0, 10)
  });
}

function hydrateNuxtPayload(root, value, depth = 0) {
  if (depth > 12) return value;

  const hydrateIndex = (index) => hydrateNuxtPayload(root, root[index], depth + 1);

  if (Array.isArray(value)) {
    const marker = value[0];
    if (
      typeof marker === "string" &&
      ["ShallowReactive", "Reactive", "Ref", "EmptyRef"].includes(marker)
    ) {
      return value.length > 1 ? hydrateIndex(value[1]) : null;
    }

    if (marker === "Set") {
      return new Set(value.slice(1).map((item) => (typeof item === "number" ? hydrateIndex(item) : item)));
    }

    return value.map((item) => (typeof item === "number" ? hydrateIndex(item) : hydrateNuxtPayload(root, item, depth + 1)));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        typeof item === "number" ? hydrateIndex(item) : hydrateNuxtPayload(root, item, depth + 1)
      ])
    );
  }

  return value;
}

function parseNuxtData(htmlText) {
  const match = htmlText.match(
    /<script type="application\/json"[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s
  );

  if (!match) {
    throw new Error("Could not find Pelosi Tracker Nuxt payload.");
  }

  return JSON.parse(match[1]);
}

function parseAmountRange(range) {
  const values = String(range || "")
    .match(/\$?[\d,]+(?:\.\d+)?/g)
    ?.map((value) => Number(value.replace(/[$,]/g, "")))
    .filter(Number.isFinite) || [];

  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  return (values[0] + values[1]) / 2;
}

function congressAction(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized.includes("purchase") || normalized === "p") return "buy";
  if (normalized.includes("sale") || normalized === "s") return "sell";
  return "other";
}

function normalizeCongressTransaction(item, sourceUrl) {
  const action = congressAction(item.action);
  const value = parseAmountRange(item.amountRange);

  return {
    id: item.guid || `${item.symbol}-${item.filedDate}-${item.tradedDate}-${item.action}`,
    issuer: cleanIssuer(item.name),
    ticker: stringValue(item.symbol),
    action,
    rawAction: stringValue(item.action),
    transactionType: stringValue(item.transactionType),
    transactionDate: stringValue(item.tradedDate),
    filingDate: stringValue(item.filedDate),
    amountRange: stringValue(item.amountRange),
    value,
    description: stringValue(item.description),
    excessReturn: stringValue(item.excessReturn),
    isCompliant: Boolean(item.isCompliant),
    daysLate: numberValue(item.daysLate),
    sourceUrl
  };
}

function summarizeCongressHoldings(transactions) {
  const grouped = new Map();

  for (const tx of transactions) {
    const key = tx.ticker || tx.issuer;
    const current = grouped.get(key) || {
      id: key,
      ticker: tx.ticker,
      issuer: tx.issuer,
      value: 0,
      buyValue: 0,
      sellValue: 0,
      transactions: 0,
      buys: 0,
      sells: 0,
      latestDate: tx.transactionDate
    };

    current.value += tx.value;
    current.transactions += 1;
    if (tx.action === "buy") {
      current.buyValue += tx.value;
      current.buys += 1;
    } else if (tx.action === "sell") {
      current.sellValue += tx.value;
      current.sells += 1;
    }
    if (String(tx.transactionDate).localeCompare(String(current.latestDate || "")) > 0) {
      current.latestDate = tx.transactionDate;
    }

    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

async function loadCongressGuru(guru) {
  const sourceUrl = guru.profileUrl || "https://pelositracker.app/stocks";
  const htmlText = await getPublicText(sourceUrl);
  const payload = parseNuxtData(htmlText);
  const rootData = hydrateNuxtPayload(payload, payload[payload[1].data]);
  const transactionsBlock = rootData["transactions-Nancy Pelosi-all-50"];
  const rawItems = [
    ...(transactionsBlock?.compliantItems || []),
    ...(transactionsBlock?.nonCompliantItems || [])
  ];

  const transactions = rawItems
    .map((item) => normalizeCongressTransaction(item, sourceUrl))
    .sort((a, b) => {
      const tradeCompare = String(b.transactionDate || "").localeCompare(String(a.transactionDate || ""));
      return tradeCompare || String(b.filingDate || "").localeCompare(String(a.filingDate || ""));
    });

  const actionCounts = transactions.reduce((acc, tx) => {
    acc[tx.action] = (acc[tx.action] || 0) + 1;
    return acc;
  }, {});
  const estimatedActivityValue = transactions.reduce((sum, tx) => sum + tx.value, 0);
  const nonCompliantCount = transactions.filter((tx) => !tx.isCompliant).length;
  const latest = transactions[0];

  return withGuruShell(guru, {
    status: "live",
    disclosureKind: "STOCK Act",
    latestFiling: {
      form: "PTR",
      filingDate: latest?.filingDate || null,
      reportDate: latest?.transactionDate || null,
      filingIndexUrl: sourceUrl
    },
    summary: {
      filingDate: latest?.filingDate || null,
      reportDate: latest?.transactionDate || null,
      recentTransactions: transactions.length,
      buys: actionCounts.buy || 0,
      sells: actionCounts.sell || 0,
      other: actionCounts.other || 0,
      latestTicker: latest?.ticker || "",
      latestIssuer: latest?.issuer || "",
      latestAmountRange: latest?.amountRange || "",
      estimatedActivityValue,
      nonCompliantCount,
      totalDisclosed: transactionsBlock?.summary?.total || transactions.length,
      complianceRate: transactionsBlock?.summary?.complianceRate ?? null
    },
    holdings: summarizeCongressHoldings(transactions).slice(0, 50),
    transactions: transactions.slice(0, 80)
  });
}

function normalizeTimelineOperation(operation) {
  const ticker = stringValue(operation.ticker || operation.issuer).toUpperCase();
  const date = stringValue(operation.date || operation.transactionDate || operation.reportDate || operation.filingDate);

  return {
    id: operation.id || `${operation.guruId}-${ticker}-${date}-${operation.action}-${operation.value || operation.shares || ""}`,
    guruId: operation.guruId,
    guruName: operation.guruName,
    source: operation.source,
    disclosureKind: operation.disclosureKind,
    ticker,
    issuer: cleanIssuer(operation.issuer || ticker),
    action: operation.action || "other",
    date,
    filingDate: operation.filingDate || null,
    value: numberValue(operation.value),
    shares: numberValue(operation.shares),
    changeShares: numberValue(operation.changeShares),
    price: numberValue(operation.price),
    amountRange: operation.amountRange || "",
    detail: operation.detail || ""
  };
}

function operationRank(operation) {
  const actionRank = {
    new: 8,
    increased: 7,
    buy: 7,
    reduced: 6,
    sold_out: 6,
    sell: 6,
    option_exercise: 4,
    gift: 2,
    other: 1
  };
  return (actionRank[operation.action] || 1) * 1e12 + Math.abs(operation.value || operation.changeShares || operation.shares || 0);
}

async function load13fTimeline(guru, limit = 10) {
  const submission = await getSubmission(guru.cik);
  const filings = recentFilings(submission)
    .filter((filing) => /^13F-HR/.test(filing.form))
    .filter((filing) => filing.accessionNumber)
    .sort((a, b) => {
      const dateCompare = String(b.reportDate || "").localeCompare(String(a.reportDate || ""));
      return dateCompare || String(b.filingDate || "").localeCompare(String(a.filingDate || ""));
    })
    .slice(0, limit)
    .reverse();

  const quarters = [];
  for (const filing of filings) {
    try {
      const doc = await getFilingDocument(guru.cik, filing);
      quarters.push({
        filing,
        holdings: parse13fInfoTable(doc.text)
      });
    } catch {
      // Skip malformed historical filings without breaking the whole context view.
    }
  }

  const operations = [];
  for (let index = 1; index < quarters.length; index += 1) {
    const previous = quarters[index - 1];
    const current = quarters[index];
    const changes = compare13fHoldings(current.holdings, previous.holdings)
      .filter((change) => change.action !== "unchanged" && (change.ticker || change.issuer))
      .sort((a, b) => operationRank(b) - operationRank(a))
      .slice(0, 18);

    for (const change of changes) {
      operations.push(normalizeTimelineOperation({
        id: `${guru.id}-${current.filing.reportDate}-${change.id}-${change.action}`,
        guruId: guru.id,
        guruName: guru.name,
        source: "13F",
        disclosureKind: "13F-HR",
        ticker: change.ticker || change.issuer,
        issuer: change.issuer,
        action: change.action,
        date: current.filing.reportDate,
        filingDate: current.filing.filingDate,
        value: change.value || change.previousValue || 0,
        shares: change.shares,
        changeShares: change.changeShares,
        detail: `${current.filing.reportDate} quarter`
      }));
    }
  }

  return operations;
}

export async function load13fHoldingHistory(guru, { years = 5, limit = 24 } = {}) {
  if (guru.type !== "manager13f") {
    return [];
  }

  const parsedYears = Number(years);
  const hasYearWindow = Number.isFinite(parsedYears) && parsedYears > 0;
  const cutoff = new Date();
  if (hasYearWindow) cutoff.setFullYear(cutoff.getFullYear() - parsedYears);
  const cutoffDate = hasYearWindow ? cutoff.toISOString().slice(0, 10) : "";
  const parsedLimit = Number(limit);
  const hasLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
  const submission = await getSubmission(guru.cik);
  const sourceFilings = hasYearWindow ? recentFilings(submission) : await allSubmissionFilings(submission);
  const filings = sourceFilings
    .filter((filing) => /^13F-HR/.test(filing.form))
    .filter((filing) => filing.accessionNumber)
    .filter((filing) => !cutoffDate || String(filing.filingDate || filing.reportDate || "") >= cutoffDate)
    .sort((a, b) => {
      const dateCompare = String(a.reportDate || "").localeCompare(String(b.reportDate || ""));
      return dateCompare || String(a.filingDate || "").localeCompare(String(b.filingDate || ""));
    })
    .slice(hasLimit ? -parsedLimit : 0);

  const history = [];
  for (const filing of filings) {
    try {
      const doc = await getFilingDocument(guru.cik, filing);
      const rawHoldings = parse13fInfoTable(doc.text);
      const totalValue = rawHoldings.reduce((sum, holding) => sum + holding.value, 0);
      history.push({
        filing: decorateFiling(guru, filing, doc.url),
        reportDate: filing.reportDate,
        filingDate: filing.filingDate,
        totalValue,
        holdings: rawHoldings
          .map((holding) => ({
            ...holding,
            pctPortfolio: totalValue ? holding.value / totalValue : 0
          }))
          .sort((a, b) => b.value - a.value)
      });
    } catch {
      // Historical filings occasionally point to malformed archives. Skip that quarter only.
    }
  }

  return history;
}

async function loadInsiderTimeline(guru, limit = 24) {
  const submission = await getSubmission(guru.cik);
  const filings = recentFilings(submission)
    .filter((filing) => /^4/.test(filing.form))
    .filter((filing) => filing.accessionNumber)
    .sort((a, b) => String(b.filingDate || "").localeCompare(String(a.filingDate || "")))
    .slice(0, limit);

  const operations = [];
  for (const filing of filings) {
    try {
      const doc = await getFilingDocument(guru.cik, filing, filing.primaryDocument);
      const parsed = parseForm4(doc.text, filing);
      for (const tx of parsed.transactions) {
        operations.push(normalizeTimelineOperation({
          id: `${guru.id}-${filing.accessionNumber}-${tx.id}`,
          guruId: guru.id,
          guruName: guru.name,
          source: "SEC",
          disclosureKind: "Form 4",
          ticker: tx.ticker || parsed.ticker || guru.focusTicker,
          issuer: tx.issuer || parsed.issuer,
          action: tx.action,
          date: tx.transactionDate || filing.reportDate,
          filingDate: filing.filingDate,
          value: tx.notional,
          shares: tx.shares,
          price: tx.price,
          detail: tx.securityTitle || tx.code
        }));
      }
    } catch {
      // Keep context generation resilient across old filings with unusual XML shape.
    }
  }

  return operations;
}

async function loadCongressTimeline(guru) {
  const sourceUrl = guru.profileUrl || "https://pelositracker.app/stocks";
  const htmlText = await getPublicText(sourceUrl);
  const payload = parseNuxtData(htmlText);
  const rootData = hydrateNuxtPayload(payload, payload[payload[1].data]);
  const transactionsBlock = rootData["transactions-Nancy Pelosi-all-50"];
  const rawItems = [
    ...(transactionsBlock?.compliantItems || []),
    ...(transactionsBlock?.nonCompliantItems || [])
  ];

  return rawItems.map((item) => {
    const tx = normalizeCongressTransaction(item, sourceUrl);
    return normalizeTimelineOperation({
      id: `${guru.id}-${tx.id}`,
      guruId: guru.id,
      guruName: guru.name,
      source: "STOCK Act",
      disclosureKind: "STOCK Act",
      ticker: tx.ticker,
      issuer: tx.issuer,
      action: tx.action,
      date: tx.transactionDate,
      filingDate: tx.filingDate,
      value: tx.value,
      amountRange: tx.amountRange,
      detail: tx.description
    });
  });
}

async function loadCachedTimelineFallback(guru) {
  const guruSnapshot = await readGuruCache(guru.id);
  if (guruSnapshot && hasUsableGuruData(guruSnapshot)) {
    return timelineFromGuruSnapshot(guru, guruSnapshot);
  }

  const cached = await readCache();
  const cachedGuru = cached.parsed?.gurus?.find((item) => item.id === guru.id);
  if (!cachedGuru) return [];

  return timelineFromGuruSnapshot(guru, cachedGuru);
}

function timelineFromGuruSnapshot(guru, cachedGuru) {
  if (guru.type === "manager13f") {
    return (cachedGuru.activity || []).map((item) => normalizeTimelineOperation({
      id: `${guru.id}-cached-${cachedGuru.summary?.reportDate}-${item.id}-${item.action}`,
      guruId: guru.id,
      guruName: guru.name,
      source: "13F cache",
      disclosureKind: "13F-HR",
      ticker: resolvedTickerForItem(item) || item.issuer,
      issuer: item.issuer,
      action: item.action,
      date: cachedGuru.summary?.reportDate,
      filingDate: cachedGuru.summary?.filingDate,
      value: item.value || item.previousValue || 0,
      shares: item.shares,
      changeShares: item.changeShares,
      detail: "cached latest 13F quarter"
    }));
  }

  return (cachedGuru.transactions || []).map((tx) => normalizeTimelineOperation({
    id: `${guru.id}-cached-${tx.id || tx.accessionNumber || tx.transactionDate}-${tx.ticker || tx.issuer}-${tx.action}`,
    guruId: guru.id,
    guruName: guru.name,
    source: tx.source || cachedGuru.disclosureKind || (guru.type === "congress" ? "STOCK Act cache" : "SEC cache"),
    disclosureKind: cachedGuru.disclosureKind || (guru.type === "congress" ? "STOCK Act" : "Form 4"),
    ticker: tx.ticker || tx.issuer,
    issuer: tx.issuer,
    action: tx.action,
    date: tx.transactionDate || tx.reportDate || tx.filingDate,
    filingDate: tx.filingDate,
    value: tx.value || tx.notional || 0,
    shares: tx.shares,
    price: tx.price,
    amountRange: tx.amountRange,
    detail: tx.securityTitle || tx.description || tx.detail || ""
  }));
}

function chooseDefaultTicker(guru, operations, requestedTicker) {
  const requested = stringValue(requestedTicker).toUpperCase();
  if (isMarketTicker(requested) && operations.some((operation) => operation.ticker === requested)) return requested;
  if (isMarketTicker(guru.focusTicker) && operations.some((operation) => operation.ticker === guru.focusTicker)) {
    return guru.focusTicker;
  }

  const ranked = new Map();
  for (const operation of operations) {
    if (!isMarketTicker(operation.ticker)) continue;
    const current = ranked.get(operation.ticker) || { ticker: operation.ticker, score: 0 };
    current.score += Math.abs(operation.value || 0) + Math.abs(operation.changeShares || operation.shares || 0) * 100;
    ranked.set(operation.ticker, current);
  }

  return [...ranked.values()].sort((a, b) => b.score - a.score)[0]?.ticker || "SPY";
}

function isMarketTicker(value) {
  const ticker = stringValue(value).toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker);
}

function resolvedTickerForItem(item) {
  const current = stringValue(item?.ticker).toUpperCase();
  if (isMarketTicker(current)) return current;
  const mapped = tickerForHolding({ issuer: item?.issuer, cusip: item?.cusip });
  return mapped && isMarketTicker(mapped) ? mapped : "";
}

function withResolvedTicker(item) {
  if (!item || typeof item !== "object") return item;
  const ticker = resolvedTickerForItem(item);
  return ticker ? { ...item, ticker } : item;
}

function guruDisclosureKind(guru) {
  if (guru.type === "manager13f") return "13F-HR";
  if (guru.type === "congress") return "STOCK Act";
  if (guru.type === "profile") return "Research profile";
  return "Form 4";
}

function simulationTagForGuru(guru) {
  if (guru.type === "manager13f" && !guru.disableSimulation) {
    return {
      label: "13F copy 模拟",
      tone: "simulatable",
      description: "按披露发布日复制公开13F长仓权重，并和SPY做全历史回测。"
    };
  }
  if (guru.type === "congress" && !guru.disableSimulation) {
    return {
      label: "STOCK Act copy 模拟",
      tone: "simulatable",
      description: "按公开披露日和交易金额区间做近似复制，并和SPY对比。"
    };
  }
  return {
    label: "不做13F复制",
    tone: "muted",
    description: guru.simulationNote || "该披露不是完整季度13F组合，复制调仓会失真。"
  };
}

function avatarPayloadForGuru(guruId) {
  const asset = readGuruAsset(guruId, "avatar");
  if (!asset?.url) return {};
  return {
    avatarUrl: asset.url,
    avatarStyle: asset.style || "",
    avatarGeneratedAt: asset.generatedAt || ""
  };
}

function withConfiguredGuruMetadata(guruPayload) {
  if (!guruPayload || typeof guruPayload !== "object") return guruPayload;
  const configured = gurus.find((guru) => guru.id === guruPayload.id);
  const avatar = avatarPayloadForGuru(guruPayload.id);
  if (!configured) {
    return {
      ...guruPayload,
      ...avatar
    };
  }
  return {
    ...guruPayload,
    ...avatar,
    excludeFromHeatmap: Boolean(configured.excludeFromHeatmap),
    heatmapExclusionReason: configured.heatmapExclusionReason || "",
    simulationTag: simulationTagForGuru(configured)
  };
}

function withResolvedGuruTickers(guruPayload) {
  const withMetadata = withConfiguredGuruMetadata(guruPayload);
  if (!withMetadata || withMetadata.type !== "manager13f") return withMetadata;
  return {
    ...withMetadata,
    holdings: (withMetadata.holdings || []).map(withResolvedTicker),
    activity: (withMetadata.activity || []).map(withResolvedTicker)
  };
}

function withResolvedDashboardTickers(payload) {
  if (!payload?.gurus) return payload;
  const avatarByGuruId = new Map(
    readGuruAssets()
      .filter((asset) => asset.assetType === "avatar" && asset.url)
      .map((asset) => [
        asset.guruId,
        {
          avatarUrl: asset.url,
          avatarStyle: asset.style || "",
          avatarGeneratedAt: asset.generatedAt || ""
        }
      ])
  );
  return {
    ...payload,
    gurus: payload.gurus.map((guru) => ({
      ...withResolvedGuruTickers(guru),
      ...(avatarByGuruId.get(guru.id) || {})
    }))
  };
}

function chartWindow(operations) {
  const dates = operations.map((operation) => dateValue(operation.date)).filter(Boolean);
  const fallbackEnd = new Date();
  const fallbackStart = new Date(fallbackEnd);
  fallbackStart.setFullYear(fallbackStart.getFullYear() - 5);

  if (!dates.length) {
    return {
      start: fallbackStart.toISOString().slice(0, 10),
      end: fallbackEnd.toISOString().slice(0, 10)
    };
  }

  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  minDate.setDate(minDate.getDate() - 180);
  maxDate.setDate(maxDate.getDate() + 120);

  const today = new Date();
  return {
    start: minDate.toISOString().slice(0, 10),
    end: new Date(Math.min(maxDate.getTime(), today.getTime())).toISOString().slice(0, 10)
  };
}

function enrichOperationsWithPrices(operations, spySeries, selectedSeries, selectedTicker) {
  return operations.map((operation) => {
    const spyPoint = nearestPoint(spySeries.points, operation.date);
    const stockPoint = operation.ticker === selectedTicker ? nearestPoint(selectedSeries.points, operation.date) : null;

    return {
      ...operation,
      spyClose: spyPoint?.close ?? null,
      selectedClose: stockPoint?.close ?? null
    };
  });
}

function marketRegime(spyPoints) {
  if (!spyPoints?.length) return { label: "No SPY data", drawdown: 0, trend: "unknown" };
  let peak = spyPoints[0].close;
  let maxDrawdown = 0;
  for (const point of spyPoints) {
    if (point.close > peak) peak = point.close;
    const drawdown = peak ? (point.close - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  const first = spyPoints[0].close;
  const last = spyPoints[spyPoints.length - 1].close;
  const returnPct = first ? (last - first) / first : 0;

  return {
    label: maxDrawdown < -0.2 ? "Bear / recovery regime" : returnPct > 0.25 ? "Bull trend" : "Range / transition",
    drawdown: maxDrawdown,
    returnPct
  };
}

export async function loadGuruMarketContext(guruId, { ticker, refresh = false } = {}) {
  const guru = gurus.find((item) => item.id === guruId);
  if (!guru) {
    throw new Error("Guru not found");
  }

  let operations = await loadCachedTimelineFallback(guru);
  if (refresh) {
    try {
      if (guru.type === "manager13f") operations = await load13fTimeline(guru);
      else if (guru.type === "congress") operations = await loadCongressTimeline(guru);
      else operations = await loadInsiderTimeline(guru);
    } catch (error) {
      if (refresh || !isRateLimitError(error)) throw error;
    }
  }

  operations = operations
    .filter((operation) => operation.date && operation.ticker)
    .sort((a, b) => dateValue(a.date) - dateValue(b.date));

  const selectedTicker = chooseDefaultTicker(guru, operations, ticker);
  const { start, end } = chartWindow(operations);
  const [spy, selected] = await Promise.all([
    loadPriceSeries("SPY", { start, end }),
    loadPriceSeries(selectedTicker, { start, end })
  ]);
  const enriched = enrichOperationsWithPrices(operations, spy, selected, selectedTicker);
  const tickers = [...new Set(operations.map((operation) => operation.ticker))]
    .filter(isMarketTicker)
    .slice(0, 30);

  return {
    generatedAt: new Date().toISOString(),
    guru: withGuruShell(guru, {
      disclosureKind: guruDisclosureKind(guru)
    }),
    selectedTicker,
    tickers,
    window: { start, end },
    market: {
      spy,
      selected,
      regime: marketRegime(spy.points)
    },
    operations: enriched.slice(-240)
  };
}

function decorateFiling(guru, filing, xmlUrl) {
  const accessionPath = String(filing.accessionNumber || "").replace(/-/g, "");
  return {
    form: filing.form,
    accessionNumber: filing.accessionNumber,
    filingDate: filing.filingDate,
    reportDate: filing.reportDate,
    primaryDocument: filing.primaryDocument,
    xmlUrl: xmlUrl || null,
    secUrl: `https://www.sec.gov/Archives/edgar/data/${cikPath(guru.cik)}/${accessionPath}/${filing.primaryDocument || ""}`,
    filingIndexUrl: `https://www.sec.gov/Archives/edgar/data/${cikPath(guru.cik)}/${accessionPath}/`
  };
}

function withGuruShell(guru, data) {
  const secCompanyUrl = guru.cik ? `https://www.sec.gov/edgar/browse/?CIK=${guru.cik}` : "";

  return {
    id: guru.id,
    name: guru.name,
    chineseName: guru.chineseName,
    entityName: guru.entityName,
    cik: guru.cik || "",
    type: guru.type,
    role: guru.role,
    focusTicker: guru.focusTicker || "",
    focusIssuer: guru.focusIssuer || "",
    thesisTag: guru.thesisTag,
    notes: guru.notes,
    excludeFromHeatmap: Boolean(guru.excludeFromHeatmap),
    heatmapExclusionReason: guru.heatmapExclusionReason || "",
    simulationTag: simulationTagForGuru(guru),
    sourceLabel: guru.sourceLabel || (guru.cik ? "SEC EDGAR" : ""),
    profileUrl: guru.profileUrl || secCompanyUrl,
    secCompanyUrl,
    ...avatarPayloadForGuru(guru.id),
    generatedAt: data.generatedAt || new Date().toISOString(),
    ...data
  };
}

async function readCache() {
  const dbSnapshot = readDashboardSnapshot();
  if (dbSnapshot) {
    const fresh = Date.now() - new Date(dbSnapshot.generatedAt).getTime() < cacheTtlMs;
    return { parsed: dbSnapshot, fresh, source: "sqlite" };
  }

  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    const parsed = JSON.parse(raw);
    const fresh = Date.now() - new Date(parsed.generatedAt).getTime() < cacheTtlMs;
    return { parsed, fresh };
  } catch {
    return { parsed: null, fresh: false };
  }
}

async function writeCache(payload) {
  writeDashboardSnapshot(payload);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2));
}

async function readGuruCache(guruId) {
  const dbSnapshot = readGuruSnapshot(guruId);
  if (dbSnapshot) return dbSnapshot;

  try {
    return JSON.parse(await fs.readFile(path.join(guruCacheDir, `${guruId}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function writeGuruCache(guruId, payload) {
  writeGuruSnapshot(guruId, payload);
  await fs.mkdir(guruCacheDir, { recursive: true });
  await fs.writeFile(path.join(guruCacheDir, `${guruId}.json`), JSON.stringify(payload, null, 2));
}

function hasGuruErrors(payload) {
  return (payload?.gurus || []).some(
    (guru) => guru.status === "error" || guru.status === "rate_limited" || guru.dataStatus
  );
}

function hasUsableGuruData(payload) {
  if (!payload || payload.status === "error" || payload.status === "rate_limited" || payload.status === "local_missing") {
    return false;
  }
  if (payload.type === "manager13f") return Boolean(payload.holdings?.length || payload.activity?.length);
  if (payload.type === "congress") return Boolean(payload.transactions?.length || payload.holdings?.length);
  if (payload.type === "profile") return payload.status === "profile";
  return Boolean(payload.transactions?.length || payload.holdings?.length);
}

function isRateLimitError(error) {
  return error?.status === 429 || /request failed 429|rate threshold|too many requests/i.test(error?.message || "");
}

function withDataStatus(guruPayload, dataStatus) {
  return {
    ...guruPayload,
    dataStatus
  };
}

function cacheCoversConfiguredGurus(payload) {
  const cachedById = new Map((payload?.gurus || []).map((guru) => [guru.id, guru]));
  return gurus.every((guru) => {
    const cached = cachedById.get(guru.id);
    return cached && cached.type === guru.type && String(cached.cik || "") === String(guru.cik || "");
  });
}

function localMissingGuru(guru) {
  return withGuruShell(guru, {
    status: "local_missing",
    disclosureKind: guruDisclosureKind(guru),
    dataStatus: {
      status: "local_missing",
      reason: "not_in_local_database",
      message: "No local database snapshot is available for this guru yet. Click refresh to fetch and store it locally."
    },
    summary: {
      message: "No local database snapshot is available yet.",
      totalValue: 0,
      totalPositions: 0,
      recentTransactions: 0
    },
    holdings: [],
    activity: [],
    transactions: []
  });
}

function loadProfileGuru(guru) {
  return withGuruShell(guru, {
    status: "profile",
    disclosureKind: guruDisclosureKind(guru),
    summary: {
      reportDate: null,
      filingDate: null,
      totalValue: 0,
      totalPositions: 0,
      recentTransactions: 0,
      message: guru.simulationNote || "No standalone SEC holdings feed is available for this profile."
    },
    holdings: [],
    activity: [],
    transactions: []
  });
}

function buildDashboardFromGuruSnapshots() {
  const localGurus = gurus.map((guru) => {
    const cachedGuru = readGuruSnapshot(guru.id);
    if (
      cachedGuru &&
      cachedGuru.type === guru.type &&
      String(cachedGuru.cik || "") === String(guru.cik || "") &&
      hasUsableGuruData(cachedGuru)
    ) {
      return withDataStatus(withResolvedGuruTickers(cachedGuru), {
        status: "local-db",
        reason: "loaded_from_local_database",
        message: "Loaded from the local SQLite database. Click refresh to update from external sources.",
        lastUpdated: cachedGuru.generatedAt || cachedGuru.summary?.filingDate || null
      });
    }
    return localMissingGuru(guru);
  });

  if (!localGurus.some((guru) => guru.dataStatus?.status === "local-db")) return null;

  return {
    generatedAt: new Date().toISOString(),
    source: {
      label: "Local SQLite database",
      submissionsApi: "https://data.sec.gov/submissions/",
      archives: "https://www.sec.gov/Archives/edgar/data/",
      congressional: "https://pelositracker.app/stocks",
      localDatabase: databaseInfo().path
    },
    gurus: localGurus
  };
}

async function loadGuru(guru) {
  try {
    let payload;
    if (guru.type === "manager13f") payload = await load13fGuru(guru);
    else if (guru.type === "congress") payload = await loadCongressGuru(guru);
    else if (guru.type === "profile") payload = loadProfileGuru(guru);
    else payload = await loadInsiderGuru(guru);

    if (hasUsableGuruData(payload)) {
      await writeGuruCache(guru.id, payload);
    }
    return payload;
  } catch (error) {
    const cachedGuru = await readGuruCache(guru.id);
    if (cachedGuru && hasUsableGuruData(cachedGuru) && isRateLimitError(error)) {
      return withDataStatus(withResolvedGuruTickers(cachedGuru), {
        status: "stale",
        reason: "sec_rate_limited",
        message: "SEC archive is temporarily rate-limiting requests. Showing the latest cached data for this guru.",
        lastUpdated: cachedGuru.generatedAt || cachedGuru.summary?.filingDate || null,
        sourceUrl: error.url || ""
      });
    }

    if (isRateLimitError(error)) {
      return withGuruShell(guru, {
        status: "rate_limited",
        disclosureKind: guruDisclosureKind(guru),
        dataStatus: {
          status: "rate_limited",
          reason: "sec_rate_limited",
          message: "SEC archive is temporarily rate-limiting requests. Wait a few minutes, then refresh.",
          sourceUrl: error.url || ""
        },
        summary: { message: error.message },
        holdings: [],
        activity: [],
        transactions: []
      });
    }

    return withGuruShell(guru, {
      status: "error",
      disclosureKind: guruDisclosureKind(guru),
      summary: { message: error.message },
      holdings: [],
      activity: [],
      transactions: []
    });
  }
}

export async function loadGuruExposureHistory(
  guruId,
  { forceRefresh = false, limit = 24 } = {}
) {
  const guru = gurus.find((item) => item.id === guruId);
  if (!guru) {
    const error = new Error(`Guru not found: ${guruId}`);
    error.statusCode = 404;
    throw error;
  }

  const cached = readGuruExposureSnapshot(guruId);
  if (cached && !forceRefresh) {
    return {
      ...cached,
      cache: {
        status: exposureCacheIsFresh(cached) ? "hit" : "local-db",
        ttlHours: 24,
        lastUpdated: cached.generatedAt || null
      }
    };
  }

  if (guru.type !== "manager13f") {
    return {
      generatedAt: new Date().toISOString(),
      status: "unsupported",
      guru: withGuruShell(guru, { disclosureKind: guruDisclosureKind(guru) }),
      history: [],
      latest: null,
      message: "Exposure timeline is available for 13F managers only.",
      cache: { status: "unsupported" }
    };
  }

  if (cached && forceRefresh) {
    scheduleGuruExposureRefresh(guruId, { limit, reason: "user-refresh" });
    return {
      ...cached,
      cache: {
        status: "refreshing",
        ttlHours: 24,
        lastUpdated: cached.generatedAt || null,
        message: "Showing the cached exposure book while a background refresh runs."
      }
    };
  }

  try {
    return await refreshGuruExposureSnapshot(guruId, { limit });
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        cache: {
          status: "stale",
          reason: error.message,
          ttlHours: 24,
          lastUpdated: cached.generatedAt || null
        }
      };
    }
    throw error;
  }
}

const guruExposureRefreshes = new Map();

function exposureRefreshKey(guruId, limit) {
  return `${guruId}:${Math.max(4, Math.min(40, Number(limit) || 24))}`;
}

export function scheduleGuruExposureRefresh(guruId, { limit = 24, reason = "background" } = {}) {
  const key = exposureRefreshKey(guruId, limit);
  if (guruExposureRefreshes.has(key)) return guruExposureRefreshes.get(key);
  const promise = refreshGuruExposureSnapshot(guruId, { limit, reason })
    .catch((error) => {
      console.warn(`Guru exposure refresh failed for ${guruId}: ${error.message}`);
      return null;
    })
    .finally(() => guruExposureRefreshes.delete(key));
  guruExposureRefreshes.set(key, promise);
  return promise;
}

export async function refreshGuruExposureSnapshot(
  guruId,
  { limit = 24, reason = "direct" } = {}
) {
  const key = exposureRefreshKey(guruId, limit);
  if (guruExposureRefreshes.has(key)) return guruExposureRefreshes.get(key);
  const promise = refreshGuruExposureSnapshotNow(guruId, { limit, reason })
    .finally(() => guruExposureRefreshes.delete(key));
  guruExposureRefreshes.set(key, promise);
  return promise;
}

async function refreshGuruExposureSnapshotNow(guruId, { limit = 24 } = {}) {
  const guru = gurus.find((item) => item.id === guruId);
  if (!guru) {
    const error = new Error(`Guru not found: ${guruId}`);
    error.statusCode = 404;
    throw error;
  }
  if (guru.type !== "manager13f") {
    return {
      generatedAt: new Date().toISOString(),
      status: "unsupported",
      guru: withGuruShell(guru, { disclosureKind: guruDisclosureKind(guru) }),
      history: [],
      latest: null,
      message: "Exposure timeline is available for 13F managers only.",
      cache: { status: "unsupported" }
    };
  }

  const maxQuarters = Math.max(4, Math.min(40, Number(limit) || 24));
  const submission = await getSubmission(guru.cik);
  const filings = (await recentOrArchivedFilings(submission, {
    formPattern: /^13F-HR/,
    minimum: maxQuarters
  }))
    .filter((filing) => /^13F-HR/.test(filing.form))
    .filter((filing) => filing.accessionNumber)
    .sort((a, b) => {
      const dateCompare = String(b.reportDate || "").localeCompare(String(a.reportDate || ""));
      return dateCompare || String(b.filingDate || "").localeCompare(String(a.filingDate || ""));
    })
    .slice(0, maxQuarters)
    .reverse();

  const history = [];
  const errors = [];
  let previousHoldings = [];

  for (const filing of filings) {
    try {
      const doc = await getFilingDocument(guru.cik, filing);
      const holdings = parse13fInfoTable(doc.text);
      history.push(summarize13fExposureQuarter(guru, filing, doc.url, holdings, previousHoldings));
      previousHoldings = holdings;
      await wait(60);
    } catch (error) {
      errors.push({
        accessionNumber: filing.accessionNumber,
        reportDate: filing.reportDate,
        message: error.message
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    status: history.length ? "live" : "missing",
    guru: withGuruShell(guru, { disclosureKind: guruDisclosureKind(guru) }),
    source: {
      label: "SEC EDGAR 13F-HR history",
      submissionsApi: "https://data.sec.gov/submissions/",
      archives: "https://www.sec.gov/Archives/edgar/data/",
      localDatabase: databaseInfo().path
    },
    history,
    latest: history.at(-1) || null,
    meta: {
      requestedQuarters: maxQuarters,
      returnedQuarters: history.length,
      errors
    }
  };

  if (history.length) {
    writeGuruExposureSnapshot(guruId, payload);
  }

  return { ...payload, cache: { status: "refreshed", ttlHours: 24 } };
}

export async function loadGuruDashboard({ forceRefresh = false } = {}) {
  const cached = await readCache();
  if (!forceRefresh && cached.parsed && cacheCoversConfiguredGurus(cached.parsed) && !hasGuruErrors(cached.parsed)) {
    const resolvedCached = withResolvedDashboardTickers(cached.parsed);
    return {
      ...resolvedCached,
      source: {
        ...(resolvedCached.source || {}),
        upstreamLabel: resolvedCached.source?.label || "SEC EDGAR + STOCK Act",
        label: "Local SQLite database",
        localDatabase: databaseInfo().path
      },
      cache: {
        status: cached.fresh ? "hit" : "local-db",
        source: cached.source || "sqlite",
        ttlMinutes: 30
      }
    };
  }

  if (!forceRefresh) {
    const localDashboard = buildDashboardFromGuruSnapshots();
    if (localDashboard) {
      return {
        ...localDashboard,
        cache: {
          status: "local-db",
          source: "sqlite",
          ttlMinutes: 0
        }
      };
    }
  }

  const results = [];
  for (const guru of gurus) {
    results.push(await loadGuru(guru));
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      label: "SEC EDGAR + STOCK Act",
      submissionsApi: "https://data.sec.gov/submissions/",
      archives: "https://www.sec.gov/Archives/edgar/data/",
      congressional: "https://pelositracker.app/stocks",
      localDatabase: databaseInfo().path
    },
    gurus: results
  };

  if (!hasGuruErrors(payload)) {
    await writeCache(payload);
  }
  return { ...payload, cache: { status: "refreshed", ttlMinutes: 30 } };
}

export async function refreshGuruSnapshot(guruId) {
  const guru = gurus.find((item) => item.id === guruId);
  if (!guru) throw new Error(`Guru not found: ${guruId}`);
  return loadGuru(guru);
}
