const translationCache = new Map();

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cacheKey(targetLanguage, text) {
  return `${targetLanguage}:${text}`;
}

function isMostlyChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function splitForTranslation(value, maxChars = 900) {
  const text = cleanText(value);
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (paragraph.length > maxChars) {
      pushCurrent();
      const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]?/g) || [paragraph];
      for (const sentence of sentences) {
        if ((current + sentence).length > maxChars) pushCurrent();
        current = current ? `${current} ${sentence.trim()}` : sentence.trim();
      }
      continue;
    }
    if ((current + "\n\n" + paragraph).length > maxChars) pushCurrent();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  pushCurrent();
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

async function translateChunkToChinese(chunk) {
  const cleaned = cleanText(chunk);
  if (!cleaned || isMostlyChinese(cleaned)) return cleaned;
  const key = cacheKey("zh-CN", cleaned);
  if (translationCache.has(key)) return translationCache.get(key);

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", cleaned);

  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "user-agent": "guru-analysis-dashboard/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`translation upstream ${response.status}`);
  }
  const payload = await response.json();
  const translated = Array.isArray(payload?.[0])
    ? payload[0].map((part) => part?.[0] || "").join("").trim()
    : "";
  if (!translated) throw new Error("translation upstream returned empty text");
  translationCache.set(key, translated);
  return translated;
}

export async function translateTextToChinese(value) {
  const source = cleanText(value);
  if (!source || isMostlyChinese(source)) return source;
  const key = cacheKey("zh-CN", source);
  if (translationCache.has(key)) return translationCache.get(key);
  const chunks = splitForTranslation(source);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunkToChinese(chunk));
  }
  const translated = translatedChunks.join("\n\n").trim();
  translationCache.set(key, translated);
  return translated;
}

export async function translateTextsToChinese(texts) {
  const normalized = Array.isArray(texts)
    ? texts.map(cleanText).filter(Boolean).slice(0, 24)
    : [];
  const unique = [...new Set(normalized)];
  const translatedBySource = new Map();
  for (const source of unique) {
    translatedBySource.set(source, await translateTextToChinese(source));
  }
  return normalized.map((source) => ({
    source,
    translated: translatedBySource.get(source) || source
  }));
}
