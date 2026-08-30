import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readTranscriptQaBundleByTickerPeriod } from "./transcriptQaClient.js";

function fixtureDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE videos (
      id INTEGER PRIMARY KEY,
      source_id TEXT,
      source TEXT,
      url TEXT,
      title TEXT,
      upload_date TEXT
    );
    CREATE TABLE transcript_segments (
      video_id INTEGER,
      segment_index INTEGER,
      text TEXT
    );
  `);
  db.prepare(`
    INSERT INTO videos (id, source_id, source, url, title, upload_date)
    VALUES (1, 'earnings:TEST:Q12026:test-call', 'earnings_call', 'https://example.test/call', 'Test Q1 2026', '2026-05-01')
  `).run();
  const insert = db.prepare(`
    INSERT INTO transcript_segments (video_id, segment_index, text)
    VALUES (1, ?, ?)
  `);
  insert.run(0, "Jane Doe — Morgan Stanley Analyst\nWhere are the strongest indicators of future demand?");
  insert.run(1, "Alex Smith — CEO\nThis is a prepared-remarks paragraph and must not be paired as an answer.");
  insert.run(2, "Operator\nWe will now begin the question-and-answer session. Our first question comes from John Brown.");
  insert.run(3, "John Brown — Analyst\nCould you discuss the assumptions behind your 2026 revenue guidance?");
  insert.run(4, "Alex Smith — CEO\nWe expect demand to remain strong, but the outlook still assumes a cautious second half.");
  insert.run(5, "Mary Jones — Analyst\nSarah?");
  insert.run(6, "Alex Smith — CEO\nThis should not become a standalone Q&A item.");
  insert.run(7, "Investor Relations\nThank you. We are now ready to open the call to questions. Operator?");
  insert.run(8, "Operator\nThere are no further questions at this time.");
  insert.run(9, "Audio Check — Analyst\nCan you guys hear me now?");
  insert.run(10, "Operator\nYes.");
  insert.run(11, "Rob Williams\nCan you please introduce the first question?");
  insert.run(12, "Operator\nWe will take our first question from Krish Sankar with Cowen and Company.");
  insert.run(13, "Krish Sankar — Cowen Analyst\nCould you explain how the backlog supports next year's demand outlook?");
  insert.run(14, "Operator\nPlease go ahead.");
  insert.run(15, "Alex Smith — CEO\nHi, Krish. Good morning.");
  insert.run(16, "Krish Sankar — Cowen Analyst\nHi, Alex.");
  insert.run(17, "Alex Smith — CEO\nThe backlog is diversified across customers and gives us meaningful visibility into next year's demand, although timing can still move between quarters.");
  return db;
}

test("extracts only complete analyst questions after the Q&A boundary", () => {
  const db = fixtureDatabase();
  const result = readTranscriptQaBundleByTickerPeriod(db, new Set(["TEST"]));
  const rows = result.qaByPeriod.get("TEST::Q12026") || [];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].question, "Could you discuss the assumptions behind your 2026 revenue guidance?");
  assert.match(rows[0].answer, /outlook still assumes a cautious second half/);
  assert.doesNotMatch(rows[0].answer, /prepared-remarks/);
  assert.match(rows[1].question, /backlog supports next year's demand outlook/);
  assert.doesNotMatch(rows[1].answer, /Please go ahead/);
  assert.match(rows[1].answer, /diversified across customers/);
});
