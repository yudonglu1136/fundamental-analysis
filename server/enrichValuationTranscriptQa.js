import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeEarningsPeriod, readTranscriptQaByTickerPeriod } from "./transcriptQaClient.js";
import { translateTextToChinese } from "./translationClient.js";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const YOUTUBE_DB_PATH = process.env.YOUTUBE_TRANSCRIPT_DB_PATH || "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";
const SHOULD_TRANSLATE_ZH = process.env.TRANSCRIPT_QA_TRANSLATE_ZH !== "false";
const TRANSLATION_CONCURRENCY = Math.max(1, Number(process.env.TRANSCRIPT_QA_TRANSLATION_CONCURRENCY || 6));
const FALLBACK_ANSWER = "Management response context is not available in the structured transcript extract.";

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

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function enoughChineseForSource(translated, source) {
  const output = String(translated || "").trim();
  const input = String(source || "").trim();
  if (!output || !input) return false;
  if (!hasChinese(output)) return false;
  if (input.length < 80) return true;
  const asciiWords = output.match(/[A-Za-z]{4,}/g) || [];
  const chineseChars = output.match(/[\u3400-\u9fff]/g) || [];
  return chineseChars.length >= Math.max(8, Math.floor(asciiWords.length * 0.35));
}

function textValue(value, fallback = "") {
  return String(value || fallback || "").trim();
}

function translationSource(value, fallback = "") {
  const source = textValue(value, fallback);
  return source || "";
}

function needsStoredChinese(existingValue, sourceValue) {
  const source = translationSource(sourceValue);
  if (!SHOULD_TRANSLATE_ZH || !source) return false;
  return !enoughChineseForSource(existingValue, source);
}

function qaRowsForHistoryRow(ticker, historyRow, qaByPeriod) {
  const period = periodKeyFromHistoryRow(historyRow);
  const key = `${ticker}::${period}`;
  const hasFreshPeriod = qaByPeriod.has(key);
  const qa = qaByPeriod.get(key) || [];
  const existingQa = historyRow.dataSnapshot?.youtubeEarnings?.qa || [];
  if (!hasFreshPeriod || !qa.length) return [];
  if (!existingQa.length) return qa;
  return mergeStoredQaTranslations(qa, existingQa);
}

function qaIdentity(qa) {
  const sourceId = textValue(qa.sourceId);
  const segmentIndex = textValue(qa.segmentIndex);
  if (sourceId && segmentIndex) return `${sourceId}::${segmentIndex}`;
  return `${textValue(qa.fiscalPeriod)}::${textValue(qa.question).toLowerCase()}`;
}

function mergeStoredQaTranslations(freshRows, existingRows) {
  const existingByKey = new Map();
  for (const row of existingRows) {
    existingByKey.set(qaIdentity(row), row);
  }
  return freshRows.map((row) => {
    const existing = existingByKey.get(qaIdentity(row));
    if (!existing) return row;
    return {
      ...row,
      questionZh: existing.questionZh || row.questionZh,
      answerZh: existing.answerZh || row.answerZh,
      askedByZh: existing.askedByZh || row.askedByZh,
      titleZh: existing.titleZh || row.titleZh
    };
  });
}

function collectTranslationSources(qaRows, sources) {
  if (!SHOULD_TRANSLATE_ZH) return;
  for (const qa of qaRows) {
    const answer = translationSource(qa.answer, FALLBACK_ANSWER);
    if (needsStoredChinese(qa.questionZh, qa.question)) sources.add(translationSource(qa.question));
    if (needsStoredChinese(qa.answerZh, answer)) sources.add(answer);
  }
}

async function translateSourcesToChinese(sources) {
  const values = [...sources].filter(Boolean);
  const translatedBySource = new Map();
  if (!values.length) return translatedBySource;

  let completed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const source = values[index];
      try {
        const translated = await translateTextToChinese(source);
        translatedBySource.set(source, enoughChineseForSource(translated, source) ? translated : source);
      } catch (error) {
        console.warn(`translation failed for item ${index + 1}/${values.length}: ${error.message}`);
        translatedBySource.set(source, source);
      } finally {
        completed += 1;
        if (completed % 50 === 0 || completed === values.length) {
          console.log(`translated ${completed}/${values.length} transcript Q&A fields`);
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(TRANSLATION_CONCURRENCY, values.length) }, () => worker())
  );
  return translatedBySource;
}

function translatedValue(sourceValue, existingValue, translatedBySource) {
  const source = translationSource(sourceValue);
  if (!source) return "";
  if (!needsStoredChinese(existingValue, source)) return existingValue || source;
  return translatedBySource.get(source) || source;
}

function translateQaRowsToChinese(qaRows, translatedBySource) {
  if (!SHOULD_TRANSLATE_ZH) return qaRows;
  return qaRows.map((qa) => {
    const answer = translationSource(qa.answer, FALLBACK_ANSWER);
    const next = { ...qa };
    next.answer = answer;
    next.questionZh = translatedValue(qa.question, next.questionZh, translatedBySource);
    next.answerZh = translatedValue(answer, next.answerZh, translatedBySource);
    return next;
  });
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
  const translationSources = new Set();

  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase();
    const snapshot = parseJson(row.payload_json, {});
    const history = Array.isArray(snapshot.history) ? snapshot.history : [];
    for (const historyRow of history) {
      const qaRows = qaRowsForHistoryRow(ticker, historyRow, qaByPeriod);
      if (qaRows.length) collectTranslationSources(qaRows, translationSources);
    }
  }
  const translatedBySource = await translateSourcesToChinese(translationSources);

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
      const nextHistory = [];
      for (const historyRow of history) {
        const qaRows = qaRowsForHistoryRow(ticker, historyRow, qaByPeriod);
        if (!qaRows.length) {
          if (historyRow.dataSnapshot?.youtubeEarnings?.qa?.length) {
            tickerChanged = true;
            nextHistory.push({
              ...historyRow,
              dataSnapshot: {
                ...(historyRow.dataSnapshot || {}),
                youtubeEarnings: {
                  ...(historyRow.dataSnapshot?.youtubeEarnings || {}),
                  qa: []
                }
              }
            });
            continue;
          }
          nextHistory.push(historyRow);
          continue;
        }
        tickerChanged = true;
        updatedRows += 1;
        const translatedQa = translateQaRowsToChinese(qaRows, translatedBySource);
        attachedQa += translatedQa.length;
        nextHistory.push({
          ...historyRow,
          dataSnapshot: {
            ...(historyRow.dataSnapshot || {}),
            youtubeEarnings: {
              ...(historyRow.dataSnapshot?.youtubeEarnings || {}),
              qa: translatedQa
            }
          }
        });
      }
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
