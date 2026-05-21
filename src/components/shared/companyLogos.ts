export type CompanyLogoTheme = {
  color: string;
  logoBackground: string;
  logoTile: string;
  logoText: string;
};

export const cashTheme: CompanyLogoTheme = {
  color: "#8fa3b8",
  logoBackground: "linear-gradient(135deg, #1f2937 0%, #64748b 100%)",
  logoTile: "rgba(255, 255, 255, 0.94)",
  logoText: "#334155",
};

const logoSymbolAliases: Record<string, string> = {
  "DGE.L": "DEO",
  GOOGL: "GOOG",
  LSEG: "LSEG.L",
};

const companyLogoUrls: Record<string, string> = {
  AAPL: "https://companiesmarketcap.com/img/company-logos/64/AAPL.png",
  AMZN: "https://companiesmarketcap.com/img/company-logos/64/AMZN.png",
  ANET: "https://companiesmarketcap.com/img/company-logos/64/ANET.png",
  ASML: "https://companiesmarketcap.com/img/company-logos/64/ASML.png",
  AUTL: "https://companiesmarketcap.com/img/company-logos/64/AUTL.png",
  AVAV: "https://companiesmarketcap.com/img/company-logos/64/AVAV.png",
  AZN: "https://companiesmarketcap.com/img/company-logos/64/AZN.png",
  BAC: "https://companiesmarketcap.com/img/company-logos/64/BAC.png",
  "BA.L": "https://companiesmarketcap.com/img/company-logos/64/BA.L.png",
  BE: "https://companiesmarketcap.com/img/company-logos/64/BE.png",
  BMY: "https://companiesmarketcap.com/img/company-logos/64/BMY.png",
  CB: "https://companiesmarketcap.com/img/company-logos/64/CB.png",
  CEG: "https://companiesmarketcap.com/img/company-logos/64/CEG.png",
  COST: "https://companiesmarketcap.com/img/company-logos/64/COST.png",
  DDOG: "https://companiesmarketcap.com/img/company-logos/64/DDOG.png",
  DBMF: "https://companiesmarketcap.com/img/company-logos/64/DBMF.png",
  "DGE.L": "https://companiesmarketcap.com/img/company-logos/64/DEO.png",
  EQT: "https://companiesmarketcap.com/img/company-logos/64/EQT.png",
  GILD: "https://companiesmarketcap.com/img/company-logos/64/GILD.png",
  GOOG: "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
  GOOGL: "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
  IBKR: "https://companiesmarketcap.com/img/company-logos/64/IBKR.png",
  ISRG: "https://companiesmarketcap.com/img/company-logos/64/ISRG.png",
  JPM: "https://companiesmarketcap.com/img/company-logos/64/JPM.png",
  KTOS: "https://companiesmarketcap.com/img/company-logos/64/KTOS.png",
  LEGN: "https://companiesmarketcap.com/img/company-logos/64/LEGN.png",
  LLY: "https://companiesmarketcap.com/img/company-logos/64/LLY.png",
  LMT: "https://companiesmarketcap.com/img/company-logos/64/LMT.png",
  LSEG: "https://companiesmarketcap.com/img/company-logos/64/LSEG.L.png",
  "LSEG.L": "https://companiesmarketcap.com/img/company-logos/64/LSEG.L.png",
  MA: "https://companiesmarketcap.com/img/company-logos/64/MA.png",
  MCK: "https://companiesmarketcap.com/img/company-logos/64/MCK.png",
  META: "https://companiesmarketcap.com/img/company-logos/64/META.png",
  MRVL: "https://companiesmarketcap.com/img/company-logos/64/MRVL.png",
  MSFT: "https://companiesmarketcap.com/img/company-logos/64/MSFT.png",
  MU: "https://companiesmarketcap.com/img/company-logos/64/MU.png",
  NOC: "https://companiesmarketcap.com/img/company-logos/64/NOC.png",
  NOW: "https://companiesmarketcap.com/img/company-logos/64/NOW.png",
  NVDA: "https://companiesmarketcap.com/img/company-logos/64/NVDA.png",
  PLTR: "https://companiesmarketcap.com/img/company-logos/64/PLTR.png",
  QCOM: "https://companiesmarketcap.com/img/company-logos/64/QCOM.png",
  QQQ: "https://companiesmarketcap.com/img/company-logos/64/QQQ.png",
  RTX: "https://companiesmarketcap.com/img/company-logos/64/RTX.png",
  TEM: "https://companiesmarketcap.com/img/company-logos/64/TEM.png",
  TRI: "https://companiesmarketcap.com/img/company-logos/64/TRI.png",
  TRV: "https://companiesmarketcap.com/img/company-logos/64/TRV.png",
  TSM: "https://companiesmarketcap.com/img/company-logos/64/TSM.png",
  TSLA: "https://companiesmarketcap.com/img/company-logos/64/TSLA.png",
  UNH: "https://companiesmarketcap.com/img/company-logos/64/UNH.png",
  V: "https://companiesmarketcap.com/img/company-logos/64/V.png",
};

const companyLogoThemes: Record<string, CompanyLogoTheme> = {
  AAPL: {
    color: "#a1a1aa",
    logoBackground: "linear-gradient(135deg, #111827 0%, #a1a1aa 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#27272a",
  },
  AMZN: {
    color: "#ff9900",
    logoBackground: "linear-gradient(135deg, #111827 0%, #ff9900 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#111827",
  },
  ANET: {
    color: "#0ea5e9",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #0ea5e9 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0369a1",
  },
  ASML: {
    color: "#0f6fff",
    logoBackground: "linear-gradient(135deg, #071a40 0%, #0f6fff 66%, #f97316 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0f4fc4",
  },
  AUTL: {
    color: "#38bdf8",
    logoBackground: "linear-gradient(135deg, #172554 0%, #38bdf8 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#075985",
  },
  AVAV: {
    color: "#22d3ee",
    logoBackground: "linear-gradient(135deg, #0b1324 0%, #1d4ed8 54%, #22d3ee 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  AZN: {
    color: "#7dd3fc",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #2563eb 48%, #facc15 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  BAC: {
    color: "#dc2626",
    logoBackground: "linear-gradient(135deg, #1e3a8a 0%, #dc2626 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1e3a8a",
  },
  "BA.L": {
    color: "#00a6d6",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #00a6d6 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0369a1",
  },
  BE: {
    color: "#14b8a6",
    logoBackground: "linear-gradient(135deg, #064e3b 0%, #14b8a6 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0f766e",
  },
  BMY: {
    color: "#f97316",
    logoBackground: "linear-gradient(135deg, #451a03 0%, #f97316 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#c2410c",
  },
  CB: {
    color: "#22c55e",
    logoBackground: "linear-gradient(135deg, #052e16 0%, #22c55e 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#15803d",
  },
  CEG: {
    color: "#60a5fa",
    logoBackground: "linear-gradient(135deg, #1e3a8a 0%, #60a5fa 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#2563eb",
  },
  COST: {
    color: "#2563eb",
    logoBackground: "linear-gradient(135deg, #2563eb 0%, #dc2626 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  DDOG: {
    color: "#7c3aed",
    logoBackground: "linear-gradient(135deg, #2e1065 0%, #7c3aed 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#6d28d9",
  },
  DBMF: {
    color: "#94a3b8",
    logoBackground: "linear-gradient(135deg, #e5edf7 0%, #ffffff 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#64748b",
  },
  "DGE.L": {
    color: "#c4a15a",
    logoBackground: "linear-gradient(135deg, #111827 0%, #c4a15a 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#92400e",
  },
  EQT: {
    color: "#84cc16",
    logoBackground: "linear-gradient(135deg, #1a2e05 0%, #84cc16 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#4d7c0f",
  },
  GILD: {
    color: "#ef4444",
    logoBackground: "linear-gradient(135deg, #450a0a 0%, #ef4444 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#b91c1c",
  },
  GOOG: {
    color: "#4285f4",
    logoBackground: "linear-gradient(135deg, #4285f4 0%, #34a853 52%, #fbbc05 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#174ea6",
  },
  GOOGL: {
    color: "#4285f4",
    logoBackground: "linear-gradient(135deg, #4285f4 0%, #34a853 52%, #fbbc05 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#174ea6",
  },
  IBKR: {
    color: "#d71920",
    logoBackground: "linear-gradient(135deg, #111827 0%, #d71920 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#d71920",
  },
  ISRG: {
    color: "#d1d5db",
    logoBackground: "linear-gradient(135deg, #111827 0%, #9ca3af 100%)",
    logoTile: "rgba(255, 255, 255, 0.98)",
    logoText: "#374151",
  },
  JPM: {
    color: "#60a5fa",
    logoBackground: "linear-gradient(135deg, #1e3a8a 0%, #60a5fa 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1e40af",
  },
  KTOS: {
    color: "#f97316",
    logoBackground: "linear-gradient(135deg, #111827 0%, #f97316 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#c2410c",
  },
  LEGN: {
    color: "#c084fc",
    logoBackground: "linear-gradient(135deg, #f5f3ff 0%, #c084fc 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#7e22ce",
  },
  LLY: {
    color: "#ef4444",
    logoBackground: "linear-gradient(135deg, #7f1d1d 0%, #ef4444 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#b91c1c",
  },
  LMT: {
    color: "#38bdf8",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0369a1",
  },
  LSEG: {
    color: "#00a3e0",
    logoBackground: "linear-gradient(135deg, #001f4f 0%, #00a3e0 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#005eb8",
  },
  MA: {
    color: "#ff5f00",
    logoBackground: "linear-gradient(135deg, #eb001b 0%, #ff5f00 50%, #f79e1b 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#c2410c",
  },
  MCK: {
    color: "#0072ce",
    logoBackground: "linear-gradient(135deg, #0072ce 0%, #f58220 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#0072ce",
  },
  META: {
    color: "#0866ff",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #0866ff 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  MRVL: {
    color: "#38bdf8",
    logoBackground: "linear-gradient(135deg, #111827 0%, #38bdf8 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0369a1",
  },
  MSFT: {
    color: "#7fba00",
    logoBackground: "linear-gradient(135deg, #f25022 0%, #7fba00 38%, #00a4ef 70%, #ffb900 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#2563eb",
  },
  MU: {
    color: "#22d3ee",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #22d3ee 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#0891b2",
  },
  NOC: {
    color: "#2563eb",
    logoBackground: "linear-gradient(135deg, #111827 0%, #2563eb 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  NOW: {
    color: "#00a862",
    logoBackground: "linear-gradient(135deg, #032d42 0%, #00a862 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#047857",
  },
  NVDA: {
    color: "#76b900",
    logoBackground: "linear-gradient(135deg, #111827 0%, #76b900 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#4d7c0f",
  },
  PLTR: {
    color: "#111827",
    logoBackground: "linear-gradient(135deg, #050505 0%, #4b5563 100%)",
    logoTile: "rgba(255, 255, 255, 0.94)",
    logoText: "#111827",
  },
  QCOM: {
    color: "#3253dc",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #3253dc 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  QQQ: {
    color: "#1d4ed8",
    logoBackground: "linear-gradient(135deg, #0b1f52 0%, #1d4ed8 100%)",
    logoTile: "rgba(255, 255, 255, 0.94)",
    logoText: "#1d4ed8",
  },
  RTX: {
    color: "#dc2626",
    logoBackground: "linear-gradient(135deg, #111827 0%, #dc2626 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#b91c1c",
  },
  TEM: {
    color: "#a78bfa",
    logoBackground: "linear-gradient(135deg, #2e1065 0%, #a78bfa 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#7c3aed",
  },
  TRI: {
    color: "#ff6a00",
    logoBackground: "linear-gradient(135deg, #111827 0%, #ff6a00 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#c2410c",
  },
  TRV: {
    color: "#dc2626",
    logoBackground: "linear-gradient(135deg, #991b1b 0%, #dc2626 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#b91c1c",
  },
  TSM: {
    color: "#ef4444",
    logoBackground: "linear-gradient(135deg, #111827 0%, #ef4444 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#b91c1c",
  },
  TSLA: {
    color: "#e82127",
    logoBackground: "linear-gradient(135deg, #111827 0%, #e82127 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#b91c1c",
  },
  UNH: {
    color: "#2563eb",
    logoBackground: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
  V: {
    color: "#1434cb",
    logoBackground: "linear-gradient(135deg, #1434cb 0%, #f7b600 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#1d4ed8",
  },
};

function normalizeSymbol(symbol: string | null | undefined) {
  return String(symbol ?? "").trim().toUpperCase();
}

export function getCompanyLogoUrl(symbol: string | null | undefined) {
  const key = normalizeSymbol(symbol);
  if (!key || key === "CASH") return null;
  const logoSymbol = logoSymbolAliases[key] ?? key;
  return companyLogoUrls[key] ?? `https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(logoSymbol)}.png`;
}

export function themeForSymbol(symbol: string | null | undefined): CompanyLogoTheme {
  const key = normalizeSymbol(symbol);
  const alias = logoSymbolAliases[key];
  return companyLogoThemes[key] ?? (alias ? companyLogoThemes[alias] : undefined) ?? {
    color: "#38bdf8",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#0369a1",
  };
}

export function logoFallbackText(symbol: string | null | undefined) {
  return normalizeSymbol(symbol).replace(/[^A-Z0-9]/g, "").slice(0, 4) || "?";
}
