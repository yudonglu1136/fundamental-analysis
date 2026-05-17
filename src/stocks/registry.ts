import { mckModule } from "./mck/config";
import { baModule } from "./ba/config";
import { lsegModule } from "./lseg/config";
import { aznModule } from "./azn/config";
import { amznModule } from "./amzn/config";
import { nvdaModule } from "./nvda/config";
import { asmlModule } from "./asml/config";
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

export const stockRegistry = {
  "BA.L": baModule,
  MCK: mckModule,
  LSEG: lsegModule,
  AZN: aznModule,
  AMZN: amznModule,
  NVDA: nvdaModule,
  ASML: asmlModule,
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
  "DGE.L": dgeModule,
  TRI: triModule,
};

export const stockList = Object.values(stockRegistry);
