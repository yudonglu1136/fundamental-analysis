import {
  databaseInfo,
  readBackgroundJobRuns,
  readDatabaseTableSummaries,
  readGuruBacktest,
  readGuruBacktestProxy,
  readValuationPodcastInsightSummary
} from "./localDatabase.js";
import {
  backtestEndGraceDays,
  guruBacktestRefreshStatus,
  manager13fBacktestMethodVersion,
  manager13fProxyMethodVersion,
  manager13fSecurityMasterVersion
} from "./backtest.js";
import { listAdminPortfolioUsers } from "./userPortfolioStore.js";
import { createSystemHealth } from "./systemHealthCore.js";

export const {
  statusForAge,
  summarizeGuruCurveAvailability,
  buildPublicSystemHealth,
  buildAdminSystemHealth
} = createSystemHealth({
  databaseInfo,
  readBackgroundJobRuns,
  readDatabaseTableSummaries,
  readGuruBacktest,
  readGuruBacktestProxy,
  readValuationPodcastInsightSummary,
  backtestEndGraceDays,
  guruBacktestRefreshStatus,
  manager13fBacktestMethodVersion,
  manager13fProxyMethodVersion,
  manager13fSecurityMasterVersion,
  listAdminPortfolioUsers
});
