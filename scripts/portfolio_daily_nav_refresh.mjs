#!/usr/bin/env node
import {
  getPortfolioSnapshotForAccount,
  listPortfolioAccounts,
  refreshPortfolioNavForAccount,
} from "../apps/api/src/services/portfolioService.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const accountKeyArg = process.argv.find((arg) => arg.startsWith("--account-key="));
const accountKeyFilter = accountKeyArg?.split("=")[1]?.trim();

const accounts = listPortfolioAccounts()
  .filter((account) => !accountKeyFilter || account.accountKey === accountKeyFilter);

const results = [];

for (const account of accounts) {
  const snapshot = getPortfolioSnapshotForAccount(account);
  const activeHoldings = snapshot.holdings.filter((holding) => Number(holding.quantity ?? 0) > 0);
  if (!activeHoldings.length) {
    results.push({
      accountKey: account.accountKey,
      email: account.email,
      status: "skipped",
      reason: "no_active_holdings",
      historyRows: snapshot.history.length,
    });
    continue;
  }

  if (dryRun) {
    results.push({
      accountKey: account.accountKey,
      email: account.email,
      status: "would_refresh",
      holdings: activeHoldings.length,
      latestHistoryDate: snapshot.history.at(-1)?.date ?? null,
    });
    continue;
  }

  try {
    const refreshed = await refreshPortfolioNavForAccount(account, { force: true });
    results.push({
      accountKey: account.accountKey,
      email: account.email,
      status: "refreshed",
      holdings: activeHoldings.length,
      navDate: refreshed.navRefresh?.date ?? null,
      portfolioValue: refreshed.navRefresh?.portfolioValue ?? null,
      positionsValue: refreshed.navRefresh?.positionsValue ?? null,
      cashFunds: refreshed.navRefresh?.cashFunds ?? null,
      priceRefreshed: refreshed.priceRefresh?.refreshed.length ?? 0,
      priceErrors: refreshed.priceRefresh?.errors ?? [],
    });
  } catch (error) {
    results.push({
      accountKey: account.accountKey,
      email: account.email,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const output = {
  ok: results.every((result) => result.status !== "error"),
  dryRun,
  accountCount: accounts.length,
  refreshedCount: results.filter((result) => result.status === "refreshed").length,
  skippedCount: results.filter((result) => result.status === "skipped").length,
  errorCount: results.filter((result) => result.status === "error").length,
  results,
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
