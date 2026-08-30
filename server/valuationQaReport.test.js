import assert from "node:assert/strict";
import test from "node:test";
import { tickerQa } from "./valuationQaReport.js";

function snapshot({ bilingual }) {
  return {
    ticker: "TEST",
    name: "Test Company",
    latest: { baseFairValue: 120, latestPrice: 100 },
    dataQuality: {
      modelInputAudit: { status: "pass", valuationRows: 1 },
      unifiedValuationAudit: { status: "pass", externalConsensusCheck: { status: "pass" } }
    },
    history: [{
      label: "FY2026 Q1",
      fiscalYear: 2026,
      fiscalQuarter: "Q1",
      asOfDate: "2026-05-01",
      fairValue: 120,
      dataSnapshot: {
        valuationSemantics: { scoreInputs: { profile: "mega_cap_platform" } },
        youtubeEarnings: {
          qaCoverage: { status: "has_qa" },
          qa: [{
            question: "What changed in the revenue outlook?",
            answer: "Management raised the full-year range after stronger demand.",
            questionZh: bilingual ? "收入展望发生了什么变化？" : "",
            answerZh: bilingual ? "管理层因需求更强而上调了全年区间。" : ""
          }]
        }
      }
    }]
  };
}

test("flags attached transcript Q&A that is not fully bilingual", () => {
  const result = tickerQa(snapshot({ bilingual: false }));
  assert.equal(result.transcriptQa.qaItems, 1);
  assert.equal(result.transcriptQa.bilingualQaItems, 0);
  assert.equal(result.researchStatus, "review");
  assert.ok(result.researchIssues.some((item) => item.code === "transcript_qa_translation_incomplete"));
});

test("passes research translation gate when every attached Q&A item is bilingual", () => {
  const result = tickerQa(snapshot({ bilingual: true }));
  assert.equal(result.transcriptQa.bilingualQaItems, 1);
  assert.equal(result.transcriptQa.untranslatedQaItems, 0);
  assert.equal(result.researchStatus, "pass");
});
