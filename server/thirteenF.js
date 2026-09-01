function finiteValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizedPutCall(holding) {
  return String(holding?.putCall || "").trim().toUpperCase();
}

function normalizedShareType(holding) {
  return String(holding?.shareType || "").trim().toUpperCase();
}

export function is13fOptionHolding(holding) {
  return ["PUT", "CALL"].includes(normalizedPutCall(holding));
}

export function is13fCommonLongHolding(holding) {
  return !is13fOptionHolding(holding) && normalizedShareType(holding) === "SH";
}

export function partition13fHoldings(holdings = []) {
  const commonLongHoldings = [];
  const optionHoldings = [];
  const otherReportedHoldings = [];

  for (const holding of holdings || []) {
    if (is13fOptionHolding(holding)) optionHoldings.push(holding);
    else if (is13fCommonLongHolding(holding)) commonLongHoldings.push(holding);
    else otherReportedHoldings.push(holding);
  }

  return { commonLongHoldings, optionHoldings, otherReportedHoldings };
}

export function summarize13fHoldingValues(holdings = []) {
  const buckets = partition13fHoldings(holdings);
  const sumValue = (rows) => rows.reduce((sum, holding) => sum + finiteValue(holding?.value), 0);
  const callNotional = sumValue(
    buckets.optionHoldings.filter((holding) => normalizedPutCall(holding) === "CALL")
  );
  const putNotional = sumValue(
    buckets.optionHoldings.filter((holding) => normalizedPutCall(holding) === "PUT")
  );
  const commonLongValue = sumValue(buckets.commonLongHoldings);
  const optionsNotional = callNotional + putNotional;
  const otherReportedValue = sumValue(buckets.otherReportedHoldings);

  return {
    reported13fTableValue: commonLongValue + optionsNotional + otherReportedValue,
    commonLongValue,
    optionsNotional,
    callOptionsNotional: callNotional,
    putOptionsNotional: putNotional,
    otherReportedValue,
    reportedRowCount: (holdings || []).length,
    commonLongPositionCount: buckets.commonLongHoldings.length,
    optionPositionCount: buckets.optionHoldings.length,
    otherReportedPositionCount: buckets.otherReportedHoldings.length,
    valueSemantics: {
      reported13fTableValue: "Sum of every reported Form 13F information-table value.",
      commonLongValue: "Sum of non-put/call rows reported in shares (SH).",
      optionsNotional: "Sum of reported underlying-security values for put/call rows; not option premium or fund AUM.",
      otherReportedValue: "Reported value outside common-long SH rows and put/call rows."
    }
  };
}

/**
 * A raw quarter-over-quarter share delta is not a trade signal. Callers must
 * supply a verified corporate-action factor from a point-in-time security
 * master before an increase/new-position rule may qualify.
 */
export function assessCorporateActionAdjustedShareChange(
  current,
  previous,
  { previousToCurrentShareFactor = null } = {}
) {
  const currentShares = finiteValue(current?.shares);
  const previousShares = finiteValue(previous?.shares);
  const factor = Number(previousToCurrentShareFactor);
  if (!current || !previous || !Number.isFinite(factor) || factor <= 0) {
    return {
      status: "unverified",
      eligibleForTradeSignal: false,
      adjustedChangePct: null,
      reason: !current || !previous
        ? "New/sold-out CUSIP cannot be treated as a trade without a point-in-time security-master continuity check."
        : "A verified corporate-action share factor is required before reported-share changes can become trade signals."
    };
  }
  const adjustedPreviousShares = previousShares * factor;
  return {
    status: "verified",
    eligibleForTradeSignal: adjustedPreviousShares > 0,
    adjustedPreviousShares,
    adjustedChangePct: adjustedPreviousShares
      ? (currentShares - adjustedPreviousShares) / adjustedPreviousShares
      : null,
    previousToCurrentShareFactor: factor,
    reason: null
  };
}

export function is13fAmendment(value) {
  const form = typeof value === "string"
    ? value
    : value?.filing?.form || value?.form || "";
  return /\/A$/i.test(String(form).trim());
}

function reportDateForSnapshot(snapshot) {
  return snapshot?.reportDate || snapshot?.filing?.reportDate || "";
}

function publicTimestampForSnapshot(snapshot) {
  return snapshot?.acceptanceDateTime ||
    snapshot?.filing?.acceptanceDateTime ||
    snapshot?.filingDate ||
    snapshot?.filing?.filingDate ||
    "";
}

function filingIdentity(snapshot) {
  return snapshot?.filing?.accessionNumber || snapshot?.accessionNumber || publicTimestampForSnapshot(snapshot);
}

function normalizedCik(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : "";
}

function filerCikForSnapshot(snapshot) {
  return normalizedCik(snapshot?.filerCik || snapshot?.filing?.filerCik);
}

export function manager13fCiks(guru = {}) {
  return [...new Set([guru.cik, ...(guru.alternateCiks || [])]
    .map(normalizedCik)
    .filter(Boolean))];
}

/**
 * Combine SEC submission feeds for every configured reporting entity before
 * applying the amendment policy. SEC accession numbers are globally unique,
 * so a filing repeated in more than one feed is retained only once.
 */
export function selectManager13fFilings(filingSources = []) {
  const sourceCiks = [];
  const byAccession = new Map();
  const duplicateAccessions = [];

  for (const source of filingSources || []) {
    const filerCik = normalizedCik(source?.cik);
    if (filerCik && !sourceCiks.includes(filerCik)) sourceCiks.push(filerCik);
    for (const filing of source?.filings || []) {
      if (!/^13F-HR(?:\/A)?$/i.test(String(filing?.form || "").trim())) continue;
      if (!filing?.accessionNumber) continue;
      const annotated = {
        ...filing,
        filerCik: normalizedCik(filing.filerCik) || filerCik
      };
      const key = String(filing.accessionNumber);
      if (byAccession.has(key)) {
        duplicateAccessions.push({
          accessionNumber: key,
          retainedFilerCik: byAccession.get(key).filerCik,
          excludedFilerCik: annotated.filerCik
        });
        continue;
      }
      byAccession.set(key, annotated);
    }
  }

  const amendmentSelection = selectUnambiguous13fOriginals([...byAccession.values()]);
  const blockedReportDates = [...new Set(amendmentSelection.excluded
    .filter(({ snapshot, code }) => code === "amendment_without_original" && reportDateForSnapshot(snapshot))
    .map(({ snapshot }) => reportDateForSnapshot(snapshot)))];
  const blockedSet = new Set(blockedReportDates);
  const blockedOriginals = amendmentSelection.history
    .filter((filing) => blockedSet.has(reportDateForSnapshot(filing)))
    .map((snapshot) => ({
      snapshot,
      code: "incomplete_cross_cik_quarter",
      reason: "Quarter excluded because another configured reporting CIK has only an amendment whose complete holdings semantics cannot be reconstructed."
    }));
  return {
    candidates: [...byAccession.values()],
    filings: amendmentSelection.history.filter((filing) => !blockedSet.has(reportDateForSnapshot(filing))),
    excluded: [...amendmentSelection.excluded, ...blockedOriginals],
    sourceCiks,
    duplicateAccessions,
    blockedReportDates
  };
}

/**
 * A manager may file pieces of the same quarter under multiple reporting CIKs.
 * Group retained originals by report date so readers load and merge every
 * component before exposing a quarter snapshot.
 */
export function group13fFilingsByReportDate(filings = []) {
  const groups = new Map();
  for (const filing of filings || []) {
    const reportDate = reportDateForSnapshot(filing);
    const key = reportDate || `missing-report-date:${filingIdentity(filing)}`;
    groups.set(key, [...(groups.get(key) || []), filing]);
  }

  return [...groups.entries()]
    .map(([key, rows]) => ({
      reportDate: reportDateForSnapshot(rows[0]) || key,
      filings: [...rows].sort((left, right) =>
        String(publicTimestampForSnapshot(left)).localeCompare(String(publicTimestampForSnapshot(right))) ||
        String(filerCikForSnapshot(left)).localeCompare(String(filerCikForSnapshot(right))) ||
        String(filingIdentity(left)).localeCompare(String(filingIdentity(right)))
      )
    }))
    .sort((left, right) => String(left.reportDate).localeCompare(String(right.reportDate)));
}

/**
 * The merged book is not public until every reporting-entity component is
 * public. Preserve the latest SEC acceptance timestamp only when every
 * component has one; otherwise force the caller onto its legacy filing-date
 * fallback using the latest component filing date.
 */
export function merge13fQuarterFilingMetadata(filings = [], reportDate = "") {
  if (!filings.length) return null;
  const ordered = [...filings].sort((left, right) =>
    String(publicTimestampForSnapshot(left)).localeCompare(String(publicTimestampForSnapshot(right))) ||
    String(filingIdentity(left)).localeCompare(String(filingIdentity(right)))
  );
  const representative = ordered.at(-1);
  const acceptanceComplete = filings.every((filing) => filing.acceptanceDateTime);
  const filingDate = filings.map((filing) => filing.filingDate || "").sort().at(-1) || null;
  const acceptanceDateTime = acceptanceComplete
    ? filings.map((filing) => filing.acceptanceDateTime).sort().at(-1)
    : null;

  return {
    ...representative,
    form: "13F-HR",
    reportDate: reportDate || reportDateForSnapshot(representative),
    filingDate,
    acceptanceDateTime,
    isAmendment: false,
    accessionNumbers: filings.map((filing) => filing.accessionNumber),
    componentCiks: [...new Set(filings.map(filerCikForSnapshot).filter(Boolean))],
    componentFilings: filings,
    componentAcceptanceTimestampsComplete: acceptanceComplete
  };
}

/**
 * Amendments require cover-page semantics to know whether they restate or add
 * holdings. Until those semantics are available, retain only the first public
 * original for each reporting CIK and report date and explicitly exclude every
 * amendment. An amendment without its original is not safe to treat as a
 * complete portfolio. Originals from different reporting CIKs are retained so
 * callers can merge a manager's reporting-entity transition safely.
 */
export function selectUnambiguous13fOriginals(history = []) {
  const groups = new Map();
  for (const snapshot of history || []) {
    const reportDate = reportDateForSnapshot(snapshot);
    const filerCik = filerCikForSnapshot(snapshot) || "unknown-filer";
    const key = reportDate
      ? `${filerCik}:${reportDate}`
      : `${filerCik}:missing-report-date:${filingIdentity(snapshot)}`;
    groups.set(key, [...(groups.get(key) || []), snapshot]);
  }

  const selected = [];
  const excluded = [];
  for (const snapshots of groups.values()) {
    const ordered = [...snapshots].sort((left, right) =>
      String(publicTimestampForSnapshot(left)).localeCompare(String(publicTimestampForSnapshot(right))) ||
      String(filingIdentity(left)).localeCompare(String(filingIdentity(right)))
    );
    const originals = ordered.filter((snapshot) => !is13fAmendment(snapshot));
    if (!originals.length) {
      for (const snapshot of ordered) {
        excluded.push({
          snapshot,
          code: "amendment_without_original",
          reason: "Amended 13F excluded because the corresponding original filing is unavailable and amendment semantics are not parsed."
        });
      }
      continue;
    }

    selected.push(originals[0]);
    for (const duplicate of originals.slice(1)) {
      excluded.push({
        snapshot: duplicate,
        code: "duplicate_original",
        reason: "Duplicate original 13F excluded; the earliest public original for the report date is retained."
      });
    }
    for (const amendment of ordered.filter(is13fAmendment)) {
      excluded.push({
        snapshot: amendment,
        code: "amendment_semantics_unavailable",
        reason: "Amended 13F excluded because restatement versus new-holdings semantics are not yet parsed; the public original is retained."
      });
    }
  }

  selected.sort((left, right) =>
    String(reportDateForSnapshot(left)).localeCompare(String(reportDateForSnapshot(right))) ||
    String(publicTimestampForSnapshot(left)).localeCompare(String(publicTimestampForSnapshot(right)))
  );
  return { history: selected, excluded };
}
