import { normalizeTicker, portfolioDisplayTicker } from "./tickerAliases.js";
import { createStockLogoLoader, stockLogoVersion } from "./stockLogoAssets.js";

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

const loadAsset = createStockLogoLoader();

export function canonicalTicker(value) {
  const ticker = portfolioDisplayTicker(value) || normalizeTicker(value);
  if (!ticker) return "";
  if (/^[A-Z]{1,5}\d{6}[CP]\d+/.test(ticker)) return ticker.slice(0, ticker.search(/\d/));
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker) ? ticker : "";
}

export function logoDomainForTicker(ticker) {
  const normalized = normalizeTicker(ticker);
  const canonical = canonicalTicker(normalized);
  return (
    logoDomains.get(normalized) ||
    logoDomains.get(canonical) ||
    ""
  );
}

export function logoUrlForTicker(ticker) {
  const normalized = canonicalTicker(ticker) || normalizeTicker(ticker);
  return normalized ? `/api/logo/${encodeURIComponent(normalized)}?v=${stockLogoVersion}` : "";
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

export async function loadTickerLogo(ticker) {
  const normalized = canonicalTicker(ticker);
  const asset = await loadAsset(normalized);
  if (!asset) throw new Error("logo_not_found");
  return asset;
}
