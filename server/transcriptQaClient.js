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

function isTranscriptPlaceholderText(value) {
  const text = cleanText(value).toLowerCase();
  return Boolean(
    text.includes("unlock this transcript") ||
    text.includes("stock analysis pro") ||
    text.includes("sign up sign in") ||
    text.includes("read full transcripts older than")
  );
}

function splitSegmentText(value) {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] || "";
  const looksLikePersonName = /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}$/.test(first);
  const hasSpeakerHeader = first.length <= 140 && (
    /(?:\s[—-]\s|Operator|Analyst|CEO|CFO|Investor Relations)/i.test(first) ||
    (lines.length > 1 && looksLikePersonName)
  );
  if (!hasSpeakerHeader) {
    return { speaker: "", body: cleanText(value) };
  }
  return {
    speaker: cleanText(first, 140),
    body: cleanText(lines.slice(1).join(" "))
  };
}

function speakerRole(speaker, body = "") {
  const speakerText = String(speaker || "").toLowerCase();
  const text = `${speaker} ${body}`.toLowerCase();
  if (/\boperator\b/.test(speakerText)) {
    return "operator";
  }
  if (/\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|chief|president|founder|chairman|management/.test(text)) {
    return "management";
  }
  if (/\banalyst\b|securities|capital markets|research|equity research|bank of america|\bbofa\b|morgan stanley|goldman|wedbush|wells fargo|rbc|ubs|jpmorgan|barclays|citi|deutsche|jefferies|bernstein|evercore|mizuho|baird|stifel|td cowen|bnp paribas|hsbc|bmo|kbw|melius|keybanc|guggenheim|loop capital|piper sandler|raymond james|susquehanna|truist|william blair|oppenheimer|wolfe/.test(text)) {
    return "analyst";
  }
  if (/investor relations|head of ir|asks?,\s*["“]|we received a question|question from/i.test(text)) {
    return "ir";
  }
  return "unknown";
}

function speakerKey(speaker) {
  return cleanText(speaker)
    .replace(/\s[—-]\s.+$/, "")
    .replace(/\b(analyst|research analyst|senior research analyst)\b.*/i, "")
    .toLowerCase();
}

function buildCallContext(segments) {
  const parsedSegments = segments.map((segment) => ({
    ...segment,
    parsed: splitSegmentText(segment.text)
  }));
  let qaStartIndex = Infinity;
  for (let index = 0; index < parsedSegments.length; index += 1) {
    const { speaker, body } = parsedSegments[index].parsed;
    const role = speakerRole(speaker, body);
    if (
      role === "operator" &&
      /question[-\s]?and[-\s]?answer|operator instructions|first question|next question|we(?:'|’)ll go to|we will go to|line of/i.test(body)
    ) {
      qaStartIndex = index;
      break;
    }
  }

  const managementSpeakers = new Set();
  for (let index = 0; index < Math.min(qaStartIndex, parsedSegments.length); index += 1) {
    const { speaker, body } = parsedSegments[index].parsed;
    const role = speakerRole(speaker, body);
    const key = speakerKey(speaker);
    if (!key || role === "operator" || role === "analyst" || role === "ir") continue;
    managementSpeakers.add(key);
  }

  return {
    parsedSegments,
    qaStartIndex,
    managementSpeakers
  };
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

function isUsableQuestionText(question) {
  const value = cleanText(question);
  if (!value || !value.includes("?")) return false;
  if (
    /ready to open (?:the )?call to questions|open (?:the )?(?:call|line) (?:to|for) questions|turn (?:the call )?(?:back )?to (?:the )?operator|operator\s*\?\s*$|introduce (?:the )?(?:first|next) question|take (?:the )?(?:first|next) question/i.test(value)
  ) {
    return false;
  }
  if (/can (?:you|everyone) (?:guys )?hear me|hear me (?:now|okay)|video (?:stream|feed)/i.test(value)) {
    return false;
  }
  const words = value.match(/[A-Za-z0-9$%]+(?:['’-][A-Za-z0-9]+)*/g) || [];
  if (value.length < 16 || words.length < 4) return false;
  if (/^[A-Z][A-Za-z.'-]+\s*\?$/.test(value)) return false;
  return true;
}

function isUsableAnswerText(answer) {
  const value = cleanText(answer);
  const words = value.match(/[A-Za-z0-9$%]+(?:['’-][A-Za-z0-9]+)*/g) || [];
  if (value.length < 80 || words.length < 12) return false;
  if (/^(?:Operator|Management)\s*:\s*(?:yes|no|correct|thank you)[.!]?$/i.test(value)) return false;
  return true;
}

function isQuestionSegment(segment, context = null, segmentIndex = -1) {
  if (isTranscriptPlaceholderText(segment.text)) return false;
  const parsed = splitSegmentText(segment.text);
  if (isTranscriptPlaceholderText(parsed.speaker) || isTranscriptPlaceholderText(parsed.body)) return false;
  if (!parsed.body.includes("?")) return false;
  if (
    context &&
    Number.isFinite(context.qaStartIndex) &&
    segmentIndex <= context.qaStartIndex
  ) {
    return false;
  }
  const role = speakerRole(parsed.speaker, parsed.body);
  if (role === "analyst") return true;
  if (role === "ir" && /asks?|question from|received a question/i.test(parsed.body)) return true;
  if (role === "operator" || role === "management") return false;
  if (context && segmentIndex > context.qaStartIndex) {
    const key = speakerKey(parsed.speaker);
    if (key && !context.managementSpeakers.has(key)) return true;
  }
  return false;
}

function answerContextAfter(segments, questionIndex, context = null) {
  const pieces = [];
  for (let index = questionIndex + 1; index < segments.length; index += 1) {
    const segment = segments[index];
    if (isQuestionSegment(segment, context, index)) break;
    if (isTranscriptPlaceholderText(segment.text)) break;
    const parsed = splitSegmentText(segment.text);
    if (isTranscriptPlaceholderText(parsed.speaker) || isTranscriptPlaceholderText(parsed.body)) break;
    if (!parsed.body) continue;
    const role = speakerRole(parsed.speaker, parsed.body);
    if (role === "analyst") {
      const analystWords = parsed.body.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];
      const briefGreeting = analystWords.length <= 8 &&
        /^(?:hi|hello|thanks?|thank you|good (?:morning|afternoon|evening))\b/i.test(parsed.body);
      if (briefGreeting && !parsed.body.includes("?")) continue;
      break;
    }
    if (role === "operator" || role === "ir") continue;
    const key = speakerKey(parsed.speaker);
    if (role !== "management" && (!context || !context.managementSpeakers.has(key))) continue;
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

function summarizeCallCoverage(call, segments, qaRows) {
  const segmentCount = segments.length;
  const placeholderCount = segments.filter((segment) => isTranscriptPlaceholderText(segment.text)).length;
  const questionLikeCount = segments.filter((segment) => String(segment.text || "").includes("?")).length;
  let status = "qa_not_found";
  let reason = "A transcript is stored, but no analyst question with management answer was detected.";

  if (qaRows.length) {
    status = "has_qa";
    reason = "Structured analyst Q&A was extracted from the stored call transcript.";
  } else if (!segmentCount) {
    status = "no_segments";
    reason = "The earnings-call record exists, but transcript segments are missing.";
  } else if (placeholderCount > 0) {
    status = "locked_preview";
    reason = "The stored transcript is a locked/preview source and does not include the Q&A section.";
  } else if (segmentCount < 8 && questionLikeCount === 0) {
    status = "partial_transcript";
    reason = "The stored transcript is too short to contain a usable Q&A section.";
  } else if (questionLikeCount > 0) {
    status = "qa_parse_miss";
    reason = "The transcript contains question-like text, but the role parser could not pair a clean analyst question with a management answer.";
  }

  return {
    ticker: call.parsed.ticker,
    fiscalPeriod: call.parsed.period,
    status,
    reason,
    qaCount: qaRows.length,
    segmentCount,
    questionLikeCount,
    placeholderCount,
    callDate: call.upload_date || null,
    title: call.title || null,
    url: call.url || null,
    sourceId: call.source_id || null
  };
}

export function readTranscriptQaBundleByTickerPeriod(db, tickerSet, { limitPerPeriod = MAX_QA_PER_PERIOD } = {}) {
  const wanted = new Set([...tickerSet].map((ticker) => String(ticker || "").toUpperCase()).filter(Boolean));
  if (!wanted.size) {
    return {
      qaByPeriod: new Map(),
      coverageByPeriod: new Map()
    };
  }
  const callRows = db.prepare(`
    SELECT id, source_id, url, title, upload_date
    FROM videos
    WHERE source = 'earnings_call'
    ORDER BY upload_date ASC
  `).all();
  const calls = callRows
    .map((row) => ({ ...row, parsed: parseEarningsSourceId(row.source_id) }))
    .filter((row) => row.parsed && wanted.has(row.parsed.ticker));
  if (!calls.length) {
    return {
      qaByPeriod: new Map(),
      coverageByPeriod: new Map()
    };
  }

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

  const qaByPeriod = new Map();
  const coverageByPeriod = new Map();
  const seenQuestions = new Set();
  for (const call of calls) {
    const segments = segmentsByVideo.get(call.id) || [];
    const context = buildCallContext(segments);
    const key = `${call.parsed.ticker}::${call.parsed.period}`;
    const existing = qaByPeriod.get(key) || [];
    for (let index = 0; index < segments.length && existing.length < limitPerPeriod; index += 1) {
      const segment = segments[index];
      if (!isQuestionSegment(segment, context, index)) continue;
      const parsed = splitSegmentText(segment.text);
      const question = extractQuestion(parsed.body);
      if (isTranscriptPlaceholderText(question)) continue;
      if (!isUsableQuestionText(question)) continue;
      const questionKey = `${key}::${question.toLowerCase()}`;
      if (seenQuestions.has(questionKey)) continue;
      const answer = answerContextAfter(segments, index, context);
      if (!isUsableAnswerText(answer) || isTranscriptPlaceholderText(answer)) continue;
      seenQuestions.add(questionKey);
      existing.push({
        ticker: call.parsed.ticker,
        fiscalPeriod: call.parsed.period,
        question,
        answer,
        askedBy: askedByFromSegment(parsed.speaker, parsed.body),
        speaker: parsed.speaker,
        callDate: call.upload_date || null,
        title: call.title || null,
        url: call.url || null,
        sourceId: call.source_id || null,
        segmentIndex: segment.segment_index
      });
    }
    if (existing.length) qaByPeriod.set(key, existing);
    coverageByPeriod.set(key, summarizeCallCoverage(call, segments, existing));
  }
  return { qaByPeriod, coverageByPeriod };
}

export function readTranscriptQaByTickerPeriod(db, tickerSet, options = {}) {
  return readTranscriptQaBundleByTickerPeriod(db, tickerSet, options).qaByPeriod;
}

export function readTranscriptQaCoverageByTickerPeriod(db, tickerSet, options = {}) {
  return readTranscriptQaBundleByTickerPeriod(db, tickerSet, options).coverageByPeriod;
}
