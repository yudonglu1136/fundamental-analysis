# Ackman 10Y Backtest and Security-Mapping Audit

Date: 2026-09-02
Scope: Bill Ackman / Pershing Square 10-year manager-13F backtest, six newly added historical CUSIP-to-provider-symbol aliases, cache lineage, and AWS release sequencing.
Source state: committed backend/frontend release `add2a59a3785c670dfd3dc8a84f9efc204c93f82`, with the six aliases in `server/cusipOverrides.js`, method version `manager13f-drifted-total-return-v6`, public extended-history cold-compute protection, and per-manager/window single-flight protection.
Mutation policy: protected local refreshes recomputed the 5Y and 10Y evidence rows first. Production refreshes were run only after the pre-release EBS snapshot `snap-02ea12bedaebf8898` completed; no SQLite database or frontend artifact was bundled in the Elastic Beanstalk package.

## Conclusion

**Local model QA status: PASS; Ackman 5Y/10Y production release status: PASS.** The Ackman 5Y and 10Y calculations were recomputed under v6 and pass the numerical, execution-coverage, total-return, date, and attribution-reconciliation gates. The six aliases are sufficient for the Ackman window actually simulated. They are not evidence that every alias is unconditionally economically continuous for every manager and every date. All-history remains a fail-closed forensic window until its older corporate-action coverage passes the same gates.

The audit identified and closed the immediate cache-lineage problem: the mapping change can materially change a backtest, so the method tag was bumped to v6 and an incompatible-cache regression now proves that a v5 row cannot satisfy a v6 extended-history read. Public 10Y and All cache misses fail closed without synchronous computation; public `refresh=1` cannot bypass that policy; identical manager/window computations share one in-flight job. A stale All row may be served but does not claim or schedule a background refresh. A backtest that validates an audited price repair is queued behind any pre-repair computation and keyed by the repair audit ID, so the older generation cannot satisfy or overwrite the repair validation. The durable follow-up is to persist and compare an explicit security-master version or mapping digest in addition to the engine version.

The UTX alias is the key qualification. Historical CUSIP `913017109` is mapped to the provider symbol `RTX`, but on 2020-04-03 United Technologies separated Carrier and Otis, distributed their shares to its owners, merged with Raytheon, and changed its name. The current RTX CUSIP shown by the post-transaction filing is `75513E101`. This alias is therefore a historical price-series lookup, not a claim that the old and new CUSIPs or standalone businesses are identical. Ackman's simulated RTX/UTX holding ended on 2019-08-15, so this 10Y result does **not** cross the 2020 distribution/merger event.

## Reproduced 10Y Result

Read-only evidence came from the `guru_backtests` row where `guru_id = 'bill-ackman'` and `years = 10` in `server/data/guru-analysis.sqlite`.

| Check | Observed result | Assessment |
| --- | ---: | --- |
| Status | `ready` | Pass under current v6 gates |
| Generated at | `2026-09-02T05:59:06.030Z` | Local calculation, not an AWS production assertion |
| Requested / market / effective end | `2026-09-02` / `2026-09-01` / `2026-09-01` | No trailing-date adjustment |
| Equity window | `2016-11-15` to `2026-09-01` | First executable disclosure through latest covered market session |
| Daily equity points stored | 2,461 | Full local curve; compact API responses may sample to at most 520 points |
| Raw filings / included filings / rebalances | 40 / 40 / 40 | Ten years of quarterly observations |
| Universe | 33 symbols | Top-60 common-long selection never binds in this concentrated book |
| Minimum execution coverage | 99.231879% | Passes the unchanged 90% fail-closed gate |
| Average simulated coverage | 99.994476% | Missing execution weight remains cash |
| Portfolio total return / CAGR | +295.7197% / 15.0800% | Numerically valid |
| SPY total return / CAGR | +307.4639% / 15.4241% | Ackman trails by 0.3275 percentage points of CAGR |
| Portfolio volatility / Sharpe / max drawdown | 21.1862% / 0.7717 / -45.2937% | More volatile and deeper drawdown than SPY in this run |
| SPY volatility / Sharpe / max drawdown | 18.0811% / 0.8867 / -33.7173% | Benchmark check |
| Attribution headline / reconstructed return | 2.9571968889717097 / 2.957196888971709 | Difference `-8.88e-16`, inside `1e-10` tolerance |
| Method version | `manager13f-drifted-total-return-v6` | Current release-candidate method |

The two disclosed unpriced weights remain explicit cash rather than being redistributed: approximately 0.0816% for Park Hotels in the 2020-Q1 rebalance and 0.7681% for Pershing Square USA in 2026-Q2. This is why the result can pass at 99.23% minimum coverage without claiming 100% coverage in every quarter.

The newline-delimited SHA-256 of the exact locally stored v6 10Y JSON at audit time was `5035d84359c9195d18c9adb51cff4113363566bd75f7fe2859835e46e7d928b9`. It is a capture identifier, not a stable semantic hash: `generatedAt`, method-version changes, and refreshed prices will change it.

## Reproduced 5Y Control Result

The same release candidate independently recomputed the product-default five-year window. It returned `ready`, covered `2021-11-16` through `2026-09-01`, stored 1,202 daily observations, included 20 filings/rebalances, recorded 99.231879% minimum execution coverage, and reconciled attribution with a zero difference. Portfolio total return was +44.8222%, versus +73.0511% for SPY; these values are evidence for window correctness, not a marketing performance claim.

## Production Release Evidence

The deployed AWS market cutoff was one session earlier than the local capture, so production correctly ends on `2026-08-31`; no `2026-09-01` result is claimed for production.

| Release check | Production observation | Assessment |
| --- | --- | --- |
| GitHub code release | `add2a59a3785c670dfd3dc8a84f9efc204c93f82` on `trunk` | Local and remote SHA matched after push |
| Backend package | `guru-backtest-20260902-add2a59`, SHA-256 `d0853ead19bbd8411feeadb3315b4e5d17440efd0a018fab7bd2a996e13d3966` | Built from the clean committed tree; no `dist/` or production data bundled |
| Pre-write recovery point | `snap-02ea12bedaebf8898` for `vol-01b9f94bdff27b71b` | Completed before deployment/warm-up; crash-consistent EBS snapshot |
| Elastic Beanstalk | `guru-backtest-20260902-add2a59`; `Ready / Green / Ok` | Pass |
| Startup 5Y refresh | `2026-09-02T06:54:54.064Z` to `2026-09-02T06:59:18.782Z`; Ackman `ready`, `2021-11-16` to `2026-08-31` | Pass for Ackman under deployed v6 method |
| Protected 10Y warm-up | `ready`, `2016-11-15` to `2026-08-31`, 40 rebalances | Pass |
| 10Y return check | Ackman +298.9122%; SPY +310.4658% | Production observation, not a marketing claim |
| 10Y data-quality check | 99.231879% minimum execution coverage; required 90%; no stale active ticker | Pass |
| 10Y attribution check | difference `-3.11e-15` | Passes `1e-10` tolerance |
| Vercel frontend | `dpl_FJ4rerPYtroG7MKseM3DGUv5WYaT` | `www.thesisforge.tech` and apex point to the same READY deployment |
| API health | Direct Elastic Beanstalk and Vercel `/api/health` proxy both healthy | Pass |

The startup aggregate refresh reported four ready managers and seventeen explicit failures. Ackman was not in the failure set. Those failures are retained as visible fail-closed historical-coverage gaps; this release does not describe the aggregate refresh as successful or silently renormalize those managers.

## Six Aliases and Their Actual Ackman Exposure

"Active through" is the next rebalance execution close at which the old book is replaced. The intervals below come from the same drifted-position contribution ledger as the headline curve.

| Historical CUSIP | Filing issuer | Provider symbol | Active in this 10Y result | Holding intervals | Economic-continuity assessment |
| --- | --- | --- | --- | ---: | --- |
| `009158106` | Air Products & Chemicals | `APD` | 2016-11-15 through 2017-08-15 | 3 | Direct issuer/symbol mapping; no successor event crossed in the simulated holding period. |
| `609207105` | Mondelez International | `MDLZ` | 2016-11-15 through 2018-11-15 | 8 | Direct issuer/symbol mapping; no successor event crossed in the simulated holding period. |
| `72766Q105` | Platform Specialty Products | `ESI` | 2016-11-15 through 2019-05-16 | 10 | Same listed company changed name/ticker after the Arysta sale; the 2018-Q4 filing executes after the 2019-02-01 ticker change. Reasonable for this run, but the business perimeter change is real and is reflected only through the provider price series. |
| `91911K102` | Valeant Pharmaceuticals International | `BHC` | 2016-11-15 through 2017-05-16 | 2 | Ackman exited this simulated position before the 2018-07-16 BHC name/ticker change. The calculation depends on the current `BHC` provider series backfilling the historical Valeant/VRX prices. |
| `G6564A105` | Nomad Holdings | `NOMD` | 2016-11-15 through 2017-11-15 | 4 | Nomad Holdings subsequently became Nomad Foods; the official 20-F identifies the same listed ordinary shares under `NOMD`. |
| `913017109` | United Technologies | `RTX` | 2018-05-16 through 2019-08-15 | 5 | Valid for Ackman's observed pre-transaction holding interval because it ends before the 2020 Carrier/Otis distributions and Raytheon merger. Not an unconditional post-2020 economic-continuity rule. |

The six loaded provider series were reported as `total_return_adjusted_close`, sourced from SQLite after Yahoo-plus-SQLite ingestion, with 2,512 usable observations each across the requested price window. Within the actual active intervals there were no null/non-positive adjusted closes or missing active-session failures. This proves computational coverage, not corporate-action completeness. Yahoo adjusted-close history is mutable vendor data, and the code has no independent spin-off entitlement ledger.

The arithmetic sum of interval contribution percentages for these aliases was APD +0.73%, BHC -1.46%, ESI +2.15%, MDLZ +1.17%, NOMD +1.44%, and RTX -0.10%. These figures are diagnostics only; contributions from different portfolio bases should not be added to reconstruct the compounded headline return.

## Primary Sources

The following sources establish the historical filing identity and the named successor/ticker events. They do not independently certify the vendor's adjusted-close transformation.

- [Pershing Square 2016-Q3 SEC 13F information table](https://www.sec.gov/Archives/edgar/data/1336528/000117266116004332/infotable.xml): contains Air Products `009158106`, Mondelez `609207105`, Nomad Holdings `G6564A105`, Platform Specialty Products `72766Q105`, and Valeant `91911K102`.
- [Pershing Square 2018-Q1 SEC 13F information table](https://www.sec.gov/Archives/edgar/data/1336528/000117266118001246/infotable.xml): contains United Technologies `913017109`.
- [Raytheon Technologies 2020 Form 8-K](https://www.sec.gov/Archives/edgar/data/101829/000010182920000033/rtx-05072020x8k.htm): states that United Technologies separated Carrier and Otis, distributed their shares, completed the Raytheon merger, and changed its name on 2020-04-03; it also shows post-transaction symbol `RTX` and CUSIP `75513E101`.
- [Element Solutions 2019 transition announcement](https://ir.elementsolutionsinc.com/Investors/news/news-details/2019/Platform-Specialty-Products-Corporation-Announces-Closing-of-the-Sale-of-Arysta-LifeScience-Inc.-to-UPL-Corporation-Limited-01-31-2019/default.aspx): states that Platform completed the Arysta sale, changed its name, and began trading as `ESI` effective 2019-02-01.
- [Bausch Health 2018 name-change announcement](https://ir.bauschhealth.com/news-releases/archive/2018/07-13-2018): states that Valeant became Bausch Health and began trading as `BHC` on 2018-07-16.
- [Nomad Foods 2025 Form 20-F](https://www.sec.gov/Archives/edgar/data/1651717/000165171726000006/nomd-20251231.htm): states that the company was incorporated as Nomad Holdings Limited, subsequently changed to Nomad Foods Limited, and lists `NOMD` on the NYSE.
- [Mondelez 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1103982/000162828026005345/mdlz-20251231.htm): identifies the listed common-stock symbol as `MDLZ`.
- [Air Products 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/2969/000000296925000055/apd-20250930.htm): identifies the NYSE symbol as `APD`.

## Findings by Severity

### Blockers

No open blocker remains for the restored selectable-range UI or the Ackman 5Y/10Y production result.

**Open release limitation:** All-history remains unavailable as a normal cold request. The control exposes the forensic mode, but a missing current-method All cache returns `not_ready`. Do not market All as complete until the legacy security/corporate-action gaps pass the same audit gates.

### High

No open code-level High finding remains in the local release candidate. Regression coverage now includes canonical window normalization (including 9.5/9.6 rounding), public extended-window refresh policy, manager and Congress cold-cache rejection, Congress stale-cache service, stale-All no-warming truth state, incompatible v5 cache rejection, per-manager/window single-flight, repair-generation serialization, double-compaction sampling lineage, UI request ordering, refresh de-duplication, warming recovery, same-window date-range anchoring, and quarterly-attribution failure/fallback states.

Production sequencing was observed: the zero-delay aggregate default-5Y refresh completed before the protected Bill Ackman 10Y warm-up. Same-key computations also share one in-flight job.

### Medium

1. Replace wording such as "verified Ackman history mappings" with "audited for the listed Ackman active intervals" and keep the UTX/RTX limitation adjacent to the rule.
2. Add an explicit 2020 UTX boundary fixture. A position held through 2020-04-03 must include RTX plus Carrier/Otis entitlements and reconcile them, or fail closed; the present Ackman window is unaffected because its holding ended in 2019.
3. Store source URL, effective date range, predecessor/successor type, corporate-action requirement, and review date with each non-trivial alias. A flat CUSIP-to-current-symbol map loses the evidence needed for later re-audit.
4. Add a semantic result manifest independent of `generatedAt`, including filing accessions, price-source cutoff/hash or revision, engine version, security-master version, window, and output metrics. A raw JSON hash alone is not reproducible lineage.

## Safe AWS Release and 10Y Warm-Up Order

The release sequence below was completed for backend environment `guru-analysis-api-prod`. It is Green/Ready on application version `guru-backtest-20260902-add2a59`; the production database path remains `/var/app/data/guru-analysis.sqlite`.

1. Finish the cache-lineage fix and tests, commit to `trunk`, and package the backend from that clean commit. Do not bundle the local SQLite database or frontend `dist/` in the EB package.
2. Record the current EB application version and volume. Create a new EBS snapshot of `vol-01b9f94bdff27b71b` and wait for `completed` before any production backtest/price write.
3. Deploy the backend first. Wait for EB `Green` / `Ready`, then verify `/api/health` through both the EB diagnostic origin and the Vercel `/api/*` proxy.
4. Because startup refresh delay is zero, poll the protected backtest status endpoint with the internal secret until the **new deployment's** refresh has a new `startedAt`/`finishedAt` and `running: false`. Do not infer this from an older idle status.
5. Call only `POST /api/internal/backtests/bill-ackman/refresh?years=10&detail=compact`. Require HTTP 200, `status: ready`, the new method/security-master version, the expected 2016-11-15 start, 2026-09-01 effective end (or a newer independently verified market end), minimum coverage at least 90%, no active stale ticker, and passing attribution reconciliation.
6. Refresh and verify Ackman 5Y under the same new version. Its historical mappings should not materially alter the 5Y book; investigate any difference beyond a newer market-price cutoff.
7. With a real user bearer token, request `/api/gurus/bill-ackman/backtest?years=10&detail=compact` twice. Confirm both responses are `ready`, show the same window/metrics, expose no more than 520 sampled points, and the second request is a compatible cache hit. Verify the full database row separately retains all daily points.
8. Only after the backend is warm and verified, deploy the frontend from the same audited `trunk` state. Confirm `www.thesisforge.tech` and `thesisforge.tech` resolve to the same Vercel deployment and that `/api/*` still proxies to EB.
9. Monitor EB CPU, memory, disk growth, SQLite write errors, background-job status, and authenticated 5Y/10Y latency during the release window. Roll back the EB application version and restore from the fresh snapshot if data or model gates fail.

## Release Acceptance Gate

The Ackman 10Y feature can be described as audited only when all of the following are true:

- the result has been recomputed under a new cache-compatible method/security-master version;
- the six mappings are documented as interval-specific provider aliases rather than unconditional issuer continuity;
- the Ackman UTX holding interval is verified to end before the 2020 distribution/merger boundary;
- window-normalization, cache-invalidation, cold-gate, single-flight, sampling-lineage, and UI state-machine regressions pass;
- AWS has a fresh pre-write snapshot and a verified warm `years=10` row; and
- the promoted frontend reads that warm row without triggering concurrent cold recomputations.
