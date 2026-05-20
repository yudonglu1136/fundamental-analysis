import { mckModule } from "./mck/config";
import { baModule } from "./ba/config";
import { lsegModule } from "./lseg/config";
import { aznModule } from "./azn/config";
import { amznModule } from "./amzn/config";
import { nvdaModule } from "./nvda/config";
import { asmlModule } from "./asml/config";
import { muModule } from "./mu/config";
import { aaplModule } from "./aapl/config";
import { maModule } from "./ma/config";
import { vModule } from "./v/config";
import { nowModule } from "./now/config";
import { anetModule } from "./anet/config";
import { msftModule } from "./msft/config";
import { googlModule } from "./googl/config";
import { metaModule } from "./meta/config";
import { pltrModule } from "./pltr/config";
import { isrgModule } from "./isrg/config";
import { nocModule } from "./noc/config";
import { rtxModule } from "./rtx/config";
import { lmtModule } from "./lmt/config";
import { legnModule } from "./legn/config";
import { dgeModule } from "./dge/config";
import { triModule } from "./tri/config";
import { bmyModule } from "./bmy/config";
import { gildModule } from "./gild/config";
import { autlModule } from "./autl/config";
import { tsmModule } from "./tsm/config";
import { cegModule } from "./ceg/config";
import { tslaModule } from "./tsla/config";
import { costModule } from "./cost/config";
import { mrvlModule } from "./mrvl/config";
import { temModule } from "./tem/config";
import { ddogModule } from "./ddog/config";
import { llyModule } from "./lly/config";

export const stockRegistry = {
  "BA.L": baModule,
  MCK: mckModule,
  LSEG: lsegModule,
  AZN: aznModule,
  AMZN: amznModule,
  NVDA: nvdaModule,
  ASML: asmlModule,
  MU: muModule,
  AAPL: aaplModule,
  MA: maModule,
  V: vModule,
  NOW: nowModule,
  ANET: anetModule,
  MSFT: msftModule,
  GOOGL: googlModule,
  META: metaModule,
  PLTR: pltrModule,
  ISRG: isrgModule,
  NOC: nocModule,
  RTX: rtxModule,
  LMT: lmtModule,
  LEGN: legnModule,
  BMY: bmyModule,
  GILD: gildModule,
  AUTL: autlModule,
  TSM: tsmModule,
  CEG: cegModule,
  TSLA: tslaModule,
  COST: costModule,
  MRVL: mrvlModule,
  TEM: temModule,
  DDOG: ddogModule,
  LLY: llyModule,
  "DGE.L": dgeModule,
  TRI: triModule,
};

export const stockList = Object.values(stockRegistry);
