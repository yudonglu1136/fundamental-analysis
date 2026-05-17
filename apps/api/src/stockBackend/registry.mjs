import {
  getLsegCapitalReturnHistory,
  getLsegReportingEvents,
  getLsegSnapshot,
} from "../services/lsegSnapshotService.mjs";
import {
  backfillLsegValuationRuns,
  createLsegValuationRun,
  getLsegHistoricalValuations,
  getLsegValuationRuns,
} from "../services/lsegValuationService.mjs";
import { getLsegBacktests, runLsegBacktest } from "../services/lsegBacktestService.mjs";
import { createLsegUpdateJob, getLsegUpdateJob } from "../services/lsegUpdateJobService.mjs";

import {
  getMsftCapitalReturnHistory,
  getMsftReportingEvents,
  getMsftSnapshot,
} from "../services/msftSnapshotService.mjs";
import {
  backfillMsftValuationRuns,
  createMsftValuationRun,
  getMsftHistoricalValuations,
  getMsftValuationRuns,
} from "../services/msftValuationService.mjs";
import { getMsftBacktests, runMsftBacktest } from "../services/msftBacktestService.mjs";
import { createMsftUpdateJob, getMsftUpdateJob } from "../services/msftUpdateJobService.mjs";

import {
  getAmznReportingEvents,
  getAmznSnapshot,
} from "../services/amznSnapshotService.mjs";
import {
  backfillAmznValuationRuns,
  createAmznValuationRun,
  getAmznHistoricalValuations,
  getAmznValuationRuns,
} from "../services/amznValuationService.mjs";
import { getAmznBacktests, runAmznBacktest } from "../services/amznBacktestService.mjs";
import { createAmznUpdateJob, getAmznUpdateJob } from "../services/amznUpdateJobService.mjs";

import {
  getAaplCapitalReturnHistory,
  getAaplReportingEvents,
  getAaplSnapshot,
} from "../services/aaplSnapshotService.mjs";
import {
  backfillAaplValuationRuns,
  createAaplValuationRun,
  getAaplHistoricalValuations,
  getAaplValuationRuns,
} from "../services/aaplValuationService.mjs";
import { getAaplBacktests, runAaplBacktest } from "../services/aaplBacktestService.mjs";
import { createAaplUpdateJob, getAaplUpdateJob } from "../services/aaplUpdateJobService.mjs";

import {
  getMaCapitalReturnHistory,
  getMaIncentivesVsNetRevenueHistory,
  getMaReportingEvents,
  getMaSnapshot,
} from "../services/maSnapshotService.mjs";
import {
  backfillMaValuationRuns,
  createMaValuationRun,
  getMaHistoricalValuations,
  getMaValuationRuns,
} from "../services/maValuationService.mjs";
import { getMaBacktests, runMaBacktest } from "../services/maBacktestService.mjs";
import { createMaUpdateJob, getMaUpdateJob } from "../services/maUpdateJobService.mjs";

import {
  getVCapitalReturnHistory,
  getVIncentivesVsNetRevenueHistory,
  getVReportingEvents,
  getVSnapshot,
} from "../services/vSnapshotService.mjs";
import {
  backfillVValuationRuns,
  createVValuationRun,
  getVHistoricalValuations,
  getVValuationRuns,
} from "../services/vValuationService.mjs";
import { getVBacktests, runVBacktest } from "../services/vBacktestService.mjs";
import { createVUpdateJob, getVUpdateJob } from "../services/vUpdateJobService.mjs";

import {
  getNowCapitalReturnHistory,
  getNowReportingEvents,
  getNowSnapshot,
  getNowSubscriptionAgentHistory,
} from "../services/nowSnapshotService.mjs";
import {
  backfillNowValuationRuns,
  createNowValuationRun,
  getNowHistoricalValuations,
  getNowValuationRuns,
} from "../services/nowValuationService.mjs";
import { getNowBacktests, runNowBacktest } from "../services/nowBacktestService.mjs";
import { createNowUpdateJob, getNowUpdateJob } from "../services/nowUpdateJobService.mjs";

import {
  getAnetCapitalReturnHistory,
  getAnetCloudAiHistory,
  getAnetReportingEvents,
  getAnetSnapshot,
} from "../services/anetSnapshotService.mjs";
import {
  backfillAnetValuationRuns,
  createAnetValuationRun,
  getAnetHistoricalValuations,
  getAnetValuationRuns,
} from "../services/anetValuationService.mjs";
import { getAnetBacktests, runAnetBacktest } from "../services/anetBacktestService.mjs";
import { createAnetUpdateJob, getAnetUpdateJob } from "../services/anetUpdateJobService.mjs";

import {
  getMetaReportingEvents,
  getMetaSnapshot,
} from "../services/metaSnapshotService.mjs";
import {
  backfillMetaValuationRuns,
  createMetaValuationRun,
  getMetaHistoricalValuations,
  getMetaValuationRuns,
} from "../services/metaValuationService.mjs";
import { getMetaBacktests, runMetaBacktest } from "../services/metaBacktestService.mjs";
import { createMetaUpdateJob, getMetaUpdateJob } from "../services/metaUpdateJobService.mjs";

import {
  getTriCapitalReturnHistory,
  getTriReportingEvents,
  getTriSnapshot,
} from "../services/triSnapshotService.mjs";
import {
  backfillTriValuationRuns,
  createTriValuationRun,
  getTriHistoricalValuations,
  getTriValuationRuns,
} from "../services/triValuationService.mjs";
import { getTriBacktests, runTriBacktest } from "../services/triBacktestService.mjs";
import { createTriUpdateJob, getTriUpdateJob } from "../services/triUpdateJobService.mjs";

import {
  getPltrReportingEvents,
  getPltrSnapshot,
} from "../services/pltrSnapshotService.mjs";
import {
  backfillPltrValuationRuns,
  createPltrValuationRun,
  getPltrHistoricalValuations,
  getPltrValuationRuns,
} from "../services/pltrValuationService.mjs";
import { createPltrUpdateJob, getPltrUpdateJob } from "../services/pltrUpdateJobService.mjs";

import {
  getTsmReportingEvents,
  getTsmSnapshot,
} from "../services/tsmSnapshotService.mjs";
import {
  backfillTsmValuationRuns,
  createTsmValuationRun,
  getTsmHistoricalValuations,
  getTsmValuationRuns,
} from "../services/tsmValuationService.mjs";
import { createTsmUpdateJob, getTsmUpdateJob } from "../services/tsmUpdateJobService.mjs";

import {
  getNocReportingEvents,
  getNocSnapshot,
} from "../services/nocSnapshotService.mjs";
import {
  backfillNocValuationRuns,
  createNocValuationRun,
  getNocHistoricalValuations,
  getNocValuationRuns,
} from "../services/nocValuationService.mjs";
import { getNocBacktests, runNocBacktest } from "../services/nocBacktestService.mjs";
import { createNocUpdateJob, getNocUpdateJob } from "../services/nocUpdateJobService.mjs";

import {
  getGooglReportingEvents,
  getGooglSnapshot,
} from "../services/googlSnapshotService.mjs";
import {
  backfillGooglValuationRuns,
  createGooglValuationRun,
  getGooglHistoricalValuations,
  getGooglValuationRuns,
} from "../services/googlValuationService.mjs";
import { getGooglBacktests, runGooglBacktest } from "../services/googlBacktestService.mjs";
import { createGooglUpdateJob, getGooglUpdateJob } from "../services/googlUpdateJobService.mjs";

import {
  getMckCapitalReturnHistory,
  getMckReportingEvents,
  getMckSnapshot,
} from "../services/mckSnapshotService.mjs";
import {
  backfillMckValuationRuns,
  createMckValuationRun,
  getMckHistoricalValuations,
  getMckValuationRuns,
} from "../services/mckValuationService.mjs";
import { getMckBacktests, runMckBacktest } from "../services/mckBacktestService.mjs";
import { createMckUpdateJob, getMckUpdateJob } from "../services/mckUpdateJobService.mjs";

import {
  getIsrgReportingEvents,
  getIsrgSnapshot,
} from "../services/isrgSnapshotService.mjs";
import {
  backfillIsrgValuationRuns,
  createIsrgValuationRun,
  getIsrgHistoricalValuations,
  getIsrgValuationRuns,
} from "../services/isrgValuationService.mjs";
import { getIsrgBacktests, runIsrgBacktest } from "../services/isrgBacktestService.mjs";
import { createIsrgUpdateJob, getIsrgUpdateJob } from "../services/isrgUpdateJobService.mjs";

import {
  getAznReportingEvents,
  getAznSnapshot,
} from "../services/aznSnapshotService.mjs";
import {
  backfillAznValuationRuns,
  createAznValuationRun,
  getAznHistoricalValuations,
  getAznValuationRuns,
} from "../services/aznValuationService.mjs";
import { getAznBacktests, runAznBacktest } from "../services/aznBacktestService.mjs";
import { createAznUpdateJob, getAznUpdateJob } from "../services/aznUpdateJobService.mjs";

import {
  getGildReportingEvents,
  getGildSnapshot,
} from "../services/gildSnapshotService.mjs";
import {
  backfillGildValuationRuns,
  createGildValuationRun,
  getGildHistoricalValuations,
  getGildValuationRuns,
} from "../services/gildValuationService.mjs";
import { getGildBacktests, runGildBacktest } from "../services/gildBacktestService.mjs";
import { createGildUpdateJob, getGildUpdateJob } from "../services/gildUpdateJobService.mjs";

import {
  getBmyReportingEvents,
  getBmySnapshot,
} from "../services/bmySnapshotService.mjs";
import {
  backfillBmyValuationRuns,
  createBmyValuationRun,
  getBmyHistoricalValuations,
  getBmyValuationRuns,
} from "../services/bmyValuationService.mjs";
import { getBmyBacktests, runBmyBacktest } from "../services/bmyBacktestService.mjs";
import { createBmyUpdateJob, getBmyUpdateJob } from "../services/bmyUpdateJobService.mjs";

import {
  getLegnReportingEvents,
  getLegnSnapshot,
} from "../services/legnSnapshotService.mjs";
import {
  backfillLegnValuationRuns,
  createLegnValuationRun,
  getLegnHistoricalValuations,
  getLegnValuationRuns,
} from "../services/legnValuationService.mjs";
import { getLegnBacktests, runLegnBacktest } from "../services/legnBacktestService.mjs";
import { createLegnUpdateJob, getLegnUpdateJob } from "../services/legnUpdateJobService.mjs";

import {
  getRtxReportingEvents,
  getRtxSnapshot,
} from "../services/rtxSnapshotService.mjs";
import {
  backfillRtxValuationRuns,
  createRtxValuationRun,
  getRtxHistoricalValuations,
  getRtxValuationRuns,
} from "../services/rtxValuationService.mjs";
import { getRtxBacktests, runRtxBacktest } from "../services/rtxBacktestService.mjs";
import { createRtxUpdateJob, getRtxUpdateJob } from "../services/rtxUpdateJobService.mjs";

import {
  getNvdaReportingEvents,
  getNvdaSnapshot,
} from "../services/nvdaSnapshotService.mjs";
import {
  backfillNvdaValuationRuns,
  createNvdaValuationRun,
  getNvdaHistoricalValuations,
  getNvdaValuationRuns,
} from "../services/nvdaValuationService.mjs";
import { getNvdaBacktests, runNvdaBacktest } from "../services/nvdaBacktestService.mjs";
import { createNvdaUpdateJob, getNvdaUpdateJob } from "../services/nvdaUpdateJobService.mjs";

import { LSEG_BACKEND_MODEL_VERSION } from "../../../../modules/lseg/valuation/modelVersion.mjs";
import { MSFT_BACKEND_MODEL_VERSION } from "../../../../modules/msft/valuation/modelVersion.mjs";
import { AMZN_BACKEND_MODEL_VERSION } from "../../../../modules/amzn/valuation/modelVersion.mjs";
import { AAPL_BACKEND_MODEL_VERSION } from "../../../../modules/aapl/valuation/modelVersion.mjs";
import { MA_BACKEND_MODEL_VERSION } from "../../../../modules/ma/valuation/modelVersion.mjs";
import { V_BACKEND_MODEL_VERSION } from "../../../../modules/v/valuation/modelVersion.mjs";
import { NOW_BACKEND_MODEL_VERSION } from "../../../../modules/now/valuation/modelVersion.mjs";
import { ANET_BACKEND_MODEL_VERSION } from "../../../../modules/anet/valuation/modelVersion.mjs";
import { META_BACKEND_MODEL_VERSION } from "../../../../modules/meta/valuation/modelVersion.mjs";
import { TRI_BACKEND_MODEL_VERSION } from "../../../../modules/tri/valuation/modelVersion.mjs";
import { PLTR_BACKEND_MODEL_VERSION } from "../../../../modules/pltr/valuation/modelVersion.mjs";
import { TSM_BACKEND_MODEL_VERSION } from "../../../../modules/tsm/valuation/modelVersion.mjs";
import { NOC_BACKEND_MODEL_VERSION } from "../../../../modules/noc/valuation/modelVersion.mjs";
import { GOOGL_BACKEND_MODEL_VERSION } from "../../../../modules/googl/valuation/modelVersion.mjs";
import { MCK_BACKEND_MODEL_VERSION } from "../../../../modules/mck/valuation/modelVersion.mjs";
import { ISRG_BACKEND_MODEL_VERSION } from "../../../../modules/isrg/valuation/modelVersion.mjs";
import { AZN_BACKEND_MODEL_VERSION } from "../../../../modules/azn/valuation/modelVersion.mjs";
import { GILD_BACKEND_MODEL_VERSION } from "../../../../modules/gild/valuation/modelVersion.mjs";
import { BMY_BACKEND_MODEL_VERSION } from "../../../../modules/bmy/valuation/modelVersion.mjs";
import { LEGN_BACKEND_MODEL_VERSION } from "../../../../modules/legn/valuation/modelVersion.mjs";
import { RTX_BACKEND_MODEL_VERSION } from "../../../../modules/rtx/valuation/modelVersion.mjs";
import { NVDA_BACKEND_MODEL_VERSION } from "../../../../modules/nvda/valuation/modelVersion.mjs";
import {
  getBaCapitalReturnHistory,
  getBaReportingEvents,
  getBaSnapshot,
} from "../services/baSnapshotService.mjs";
import {
  backfillBaValuationRuns,
  createBaValuationRun,
  getBaHistoricalValuations,
  getBaValuationRuns,
} from "../services/baValuationService.mjs";
import { getBaBacktests, runBaBacktest } from "../services/baBacktestService.mjs";
import { createBaUpdateJob, getBaUpdateJob } from "../services/baUpdateJobService.mjs";
import { BA_BACKEND_MODEL_VERSION } from "../../../../modules/ba/valuation/modelVersion.mjs";

import {
  getDgeReportingEvents,
  getDgeSnapshot,
} from "../services/dgeSnapshotService.mjs";
import {
  backfillDgeValuationRuns,
  createDgeValuationRun,
  getDgeHistoricalValuations,
  getDgeValuationRuns,
} from "../services/dgeValuationService.mjs";
import { getDgeBacktests, runDgeBacktest } from "../services/dgeBacktestService.mjs";
import { createDgeUpdateJob, getDgeUpdateJob } from "../services/dgeUpdateJobService.mjs";
import { DGE_BACKEND_MODEL_VERSION } from "../../../../modules/dge/valuation/modelVersion.mjs";

export const stockBackendRegistry = {
  nvda: {
    slug: "nvda",
    ticker: "NVDA",
    displayName: "NVIDIA",
    modelVersion: NVDA_BACKEND_MODEL_VERSION.version,
    backtestMessage: "NVDA stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getNvdaReportingEvents,
    getSnapshot: getNvdaSnapshot,
    getValuationRuns: getNvdaValuationRuns,
    getHistoricalValuations: getNvdaHistoricalValuations,
    createValuationRun: createNvdaValuationRun,
    backfillValuationRuns: backfillNvdaValuationRuns,
    createUpdateJob: createNvdaUpdateJob,
    getUpdateJob: getNvdaUpdateJob,
    getBacktests: getNvdaBacktests,
    runBacktest: runNvdaBacktest,
  },
  amzn: {
    slug: "amzn",
    ticker: "AMZN",
    displayName: "Amazon.com",
    modelVersion: AMZN_BACKEND_MODEL_VERSION.version,
    backtestMessage: "AMZN stock-vs-SPY backtest is backed by daily price bars in the unified stock backend.",
    getEvents: getAmznReportingEvents,
    getSnapshot: getAmznSnapshot,
    getValuationRuns: getAmznValuationRuns,
    getHistoricalValuations: getAmznHistoricalValuations,
    createValuationRun: createAmznValuationRun,
    backfillValuationRuns: backfillAmznValuationRuns,
    createUpdateJob: createAmznUpdateJob,
    getUpdateJob: getAmznUpdateJob,
    getBacktests: getAmznBacktests,
    runBacktest: runAmznBacktest,
  },
  aapl: {
    slug: "aapl",
    ticker: "AAPL",
    displayName: "Apple",
    modelVersion: AAPL_BACKEND_MODEL_VERSION.version,
    backtestMessage: "AAPL stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getAaplReportingEvents,
    getSnapshot: getAaplSnapshot,
    getCapitalReturns: getAaplCapitalReturnHistory,
    getValuationRuns: getAaplValuationRuns,
    getHistoricalValuations: getAaplHistoricalValuations,
    createValuationRun: createAaplValuationRun,
    backfillValuationRuns: backfillAaplValuationRuns,
    createUpdateJob: createAaplUpdateJob,
    getUpdateJob: getAaplUpdateJob,
    getBacktests: getAaplBacktests,
    runBacktest: runAaplBacktest,
  },
  ma: {
    slug: "ma",
    ticker: "MA",
    displayName: "Mastercard",
    modelVersion: MA_BACKEND_MODEL_VERSION.version,
    backtestMessage: "MA stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getMaReportingEvents,
    getSnapshot: getMaSnapshot,
    getCapitalReturns: getMaCapitalReturnHistory,
    getIncentivesVsNetRevenue: getMaIncentivesVsNetRevenueHistory,
    getValuationRuns: getMaValuationRuns,
    getHistoricalValuations: getMaHistoricalValuations,
    createValuationRun: createMaValuationRun,
    backfillValuationRuns: backfillMaValuationRuns,
    createUpdateJob: createMaUpdateJob,
    getUpdateJob: getMaUpdateJob,
    getBacktests: getMaBacktests,
    runBacktest: runMaBacktest,
  },
  v: {
    slug: "v",
    ticker: "V",
    displayName: "Visa",
    modelVersion: V_BACKEND_MODEL_VERSION.version,
    backtestMessage: "V stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getVReportingEvents,
    getSnapshot: getVSnapshot,
    getCapitalReturns: getVCapitalReturnHistory,
    getIncentivesVsNetRevenue: getVIncentivesVsNetRevenueHistory,
    getValuationRuns: getVValuationRuns,
    getHistoricalValuations: getVHistoricalValuations,
    createValuationRun: createVValuationRun,
    backfillValuationRuns: backfillVValuationRuns,
    createUpdateJob: createVUpdateJob,
    getUpdateJob: getVUpdateJob,
    getBacktests: getVBacktests,
    runBacktest: runVBacktest,
  },
  now: {
    slug: "now",
    ticker: "NOW",
    displayName: "ServiceNow",
    modelVersion: NOW_BACKEND_MODEL_VERSION.version,
    backtestMessage: "NOW stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getNowReportingEvents,
    getSnapshot: getNowSnapshot,
    getCapitalReturns: getNowCapitalReturnHistory,
    getSubscriptionAgentHistory: getNowSubscriptionAgentHistory,
    getValuationRuns: getNowValuationRuns,
    getHistoricalValuations: getNowHistoricalValuations,
    createValuationRun: createNowValuationRun,
    backfillValuationRuns: backfillNowValuationRuns,
    createUpdateJob: createNowUpdateJob,
    getUpdateJob: getNowUpdateJob,
    getBacktests: getNowBacktests,
    runBacktest: runNowBacktest,
  },
  anet: {
    slug: "anet",
    ticker: "ANET",
    displayName: "Arista Networks",
    modelVersion: ANET_BACKEND_MODEL_VERSION.version,
    backtestMessage: "ANET stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getAnetReportingEvents,
    getSnapshot: getAnetSnapshot,
    getCapitalReturns: getAnetCapitalReturnHistory,
    getCloudAiHistory: getAnetCloudAiHistory,
    getValuationRuns: getAnetValuationRuns,
    getHistoricalValuations: getAnetHistoricalValuations,
    createValuationRun: createAnetValuationRun,
    backfillValuationRuns: backfillAnetValuationRuns,
    createUpdateJob: createAnetUpdateJob,
    getUpdateJob: getAnetUpdateJob,
    getBacktests: getAnetBacktests,
    runBacktest: runAnetBacktest,
  },
  dge: {
    slug: "dge",
    ticker: "DGE.L",
    displayName: "Diageo",
    modelVersion: DGE_BACKEND_MODEL_VERSION.version,
    backtestMessage: "DGE.L stock-vs-SPY backtest is backed by daily local-price bars with explicit GBp/USD currency warnings.",
    getEvents: getDgeReportingEvents,
    getSnapshot: getDgeSnapshot,
    getValuationRuns: getDgeValuationRuns,
    getHistoricalValuations: getDgeHistoricalValuations,
    createValuationRun: createDgeValuationRun,
    backfillValuationRuns: backfillDgeValuationRuns,
    createUpdateJob: createDgeUpdateJob,
    getUpdateJob: getDgeUpdateJob,
    getBacktests: getDgeBacktests,
    runBacktest: runDgeBacktest,
  },
  gild: {
    slug: "gild",
    ticker: "GILD",
    displayName: "Gilead Sciences",
    modelVersion: GILD_BACKEND_MODEL_VERSION.version,
    backtestMessage: "GILD backtest table is present; event-visible mature-biopharma valuation persistence is implemented first.",
    getEvents: getGildReportingEvents,
    getSnapshot: getGildSnapshot,
    getValuationRuns: getGildValuationRuns,
    getHistoricalValuations: getGildHistoricalValuations,
    createValuationRun: createGildValuationRun,
    backfillValuationRuns: backfillGildValuationRuns,
    createUpdateJob: createGildUpdateJob,
    getUpdateJob: getGildUpdateJob,
    getBacktests: getGildBacktests,
    runBacktest: runGildBacktest,
  },
  bmy: {
    slug: "bmy",
    ticker: "BMY",
    displayName: "Bristol Myers Squibb",
    modelVersion: BMY_BACKEND_MODEL_VERSION.version,
    backtestMessage: "BMY stock-vs-SPY backtest is backed by Yahoo adjusted daily price bars in the unified stock backend.",
    getEvents: getBmyReportingEvents,
    getSnapshot: getBmySnapshot,
    getValuationRuns: getBmyValuationRuns,
    getHistoricalValuations: getBmyHistoricalValuations,
    createValuationRun: createBmyValuationRun,
    backfillValuationRuns: backfillBmyValuationRuns,
    createUpdateJob: createBmyUpdateJob,
    getUpdateJob: getBmyUpdateJob,
    getBacktests: getBmyBacktests,
    runBacktest: runBmyBacktest,
  },
  legn: {
    slug: "legn",
    ticker: "LEGN",
    displayName: "Legend Biotech",
    modelVersion: LEGN_BACKEND_MODEL_VERSION.version,
    backtestMessage: "LEGN backtest table is present; event-visible cell-therapy NAV persistence is implemented first.",
    getEvents: getLegnReportingEvents,
    getSnapshot: getLegnSnapshot,
    getValuationRuns: getLegnValuationRuns,
    getHistoricalValuations: getLegnHistoricalValuations,
    createValuationRun: createLegnValuationRun,
    backfillValuationRuns: backfillLegnValuationRuns,
    createUpdateJob: createLegnUpdateJob,
    getUpdateJob: getLegnUpdateJob,
    getBacktests: getLegnBacktests,
    runBacktest: runLegnBacktest,
  },
  rtx: {
    slug: "rtx",
    ticker: "RTX",
    displayName: "RTX Corporation",
    modelVersion: RTX_BACKEND_MODEL_VERSION.version,
    backtestMessage: "RTX stock-vs-SPY backtest is backed by daily adjusted price bars in the unified stock backend.",
    getEvents: getRtxReportingEvents,
    getSnapshot: getRtxSnapshot,
    getValuationRuns: getRtxValuationRuns,
    getHistoricalValuations: getRtxHistoricalValuations,
    createValuationRun: createRtxValuationRun,
    backfillValuationRuns: backfillRtxValuationRuns,
    createUpdateJob: createRtxUpdateJob,
    getUpdateJob: getRtxUpdateJob,
    getBacktests: getRtxBacktests,
    runBacktest: runRtxBacktest,
  },
  ba: {
    slug: "ba",
    ticker: "BA.L",
    displayName: "BAE Systems",
    modelVersion: BA_BACKEND_MODEL_VERSION.version,
    backtestMessage: "BA.L backtest table is present; valuation-event persistence and backtest stubs route through the unified stock backend.",
    getEvents: getBaReportingEvents,
    getSnapshot: getBaSnapshot,
    getCapitalReturns: getBaCapitalReturnHistory,
    getValuationRuns: getBaValuationRuns,
    getHistoricalValuations: getBaHistoricalValuations,
    createValuationRun: createBaValuationRun,
    backfillValuationRuns: backfillBaValuationRuns,
    createUpdateJob: createBaUpdateJob,
    getUpdateJob: getBaUpdateJob,
    getBacktests: getBaBacktests,
    runBacktest: runBaBacktest,
  },
  azn: {
    slug: "azn",
    ticker: "AZN.L",
    displayName: "AstraZeneca",
    modelVersion: AZN_BACKEND_MODEL_VERSION.version,
    backtestMessage: "AZN backtest table is present; event-by-event biopharma valuation persistence is implemented first.",
    getEvents: getAznReportingEvents,
    getSnapshot: getAznSnapshot,
    getValuationRuns: getAznValuationRuns,
    getHistoricalValuations: getAznHistoricalValuations,
    createValuationRun: createAznValuationRun,
    backfillValuationRuns: backfillAznValuationRuns,
    createUpdateJob: createAznUpdateJob,
    getUpdateJob: getAznUpdateJob,
    getBacktests: getAznBacktests,
    runBacktest: runAznBacktest,
  },
  lseg: {
    slug: "lseg",
    ticker: "LSEG.L",
    displayName: "LSEG",
    modelVersion: LSEG_BACKEND_MODEL_VERSION.version,
    backtestMessage: "Backtest persistence table is present; execution is deferred to a later phase.",
    getEvents: getLsegReportingEvents,
    getSnapshot: getLsegSnapshot,
    getValuationRuns: getLsegValuationRuns,
    getHistoricalValuations: getLsegHistoricalValuations,
    getCapitalReturns: getLsegCapitalReturnHistory,
    createValuationRun: createLsegValuationRun,
    backfillValuationRuns: backfillLsegValuationRuns,
    createUpdateJob: createLsegUpdateJob,
    getUpdateJob: getLsegUpdateJob,
    getBacktests: getLsegBacktests,
    runBacktest: runLsegBacktest,
  },
  msft: {
    slug: "msft",
    ticker: "MSFT",
    displayName: "Microsoft",
    modelVersion: MSFT_BACKEND_MODEL_VERSION.version,
    backtestMessage: "MSFT backtest table is present; execution is deferred to a later phase.",
    getEvents: getMsftReportingEvents,
    getSnapshot: getMsftSnapshot,
    getCapitalReturns: getMsftCapitalReturnHistory,
    getValuationRuns: getMsftValuationRuns,
    getHistoricalValuations: getMsftHistoricalValuations,
    createValuationRun: createMsftValuationRun,
    backfillValuationRuns: backfillMsftValuationRuns,
    createUpdateJob: createMsftUpdateJob,
    getUpdateJob: getMsftUpdateJob,
    getBacktests: getMsftBacktests,
    runBacktest: runMsftBacktest,
  },
  meta: {
    slug: "meta",
    ticker: "META",
    displayName: "Meta Platforms",
    modelVersion: META_BACKEND_MODEL_VERSION.version,
    backtestMessage: "META stock-vs-SPY backtest is backed by daily price bars when available and explicit proxy warnings when not.",
    getEvents: getMetaReportingEvents,
    getSnapshot: getMetaSnapshot,
    getValuationRuns: getMetaValuationRuns,
    getHistoricalValuations: getMetaHistoricalValuations,
    createValuationRun: createMetaValuationRun,
    backfillValuationRuns: backfillMetaValuationRuns,
    createUpdateJob: createMetaUpdateJob,
    getUpdateJob: getMetaUpdateJob,
    getBacktests: getMetaBacktests,
    runBacktest: runMetaBacktest,
  },
  tri: {
    slug: "tri",
    ticker: "TRI",
    displayName: "Thomson Reuters",
    modelVersion: TRI_BACKEND_MODEL_VERSION.version,
    backtestMessage: "TRI simple buy-and-hold backtest routes through the unified stock backend.",
    getEvents: getTriReportingEvents,
    getSnapshot: getTriSnapshot,
    getCapitalReturns: getTriCapitalReturnHistory,
    getValuationRuns: getTriValuationRuns,
    getHistoricalValuations: getTriHistoricalValuations,
    createValuationRun: createTriValuationRun,
    backfillValuationRuns: backfillTriValuationRuns,
    createUpdateJob: createTriUpdateJob,
    getUpdateJob: getTriUpdateJob,
    getBacktests: getTriBacktests,
    runBacktest: runTriBacktest,
  },
  pltr: {
    slug: "pltr",
    ticker: "PLTR",
    displayName: "Palantir Technologies",
    modelVersion: PLTR_BACKEND_MODEL_VERSION.version,
    backtestMessage: "PLTR backend currently provides reporting-event as-of price anchors from SQLite daily price bars.",
    getEvents: getPltrReportingEvents,
    getSnapshot: getPltrSnapshot,
    getValuationRuns: getPltrValuationRuns,
    getHistoricalValuations: getPltrHistoricalValuations,
    createValuationRun: createPltrValuationRun,
    backfillValuationRuns: backfillPltrValuationRuns,
    createUpdateJob: createPltrUpdateJob,
    getUpdateJob: getPltrUpdateJob,
  },
  tsm: {
    slug: "tsm",
    ticker: "TSM",
    displayName: "Taiwan Semiconductor Manufacturing",
    modelVersion: TSM_BACKEND_MODEL_VERSION.version,
    backtestMessage: "TSM backend currently provides reporting-event valuation snapshots and ADR as-of price anchors from SQLite daily price bars.",
    getEvents: getTsmReportingEvents,
    getSnapshot: getTsmSnapshot,
    getValuationRuns: getTsmValuationRuns,
    getHistoricalValuations: getTsmHistoricalValuations,
    createValuationRun: createTsmValuationRun,
    backfillValuationRuns: backfillTsmValuationRuns,
    createUpdateJob: createTsmUpdateJob,
    getUpdateJob: getTsmUpdateJob,
  },
  noc: {
    slug: "noc",
    ticker: "NOC",
    displayName: "Northrop Grumman",
    modelVersion: NOC_BACKEND_MODEL_VERSION.version,
    backtestMessage: "NOC stock-vs-SPY backtest is backed by daily adjusted price bars.",
    getEvents: getNocReportingEvents,
    getSnapshot: getNocSnapshot,
    getValuationRuns: getNocValuationRuns,
    getHistoricalValuations: getNocHistoricalValuations,
    createValuationRun: createNocValuationRun,
    backfillValuationRuns: backfillNocValuationRuns,
    createUpdateJob: createNocUpdateJob,
    getUpdateJob: getNocUpdateJob,
    getBacktests: getNocBacktests,
    runBacktest: runNocBacktest,
  },
  googl: {
    slug: "googl",
    ticker: "GOOGL",
    displayName: "Alphabet",
    modelVersion: GOOGL_BACKEND_MODEL_VERSION.version,
    backtestMessage: "GOOGL stock-vs-SPY backtest is backed by daily price bars.",
    getEvents: getGooglReportingEvents,
    getSnapshot: getGooglSnapshot,
    getValuationRuns: getGooglValuationRuns,
    getHistoricalValuations: getGooglHistoricalValuations,
    createValuationRun: createGooglValuationRun,
    backfillValuationRuns: backfillGooglValuationRuns,
    createUpdateJob: createGooglUpdateJob,
    getUpdateJob: getGooglUpdateJob,
    getBacktests: getGooglBacktests,
    runBacktest: runGooglBacktest,
  },
  mck: {
    slug: "mck",
    ticker: "MCK",
    displayName: "McKesson",
    modelVersion: MCK_BACKEND_MODEL_VERSION.version,
    backtestMessage: "MCK simple buy-and-hold backtest routes through the unified stock backend.",
    getEvents: getMckReportingEvents,
    getSnapshot: getMckSnapshot,
    getCapitalReturns: getMckCapitalReturnHistory,
    getValuationRuns: getMckValuationRuns,
    getHistoricalValuations: getMckHistoricalValuations,
    createValuationRun: createMckValuationRun,
    backfillValuationRuns: backfillMckValuationRuns,
    createUpdateJob: createMckUpdateJob,
    getUpdateJob: getMckUpdateJob,
    getBacktests: getMckBacktests,
    runBacktest: runMckBacktest,
  },
  isrg: {
    slug: "isrg",
    ticker: "ISRG",
    displayName: "Intuitive Surgical",
    modelVersion: ISRG_BACKEND_MODEL_VERSION.version,
    backtestMessage: "ISRG simple buy-and-hold backtest routes through the unified stock backend.",
    getEvents: getIsrgReportingEvents,
    getSnapshot: getIsrgSnapshot,
    getValuationRuns: getIsrgValuationRuns,
    getHistoricalValuations: getIsrgHistoricalValuations,
    createValuationRun: createIsrgValuationRun,
    backfillValuationRuns: backfillIsrgValuationRuns,
    createUpdateJob: createIsrgUpdateJob,
    getUpdateJob: getIsrgUpdateJob,
    getBacktests: getIsrgBacktests,
    runBacktest: runIsrgBacktest,
  },
};

function stockBackendRoutes(prefix, backend) {
  const { slug } = backend;
  return [
    `${prefix}/${slug}/events`,
    `${prefix}/${slug}/snapshot`,
    `${prefix}/${slug}/valuation-runs`,
    ...(backend.backfillValuationRuns ? [`${prefix}/${slug}/valuation-runs/backfill`] : []),
    `${prefix}/${slug}/historical-valuations`,
    ...(backend.getCapitalReturns ? [`${prefix}/${slug}/capital-returns`] : []),
    ...(backend.createUpdateJob ? [`${prefix}/${slug}/update`] : []),
    ...(backend.getUpdateJob ? [`${prefix}/${slug}/jobs/:jobId`] : []),
    `${prefix}/${slug}/backtests`,
  ];
}

export function listStockBackends() {
  return Object.values(stockBackendRegistry).map((backend) => ({
    slug: backend.slug,
    ticker: backend.ticker,
    displayName: backend.displayName,
    modelVersion: backend.modelVersion,
    routes: [
      ...stockBackendRoutes("/api", backend),
      ...stockBackendRoutes("/api/stocks", backend),
    ],
  }));
}

export function getStockBackend(slug) {
  return stockBackendRegistry[String(slug ?? "").toLowerCase()] ?? null;
}
