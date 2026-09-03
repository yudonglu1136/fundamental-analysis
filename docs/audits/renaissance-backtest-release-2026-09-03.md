# Renaissance Backtest Production Release Audit — 2026-09-03

## 结论

**PASS：文艺复兴科技（Renaissance Technologies）的曲线、持仓变化、季度贡献和持仓轨迹已在生产环境恢复。**

- 5Y 使用严格回测，最低执行覆盖率为 **94.74%**，高于 90% fail-closed 门槛。
- 10Y 的严格回测仍因早期历史价格覆盖不足而失败；产品只展示单独存储、明确标注的 **manager-level public 13F proxy**，没有把 proxy 冒充严格基金收益。
- 中英文 UI 都明确显示“管理人级公开 13F · 非 MEDALLION”／“MANAGER-LEVEL PUBLIC 13F · NOT MEDALLION”。
- 生产健康状态为 **28 位启用经理、56/56 个 5Y/10Y 窗口可展示、0 failures**。
- 最终 runtime commit 为 `90a5f0306b1c732b0b5ab3fbb09539e7f7aaf82d`；本报告之后的 docs-only commit 不改变线上 runtime。

本报告不包含授权行情明细、内部凭证、私有持仓或用户组合数据。

## 1. 为什么之前没有曲线

旧配置对 Renaissance 设置了 `disableSimulation: true`。当时公开 13F 账面的历史证券映射与可执行价格覆盖尚未通过当前审计门槛，因此界面按 fail-closed 原则不生成曲线。这避免了用缺失价格、合成价格或降低门槛来制造结果，但也导致用户看到档案和持仓、看不到模拟曲线。

本次修复没有降低门槛：

1. 重新生成并审计 Renaissance 的 SEC filing manifest 与 security master；
2. 对重复 CUSIP 聚合，并排除债务、优先股、权证、rights 等非普通股索偿权后再构建 Top-60 账面；
3. 启用 5Y 严格模型，未覆盖权重继续留在现金；
4. 将 10Y 历史缺口保留为严格失败，只允许独立、可追溯、明确披露的公开持仓 proxy；
5. 让 health、prewarm、refresh、release audit 和 UI 共用同一套 manager/window proxy policy，防止某一层显示、另一层仍判失败。

主要代码提交：

- `7293d9c` — Restore Renaissance audited backtests
- `90a5f03` — Balance manager 13F activity samples

## 2. Renaissance 当前生产数据

### 2.1 最新申报快照

| 项目 | 生产值 |
| --- | ---: |
| 报告季度 | 2026 Q2 |
| 报告日 | 2026-06-30 |
| 申报日 | 2026-08-13 |
| 申报滞后 | 44 天 |
| canonical common-long 持仓数 | 3,128 |
| 申报 common-long value | $72.618B |
| exposure 历史 | 40 个季度 |

旧截图中的 `3,140` 来自较早的缓存/过滤版本。原子刷新后，生产页面、activity、exposure 和 backtest 统一使用经重复项聚合与证券类型过滤后的 **3,128** 个 canonical common-long positions；没有为了保持旧数字而混用两代快照。

### 2.2 5Y 严格回测

| 项目 | 结果 |
| --- | ---: |
| 状态 | `ready` |
| equity curve points | 1,202 |
| quarterly contributions | 20 |
| 最低执行覆盖率 | 94.7355% |
| 方法 | `manager13f-drifted-total-return-v9` |
| security master | `holding-resolution-v1-99230d9f3aa4b341` |
| proxy | 否 |

严格模型在每次再平衡后保留未覆盖权重为现金，不对可定价子集重新归一化，因此达到 94.74% 是真实通过门槛，而不是放宽门槛后的视觉修复。

### 2.3 10Y 公开持仓代理

| 项目 | 结果 |
| --- | ---: |
| 严格结果 | `insufficient_data`，不展示为 strict |
| 展示结果 | `proxy_ready` |
| equity curve points | 2,460 |
| quarterly contributions | 40 |
| 方法 | `manager13f-public-holdings-proxy-v1` |
| 最低 Top-60 可定价权重 | 82.6% |
| 平均可定价权重 | 93.3% |
| 最大排除权重 | 17.4% |
| 每期最低纳入持仓 | 48 |

UI 会展示纳入数量、排除权重和方法说明，并明确说明这不是 strict coverage-audited fund return。该曲线也不是 Medallion Fund 的重建：公开 13F 不包含 shorts、futures、swaps、现金、很多非美国证券以及季度内交易。

## 3. 功能恢复与数据完整性

生产 UI 已逐项验收：

| 功能 | Renaissance 生产结果 |
| --- | --- |
| 模拟曲线 | 5Y strict 与 10Y disclosed proxy 均可见 |
| 时间控件 | 1Y、3Y、5Y、10Y、All 与双手柄自由区间条可见 |
| 新买入/卖出 | 可见；包含退出持仓，不再被高价值 Top-80 截断全部挤掉 |
| 季度贡献 | 40 个季度；最新 2026 Q2；最新季度覆盖率 100%；展示 60 个贡献持仓 |
| 持仓轨迹 | 40 个季度；最新 3,128 个持仓；可查看 NVDA 等单股轨迹 |
| 中英文 | 标签、proxy 披露和限制说明均已验证 |
| 1280×720 | 初始视口可见曲线、区间控件，无页面级横向溢出 |
| 390×844 | 垂直堆叠可滚动，document width 与 viewport 一致，无页面级横向溢出 |

Renaissance 最新 activity 仍是一个有界的代表性 Top-80 响应，不是假装完整分页：

| 分类 | 返回行数 |
| --- | ---: |
| new | 8 |
| increased | 25 |
| reduced | 39 |
| sold out | 8 |
| 合计 | 80 |

修复前按绝对市值全局截断，广泛分散的 Renaissance 账面容易让“小但重要”的 new/sold-out 分类全部消失。现在每个实际存在的分类先保留 8 行，再按 `max(current value, previous value)` 和确定性 tie-break 补满剩余容量。页面汇总计数仍基于完整 activity，不受 Top-80 响应限制。

## 4. 全目录与头像审计

| 检查项 | 结果 |
| --- | ---: |
| 总 profile | 38 |
| `manager13f` profile | 29 |
| 启用回测经理 | 28 |
| 预期头像 | 38 |
| 实际头像 | 38 |
| 缺失 / 额外 | 0 / 0 |
| 无效格式或尺寸 | 0 |
| 144×144 PNG | 38/38 |
| 唯一 SHA-256 | 38/38 |
| 生产可加载 | 38/38 |

头像完整性已经通过 fail-closed catalog audit，因此不存在“缺头像”。但资产目前是统一风格的 editorial/AI-generated illustrations，不是新闻照片；Renaissance 的抽象球体与 Baillie Gifford 的人物式插画仍属于视觉身份质量的 P1 后续项，尚未伪称为经过来源认证的真人照片。

## 5. 全量预热与生产健康

最终生产 prewarm：

| 窗口 | 完成情况 | strict | proxy | failure |
| --- | ---: | ---: | ---: | ---: |
| 5Y | 28/28 | 21 | 7 | 0 |
| 10Y | 28/28 | 6 | 22 | 0 |
| 合计 | 56/56 | 27 | 29 | 0 |

每条曲线都绑定精确 `method.years`、当前模型版本和同一个 security-master hash。5Y cache 不能满足 10Y 请求，严格结果始终优先于 proxy，proxy 也不能让严格 refresh 假装成功。

## 6. 测试结果

| 检查 | 结果 |
| --- | --- |
| Node/server suite | 476/476 passed |
| Flutter widget suite | 74/74 passed |
| `flutter analyze` | 0 issues |
| Flutter production build | passed |
| Vercel production build | passed |
| i18n audit | passed |
| SEC manifest / security-master contract | passed |
| Renaissance activity ordering与稀疏分类回归 | passed |
| 头像目录/格式/尺寸/唯一性 | 38/38 passed |
| `git diff --check` | passed at release gate |

生产浏览器验收额外覆盖了 5Y、10Y、proxy disclosure 展开、新买入/卖出、季度贡献、持仓轨迹、中英文、桌面与 390×844 移动布局。

## 7. GitHub、AWS 与 Vercel 发布

### GitHub

- 分支：`trunk`
- runtime commit：`90a5f0306b1c732b0b5ab3fbb09539e7f7aaf82d`
- `HEAD == origin/trunk`：PASS（runtime 发布时）
- licensed market rows、数据库和私有修复包未提交到 Git：PASS

### AWS Elastic Beanstalk backend/API

- application version：`guru-renaissance-20260903-90a5f03`
- 状态：**Ready / Green / Ok**
- Renaissance 原子刷新：snapshot、activity、exposure、5Y、10Y 同一轮更新完成
- 一致性数据库备份与加密 rollback snapshot：PASS；精确基础设施标识仅保留在私有发布日志
- SQLite integrity check：`ok`
- 临时 TCP/22 ingress：已撤销；生产 security group 最终只保留 TCP/80 公网入口

外部健康检查：

- AWS EB `/api/health`：HTTP 200、healthy、56/56、0 failures
- `https://thesisforge.tech/api/health`：HTTP 200、healthy、56/56、0 failures
- `https://www.thesisforge.tech/api/health`：HTTP 200、healthy、56/56、0 failures
- 三个公网目标的 `/api/internal/backtests/status`：HTTP 404，内部 bearer route 未暴露

### Vercel Flutter frontend

- production deployment ID：`dpl_jXr8BuaJuF9Q2sLCgqdsNs9xr3uL`
- deployment URL：`https://fundamental-analysis-85hhrilbi-yudonglu1136s-projects.vercel.app`
- `thesisforge.tech` 与 `www.thesisforge.tech`：显式指向同一 READY deployment
- 两域 `index.html` SHA-256：`23551ebaeac833a140e9ca1ead407f45c0bddd75a6db2561b1f4125b3293ea0d`
- 两域 `main.dart.js` SHA-256：`9be31287d86aac59e8a1d25b955f1952e41d38d6cd23b700b1a16ae685ff4367`

## 8. 剩余限制与后续优先级

1. **10Y 不是 strict。** 在历史证券映射与真实价格覆盖能通过 90% 门槛前，应继续保留当前醒目的 public-13F proxy 标识；不能用插值或 synthetic price 把它变绿。
2. **13F 不是实时完整组合。** 它最多滞后 45 天，并遗漏空头、衍生品、现金、非美国证券、私有资产和季度内交易；Renaissance 尤其不适合按字面复制。
3. **activity 是 Top-80 代表样本。** 当前 UI 已平衡分类，但完整 3,128 行审计若要开放，应新增服务端分页，而不是扩大单次 payload。
4. **头像来源链仍需升级。** 完整性为 38/38，但 Renaissance 与 Baillie Gifford 应进一步改成明确的机构视觉并记录来源/身份审阅链。
5. **单实例预热仍较重。** 完整 5Y/10Y prewarm 会短时增加 API 延迟，长期应迁到 worker 或滚动多实例任务。
6. **Vercel proxy 有一个非阻断 warning。** 最近日志仅观察到 Node `url.parse()` deprecation warning，对应请求仍返回 200；应在后续小版本改为 WHATWG `URL` API。

## 9. 最终发布判定

本次发布满足以下停止条件：

1. Renaissance 5Y 严格曲线与 10Y 明示 proxy 在生产可见；
2. 28 位启用经理的 56 个必要窗口全部可展示，0 failures；
3. 新买入/卖出、季度贡献、持仓轨迹和自由区间选择均通过生产 UI 验收；
4. 38/38 头像完整、有效、唯一且线上可加载；
5. GitHub runtime commit、AWS backend 与 Vercel frontend 已同步；
6. 全量测试、构建、外部健康检查、回滚保护和临时访问清理均通过。

**Release verdict：PASS。**
