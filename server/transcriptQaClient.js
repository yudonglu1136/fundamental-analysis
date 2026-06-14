const MAX_QA_PER_PERIOD = Number(process.env.MAX_TRANSCRIPT_QA_PER_PERIOD || 6);
const MAX_QUESTION_CHARS = Number(process.env.MAX_TRANSCRIPT_QUESTION_CHARS || 4000);
const MAX_ANSWER_CHARS = Number(process.env.MAX_TRANSCRIPT_ANSWER_CHARS || 20000);

export function normalizeEarningsPeriod(period) {
  const value = String(period || "").trim().toUpperCase().replace(/\s+/g, "");
  const leadingQuarter = value.match(/^Q([1-4])(?:FY)?(20\d{2})$/);
  if (leadingQuarter) return `Q${leadingQuarter[1]}${leadingQuarter[2]}`;
  const trailingQuarter = value.match(/^(20\d{2})Q([1-4])$/);
  if (trailingQuarter) return `Q${trailingQuarter[2]}${trailingQuarter[1]}`;
  return value;
}

export function parseEarningsSourceId(sourceId) {
  const match = String(sourceId || "").match(/^earnings:([^:]+):([^:]+):(.+)$/);
  if (!match) return null;
  return {
    ticker: match[1].toUpperCase(),
    period: normalizeEarningsPeriod(match[2]),
    slug: match[3]
  };
}

function cleanText(value, maxChars = 0) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,;:])/g, "$1")
    .trim();
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function splitSegmentText(value) {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] || "";
  const hasSpeakerHeader = first.length <= 140 && /(?:\s[—-]\s|Operator|Analyst|CEO|CFO|Investor Relations)/i.test(first);
  if (!hasSpeakerHeader) {
    return { speaker: "", body: cleanText(value) };
  }
  return {
    speaker: cleanText(first, 140),
    body: cleanText(lines.slice(1).join(" "))
  };
}

function speakerRole(speaker, body = "") {
  const text = `${speaker} ${body}`.toLowerCase();
  if (/\banalyst\b|securities|capital markets|research|equity research|bank of america|morgan stanley|goldman|wedbush|wells fargo|rbc|ubs|jpmorgan|barclays|citi|deutsche|jefferies|bernstein|evercore|mizuho|baird|stifel|td cowen/.test(text)) {
    return "analyst";
  }
  if (/investor relations|head of ir|asks?,\s*["“]|we received a question|question from/i.test(text)) {
    return "ir";
  }
  if (/\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|chief|president|founder|chairman|management/.test(text)) {
    return "management";
  }
  return "unknown";
}

function questionIntroIndex(body) {
  const lower = body.toLowerCase();
  const markers = [
    "my question is",
    "question is",
    "who asks",
    "asks,",
    "can you",
    "could you",
    "how do",
    "how should",
    "what",
    "why",
    "where",
    "when",
    "is there",
    "are you"
  ];
  const indexes = markers
    .map((marker) => lower.indexOf(marker))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : 0;
}

function extractQuestion(body) {
  const quote = body.match(/[“"]([^”"]+\?[^”"]*)[”"]/);
  if (quote) return cleanText(quote[1], MAX_QUESTION_CHARS);
  const openQuote = body.match(/(?:question from|who asks|asks),?\s*[“"]([^”"]+\?[^”"]*)$/i);
  if (openQuote) return cleanText(openQuote[1], MAX_QUESTION_CHARS);
  const firstQuestionEnd = body.indexOf("?");
  if (firstQuestionEnd < 0) return "";
  const start = questionIntroIndex(body);
  let question = body.slice(start, firstQuestionEnd + 1);
  let cursor = firstQuestionEnd + 1;
  while (cursor < body.length) {
    const nextEnd = body.indexOf("?", cursor);
    if (nextEnd < 0 || (MAX_QUESTION_CHARS && nextEnd > MAX_QUESTION_CHARS)) break;
    question = body.slice(start, nextEnd + 1);
    cursor = nextEnd + 1;
  }
  return cleanText(question, MAX_QUESTION_CHARS);
}

function isQuestionSegment(segment) {
  const parsed = splitSegmentText(segment.text);
  if (!parsed.body.includes("?")) return false;
  const role = speakerRole(parsed.speaker, parsed.body);
  if (role === "analyst") return true;
  if (role === "ir" && /asks?|question from|received a question/i.test(parsed.body)) return true;
  return false;
}

function answerContextAfter(segments, questionIndex) {
  const pieces = [];
  for (let index = questionIndex + 1; index < segments.length; index += 1) {
    const segment = segments[index];
    if (isQuestionSegment(segment)) break;
    const parsed = splitSegmentText(segment.text);
    if (!parsed.body) continue;
    const role = speakerRole(parsed.speaker, parsed.body);
    if (role === "analyst") break;
    const label = parsed.speaker || "Management";
    pieces.push(`${label}: ${parsed.body}`);
  }
  return cleanText(pieces.join("\n\n"), MAX_ANSWER_CHARS);
}

function askedByFromSpeaker(speaker) {
  if (!speaker) return "";
  return speaker
    .replace(/\s[—-]\s.+$/, "")
    .replace(/\bAnalyst\b.*/i, "")
    .trim();
}

function askedByFromSegment(speaker, body) {
  const relayed = String(body || "").match(/question from\s+([^,.]+(?:\s+[A-Z]\.)?)/i);
  if (relayed?.[1]) return cleanText(relayed[1], 80);
  return askedByFromSpeaker(speaker);
}

export function readTranscriptQaByTickerPeriod(db, tickerSet, { limitPerPeriod = MAX_QA_PER_PERIOD } = {}) {
  const wanted = new Set([...tickerSet].map((ticker) => String(ticker || "").toUpperCase()).filter(Boolean));
  if (!wanted.size) return new Map();
  const callRows = db.prepare(`
    SELECT id, source_id, url, title, upload_date
    FROM videos
    WHERE source = 'earnings_call'
    ORDER BY upload_date ASC
  `).all();
  const calls = callRows
    .map((row) => ({ ...row, parsed: parseEarningsSourceId(row.source_id) }))
    .filter((row) => row.parsed && wanted.has(row.parsed.ticker));
  if (!calls.length) return new Map();

  const byVideoId = new Map(calls.map((call) => [call.id, call]));
  const placeholders = calls.map(() => "?").join(", ");
  const segmentRows = db.prepare(`
    SELECT video_id, segment_index, text
    FROM transcript_segments
    WHERE video_id IN (${placeholders})
    ORDER BY video_id ASC, segment_index ASC
  `).all(...calls.map((call) => call.id));

  const segmentsByVideo = new Map();
  for (const row of segmentRows) {
    segmentsByVideo.set(row.video_id, [...(segmentsByVideo.get(row.video_id) || []), row]);
  }

  const result = new Map();
  const seenQuestions = new Set();
  for (const [videoId, segments] of segmentsByVideo.entries()) {
    const call = byVideoId.get(videoId);
    if (!call?.parsed) continue;
    const key = `${call.parsed.ticker}::${call.parsed.period}`;
    const existing = result.get(key) || [];
    for (let index = 0; index < segments.length && existing.length < limitPerPeriod; index += 1) {
      const segment = segments[index];
      if (!isQuestionSegment(segment)) continue;
      const parsed = splitSegmentText(segment.text);
      const question = extractQuestion(parsed.body);
      if (!question) continue;
      const questionKey = `${key}::${question.toLowerCase()}`;
      if (seenQuestions.has(questionKey)) continue;
      seenQuestions.add(questionKey);
      existing.push({
        ticker: call.parsed.ticker,
        fiscalPeriod: call.parsed.period,
        question,
        answer: answerContextAfter(segments, index),
        askedBy: askedByFromSegment(parsed.speaker, parsed.body),
        speaker: parsed.speaker,
        callDate: call.upload_date || null,
        title: call.title || null,
        url: call.url || null,
        sourceId: call.source_id || null,
        segmentIndex: segment.segment_index
      });
    }
    if (existing.length) result.set(key, existing);
  }
  return result;
}
