import type { StockModule } from "./types";

export type StockModuleLoader = () => Promise<StockModule>;

export const stockModuleLoaders: Record<string, StockModuleLoader> = {
  "BA.L": () => import("./ba/config").then((module) => module.baModule),
  MCK: () => import("./mck/config").then((module) => module.mckModule),
  LSEG: () => import("./lseg/config").then((module) => module.lsegModule),
  AZN: () => import("./azn/config").then((module) => module.aznModule),
  AMZN: () => import("./amzn/config").then((module) => module.amznModule),
  NVDA: () => import("./nvda/config").then((module) => module.nvdaModule),
  ASML: () => import("./asml/config").then((module) => module.asmlModule),
  MU: () => import("./mu/config").then((module) => module.muModule),
  AAPL: () => import("./aapl/config").then((module) => module.aaplModule),
  MA: () => import("./ma/config").then((module) => module.maModule),
  V: () => import("./v/config").then((module) => module.vModule),
  NOW: () => import("./now/config").then((module) => module.nowModule),
  ANET: () => import("./anet/config").then((module) => module.anetModule),
  MSFT: () => import("./msft/config").then((module) => module.msftModule),
  GOOGL: () => import("./googl/config").then((module) => module.googlModule),
  META: () => import("./meta/config").then((module) => module.metaModule),
  PLTR: () => import("./pltr/config").then((module) => module.pltrModule),
  ISRG: () => import("./isrg/config").then((module) => module.isrgModule),
  NOC: () => import("./noc/config").then((module) => module.nocModule),
  RTX: () => import("./rtx/config").then((module) => module.rtxModule),
  LMT: () => import("./lmt/config").then((module) => module.lmtModule),
  LEGN: () => import("./legn/config").then((module) => module.legnModule),
  BMY: () => import("./bmy/config").then((module) => module.bmyModule),
  GILD: () => import("./gild/config").then((module) => module.gildModule),
  AUTL: () => import("./autl/config").then((module) => module.autlModule),
  TSM: () => import("./tsm/config").then((module) => module.tsmModule),
  CEG: () => import("./ceg/config").then((module) => module.cegModule),
  TSLA: () => import("./tsla/config").then((module) => module.tslaModule),
  COST: () => import("./cost/config").then((module) => module.costModule),
  MRVL: () => import("./mrvl/config").then((module) => module.mrvlModule),
  TEM: () => import("./tem/config").then((module) => module.temModule),
  DDOG: () => import("./ddog/config").then((module) => module.ddogModule),
  LLY: () => import("./lly/config").then((module) => module.llyModule),
  AVAV: () => import("./avav/config").then((module) => module.avavModule),
  KTOS: () => import("./ktos/config").then((module) => module.ktosModule),
  JPM: () => import("./jpm/config").then((module) => module.jpmModule),
  CB: () => import("./cb/config").then((module) => module.cbModule),
  TRV: () => import("./trv/config").then((module) => module.trvModule),
  EQT: () => import("./eqt/config").then((module) => module.eqtModule),
  QCOM: () => import("./qcom/config").then((module) => module.qcomModule),
  BAC: () => import("./bac/config").then((module) => module.bacModule),
  UNH: () => import("./unh/config").then((module) => module.unhModule),
  BE: () => import("./be/config").then((module) => module.beModule),
  "DGE.L": () => import("./dge/config").then((module) => module.dgeModule),
  TRI: () => import("./tri/config").then((module) => module.triModule),
};

export function normalizeStockTicker(ticker: string | undefined) {
  return ticker?.toUpperCase();
}

export function getStockModuleLoader(ticker: string | undefined) {
  const normalized = normalizeStockTicker(ticker);
  return normalized ? stockModuleLoaders[normalized] : undefined;
}
