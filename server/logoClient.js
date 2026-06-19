import { normalizeTicker, portfolioDisplayTicker } from "./tickerAliases.js";

export { normalizeTicker };

const logoDomains = new Map(
  [
    ["AAPL", "apple.com"],
    ["AAOI", "ao-inc.com"],
    ["AB", "alliancebernstein.com"],
    ["ABNB", "airbnb.com"],
    ["ADBE", "adobe.com"],
    ["ADI", "analog.com"],
    ["ADP", "adp.com"],
    ["ADSK", "autodesk.com"],
    ["AEP", "aep.com"],
    ["AKAM", "akamai.com"],
    ["ALNY", "alnylam.com"],
    ["AMAT", "appliedmaterials.com"],
    ["AMD", "amd.com"],
    ["AMGN", "amgen.com"],
    ["AMZN", "amazon.com"],
    ["ANET", "arista.com"],
    ["APP", "applovin.com"],
    ["ARM", "arm.com"],
    ["ASML", "asml.com"],
    ["AVGO", "broadcom.com"],
    ["AXON", "axon.com"],
    ["AXP", "americanexpress.com"],
    ["AZN", "astrazeneca.com"],
    ["AZNL", "astrazeneca.com"],
    ["AZN.L", "astrazeneca.com"],
    ["BAC", "bankofamerica.com"],
    ["BKNG", "bookingholdings.com"],
    ["BKR", "bakerhughes.com"],
    ["BRK.B", "berkshirehathaway.com"],
    ["CCEP", "ccep.com"],
    ["CDNS", "cadence.com"],
    ["CEG", "constellationenergy.com"],
    ["CHTR", "charter.com"],
    ["CMCSA", "comcast.com"],
    ["COST", "costco.com"],
    ["CPRT", "copart.com"],
    ["CRDO", "credosemi.com"],
    ["CRM", "salesforce.com"],
    ["CRWD", "crowdstrike.com"],
    ["CSCO", "cisco.com"],
    ["CSX", "csx.com"],
    ["CTAS", "cintas.com"],
    ["CTSH", "cognizant.com"],
    ["CVX", "chevron.com"],
    ["DAL", "delta.com"],
    ["DASH", "doordash.com"],
    ["DBMF", "imgpfunds.com"],
    ["DDOG", "datadoghq.com"],
    ["DXCM", "dexcom.com"],
    ["EA", "ea.com"],
    ["EXC", "exeloncorp.com"],
    ["FANG", "diamondbackenergy.com"],
    ["FAST", "fastenal.com"],
    ["FER", "ferrovial.com"],
    ["FTNT", "fortinet.com"],
    ["GEHC", "gehealthcare.com"],
    ["GILD", "gilead.com"],
    ["GOOG", "google.com"],
    ["GOOGL", "google.com"],
    ["HON", "honeywell.com"],
    ["HUBS", "hubspot.com"],
    ["IDXX", "idexx.com"],
    ["INSM", "insmed.com"],
    ["INTC", "intel.com"],
    ["INTU", "intuit.com"],
    ["ISRG", "intuitive.com"],
    ["KDP", "keurigdrpepper.com"],
    ["KHC", "kraftheinzcompany.com"],
    ["KLAC", "kla.com"],
    ["KO", "coca-colacompany.com"],
    ["LITE", "lumentum.com"],
    ["LIN", "linde.com"],
    ["LRCX", "lamresearch.com"],
    ["LSEGL", "lseg.com"],
    ["LSEG", "lseg.com"],
    ["LSEG.L", "lseg.com"],
    ["MAR", "marriott.com"],
    ["MCHP", "microchip.com"],
    ["MDLZ", "mondelezinternational.com"],
    ["MELI", "mercadolibre.com"],
    ["META", "meta.com"],
    ["MNST", "monsterbevcorp.com"],
    ["MPWR", "monolithicpower.com"],
    ["MSFT", "microsoft.com"],
    ["MRVL", "marvell.com"],
    ["MU", "micron.com"],
    ["NFLX", "netflix.com"],
    ["NXPI", "nxp.com"],
    ["NVDA", "nvidia.com"],
    ["ODFL", "odfl.com"],
    ["ORLY", "oreillyauto.com"],
    ["OXY", "oxy.com"],
    ["PANW", "paloaltonetworks.com"],
    ["PAYX", "paychex.com"],
    ["PCAR", "paccar.com"],
    ["PEP", "pepsico.com"],
    ["PDD", "pinduoduo.com"],
    ["PLTR", "palantir.com"],
    ["PYPL", "paypal.com"],
    ["QCOM", "qualcomm.com"],
    ["QSR", "rbi.com"],
    ["RBLX", "roblox.com"],
    ["REGN", "regeneron.com"],
    ["ROP", "ropertech.com"],
    ["ROST", "rossstores.com"],
    ["SBUX", "starbucks.com"],
    ["SE", "sea.com"],
    ["SHOP", "shopify.com"],
    ["SNDK", "sandisk.com"],
    ["SNPS", "synopsys.com"],
    ["SPCX", "spacex.com"],
    ["STX", "seagate.com"],
    ["TEM", "tempus.com"],
    ["TMUS", "t-mobile.com"],
    ["TTWO", "take2games.com"],
    ["TXN", "ti.com"],
    ["TSM", "tsmc.com"],
    ["VRSK", "verisk.com"],
    ["VRTX", "vrtx.com"],
    ["V", "visa.com"],
    ["VST", "vistracorp.com"],
    ["WBD", "wbd.com"],
    ["WDAY", "workday.com"],
    ["WDC", "westerndigital.com"],
    ["WMT", "walmart.com"],
    ["XEL", "xcelenergy.com"],
    ["ZS", "zscaler.com"],
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
