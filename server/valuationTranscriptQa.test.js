import test from "node:test";
import assert from "node:assert/strict";
import {
  preserveTranscriptQaByFiscalPeriod,
  transcriptQaCoverageSummary
} from "./valuationTranscriptQa.js";

test("preserves only transcript Q&A research on the matching fiscal period", () => {
  const prior = [{
    fiscalYear: 2025,
    fiscalQuarter: "Q2",
    dataSnapshot: {
      youtubeEarnings: {
        revenueGuidanceM: 99,
        qa: [{ question: "Why?", answer: "Because.", questionZh: "为什么？", answerZh: "因为。" }],
        qaCoverage: { status: "has_qa" }
      }
    }
  }];
  const next = [{
    label: "FY2025 Q2",
    dataSnapshot: { youtubeEarnings: { revenueGuidanceM: 123 } }
  }];

  const [result] = preserveTranscriptQaByFiscalPeriod(next, prior);
  assert.equal(result.dataSnapshot.youtubeEarnings.revenueGuidanceM, 123);
  assert.equal(result.dataSnapshot.youtubeEarnings.qa[0].questionZh, "为什么？");
  assert.equal(result.dataSnapshot.youtubeEarnings.qaCoverage.status, "has_qa");
});

test("does not carry transcript research across fiscal periods", () => {
  const prior = [{
    label: "FY2025 Q1",
    dataSnapshot: { youtubeEarnings: { qa: [{ question: "Old?" }] } }
  }];
  const next = [{ label: "FY2025 Q2", dataSnapshot: { youtubeEarnings: {} } }];
  assert.deepEqual(preserveTranscriptQaByFiscalPeriod(next, prior), next);
});

test("summarizes coverage and bilingual completeness", () => {
  const summary = transcriptQaCoverageSummary([
    {
      dataSnapshot: {
        youtubeEarnings: {
          qaCoverage: { status: "has_qa" },
          qa: [
            { questionZh: "问题", answerZh: "回答" },
            { questionZh: "问题二", answerZh: "" }
          ]
        }
      }
    },
    {
      dataSnapshot: {
        youtubeEarnings: { qaCoverage: { status: "transcript_not_in_source" }, qa: [] }
      }
    }
  ]);
  assert.deepEqual(summary, {
    totalPeriods: 2,
    coveragePeriods: 2,
    qaPeriods: 1,
    qaRows: 2,
    bilingualQaRows: 1,
    statusCounts: { has_qa: 1, transcript_not_in_source: 1 }
  });
});
