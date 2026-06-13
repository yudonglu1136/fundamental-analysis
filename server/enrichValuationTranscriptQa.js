import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeEarningsPeriod, readTranscriptQaByTickerPeriod } from "./transcriptQaClient.js";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const YOUTUBE_DB_PATH = process.env.YOUTUBE_TRANSCRIPT_DB_PATH || "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function periodKeyFromHistoryRow(row) {
  const year = Number(row?.fiscalYear);
  const quarterMatch = String(row?.fiscalQuarter || row?.label || row?.periodId || "")
    .toUpperCase()
    .match(/Q([1-4])/);
  if (Number.isFinite(year) && quarterMatch) return `Q${quarterMatch[1]}${year}`;
  const text = String(row?.label || row?.periodId || "").toUpperCase();
  const qfy = text.match(/Q([1-4])\s*(?:FY)?\s*(20\d{2})/);
  if (qfy) return `Q${qfy[1]}${qfy[2]}`;
  const fyq = text.match(/(?:FY)?\s*(20\d{2}).*Q([1-4])/);
  if (fyq) return `Q${fyq[2]}${fyq[1]}`;
  return normalizeEarningsPeriod(text);
}

if (!fs.existsSync(CURRENT_DB_PATH)) {
  throw new Error(`Valuation database not found at ${CURRENT_DB_PATH}`);
}
if (!fs.existsSync(YOUTUBE_DB_PATH)) {
  throw new Error(`YouTube transcript database not found at ${YOUTUBE_DB_PATH}`);
}

const currentDb = new DatabaseSync(CURRENT_DB_PATH);
const youtubeDb = new DatabaseSync(YOUTUBE_DB_PATH, { readOnly: true });

try {
  const rows = currentDb.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots").all();
  const tickerSet = new Set(rows.map((row) => String(row.ticker || "").toUpperCase()).filter(Boolean));
  const qaByPeriod = readTranscriptQaByTickerPeriod(youtubeDb, tickerSet);
  const statement = currentDb.prepare(`
    INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(ticker) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `);

  let updatedTickers = 0;
  let updatedRows = 0;
  let attachedQa = 0;
  currentDb.exec("BEGIN");
  try {
    for (const row of rows) {
      const ticker = String(row.ticker || "").toUpperCase();
      const snapshot = parseJson(row.payload_json, {});
      const history = Array.isArray(snapshot.history) ? snapshot.history : [];
      let tickerChanged = false;
      const nextHistory = history.map((historyRow) => {
        const period = periodKeyFromHistoryRow(historyRow);
        const qa = qaByPeriod.get(`${ticker}::${period}`) || [];
        if (!qa.length) return historyRow;
        tickerChanged = true;
        updatedRows += 1;
        attachedQa += qa.length;
        return {
          ...historyRow,
          dataSnapshot: {
            ...(historyRow.dataSnapshot || {}),
            youtubeEarnings: {
              ...(historyRow.dataSnapshot?.youtubeEarnings || {}),
              qa
            }
          }
        };
      });
      if (!tickerChanged) continue;
      updatedTickers += 1;
      const generatedAt = new Date().toISOString();
      const nextSnapshot = {
        ...snapshot,
        generatedAt,
        history: nextHistory,
        dataQuality: {
          ...(snapshot.dataQuality || {}),
          transcriptQaPeriods: nextHistory.filter((historyRow) => historyRow.dataSnapshot?.youtubeEarnings?.qa?.length).length
        }
      };
      statement.run(ticker, generatedAt, JSON.stringify(nextSnapshot));
    }
    const dashboard = parseJson(currentDb.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest")?.payload_json, {});
    if (dashboard && Object.keys(dashboard).length) {
      const generatedAt = new Date().toISOString();
      currentDb.prepare(`
        INSERT INTO valuation_snapshots (id, generated_at, payload_json)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          generated_at = excluded.generated_at,
          payload_json = excluded.payload_json
      `).run("latest", generatedAt, JSON.stringify({
        ...dashboard,
        generatedAt,
        summary: {
          ...(dashboard.summary || {}),
          transcriptQaTickerCount: updatedTickers,
          transcriptQaEventCount: attachedQa
        }
      }));
    }
    currentDb.exec("COMMIT");
  } catch (error) {
    currentDb.exec("ROLLBACK");
    throw error;
  }
  currentDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify({
    currentDbPath: CURRENT_DB_PATH,
    youtubeDbPath: YOUTUBE_DB_PATH,
    updatedTickers,
    updatedRows,
    attachedQa
  }, null, 2));
} finally {
  youtubeDb.close();
  currentDb.close();
}
