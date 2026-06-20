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
  const aliasBoost = Math.min(0.42, matchedAliases.length * 0.12);
  const forwardBoost = Math.min(0.32, forwardHits * 0.035);
  return Math.min(0.98, 0.36 + aliasBoost + forwardBoost);
}

function hasForwardSignal(textLower) {
  return FORWARD_KEYWORDS.some((keyword) => textLower.includes(keyword));
}

function buildSummary(ticker, theme, stance, excerpt) {
  const lead = stance === "risk"
    ? "The discussion frames a potential risk to watch"
    : stance === "positive"
      ? "The discussion highlights a constructive forward indicator"
      : "The discussion surfaces a mixed forward indicator";
  return `${lead} for ${ticker}: ${theme.toLowerCase()}. Evidence should be tracked against upcoming guidance, margins, and order/customer signals.`;
}

function buildChineseSummary(ticker, theme, stance, excerptLower) {
  if (["GOOG", "GOOGL"].includes(ticker) && /(tpu|gemini|deepmind|google cloud|inference|compute|data center|gigawatt|power)/.test(excerptLower)) {
    return "频道重点讨论了 Google/Alphabet 在 TPU、自研算力、Gemini/DeepMind 与云生态上的端到端优化。研究看点是：如果训练和推理成本继续下降，Google Cloud 毛利率、AI 产品定价能力和搜索/广告侧的 AI 变现可能被市场重新定价。";
  }
  if (["GOOG", "GOOGL"].includes(ticker) && /(alphabet|drug|therapeutic|isomorphic|pipeline)/.test(excerptLower)) {
    return "频道讨论了 Alphabet 在 AI 药物发现、Other Bets 或新业务上的可选价值。研究看点是：这些项目是否仍只是长期期权，还是开始对估值中的 SOTP/长期增长假设产生贡献。";
  }
  if (["GOOG", "GOOGL"].includes(ticker) && /(youtube|search|ads|advertising)/.test(excerptLower)) {
    return "频道讨论了 Google/Alphabet 的 YouTube、搜索和广告分发。研究看点是：AI 搜索形态变化会不会压低广告点击经济性，或反过来通过更强的投放效果提高商业化效率。";
  }
  if (ticker === "NVDA" && /(blackwell|gpu|cuda|inference|data center)/.test(excerptLower)) {
    return "频道把 NVIDIA 的 GPU 需求、Blackwell 供给和推理算力放在一起讨论。研究看点是：数据中心订单、客户资本开支和推理成本曲线是否继续支撑高毛利与高增长。";
  }
  if (ticker === "MSFT" && /(azure|copilot|github|openai|agent)/.test(excerptLower)) {
    return "频道关注 Microsoft 在 Azure、Copilot、GitHub 和 OpenAI 生态中的分发优势。研究看点是：AI 功能能否转化为席位渗透、云消费和更高的软件 ARPU。";
  }
  if (ticker === "AMZN" && /(aws|anthropic|cloud|bedrock|data center)/.test(excerptLower)) {
    return "频道讨论 AWS、Anthropic/Bedrock 和云端 AI 工作负载。研究看点是：AWS 能否用模型选择、芯片和基础设施效率把 AI 需求转化为收入增速和利润率改善。";
  }
  if (ticker === "META" && /(llama|instagram|facebook|ads|reality labs)/.test(excerptLower)) {
    return "频道讨论 Meta 的开源模型、广告系统和消费端分发。研究看点是：Llama/AI 推荐能否继续提升广告 ROI，同时 Reality Labs 投入是否拖累自由现金流。";
  }
  if (ticker === "CRM" && /(salesforce|agentforce|data cloud|enterprise)/.test(excerptLower)) {
    return "频道讨论 Salesforce 的企业 AI agent、Data Cloud 和应用层落地。研究看点是：Agentforce 能否带来新增模块收入，而不是只变成销售话术。";
  }
  if (ticker === "NFLX" && /(netflix|streaming|ads|content)/.test(excerptLower)) {
    return "频道讨论 Netflix 的广告层、内容效率和流媒体竞争。研究看点是：广告库存、会员套餐组合和内容投入回报是否继续推高经营杠杆。";
  }
  if (ticker === "ARM" && /(arm|cpu|architecture|chip)/.test(excerptLower)) {
    return "频道讨论 Arm 架构在 AI 终端、服务器和定制芯片中的位置。研究看点是：授权费率、版税结构和新市场渗透是否能支撑高估值。";
  }
  if (theme.includes("Pipeline")) {
    return `${ticker} 的 podcast 看点集中在医疗/产品管线和临床催化剂。需要跟踪下一次财报中管理层对上市节奏、适应症扩展和利润率的指引变化。`;
  }
  if (theme.includes("Regulation")) {
    return `${ticker} 的外部讨论包含监管、地缘或政策变量。这个信号不直接进入估值，但应该作为下个季度风险折现和情景分析的观察项。`;
  }
  if (stance === "risk") {
    return `${ticker} 的 podcast 信号偏风险：讨论集中在${theme}。需要验证这些担忧是否会反映到收入增速、毛利率、资本开支或订单节奏。`;
  }
  if (stance === "positive") {
    return `${ticker} 的 podcast 信号偏正面：讨论集中在${theme}。关键是看这些定性观点能否在下一季财务数据、指引或管理层表述里得到确认。`;
  }
  return `${ticker} 的 podcast 信号偏混合：讨论集中在${theme}。它适合作为财报前的前瞻观察项，后续要和实际收入、利润率、订单和指引交叉验证。`;
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
  const evidenceLower = evidenceExcerpt.toLowerCase();
  return {
    id: hashId([ticker, row.source_id || row.id, segment.segment_index, theme]),
    ticker,
    generatedAt: new Date().toISOString(),
    observedAt: row.upload_date || "",
    channel: row.channel || "",
    videoId: row.source_id || "",
    videoTitle: row.title || "",
    videoUrl: row.url || (row.source_id ? `https://www.youtube.com/watch?v=${row.source_id}` : ""),
    speaker: "",
    theme,
    stance,
    horizon: "next 1-4 quarters",
    confidence: Number(score.toFixed(2)),
    relevanceScore: Number((score * 100).toFixed(1)),
    summary: buildSummary(ticker, theme, stance, evidenceExcerpt),
    summaryZh: buildChineseSummary(ticker, theme, stance, evidenceLower),
    evidenceExcerpt,
    evidenceExcerptZh: "",
    payload: {
      matchedAliases,
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
        const contextText = cleanText([
          segments[index - 1]?.text,
          current.text,
          segments[index + 1]?.text
        ].filter(Boolean).join(" "));
        if (!contextText) continue;
        const textLower = contextText.toLowerCase();
        if (!hasForwardSignal(textLower)) continue;
        for (const tickerRow of tickers) {
          const matchedAliases = tickerRow.aliases.filter((alias) => includesAlias(textLower, alias));
          if (!matchedAliases.length) continue;
          const centeredTextLower = excerptAroundAlias(contextText, matchedAliases).toLowerCase();
          if (!hasForwardSignal(centeredTextLower)) continue;
          const score = scoreSegment(textLower, matchedAliases);
          if (score < 0.48) continue;
          const key = `${tickerRow.ticker}:${video.source_id || video.id}`;
          const previous = bestByTickerVideo.get(key);
          if (!previous || score > previous.confidence) {
            bestByTickerVideo.set(
              key,
              createInsight(video, current, contextText, tickerRow, matchedAliases.slice(0, 6), score)
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
    insights.push(...rows.slice(0, 12));
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
