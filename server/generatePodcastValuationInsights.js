import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  databaseInfo,
  readValuationSnapshot,
  replaceValuationPodcastInsights,
  writeBackgroundJobRun
} from "./localDatabase.js";

const DEFAULT_YOUTUBE_DB = "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";
const JOB_ID = "valuation_podcast_insights";
const DEFAULT_CHANNELS = [
  "All-In Podcast",
  "Latent Space",
  "No Priors",
  "Invest Like The Best",
  "Dwarkesh Patel",
  "Peter H. Diamandis",
  "Core Memory Podcast"
];

const FORWARD_KEYWORDS = [
  "accelerate",
  "adoption",
  "agent",
  "ai",
  "capex",
  "capacity",
  "cloud",
  "competition",
  "compute",
  "cost",
  "data center",
  "demand",
  "efficiency",
  "end-to-end",
  "growth",
  "inference",
  "margin",
  "monetization",
  "optimize",
  "pipeline",
  "pricing",
  "power",
  "risk",
  "semiconductor",
  "subscription",
  "supply",
  "revenue",
  "tpu",
  "training",
  "will"
];

const NEGATIVE_KEYWORDS = [
  "competitive pressure",
  "concern",
  "decline",
  "disruption",
  "expensive",
  "headwind",
  "pressure",
  "risk",
  "slowdown",
  "threat"
];

const POSITIVE_KEYWORDS = [
  "accelerate",
  "advantage",
  "benefit",
  "demand",
  "efficiency",
  "growth",
  "lower cost",
  "margin",
  "moat",
  "opportunity",
  "optimize",
  "pricing power"
];

const CLAIM_KEYWORDS = [
  "argue",
  "believe",
  "benefit",
  "because",
  "cannot",
  "can't",
  "could",
  "doesn't work",
  "going to",
  "i think",
  "impossibility",
  "important",
  "led to",
  "mean",
  "means",
  "missing",
  "need",
  "opportunity",
  "risk",
  "should",
  "will",
  "would"
];

const QUESTION_START_PATTERN = /^(what|why|how|when|where|who|can you|could you|do you|does|did|is|are|should we|would you)\b/i;
const NOISE_PATTERN = /\b(subscribe|youtube channel|our faces|check them out|sponsor|sponsored|advertis|promo code|like and subscribe|thanks for watching|welcome back|core buddy|for the love of the game)\b/i;
const BROKEN_START_PATTERN = /^(and|or|but|so|um|uh|like|lic|he|she|they|we|you|i)\s/i;
const BUSINESS_KEYWORDS = [
  "adoption",
  "arpu",
  "capex",
  "cash flow",
  "cloud",
  "competition",
  "compute",
  "cost",
  "customer",
  "data center",
  "demand",
  "efficiency",
  "growth",
  "inference",
  "infrastructure",
  "investing",
  "margin",
  "market",
  "monetization",
  "pricing",
  "product",
  "profit",
  "revenue",
  "risk",
  "supply",
  "trillion"
];

const MANUAL_ALIASES = {
  AAPL: ["apple", "iphone", "app store", "vision pro", "siri"],
  AAOI: ["applied optoelectronics", "aaoi", "optical transceiver"],
  ADBE: ["adobe", "creative cloud", "firefly"],
  AMD: ["amd", "advanced micro devices", "mi300", "mi350"],
  AMZN: ["amazon", "aws", "prime video", "anthropic", "bedrock"],
  ARM: ["arm holdings", "arm architecture", "arm chips", "arm cpu"],
  ASML: ["asml", "euv"],
  AVGO: ["broadcom", "avgo", "vmware", "custom silicon"],
  AZN: ["astrazeneca", "tagrisso", "enhertu", "farxiga", "dato-dxd"],
  "AZN.L": ["astrazeneca", "tagrisso", "enhertu", "farxiga", "dato-dxd"],
  CB: ["chubb", "cb insurance"],
  CRM: ["salesforce", "crm", "agentforce", "data cloud"],
  DIS: ["disney", "espn", "parks", "disney+"],
  GOOG: ["google", "alphabet", "gemini", "deepmind", "waymo", "youtube", "google cloud", "tpu"],
  GOOGL: ["google", "alphabet", "gemini", "deepmind", "waymo", "youtube", "google cloud", "tpu"],
  ISRG: ["intuitive surgical", "da vinci robot", "surgical robot"],
  JNJ: ["johnson & johnson", "jnj", "medtech"],
  LIN: ["linde", "industrial gases"],
  "LSEG.L": ["london stock exchange group", "lseg", "refinitiv"],
  LSEGL: ["london stock exchange group", "lseg", "refinitiv"],
  MA: ["mastercard", "payments network"],
  META: ["meta", "facebook", "instagram", "llama", "reality labs"],
  MRVL: ["marvell", "mrvl", "custom silicon", "optical dsp"],
  MSFT: ["microsoft", "azure", "copilot", "github", "openai"],
  MSTR: ["microstrategy", "bitcoin treasury"],
  NFLX: ["netflix", "streaming", "ads tier"],
  NTRA: ["natera", "signatera", "genetic testing"],
  NVDA: ["nvidia", "cuda", "blackwell", "gb200", "gpu"],
  NOW: ["servicenow", "service now", "workflow automation"],
  ORCL: ["oracle", "oci", "database"],
  PLTR: ["palantir", "aip", "ontology"],
  QCOM: ["qualcomm", "snapdragon"],
  QQQ: ["nasdaq 100", "qqq"],
  SNDK: ["sandisk", "nand flash", "memory"],
  SE: ["sea limited", "shopee", "garena", "seamoney"],
  TEM: ["tempus ai", "tempus"],
  TSLA: ["tesla", "robotaxi", "optimus"],
  TSM: ["tsmc", "taiwan semiconductor"],
  V: ["visa", "payments network"]
};

const COMPANY_SUFFIX_PATTERN = /\b(inc|incorporated|corp|corporation|plc|holdings|holding|class|common|stock|group|technologies|technology|limited|ltd|company|co|sa|nv|adr|shares|cl|a|b|c)\b/gi;
const NOISY_SYMBOLS = new Set([
  "A",
  "AI",
  "APP",
  "ARM",
  "BE",
  "C",
  "CAT",
  "CB",
  "COST",
  "DD",
  "FAST",
  "IT",
  "KEY",
  "MA",
  "NET",
  "NOW",
  "ON",
  "PATH",
  "SE",
  "SHOP",
  "SNOW",
  "T",
  "TEAM",
  "V"
]);

function cliValue(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env[name.toUpperCase().replaceAll("-", "_")] || fallback;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:?!])/g, "$1")
    .trim();
}

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function hashId(parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 20);
}

function companyAliases(row) {
  const ticker = normalizeTicker(row.ticker || row.key);
  const aliases = new Set(MANUAL_ALIASES[ticker] || []);
  const name = cleanText(row.name || row.companyName || "");
  const cleanedName = cleanText(name.replace(COMPANY_SUFFIX_PATTERN, " "));
  if (cleanedName.length >= 5) aliases.add(cleanedName.toLowerCase());
  for (const token of cleanedName.split(/\s+/)) {
    const normalized = token.toLowerCase();
    if (normalized.length >= 5) aliases.add(normalized);
  }
  if (ticker.length >= 3 && !NOISY_SYMBOLS.has(ticker)) aliases.add(ticker.toLowerCase());
  return [...aliases]
    .map((value) => cleanText(value).toLowerCase())
    .filter((value) => value.length >= 2)
    .sort((left, right) => right.length - left.length);
}

function includesAlias(textLower, alias) {
  const pattern = alias.includes(" ")
    ? new RegExp(escapeRegex(alias), "i")
    : new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
  return pattern.test(textLower);
}

function themeFor(textLower) {
  if (/(tpu|gpu|blackwell|gb200|cuda|chip|semiconductor|compute|data center|inference|training|custom silicon|optical)/.test(textLower)) {
    return "AI infrastructure / compute economics";
  }
  if (/(pricing|monetization|ads|subscription|arpu|take rate|revenue recognition)/.test(textLower)) {
    return "Monetization / pricing";
  }
  if (/(agent|copilot|workflow|enterprise|developer|automation|saas)/.test(textLower)) {
    return "Enterprise AI adoption";
  }
  if (/(regulation|antitrust|china|export control|tariff|geopolitical)/.test(textLower)) {
    return "Regulation / geopolitical risk";
  }
  if (/(pipeline|drug|trial|oncology|medtech|biotech|clinical)/.test(textLower)) {
    return "Pipeline / healthcare catalyst";
  }
  if (/(consumer|streaming|gaming|commerce|search|social|payments)/.test(textLower)) {
    return "Consumer demand / platform";
  }
  return "Forward-looking debate";
}

function stanceFor(textLower) {
  const positives = POSITIVE_KEYWORDS.filter((word) => textLower.includes(word)).length;
  const negatives = NEGATIVE_KEYWORDS.filter((word) => textLower.includes(word)).length;
  if (positives > negatives + 1) return "positive";
  if (negatives > positives) return "risk";
  return "mixed";
}

function scoreSegment(textLower, matchedAliases) {
  const forwardHits = FORWARD_KEYWORDS.filter((word) => textLower.includes(word)).length;
  const claimHits = CLAIM_KEYWORDS.filter((word) => textLower.includes(word)).length;
  const aliasBoost = Math.min(0.42, matchedAliases.length * 0.12);
  const forwardBoost = Math.min(0.32, forwardHits * 0.035);
  const claimBoost = Math.min(0.16, claimHits * 0.035);
  return Math.min(0.98, 0.34 + aliasBoost + forwardBoost + claimBoost);
}

function hasForwardSignal(textLower) {
  return FORWARD_KEYWORDS.some((keyword) => textLower.includes(keyword));
}

function buildSummary(ticker, theme, stance, excerpt) {
  return `View on ${ticker}: ${excerpt}`;
}

function buildChineseSummary(ticker, speaker, pointText) {
  const lower = pointText.toLowerCase();
  if (/(amazon|microsoft|google).{0,120}spent decades investing trillions|spent decades investing trillions/.test(lower) && /impossibility/.test(lower)) {
    return "观点：Amazon、Microsoft、Google 这类 hyperscaler 用几十年和万亿级投入建立了云基础设施、VPC/KYC/数据中心能力；新进入者想复制这套基础设施几乎不可能。这是对大型云厂商基础设施护城河的正面判断。";
  }
  if (/microsoft only compute|diversify beyond.*stargate|starved of microsoft/.test(lower)) {
    return "观点：OpenAI 不想只依赖 Microsoft 提供算力，正在寻求更分散的基础设施来源。对 MSFT 来说，这是 Azure/OpenAI 绑定关系和长期议价权需要跟踪的风险点。";
  }
  if (/openai and anthropic exceed.*arr|frontier token pricing|enterprise models/.test(lower)) {
    return "观点：OpenAI/Anthropic 的企业化收入和 token 定价仍可能继续扩张，AI 工作负载会拉动更多算力上线。对云厂商和 AI 基建链条来说，这是需求端的正面读数。";
  }
  if (/compute spend.*billion.*gigawatt|billion.*gigawatt/.test(lower)) {
    return "观点：AI 模型公司的算力开支正在以“每 GW 数十亿美元”的量级扩张，短期需求不是单纯训练模型，而是持续购买电力、数据中心和加速卡容量。对云厂商、GPU、网络和电力链条是正面需求读数。";
  }
  if (/(aws or azure|aws.*azure|azure.*aws).*(not worth|switch|durable)|durable businesses.*aws.*azure/.test(lower)) {
    return "观点：AI/云工作负载即使技术上可以迁移，企业通常也不愿频繁切换 AWS/Azure 这类平台；切换成本和生态差异让云业务更像耐久型基础设施，而不是完全同质化算力。";
  }
  if (/azure revenue/.test(lower)) {
    return "观点：讨论把 Azure 收入作为判断 AI 基建景气度的重要指标。对 MSFT 来说，市场会把 AI 工作负载能否持续转化为 Azure 增量收入作为核心验证点。";
  }
  if (ticker === "MSFT" && /coding agent|cursor|codex/.test(lower) && /(revenue|opportunity|model|agent)/.test(lower)) {
    return "观点：代码 agent 正在从实验工具变成可商业化产品，Cursor/Codex 这类产品说明开发者工作流可能成为 AI 付费的重要入口。需要跟踪 GitHub/Copilot/Codex 对 MSFT 软件 ARPU 的贡献。";
  }
  if (/anthropic could surpass alphabet/.test(lower)) {
    return "观点：外部讨论认为 Anthropic 的收入增长速度可能挑战 Alphabet 现有业务规模，这不是基准情景，但提示 Google 在模型层竞争和 AI 商业化上不能只靠存量搜索优势。";
  }
  if (/orbital compute|data centers in space|power and data centers|powered land/.test(lower)) {
    return "观点：AI 算力瓶颈正在从芯片扩展到电力、土地和数据中心选址；orbital compute 属于远期可选项，但它反映了数据中心供给约束可能继续影响云厂商和 AI 基建公司的估值。";
  }
  if (/internal infrastructure|guaranteed capacity|spike up on research|scheduler/.test(lower) && /google/.test(lower)) {
    return "观点：Google 早期内部基础设施强调基础工作负载的保底容量，以及研究高峰期的弹性调度。这个观点提示 GOOG 的 TPU/调度/集群管理能力是 AI 成本端优化的重要资产。";
  }
  if (/google.*missing gpt|led to google missing gpt/.test(lower)) {
    return "观点：嘉宾认为 Google 的内部组织和资源配置方式曾导致它错失 GPT 式产品窗口。对 GOOG 来说，关键不是有没有技术储备，而是 Gemini/DeepMind 能否更快产品化和商业化。";
  }
  return "";
}

function excerptAroundAlias(contextText, matchedAliases) {
  const normalized = cleanText(contextText);
  const lower = normalized.toLowerCase();
  let index = -1;
  for (const alias of matchedAliases) {
    index = lower.indexOf(alias.toLowerCase());
    if (index >= 0) break;
  }
  if (index < 0) return normalized.slice(0, 1200);
  const start = Math.max(0, index - 360);
  const end = Math.min(normalized.length, index + 840);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < normalized.length ? " ..." : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function videoSpeakerLabel(row) {
  const channel = cleanText(row.channel || "Podcast");
  const title = cleanText(row.title || "");
  const dashGuest = title.match(/[—-]\s*([^|]+)$/);
  if (dashGuest?.[1]) {
    return `${cleanText(dashGuest[1].replace(/\s*\|\s*\d+\s*$/, ""))} (${channel})`;
  }
  const withGuest = title.match(/\bwith\s+([^|,]+(?:,\s*[^|]+)?)/i);
  if (withGuest?.[1]) return `${cleanText(withGuest[1])} (${channel})`;
  if (/all-in/i.test(channel)) return "All-In hosts";
  if (/latent space/i.test(channel)) return "Latent Space hosts/guest";
  if (/no priors/i.test(channel)) return "No Priors hosts/guest";
  if (/invest like the best/i.test(channel)) return "Invest Like The Best guest";
  if (/core memory/i.test(channel)) return "Core Memory hosts";
  return channel;
}

function sentenceUnits(text) {
  const normalized = cleanText(text)
    .replace(/\[music\]/gi, "")
    .replace(/>>\s*/g, "")
    .trim();
  if (!normalized) return [];
  const withSentenceBreaks = normalized
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
    .replace(/\s+(?=(?:So|But|And|Because|If|The|This|That|It|We|I|You|They|Amazon|Microsoft|Google|Nvidia|OpenAI)\b)/g, "\n");
  return withSentenceBreaks
    .split(/\n+/)
    .map(cleanText)
    .filter((unit) => unit.length >= 28);
}

function unitHasAlias(unitLower, aliases) {
  return aliases.some((alias) => includesAlias(unitLower, alias));
}

function unitClaimScore(unit, aliases) {
  const lower = unit.toLowerCase();
  let score = 0;
  if (unitHasAlias(lower, aliases)) score += 5;
  score += FORWARD_KEYWORDS.filter((keyword) => lower.includes(keyword)).length;
  score += BUSINESS_KEYWORDS.filter((keyword) => lower.includes(keyword)).length * 1.2;
  score += CLAIM_KEYWORDS.filter((keyword) => lower.includes(keyword)).length * 1.5;
  if (QUESTION_START_PATTERN.test(lower) || lower.endsWith("?")) score -= 4;
  if (NOISE_PATTERN.test(lower)) score -= 10;
  if (BROKEN_START_PATTERN.test(lower)) score -= 1.5;
  if (unit.length < 55) score -= 1;
  if (unit.length > 420) score -= 1;
  return score;
}

function isUsablePoint(unit, aliases) {
  const lower = unit.toLowerCase();
  if (!unitHasAlias(lower, aliases)) return false;
  if (NOISE_PATTERN.test(lower)) return false;
  if (QUESTION_START_PATTERN.test(lower) || lower.endsWith("?")) return false;
  if (unit.length < 60 || unit.length > 520) return false;
  const hasBusinessMeaning = BUSINESS_KEYWORDS.some((keyword) => lower.includes(keyword));
  const hasClaimMeaning = CLAIM_KEYWORDS.some((keyword) => lower.includes(keyword));
  return hasBusinessMeaning && hasClaimMeaning;
}

function trimPoint(text, maxLength = 420) {
  const normalized = cleanText(text).replace(/^\.\.\.\s*/, "").replace(/\s*\.\.\.$/, "");
  if (normalized.length <= maxLength) return normalized;
  const truncated = normalized.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, Math.max(120, lastSpace)).trim()} ...`;
}

function extractPointText(evidenceExcerpt, matchedAliases) {
  const units = sentenceUnits(evidenceExcerpt);
  if (!units.length) return trimPoint(evidenceExcerpt, 360);
  let best = { text: "", score: -Infinity, index: -1 };
  for (let index = 0; index < units.length; index += 1) {
    const current = units[index];
    const next = units[index + 1] || "";
    const currentLower = current.toLowerCase();
    const nextLower = next.toLowerCase();
    const shouldAddNext =
      unitHasAlias(currentLower, matchedAliases) &&
      /(impossib|therefore|so|means|led to|that's why|this is why|cannot|can't|will|going to)/i.test(nextLower);
    const candidate = shouldAddNext ? `${current} ${next}` : current;
    if (!isUsablePoint(candidate, matchedAliases)) continue;
    let score = unitClaimScore(candidate, matchedAliases);
    if (score > best.score) best = { text: candidate, score, index };
  }
  if (!best.text) return "";
  return trimPoint(best.text);
}

function pointTitleFor(theme) {
  if (theme.includes("AI infrastructure")) return "AI infrastructure conclusion";
  if (theme.includes("Monetization")) return "Monetization conclusion";
  if (theme.includes("Enterprise")) return "Enterprise AI conclusion";
  if (theme.includes("Regulation")) return "Risk conclusion";
  if (theme.includes("Pipeline")) return "Pipeline conclusion";
  if (theme.includes("Consumer")) return "Platform conclusion";
  return "Podcast view";
}

function aliasSignalAllowed(ticker, matchedAliases, textLower) {
  if (ticker === "MSFT") {
    const direct = matchedAliases.some((alias) => /^(microsoft|azure|copilot|github)$/.test(alias));
    if (!direct && matchedAliases.includes("openai")) {
      return /(microsoft|azure|copilot|github|codex|stargate)/i.test(textLower);
    }
  }
  return true;
}

function videoRows(db, channels, sinceDate) {
  const rows = db.prepare(`
    SELECT id, source_id, url, title, channel, upload_date, duration_seconds
    FROM videos
    WHERE source = 'youtube'
      AND upload_date >= ?
    ORDER BY upload_date DESC, id DESC
  `).all(sinceDate);
  const normalizedChannels = channels.map((channel) => channel.toLowerCase());
  return rows.filter((row) => {
    const channel = String(row.channel || "").toLowerCase();
    return normalizedChannels.some((wanted) => channel.includes(wanted));
  });
}

function segmentsForVideo(db, videoId) {
  return db.prepare(`
    SELECT segment_index, start_seconds, text
    FROM transcript_segments
    WHERE video_id = ?
    ORDER BY segment_index ASC
  `).all(videoId);
}

function createInsight(row, segment, contextText, tickerRow, matchedAliases, score) {
  const ticker = normalizeTicker(tickerRow.ticker || tickerRow.key);
  const textLower = contextText.toLowerCase();
  const theme = themeFor(textLower);
  const stance = stanceFor(textLower);
  const evidenceExcerpt = excerptAroundAlias(contextText, matchedAliases);
  const pointText = extractPointText(evidenceExcerpt, matchedAliases);
  if (!pointText) return null;
  const speaker = videoSpeakerLabel(row);
  const summaryZh = buildChineseSummary(ticker, speaker, pointText);
  if (!summaryZh) return null;
  return {
    id: hashId([ticker, row.source_id || row.id, segment.segment_index, pointText]),
    ticker,
    generatedAt: new Date().toISOString(),
    observedAt: row.upload_date || "",
    channel: row.channel || "",
    videoId: row.source_id || "",
    videoTitle: row.title || "",
    videoUrl: row.url || (row.source_id ? `https://www.youtube.com/watch?v=${row.source_id}` : ""),
    speaker,
    theme: pointTitleFor(theme),
    stance,
    horizon: "next 1-4 quarters",
    confidence: Number(score.toFixed(2)),
    relevanceScore: Number((score * 100).toFixed(1)),
    summary: buildSummary(ticker, theme, stance, pointText),
    summaryZh,
    evidenceExcerpt,
    evidenceExcerptZh: "",
    payload: {
      matchedAliases,
      pointText,
      pointTheme: theme,
      speakerLabel: speaker,
      isPolishedTakeaway: true,
      segmentIndex: segment.segment_index,
      startSeconds: segment.start_seconds,
      sourceDatabase: cliValue("youtube-db", DEFAULT_YOUTUBE_DB)
    }
  };
}

function generateInsights() {
  const startedAt = new Date().toISOString();
  const youtubeDbPath = cliValue("youtube-db", DEFAULT_YOUTUBE_DB);
  const maxAgeDays = Number(cliValue("max-age-days", "180")) || 180;
  const sinceDate = cliValue("since", dateDaysAgo(maxAgeDays));
  const channels = cliValue("channels", DEFAULT_CHANNELS.join(","))
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean);

  if (!fs.existsSync(youtubeDbPath)) {
    throw new Error(`YouTube transcript database not found: ${youtubeDbPath}`);
  }

  const snapshot = readValuationSnapshot();
  const tickers = (snapshot?.tickers || [])
    .map((ticker) => ({
      ticker: normalizeTicker(ticker.ticker || ticker.key),
      key: normalizeTicker(ticker.key),
      name: ticker.name || ticker.companyName || "",
      aliases: companyAliases(ticker)
    }))
    .filter((ticker) => ticker.ticker && ticker.aliases.length);

  const youtubeDb = new DatabaseSync(youtubeDbPath, { readOnly: true });
  const bestByTickerVideo = new Map();
  try {
    for (const video of videoRows(youtubeDb, channels, sinceDate)) {
      const segments = segmentsForVideo(youtubeDb, video.id);
      if (!segments.length) continue;
      for (let index = 0; index < segments.length; index += 1) {
        const current = segments[index];
        const contextText = cleanText(
          segments
            .slice(Math.max(0, index - 5), Math.min(segments.length, index + 6))
            .map((part) => part.text)
            .filter(Boolean)
            .join(" ")
        );
        if (!contextText) continue;
        const textLower = contextText.toLowerCase();
        if (!hasForwardSignal(textLower)) continue;
        for (const tickerRow of tickers) {
          const matchedAliases = tickerRow.aliases.filter((alias) => includesAlias(textLower, alias));
          if (!matchedAliases.length) continue;
          if (!aliasSignalAllowed(tickerRow.ticker, matchedAliases, textLower)) continue;
          const centeredTextLower = excerptAroundAlias(contextText, matchedAliases).toLowerCase();
          if (!hasForwardSignal(centeredTextLower)) continue;
          const score = scoreSegment(textLower, matchedAliases);
          if (score < 0.48) continue;
          const key = `${tickerRow.ticker}:${video.source_id || video.id}`;
          const previous = bestByTickerVideo.get(key);
          if (!previous || score > previous.confidence) {
            const insight = createInsight(video, current, contextText, tickerRow, matchedAliases.slice(0, 6), score);
            if (!insight) continue;
            bestByTickerVideo.set(
              key,
              insight
            );
          }
        }
      }
    }
  } finally {
    youtubeDb.close();
  }

  const perTicker = new Map();
  for (const insight of bestByTickerVideo.values()) {
    if (!perTicker.has(insight.ticker)) perTicker.set(insight.ticker, []);
    perTicker.get(insight.ticker).push(insight);
  }

  const insights = [];
  for (const rows of perTicker.values()) {
    rows.sort((left, right) => {
      const dateCompare = String(right.observedAt).localeCompare(String(left.observedAt));
      if (dateCompare !== 0) return dateCompare;
      return Number(right.relevanceScore) - Number(left.relevanceScore);
    });
    const seenSummaries = new Set();
    const uniqueRows = [];
    for (const row of rows) {
      const summaryKey = cleanText(row.summaryZh || row.summary).toLowerCase();
      if (!summaryKey || seenSummaries.has(summaryKey)) continue;
      seenSummaries.add(summaryKey);
      uniqueRows.push(row);
      if (uniqueRows.length >= 12) break;
    }
    insights.push(...uniqueRows);
  }

  const written = replaceValuationPodcastInsights(insights);
  const finishedAt = new Date().toISOString();
  writeBackgroundJobRun(JOB_ID, {
    startedAt,
    finishedAt,
    status: "success",
    payload: {
      youtubeDbPath,
      valuationDbPath: databaseInfo().path,
      channels,
      sinceDate,
      tickerCount: tickers.length,
      insightCount: written
    }
  });

  return { written, channels, sinceDate, tickerCount: tickers.length };
}

try {
  const result = generateInsights();
  console.info(
    `[podcast-insights] wrote ${result.written} insights for ${result.tickerCount} valuation tickers since ${result.sinceDate}`
  );
} catch (error) {
  writeBackgroundJobRun(JOB_ID, {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "error",
    payload: {
      message: error.message,
      stack: error.stack
    }
  });
  console.error(`[podcast-insights] ${error.stack || error.message}`);
  process.exitCode = 1;
}
