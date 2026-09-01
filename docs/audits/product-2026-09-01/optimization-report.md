# Guru Intelligence 产品优化与复审报告

日期：2026-09-01
审计视角：资深产品经理 + 专业金融终端用户 + 模型审计
范围：Guru、Valuation、Portfolio、Ontology、共享 Truth Layer、认证、健康检查与发布门禁
生产状态：**未部署、未提交、未推送**

## 1. 结论

本轮把 Guru Intelligence 从 **64/100 的付费研究 Beta** 提升到 **84/100 的“可信专业个人投资终端”工程候选版**。五个 P0 的本地算法 / decision-safety gate 均已在代码和自动化测试层关闭；原始审计中的 Guru 权威历史档案、PIT security master、delisting 和交易成本仍是结果发布的外部硬门槛。选定的高价值 P1 已完成，浏览器原生 Back/Forward 验收和生产真实链路指标仍保留为明确的上线前任务。

| 维度 | 优化前 | 优化后 | 主要变化 |
| --- | ---: | ---: | --- |
| 可用性 | 63 | 86 | 768/1024 阻断消除；筛选、零结果、局部失败和恢复路径可用 |
| 易用性 | 66 | 84 | 模块状态、样本边界、估值审计含义和关键动作更易读 |
| 专业价值 | 68 | 87 | 13F、回测、LSEG FCFE 和估值审计口径改为可复算、不可误读 |
| 可靠性 / 运营成熟度 | 53 | 80 | 健康检查 fail-closed；Ontology artifact guard；machine-readable 本地性能门禁 |
| **综合（优化前沿用原始整体审计；优化后四维等权取整）** | **64** | **84** | **达到 ≥82 的工程目标** |

这个 84 分是代码、模型、浏览器和发布门禁的专家评分，不是用户研究结论。8 名目标用户任务测试、AWS/Vercel 真实链路、LCP/INP、错误率和 7 天稳定性尚未完成，不能把本报告写成“生产已达到 84 分”。

## 2. 目标完成情况

| 目标 | 结果 | 可复核证据 |
| --- | --- | --- |
| 本地算法 / decision-safety P0 gate | **5/5** | Truth Layer、13F、回测、Valuation、Portfolio 测试与截图；不等同 Guru 结果可发布 |
| 决策安全场景 | **7/7** | freshness、sample/live、13F 归属、next-session、收益归因、审计分层、断开恢复 |
| 核心模块 Truth State | **5/5** | Guru、Valuation、Portfolio、Ontology、共享 health |
| 响应式主流程 | **16/16** | 4 模块 × 390/768/1024/1440；无阻断横向 overflow |
| 可恢复失败 | **3/3** | auth 初始化、非阻断刷新、Ontology 单 shard 失败 |
| 本地发布门禁 | **全部通过** | server、Flutter、Ontology、proxy、i18n、production build、artifact、performance |

## 3. 一一完成的优化

### 3.1 Truth Layer：从“看起来实时”改成“状态真实”

- 每个模块使用自己的 `asOf`、来源和状态，不再复用 Guru 日期或当前系统日期。
- 统一区分 `LIVE / CACHED / STALE / SAMPLE / DATA ERROR`；缺库、缺表、过期或无效 health 不能显示绿色 live。
- Ontology 明确显示 snapshot 生成日和七天 stale policy；Portfolio sample 永远不伪装成真实账户。

### 3.2 Guru 13F：修正归属与命名

- 不再把 13F information-table total 称为基金 AUM。
- 分开显示 reported table value、common-long value、put/call option underlying value 和其他申报行。
- amendment、multi-CIK reporting entity、share-basis 异常和缺失 corporate-action evidence 均 fail closed。
- 性能 fixture 缺少权威历史申报档案时，页面明确显示 insufficient data，不生成一条营销上更漂亮但不可审计的假曲线。

### 3.3 Guru 回测：统一为一套可复算引擎

- 保留 SEC acceptance timestamp，并在受理后的下一交易时点执行。
- 使用 adjusted close 构造 total-return 序列；缺失 adjusted data 时不发布部分调整的结果。
- headline NAV、季度收益和贡献归因复用同一持仓漂移 / 再平衡引擎。
- 原始申报股数变化没有 corporate-action 证据时不直接解释为买卖信号。

仍未声称完成的机构级要素：全量权威 13F archive、完整 amendment cover-page 语义、PIT security master、delisting 全覆盖和交易成本。这些是结果可公开宣传前的硬前置，不影响本轮“方法不会静默错算”的关闭判断。

### 3.4 Valuation：审计语义、选择状态和 LSEG

- 把一个容易误导的 `PIT audited` 拆成：lineage/arithmetic、release reproducibility、economic/model validation、market calibration。
- 搜索或筛选后，详情只跟随仍然可见的 ticker；零匹配时清空旧详情和路由 ticker。
- 3Y target 改名为 3Y scenario，避免被理解为分析师目标价。
- LSEG 使用 parent-economic FCFE 复现 **£102.884651/股**；与 SOTP 和 20× EPS 三角验证、再扣风险准备后得到 **£103.52/股**，平台显示为四舍五入的 **£104**。FCFE 已归属于母公司普通股时不再重复扣净债务或 Tradeweb NCI。
- 历史估值仍显示 point-in-time data；release reproducibility 与经济有效性明确分开，0/141 的 model validation 不再被 lineage 通过所掩盖。

### 3.5 Portfolio：样本不可误认，断开可恢复

- 顶部、正文和角标持续显示 `SAMPLE DATA · NOT A REAL ACCOUNT`；示例金额、盈亏和持仓不再具有真实账户语气。
- `Disconnect all` 增加明确确认，不在服务端确认前预清空页面。
- 断开后提供 15 分钟恢复资格；恢复区只保存加密配置和到期时间，不回显 token。
- 过期后不可恢复；后端在下次 Portfolio 访问时永久清理过期加密副本。刷新后 Undo 状态仍可从服务端恢复。

### 3.6 响应式与关键可访问性

- 390、768、1024、1440 四档完成 Guru / Valuation / Portfolio / Ontology 主路径检查。
- 修复 768px header RenderFlex overflow；移动端语言切换保持可见。
- 审计到的关键按钮、链接、筛选、重试、日期和缩放控件达到至少 44 CSS px。
- 图表增加语义摘要；普通主任务在窄屏不再依赖横向滚动。

这不是完整 WCAG 2.2 认证；屏幕阅读器全流程、键盘焦点顺序和所有文本对比度仍需专项审计。

### 3.7 Ontology：从整页单点失败改成分片恢复

- 多视图请求由整页 `Promise.all` 改为独立加载、独立错误和 `Retry this view`。
- 单个 Strategy shard 503 时，Market / Industry / Ranking 仍可继续使用。
- 顶部状态独立读取 health，不被某一个 payload 失败拖垮。
- 文案将“实际持仓”修正为“模拟重建持仓 / reconstructed model portfolio”。
- 严格 snapshot verifier 检查 SQLite integrity、schema v2、manifest 数量与字节、必需路由、gzip/JSON、sidecar 和 SHA-256；AWS 打包在 snapshot 无效时拒绝继续。

冻结 Ontology artifact：10,366 个响应，454,377,904 JSON bytes，SHA-256 `f6defbaa991617744c691b9cf598b30eeae53045e5550625054221dd92857a24`。

### 3.8 导航、认证与刷新

- 用户主动导航使用 `pushState`，初始化和历史恢复使用 `replaceState`，避免归一化过程破坏 Forward stack。
- Valuation 过滤与选择状态统一；假控件移除或变成真实状态。
- 认证初始化失败提供页内 retry；刷新失败保留已有内容并显示非阻断错误。
- 生产 build 将 dev-auth bypass flag 编译为关闭；bundle 仍包含本地 token 字面量，但后端在 `NODE_ENV=production` 时无条件禁用 bypass，因此生产配置不会接受该 token。

当前内置浏览器的 `back()` 会跳过同文档 history entry，因此无法把这次浏览器工具行为当成真实用户 Back/Forward 的通过证据。代码路径和静态回归已通过，但仍保留一项真实 Chrome/Safari acceptance test。

## 4. 性能结果

方法：同一 Node/runtime、同一 709,148,672-byte 数据库、同一 Ontology snapshot；每个 route 三轮，每轮 60 个串行 + 60 个并发请求，并发度 20；校验 HTTP 200、Brotli、304 和解压后的 semantic SHA 不变。

| Route | 并发 p95 优化前 | 优化后 | 改善 | 优化后 RPS |
| --- | ---: | ---: | ---: | ---: |
| `/api/valuation` | 3.220 ms | 1.756 ms | 45.5% | 11,631 |
| LSEG summary | 2.784 ms | 1.270 ms | 54.4% | 13,329 |
| LSEG full | 3.335 ms | 1.720 ms | 48.4% | 10,973 |
| `/api/gurus` | 102.662 ms | 2.679 ms | 97.4% | 9,324 |
| compact backtests | 2.671 ms | 1.755 ms | 34.3% | 11,887 |
| Ontology overview | 1.804 ms | 1.171 ms | 35.1% | 15,246 |
| graph | 1.580 ms | 0.806 ms | 49.0% | 22,954 |

门禁要求至少一个核心 route 改善 30%，且任何 required route 不得退化超过 5%；最终 gate 为 `ok: true`，七条 route 全部改善 34.3%–97.4%。这是 machine-readable、输入已标识的**本地 warm-cache/hot-read**证据，不是互联网端到端延迟。baseline median 记录的 source commit `97c51bf…` 在当前仓库不可解析，且没有保存对应 source snapshot，因此第三方不能只用当前 workspace 独立重放 baseline；正式 release evidence 必须归档可解析 commit 或 source bundle。

诚实的反向指标：server ready 时间由 205.7 ms 变为 256.9 ms，变慢 24.9%；RSS 由 231.8 MiB 降到 177.8 MiB，下降 23.3%；cold latency 整体没有被证明显著改善。

## 5. 构建体积与发布门禁

最终 production exact build：

- `dist/`：44,634,994 → 44,681,150 bytes，**+0.103%**。
- `main.dart.js` raw：+1.012%。
- `main.dart.js` gzip：960,263 → 971,745 bytes，**+1.196%**。
- `main.dart.js` Brotli：867,406 → 878,840 bytes，**+1.318%**。
- 全部低于 5% guardrail。
- production build、built Ontology verifier、`git diff --check` 均通过。

## 6. 回归与浏览器验证

| 门禁 | 结果 |
| --- | ---: |
| Server | 209/209 |
| Performance contracts | 31/31 |
| Ontology | 16/16 |
| Proxy | 6/6 |
| Flutter widget | 29/29 |
| `flutter analyze` | 0 issues |
| Bilingual audit | pass |
| Production build | pass |
| Built Ontology artifact verification | pass |
| Diff whitespace check | pass |

浏览器 console 的 Guru → Valuation → Portfolio 和 Ontology clean smoke 均为 0 warning/error。视觉对比和最终截图位于：

- [Guru 前后对比](comparisons/guru-before-after-1280x720.png)
- [Valuation 前后对比](comparisons/valuation-before-after-1280x720.png)
- [Portfolio 前后对比](comparisons/portfolio-before-after-1280x720.png)
- [Ontology 前后对比](comparisons/ontology-before-after-1280x720.png)
- [移动端 Guru 对比](comparisons/guru-before-after-390x844.png)
- [移动端 Valuation 对比](comparisons/valuation-before-after-390x844.png)
- [平板 overflow 对比](comparisons/tablet-before-after-768x720.png)

## 7. 没有被本轮结果掩盖的风险

1. **用户验证未完成。** 还需要 8 名目标用户完成五个核心任务，成功率 ≥90%、找到可引用证据中位时间 ≤45 秒、SUS ≥80。
2. **生产链路未验证。** 还没有 AWS/Vercel 的真实 p95、API error、cache hit、LCP、INP、crash-free 和七天稳定性数据。
3. **Guru 数据覆盖仍不够。** 当前确定性 fixture 对多数管理人只能安全显示 insufficient data；方法已 fail closed，但不能等同于已完成机构级历史回测验证。
4. **Valuation 经济验证为 0/141。** 这现在被正确显示；lineage/arithmetic 通过不能替代 walk-forward predictive validation。
5. **浏览器历史验收待补。** push/replace 语义和回归测试通过，但真实 Chrome/Safari 的 Back/Forward 任务仍需人工 acceptance。
6. **一次诊断副作用已留档。** 只读诊断曾触发 sibling research DB 的启动同步；没有改生产或 AWS，未做猜测性回滚。详见 [source-database-incident.md](source-database-incident.md)。

## 8. 下一步

上线前只做四件事：

1. 在 staging 跑真实登录、刷新、Back/Forward、Portfolio disconnect/Undo 和 Ontology 单 shard 失败 acceptance。
2. 接入生产 telemetry 并观察七天；任何 truth state 错标、API error ≥0.5%、LCP ≥2.5s 或 INP ≥200ms 都阻止推广。
3. 补 8 人任务研究和 Valuation walk-forward validation；结果不达标则不提升“专业终端”对外定位。
4. 用权威 13F archive 重建并复核 Guru 回测，再发布任何收益曲线或营销数字。

当前适合进入 staging / release-candidate 复核；**不建议跳过上述验证直接部署生产**。

## 9. 独立复核

独立只读复核支持 **84/100 的本地专家工程候选分**，并确认当前没有剩余的本地代码阻塞项。该结论不扩展为生产验收；Chrome/Safari 原生 Back/Forward、用户研究、生产 telemetry、Guru 权威历史数据和 Valuation walk-forward 仍按本报告的边界保留。
