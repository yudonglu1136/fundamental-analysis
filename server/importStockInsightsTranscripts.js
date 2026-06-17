import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const YOUTUBE_DB_PATH = process.env.YOUTUBE_TRANSCRIPT_DB_PATH || "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";
const OUT_DIR = process.env.STOCKINSIGHTS_TRANSCRIPT_OUT_DIR || "/Users/yudonglu/Documents/youtube_transcript_db/earnings_transcripts";
const TICKERS = (process.env.STOCKINSIGHTS_TICKERS || process.argv.slice(2).join(",") || "NTRA")
  .split(/[,\s]+/)
  .map((ticker) => ticker.trim().toUpperCase())
  .filter(Boolean);

const SEEDS = {
  NTRA: "https://www.stockinsights.ai/us/NTRA/earnings-transcript/fy25-q1-5cfc"
};

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "-")
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&lsquo;|&#8216;/g, "'")
    .replace(/&rdquo;|&#8221;/g, '"')
    .replace(/&ldquo;|&#8220;/g, '"')
    .replace(/&hellip;|&#8230;/g, "...");
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,;:])/g, "$1")
    .trim();
}

function periodFromSlug(slug) {
  const match = String(slug || "").match(/fy(\d{2})-q([1-4])/i);
  if (!match) return null;
  return `Q${match[2]}20${match[1]}`;
}

function parseAnchorDate(label) {
  const match = String(label || "").match(/\b(\d{1,2})\s+([A-Za-z]{3})\s+'(\d{2})\b/);
  if (!match) return null;
  const [, day, monthText, year] = match;
  const month = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  }[monthText.toLowerCase()];
  if (!month) return null;
  return `20${year}-${month}-${String(day).padStart(2, "0")}`;
}

function extractTranscriptLinks(html, ticker, seedUrl) {
  const links = new Map();
  const pattern = /<a\b[^>]*href="([^"]*\/earnings-transcript\/([^"/]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const href = decodeHtml(match[1]);
    const slug = match[2];
    const label = cleanText(match[3]);
    const period = periodFromSlug(slug);
    if (!period) continue;
    const url = new URL(href, seedUrl).toString();
    links.set(url, {
      ticker,
      url,
      slug,
      period,
      uploadDate: parseAnchorDate(label),
      label
    });
  }
  return [...links.values()].sort((a, b) => String(b.period).localeCompare(String(a.period)));
}

function extractTitle(html, fallback) {
  const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return cleanText(title) || fallback;
}

function extractSegments(html) {
  const paragraphs = [...String(html || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => match[1]);
  const segments = [];
  let current = null;

  for (const paragraphHtml of paragraphs) {
    const speakerMatch = paragraphHtml.match(/<strong[^>]*>([\s\S]*?):<\/strong>\s*([\s\S]*)$/i);
    if (speakerMatch) {
      const speaker = cleanText(speakerMatch[1]);
      const body = cleanText(speakerMatch[2]);
      if (!speaker || !body) continue;
      current = { speaker, parts: [body] };
      segments.push(current);
      continue;
    }

    const body = cleanText(paragraphHtml);
    if (!body || !current) continue;
    if (/^(AI Assistant|Find Answers|Ask about any part of the document)/i.test(body)) continue;
    current.parts.push(body);
  }

  return segments
    .map((segment) => ({
      start: null,
      text: `${segment.speaker}\n${segment.parts.join("\n\n")}`.trim()
    }))
    .filter((segment) => segment.text.length > 40);
}

function sourceIdFor(link) {
  return `earnings:${link.ticker}:${link.period}:stockinsights-${link.slug}`;
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'youtube',
      source_id TEXT NOT NULL,
      url TEXT,
      title TEXT,
      channel TEXT,
      upload_date TEXT,
      duration_seconds INTEGER,
      language TEXT DEFAULT 'en',
      transcript_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source, source_id)
    );
    CREATE TABLE IF NOT EXISTS transcript_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      start_time TEXT,
      start_seconds REAL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(video_id, segment_index)
    );
  `);
}

function upsertVideo(db, metadata) {
  const stamp = nowIso();
  db.prepare(`
    INSERT INTO videos (
      source, source_id, url, title, channel, upload_date, duration_seconds,
      language, transcript_path, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_id) DO UPDATE SET
      url=excluded.url,
      title=excluded.title,
      channel=excluded.channel,
      upload_date=excluded.upload_date,
      duration_seconds=excluded.duration_seconds,
      language=excluded.language,
      transcript_path=excluded.transcript_path,
      updated_at=excluded.updated_at
  `).run(
    metadata.source,
    metadata.sourceId,
    metadata.url,
    metadata.title,
    metadata.channel,
    metadata.uploadDate,
    null,
    "en",
    metadata.transcriptPath,
    stamp,
    stamp
  );
  return db.prepare("SELECT id FROM videos WHERE source = ? AND source_id = ?").get(metadata.source, metadata.sourceId).id;
}

function importSegments(db, videoId, segments) {
  const stamp = nowIso();
  db.prepare("DELETE FROM transcript_segments WHERE video_id = ?").run(videoId);
  const insert = db.prepare(`
    INSERT INTO transcript_segments(video_id, segment_index, start_time, start_seconds, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  segments.forEach((segment, index) => {
    insert.run(videoId, index, segment.start, null, segment.text, stamp);
  });
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const db = new DatabaseSync(YOUTUBE_DB_PATH);
  ensureSchema(db);
  db.exec("BEGIN");
  try {
    let importedCalls = 0;
    let importedSegments = 0;
    for (const ticker of TICKERS) {
      const seedUrl = SEEDS[ticker];
      if (!seedUrl) throw new Error(`No StockInsights seed URL configured for ${ticker}`);
      const indexHtml = await fetchHtml(seedUrl);
      const links = extractTranscriptLinks(indexHtml, ticker, seedUrl);
      console.log(`${ticker}: found ${links.length} StockInsights transcripts`);
      for (const link of links) {
        const html = link.url === seedUrl ? indexHtml : await fetchHtml(link.url);
        const segments = extractSegments(html);
        if (!segments.length) {
          console.warn(`  skipped ${link.period}: no transcript segments`);
          continue;
        }
        const title = extractTitle(html, `${ticker} Earnings Call: ${link.period}`);
        const tickerDir = path.join(OUT_DIR, ticker);
        fs.mkdirSync(tickerDir, { recursive: true });
        const sourceId = sourceIdFor(link);
        const transcriptPath = path.join(tickerDir, `${sourceId.replace(/[^A-Za-z0-9_.-]+/g, "_")}.txt`);
        fs.writeFileSync(
          transcriptPath,
          `${title}\n${link.uploadDate || ""}\n${link.url}\n\n${segments.map((segment) => segment.text).join("\n\n---\n\n")}`,
          "utf8"
        );
        const videoId = upsertVideo(db, {
          source: "earnings_call",
          sourceId,
          url: link.url,
          title,
          channel: `${ticker} / StockInsights`,
          uploadDate: link.uploadDate,
          transcriptPath
        });
        importSegments(db, videoId, segments);
        importedCalls += 1;
        importedSegments += segments.length;
        console.log(`  ${sourceId} segments=${segments.length}`);
      }
    }
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log(`Imported/updated ${importedCalls} calls and ${importedSegments} speaker segments into ${YOUTUBE_DB_PATH}`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
