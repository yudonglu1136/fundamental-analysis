import { normalizeTicker, portfolioDisplayTicker } from "./tickerAliases.js";

export { normalizeTicker };

const logoDomains = new Map(
  [
    ["AAPL", "apple.com"],
    ["AAOI", "ao-inc.com"],
    ["AB", "alliancebernstein.com"],
    ["AKAM", "akamai.com"],
    ["AMZN", "amazon.com"],
    ["APP", "applovin.com"],
    ["AVGO", "broadcom.com"],
    ["AXP", "americanexpress.com"],
    ["AZN", "astrazeneca.com"],
    ["AZNL", "astrazeneca.com"],
    ["AZN.L", "astrazeneca.com"],
    ["BAC", "bankofamerica.com"],
    ["BRK.B", "berkshirehathaway.com"],
    ["CRDO", "credosemi.com"],
    ["CVX", "chevron.com"],
    ["DAL", "delta.com"],
    ["DBMF", "imgpfunds.com"],
    ["GOOG", "google.com"],
    ["GOOGL", "google.com"],
    ["HUBS", "hubspot.com"],
    ["ISRG", "intuitive.com"],
    ["KO", "coca-colacompany.com"],
    ["LIN", "linde.com"],
    ["LSEGL", "lseg.com"],
    ["LSEG", "lseg.com"],
    ["LSEG.L", "lseg.com"],
    ["META", "meta.com"],
    ["MSFT", "microsoft.com"],
    ["MRVL", "marvell.com"],
    ["NVDA", "nvidia.com"],
    ["OXY", "oxy.com"],
    ["PANW", "paloaltonetworks.com"],
    ["PLTR", "palantir.com"],
    ["QSR", "rbi.com"],
    ["RBLX", "roblox.com"],
    ["SE", "sea.com"],
    ["SNDK", "sandisk.com"],
    ["SPCX", "spacex.com"],
    ["TEM", "tempus.com"],
    ["TSM", "tsmc.com"],
    ["V", "visa.com"],
    ["VST", "vistracorp.com"],
    ["ZM", "zoom.com"]
  ].map(([ticker, domain]) => [normalizeTicker(ticker), domain])
);

const logoCache = new Map();
const logoCacheTtlMs = 7 * 24 * 60 * 60 * 1000;

export function canonicalTicker(value) {
  const ticker = portfolioDisplayTicker(value) || normalizeTicker(value);
  if (!ticker) return "";
  if (/^[A-Z]{1,5}\d{6}[CP]\d+/.test(ticker)) return ticker.slice(0, ticker.search(/\d/));
  return ticker.replace(/\.(L|LN|US|N|O|A)$/i, "");
}

export function logoDomainForTicker(ticker) {
  const normalized = normalizeTicker(ticker);
  const canonical = canonicalTicker(normalized);
  return (
    logoDomains.get(normalized) ||
    logoDomains.get(canonical) ||
    logoDomains.get(canonical.replace(/[.-].*$/, "")) ||
    ""
  );
}

export function logoUrlForTicker(ticker) {
  const normalized = canonicalTicker(ticker) || normalizeTicker(ticker);
  return normalized ? `/api/logo/${encodeURIComponent(normalized)}` : "";
}

export function logoMetadataForTicker(ticker, companyName = "") {
  const normalized = canonicalTicker(ticker) || normalizeTicker(ticker);
  return {
    ticker: normalized,
    companyName: companyName || normalized,
    logoUrl: logoUrlForTicker(normalized),
    logoDomain: logoDomainForTicker(normalized),
    logoSource: "thesisforge_logo_proxy"
  };
}

function fallbackLogoSvg(ticker) {
  const normalized = normalizeTicker(ticker) || "?";
  const label = normalized.slice(0, 4);
  const colorSeed = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = 150 + (colorSeed % 90);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="hsl(${hue}, 42%, 22%)"/>
      <circle cx="64" cy="64" r="61" fill="none" stroke="hsl(${hue}, 52%, 54%)" stroke-width="4"/>
      <text x="64" y="73" text-anchor="middle" font-family="Arial, sans-serif" font-size="${label.length > 2 ? 34 : 44}" font-weight="800" fill="hsl(${hue}, 78%, 68%)">${label}</text>
    </svg>
  `.trim();
  return {
    body: Buffer.from(svg),
    contentType: "image/svg+xml; charset=utf-8",
    source: "fallback"
  };
}

async function fetchLogoUrl(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "ThesisForge-LogoProxy/1.0"
    },
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "image/png";
  if (!/^image\//i.test(contentType)) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100) return null;
  return { body: buffer, contentType, source: url };
}

export async function loadTickerLogo(ticker) {
  const normalized = canonicalTicker(ticker) || normalizeTicker(ticker);
  if (!normalized) return fallbackLogoSvg(ticker);

  const cached = logoCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.asset;

  const domain = logoDomainForTicker(normalized);
  const genericTicker = normalized.replace(".", "-");
  const candidates = domain
    ? [
        `https://logo.clearbit.com/${domain}`,
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
        `https://financialmodelingprep.com/image-stock/${encodeURIComponent(genericTicker)}.png`
      ]
    : [`https://financialmodelingprep.com/image-stock/${encodeURIComponent(genericTicker)}.png`];

  for (const url of candidates) {
    try {
      const asset = await fetchLogoUrl(url);
      if (asset) {
        logoCache.set(normalized, { expiresAt: Date.now() + logoCacheTtlMs, asset });
        return asset;
      }
    } catch {
      // Try the next provider; fall back to generated SVG below.
    }
  }

  const fallback = fallbackLogoSvg(normalized);
  logoCache.set(normalized, { expiresAt: Date.now() + logoCacheTtlMs, asset: fallback });
  return fallback;
}
