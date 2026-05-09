import { mckModule } from "./mck/config";
import { lsegModule } from "./lseg/config";
import { msftModule } from "./msft/config";
import { googlModule } from "./googl/config";
import { metaModule } from "./meta/config";

export const stockRegistry = {
  MCK: mckModule,
  LSEG: lsegModule,
  MSFT: msftModule,
  GOOGL: googlModule,
  META: metaModule,
};

export const stockList = Object.values(stockRegistry);
