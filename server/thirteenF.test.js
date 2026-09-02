import assert from "node:assert/strict";
import test from "node:test";

import { gurus } from "./gurus.js";
import { tickerForHolding } from "./cusipOverrides.js";

import {
  assessCorporateActionAdjustedShareChange,
  group13fFilingsByReportDate,
  is13fCommonLongHolding,
  is13fOptionHolding,
  manager13fCiks,
  merge13fQuarterFilingMetadata,
  partition13fHoldings,
  selectManager13fFilings,
  selectUnambiguous13fOriginals,
  summarize13fHoldingValues
} from "./thirteenF.js";

test("13F values separate common longs, option underlying value, and other rows", () => {
  const holdings = [
    { id: "common", shareType: "SH", putCall: "", value: 600 },
    { id: "call", shareType: "SH", putCall: "CALL", value: 250 },
    { id: "put", shareType: "SH", putCall: "put", value: 100 },
    { id: "principal", shareType: "PRN", putCall: "", value: 50 }
  ];

  assert.equal(is13fCommonLongHolding(holdings[0]), true);
  assert.equal(is13fCommonLongHolding(holdings[1]), false);
  assert.equal(is13fOptionHolding(holdings[1]), true);
  const buckets = partition13fHoldings(holdings);
  assert.deepEqual(buckets.commonLongHoldings.map((row) => row.id), ["common"]);
  assert.deepEqual(buckets.optionHoldings.map((row) => row.id), ["call", "put"]);
  assert.deepEqual(buckets.otherReportedHoldings.map((row) => row.id), ["principal"]);

  const summary = summarize13fHoldingValues(holdings);
  assert.equal(summary.reported13fTableValue, 1000);
  assert.equal(summary.commonLongValue, 600);
  assert.equal(summary.optionsNotional, 350);
  assert.equal(summary.callOptionsNotional, 250);
  assert.equal(summary.putOptionsNotional, 100);
  assert.equal(summary.otherReportedValue, 50);
  assert.match(summary.valueSemantics.optionsNotional, /not option premium or fund AUM/i);
});

test("amendments fail closed to the first public original and never win by row count", () => {
  const history = [
    {
      reportDate: "2024-03-31",
      filingDate: "2024-05-15",
      acceptanceDateTime: "2024-05-15T17:01:00.000Z",
      filing: { form: "13F-HR", accessionNumber: "original" },
      holdings: [{ id: "A" }]
    },
    {
      reportDate: "2024-03-31",
      filingDate: "2024-06-01",
      acceptanceDateTime: "2024-06-01T12:00:00.000Z",
      filing: { form: "13F-HR/A", accessionNumber: "amendment" },
      holdings: Array.from({ length: 10 }, (_, index) => ({ id: `A${index}` }))
    },
    {
      reportDate: "2024-06-30",
      filingDate: "2024-08-20",
      filing: { form: "13F-HR/A", accessionNumber: "orphan-amendment" },
      holdings: [{ id: "B" }]
    }
  ];

  const result = selectUnambiguous13fOriginals(history);
  assert.deepEqual(result.history.map((row) => row.filing.accessionNumber), ["original"]);
  assert.deepEqual(result.excluded.map((row) => row.code), [
    "amendment_semantics_unavailable",
    "amendment_without_original"
  ]);
});

test("Ackman reporting-entity transition retains and groups both CIK components", () => {
  const configuredAckman = gurus.find((guru) => guru.id === "bill-ackman");
  assert.deepEqual(configuredAckman.alternateCiks, ["0002026053"]);
  const ackman = { ...configuredAckman, alternateCiks: ["2026053", "0002026053"] };
  assert.deepEqual(manager13fCiks(ackman), ["0001336528", "0002026053"]);

  const oldEntityQuarter = {
    form: "13F-HR",
    accessionNumber: "old-2026-q1",
    reportDate: "2026-03-31",
    filingDate: "2026-05-15",
    acceptanceDateTime: "2026-05-15T16:10:00.000Z"
  };
  const newEntityQuarter = {
    form: "13F-HR",
    accessionNumber: "new-2026-q1",
    reportDate: "2026-03-31",
    filingDate: "2026-05-15",
    acceptanceDateTime: "2026-05-15T16:20:56.000Z"
  };
  const selection = selectManager13fFilings([
    {
      cik: "0001336528",
      filings: [
        {
          form: "13F-HR",
          accessionNumber: "old-2025-q4",
          reportDate: "2025-12-31",
          filingDate: "2026-02-13"
        },
        oldEntityQuarter,
        oldEntityQuarter
      ]
    },
    {
      cik: "0002026053",
      filings: [
        newEntityQuarter,
        {
          ...newEntityQuarter,
          form: "13F-HR/A",
          accessionNumber: "new-2026-q1-amendment",
          filingDate: "2026-05-20",
          acceptanceDateTime: "2026-05-20T12:00:00.000Z"
        }
      ]
    }
  ]);

  assert.equal(selection.duplicateAccessions.length, 1);
  assert.deepEqual(selection.filings.map((filing) => filing.accessionNumber), [
    "old-2025-q4",
    "old-2026-q1",
    "new-2026-q1"
  ]);
  assert.deepEqual(selection.excluded.map((row) => row.code), [
    "amendment_semantics_unavailable"
  ]);

  const groups = group13fFilingsByReportDate(selection.filings);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].reportDate, "2026-03-31");
  assert.deepEqual(groups[1].filings.map((filing) => filing.filerCik), [
    "0001336528",
    "0002026053"
  ]);

  const merged = merge13fQuarterFilingMetadata(groups[1].filings, groups[1].reportDate);
  assert.equal(merged.acceptanceDateTime, "2026-05-15T16:20:56.000Z");
  assert.equal(merged.componentAcceptanceTimestampsComplete, true);
  assert.deepEqual(merged.accessionNumbers, ["old-2026-q1", "new-2026-q1"]);

  const legacyMerged = merge13fQuarterFilingMetadata([
    groups[1].filings[0],
    { ...groups[1].filings[1], acceptanceDateTime: null, filingDate: "2026-05-16" }
  ], groups[1].reportDate);
  assert.equal(legacyMerged.acceptanceDateTime, null);
  assert.equal(legacyMerged.filingDate, "2026-05-16");
  assert.equal(legacyMerged.componentAcceptanceTimestampsComplete, false);
});

test("Renaissance Technologies uses the manager 13F entity and discloses the Medallion limitation", () => {
  const renaissance = gurus.find((guru) => guru.id === "renaissance-technologies");

  assert.ok(renaissance);
  assert.equal(renaissance.name, "Renaissance Technologies");
  assert.equal(renaissance.chineseName, "文艺复兴科技");
  assert.equal(renaissance.entityName, "RENAISSANCE TECHNOLOGIES LLC");
  assert.equal(renaissance.type, "manager13f");
  assert.deepEqual(manager13fCiks(renaissance), ["0001037389"]);
  assert.equal(renaissance.disableSimulation, true);
  assert.equal(renaissance.excludeFromHeatmap, true);
  assert.match(renaissance.simulationNote, /security mapping/i);
  assert.match(renaissance.notes.join(" "), /not the Medallion Fund portfolio/i);
  assert.match(renaissance.notes.join(" "), /delayed systematic ownership/i);
});

test("Renaissance's largest previously unresolved Q2 holdings map to tradable tickers", () => {
  assert.equal(tickerForHolding({ cusip: "30161Q104", issuer: "EXELIXIS INC" }), "EXEL");
  assert.equal(tickerForHolding({ cusip: "22788C105", issuer: "CROWDSTRIKE HLDGS INC" }), "CRWD");
  assert.equal(tickerForHolding({ cusip: "859241101", issuer: "STERLING INFRASTRUCTURE INC" }), "STRL");
  assert.equal(tickerForHolding({ cusip: "218352102", issuer: "CORCEPT THERAPEUTICS INC" }), "CORT");
  assert.equal(tickerForHolding({ cusip: "G7997R103", issuer: "SEAGATE TECHNOLOGY HLDNGS PL" }), "STX");
});

test("Ackman successor CUSIPs retain the economically continuous market ticker", () => {
  assert.equal(tickerForHolding({ cusip: "44267D107", issuer: "HOWARD HUGHES CORP" }), "HHH");
  assert.equal(tickerForHolding({ cusip: "44267T102", issuer: "HOWARD HUGHES HOLDINGS INC" }), "HHH");
  assert.equal(tickerForHolding({ cusip: "13645T100", issuer: "CANADIAN PAC RY LTD" }), "CP");
  assert.equal(tickerForHolding({ cusip: "13646K108", issuer: "CANADIAN PACIFIC KANSAS CITY" }), "CP");
  assert.equal(tickerForHolding({ cusip: "913017109", issuer: "UNITED TECHNOLOGIES CORP" }), "RTX");
  assert.equal(tickerForHolding({ cusip: "72766Q105", issuer: "PLATFORM SPECIALTY PRODS COR" }), "ESI");
  assert.equal(tickerForHolding({ cusip: "609207105", issuer: "MONDELEZ INTL INC" }), "MDLZ");
  assert.equal(tickerForHolding({ cusip: "009158106", issuer: "AIR PRODS & CHEMS INC" }), "APD");
  assert.equal(tickerForHolding({ cusip: "91911K102", issuer: "VALEANT PHARMACEUTICALS INTL" }), "BHC");
  assert.equal(tickerForHolding({ cusip: "G6564A105", issuer: "NOMAD HLDGS LTD" }), "NOMD");
});

test("a multi-CIK quarter with an orphan amendment is excluded as incomplete", () => {
  const selection = selectManager13fFilings([
    {
      cik: "0001336528",
      filings: [{
        form: "13F-HR",
        accessionNumber: "old-original",
        reportDate: "2026-06-30",
        filingDate: "2026-08-14"
      }]
    },
    {
      cik: "0002026053",
      filings: [{
        form: "13F-HR/A",
        accessionNumber: "new-orphan-amendment",
        reportDate: "2026-06-30",
        filingDate: "2026-08-20"
      }]
    }
  ]);

  assert.deepEqual(selection.filings, []);
  assert.deepEqual(selection.blockedReportDates, ["2026-06-30"]);
  assert.deepEqual(selection.excluded.map((row) => row.code), [
    "amendment_without_original",
    "incomplete_cross_cik_quarter"
  ]);
});

test("raw reported-share changes cannot become trade signals without corporate-action evidence", () => {
  const unverified = assessCorporateActionAdjustedShareChange(
    { shares: 2000 },
    { shares: 100 },
  );
  assert.equal(unverified.status, "unverified");
  assert.equal(unverified.eligibleForTradeSignal, false);
  assert.equal(unverified.adjustedChangePct, null);
  assert.match(unverified.reason, /corporate-action share factor/i);

  const verifiedSplit = assessCorporateActionAdjustedShareChange(
    { shares: 2100 },
    { shares: 100 },
    { previousToCurrentShareFactor: 20 }
  );
  assert.equal(verifiedSplit.status, "verified");
  assert.equal(verifiedSplit.eligibleForTradeSignal, true);
  assert.ok(Math.abs(verifiedSplit.adjustedChangePct - 0.05) < 1e-12);
});
