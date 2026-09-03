# Guru 目录、数据、头像与全功能生产发布审计（PASS）

审计日期：2026-09-03
审计对象：GitHub `trunk` application-code commit `f0d9c10`、AWS production backend、Vercel production frontend 与生产数据库
发布状态：**PASS：38 位 profile、9 位新增经理数据、54 条必需曲线、38 张头像、双语 UI、Market Lens 深入分析、AWS/Vercel 双域和一次性资源清理均已完成生产验收。**

## 结论摘要

- Guru 目录现有 **38 个 profile**，其中 **29 个 `manager13f`**，**27 个启用模拟**；因此强制健康矩阵是 `27 ×（5Y、10Y）= 54` 条可展示曲线。
- 本次新增 **9 位经理**：Chris Hohn、David Tepper、Dan Loeb、Seth Klarman、Nelson Peltz、Andreas Halvorsen、David Einhorn、Mohnish Pabrai、Pat Dorsey。身份、申报实体、历史 CIK 衔接、角色、策略标签和中文名均已进入统一目录。
- 静态头像审计为 **38/38**：缺失 0、额外 0、无效 0，全部为 144×144 PNG，38 个文件具有 38 个不同 SHA-256，总体积 1,037,900 bytes，低于 1 MiB 预算。头像缺失、尺寸错误、额外文件或畸形 PNG 均会使安装失败。
- 9 位新增经理已通过生产原子 bootstrap。生产数据库聚合审计为 **9/9 snapshot、9/9 exposure、9/9 dashboard profile**；最新 13F、持仓变化、5Y/10Y 模拟、季度贡献、集中持仓、深度分析、仓位轨迹、双语显示和头像均使用同一组已验证输入。
- 严格模拟仍使用 90% 执行价格覆盖门槛；公开持仓代理仅在严格结果不可用、每季度至少保留 30% 所选账面且至少有两个可定价持仓时展示，并必须标注为 proxy。没有降低门槛、没有只对有价格的子集重新归一化为“严格结果”。
- `LFG` 有两个授权价格源缺口；Nelson Peltz 的 2026 Q2 `JHG` 在申报可执行前已转为非公开权益。两者都必须保留真实限制，不允许插值、前向填充、虚构交易价或伪装成严格回测。
- Release candidate 已通过核心后端、Flutter、构建、价格修复工具、性能、Ontology 与 i18n 测试；后端完整套件为 **464/464 passed**。生产 current-generation 曲线审计为 **54/54 displayable、0 failures**。
- GitHub application-code release 为 `f0d9c10`；AWS backend 已部署 application version `guru-catalog-final2-20260903-f0d9c10` 并为 **Ready/Green**。Vercel production 为 **READY**，`thesisforge.tech` 与 `www.thesisforge.tech` 已核对为同一 deployment。
- 三个公开健康入口（AWS origin、apex、`www`）均返回 HTTP 200/`healthy`，Guru 矩阵均为 27 位、5Y/10Y、54/54、0 failures；两个公开域名上的 `/api/internal/*` 均返回 404。
- 一次性私有修复对象、临时读取权限、远端临时文件与 SSH ingress 已删除；生产 repair 环境变量为 0。source snapshot、encrypted rollback copy 与一致性数据库备份按恢复合同保留。
- 本次提交只包含代码、公开 SEC/OpenFIGI 审计目录、文档和头像。**Sharadar 等授权价格明细及其私有交付 artifact 不进入 Git。**

## 1. 目录人口与新增经理

目录人口由 [`server/gurus.js`](../../server/gurus.js) 动态派生，不在健康检查或发布脚本中复制固定数字。

| 人口 | 数量 | 说明 |
| --- | ---: | --- |
| 全部 profile | 38 | 页面与头像必须完整覆盖 |
| `manager13f` | 29 | 使用 SEC 13F 研究管线 |
| 启用模拟 | 27 | 5Y、10Y 均必须有严格或合规 proxy 曲线 |
| 禁用模拟 | 2 | Renaissance Technologies；Nick Sleep / Qais Zakaria |
| 强制曲线矩阵 | 54 | 27 位 × 2 个窗口 |

Renaissance 与 Nick Sleep / Qais Zakaria 保留为研究 profile，但公开披露不足以支持真实的当前比例复制模拟，因此不为其制造曲线，也不计入 54 条健康矩阵。

| 新增经理 | 13F 申报实体 | 主 CIK | 历史/替代 CIK | 目录状态 |
| --- | --- | --- | --- | --- |
| Chris Hohn | TCI Fund Management Ltd | `0001647251` | `0001362598` | 已配置 |
| David Tepper | Appaloosa LP | `0001656456` | `0001006438` | 已配置 |
| Dan Loeb | Third Point LLC | `0001040273` | — | 已配置 |
| Seth Klarman | Baupost Group LLC/MA | `0001061768` | — | 已配置 |
| Nelson Peltz | Trian Fund Management, L.P. | `0001345471` | — | 已配置 |
| Andreas Halvorsen | Viking Global Investors LP | `0001103804` | — | 已配置 |
| David Einhorn | DME Capital Management, LP | `0001489933` | `0001079114` | 已配置 |
| Mohnish Pabrai | Dalal Street, LLC | `0001549575` | `0001173334` | 已配置 |
| Pat Dorsey | Dorsey Asset Management, LLC | `0001671657` | — | 已配置 |

历史 CIK 不是别名展示字段：所有 13F reader 必须合并主 CIK 与 `alternateCiks`，否则 TCI、Appaloosa、Greenlight/DME、Pabrai/Dalal 的历史会被错误截断。

## 2. 数据覆盖与可追溯性

### 2.1 公开申报与证券主数据

| 数据层 | 当前候选证据 | 审计含义 |
| --- | --- | --- |
| SEC holding manifest | 27 位启用经理、32 个 filer CIK、1,134 份 filing、2,317 个 observed CUSIP | 直接来自 SEC submissions/archive，不由应用缓存反推 |
| SEC manifest records SHA-256 | `cbfaf5c7d8850719a8578c52a4457ef8ce6dc97a1dbdc33fa9e6eb9cc95b2ab2` | 绑定本次 holding universe |
| OpenFIGI 可识别美国股票 | 1,473 | 仅精确标识映射，不做模糊猜测 |
| 已解析 CUSIP | 1,446 | 可进入后续价格与模拟审核 |
| 未解析 CUSIP | 870 | 保留为未解析，不替换成相似证券 |
| 歧义 CUSIP | 1 | 保留歧义状态，不能自动选边 |
| Security-master records SHA-256 | `2f177c993cb5819efa033fa1830ff1e41addaca6b1033183109ece9c562c5c02` | 与方法版本共同决定曲线缓存兼容性 |

公开目录分别位于 [`guru-sec-cusip-manifest.json`](../../server/config/guru-sec-cusip-manifest.json) 与 [`guru-security-master.json`](../../server/config/guru-security-master.json)。CUSIP 字符串只作为从公开 SEC information table 转录的查询键；该文件不是商业 CUSIP master 的替代品。

### 2.2 功能完整性矩阵

下表同时记录共享实现与 2026-09-03 的生产数据库/API/UI 验收结果。

| Surface | 当前实现与真实性约束 | 当前工作树 | 生产验收 |
| --- | --- | --- | --- |
| 最新 13F / 经理头部 | 最新季度、申报日、滞后天数、申报信息表市值、持仓数、Top holdings | 已接入共享 snapshot 路径 | PASS：新增经理 9/9，生产 UI 抽查显示真实季度、AUM、持仓数与头像 |
| New Buys & Sells / 持仓变化 | 对比相邻季度，先合并重复 CUSIP，再区分普通股与 options/非普通索偿权 | 已实现并有后端回归测试 | PASS：9/9 snapshot 活动数组有效；线上列表可搜索并展示新建/增持/减持/不再申报 |
| 5Y / 10Y 模拟 | 默认 5Y；10Y 延迟加载；缓存绑定精确窗口、方法和 security master | 隔离 acceptance 54/54，0 failures | PASS：生产 54/54 current-generation、0 failures；5Y 与 10Y 均已点击验收 |
| 1Y / 3Y / All / 自由区间 | 1Y/3Y 从已加载曲线选择；双手柄自由区间重算区间指标；All 为 forensic 且 cache miss fail closed | Flutter 交互与布局测试已覆盖 | PASS：桌面/移动 controls 可见，自由区间条可用；All 未预热时保留 10Y ready 曲线并明确 fail closed |
| 季度贡献 | 与模拟使用同一公开披露后执行序列，不单独制造“基金实际回报” | 已接入 backtest payload | PASS：54 条展示曲线均含季度贡献；线上显示 40 个历史季度选择 |
| 集中持仓 / Market Lens | 显示经理集中度与跨经理本季度集中持仓；非公开持仓保留申报价值但禁用公开交易语义 | 已实现 | PASS：27/27 eligible managers；拥挤持仓、集中加仓、集中减仓均可展开 |
| 深度分析 | 公开可交易 ticker 可进入估值/研究；非公开或不可复制证券禁用误导性交易入口 | 已实现 JHG fail-closed | PASS：桌面和移动均完成榜单→证券→经理级证据下钻；JHG 显示 private 限制 |
| Position History | `/api/gurus/:id/exposure?limit=40` 懒加载；季度与 ticker 选择；Top-10 仓位轨迹与缺席不等于退出的披露 | 已实现，含 retry 与 overflow 测试 | PASS：新增经理 exposure 9/9；生产 UI 显示 40 季度与 ticker 仓位轨迹 |
| 双语 | 38/38 有真实中文名；新增策略标签、错误状态与 JHG 限制有中英文文案 | 单元/widget 覆盖已增加 | PASS：`npm run audit:i18n` 通过，线上中英文切换通过 |
| 头像 | canonical 静态 fallback、版本化 URL、部署后 fail-closed DB 安装 | 38/38 静态审计通过 | PASS：生产 `guru_assets` 38/38；线上 38/38 为 HTTP 200、PNG、144×144、immutable |

### 2.3 新增经理的生产曲线合同

以下是生产 current-generation 证明中的实际状态。生产安装器要求实际状态与声明逐项完全一致；`ready` 与 `proxy_ready` 不能互相静默替代。

| 新增经理 | 5Y | 10Y | 主要限制 |
| --- | --- | --- | --- |
| Chris Hohn | `ready` | `proxy_ready` | 更早历史的公开可定价覆盖不足以满足严格门槛 |
| David Tepper | `ready` | `proxy_ready` | 更早历史严格覆盖不足 |
| Dan Loeb | `ready` | `proxy_ready` | 更早历史严格覆盖不足 |
| Seth Klarman | `proxy_ready` | `proxy_ready` | `LFG` 授权源缺少两个仍属公开交易区间的会话 |
| Nelson Peltz | `proxy_ready` | `proxy_ready` | 2026 Q2 `JHG` 在 filing 可执行前转为非公开权益 |
| Andreas Halvorsen | `ready` | `proxy_ready` | 更早历史严格覆盖不足 |
| David Einhorn | `ready` | `proxy_ready` | 更早历史严格覆盖不足 |
| Mohnish Pabrai | `ready` | `ready` | FCAU/STLA provider alias、EAF 与 scoped BRK.B 已审计 |
| Pat Dorsey | `ready` | `proxy_ready` | 更早历史严格覆盖不足 |

最终生产结果：**PASS；54/54 displayable，0 failures，54 个唯一 manager/window 键与 current-generation 证明完全匹配。**
生产 strict / proxy 分布：**10 `ready` / 44 `proxy_ready`；5Y 为 8/19，10Y 为 2/25。** 隔离候选在较早市场截止日曾为 26/28；生产分布因更新后的精确市场会话覆盖而改变，代理状态透明保留，不代表曲线缺失。
完整 acceptance 记录保存在私有运行日志中；本公开报告只保留聚合结果，不公开私有文件名、路径、授权价格或哈希。

## 3. 模拟模型与特殊限制

### 3.1 共用模型约束

- 严格方法：`manager13f-drifted-total-return-v9`。
- 公开持仓代理方法：`manager13f-public-holdings-proxy-v1`，与严格结果分表保存。
- 严格门槛：每次再平衡至少覆盖所选 Top-60 普通股账面的 90%；未覆盖权重留在现金，不对可定价子集重新归一化为严格组合。
- Proxy 门槛：每个季度至少保留 30% 所选账面、至少两个完全可定价持仓，并披露纳入数量、排除权重与最大排除项。
- 兼容 strict 始终优先于 proxy；proxy 不能满足严格 refresh 或原子严格回测 gate，也不能描述为经理真实基金回报。
- 5Y 与 10Y 缓存按 `method.years` 分开绑定。5Y 结果不能满足 10Y key；All 仍是显式 forensic 模式，cache miss 不触发同步计算。
- 13F 本身可能滞后 45 天，并遗漏 shorts、cash、private assets、很多非美国证券、derivatives 与季度内交易；界面和研究结论必须保留该限制。

### 3.2 `LFG`：保留源数据缺口，不制造严格曲线

授权 Sharadar archive 及其 Parquet 衍生数据的 `LFG` 序列止于 2022-12-22，但公开 active interval 仍要求 2022-12-23 与 2022-12-27。Archaea Energy 的 $26/股现金并购在 2022-12-28 生效，不能把现金结算日期提前来覆盖前两个交易会话。

因此：

- 不插值、不前向填充、不复制前一收盘价；
- 不把 2022-12-28 的现金权利提前两日；
- Seth Klarman 的相应窗口保持 strict fail-closed，只能在独立 proxy 门槛通过时显示 `proxy_ready`；
- 私有修复包可交付其包含的精确行，但 `strictPriceCoverageEligible` 必须保持 `false`。

官方边界证据：[Archaea Energy 2022-12-28 Form 8-K](https://www.sec.gov/Archives/edgar/data/1823766/000121390022083247/ea170864-8k_archaea.htm)。工作流见 [`docs/guru-sharadar-price-repair-workflow.md`](../guru-sharadar-price-repair-workflow.md)。

### 3.3 `JHG`：非公开 rollover 不是现金退出

Nelson Peltz / Trian 的 2026 Q2 filing 含 `JHG`。公开交易在 2026-07-01 起不可用，而 13F 到可执行时已无公开市场价格；该权益转入 private interest，不是普通股东可复制的现金并购。

因此：

- 保留申报持仓与价值，但标记 `publicReplicable: false`；
- 禁用公开市场估值/复制交易入口；
- 严格结果必须为 `insufficient_data`，另存与同一 generation 正确关联的 `proxy_ready`；
- 原子 13F job 可仅对这一精确经理、季度、CUSIP 和错误码提交为 `degraded`，绝不能报告 `success`/`refreshed`；
- 不给 JHG 虚构 successor、现金价格或私募权益估值。

该例外由 [`server/backtestReplicability.js`](../../server/backtestReplicability.js) 以经理、季度、CUSIP 和 transition date 精确限定，不能扩展到其他经理、其他 JHG 季度或其他证券。

### 3.4 其他历史身份与公司行动修复

- Pabrai：UI 持仓身份保持 `FCAU`，仅价格 provider 使用审计后的 `STLA` alias；`384313508 → EAF`；八位 `84670702 → BRK.B` 只对 Pabrai 2016 Q3 的精确 report/accession/issuer/class 生效，不做全局补零。
- Li Lu：补足经审计的历史 `SINA` 价格区间，以支持 10Y 严格测试。
- 公司行动引擎采用 exact-CUSIP、effective-date 规则；现金并购、股票转换与 private rollover 分开处理。`CHNG` 的 $25.75 现金加 $2 CVR 只计一次，Twitter 保留 2022-10-27 最后真实公开收盘并于 2022-10-28 转为 $54.20 现金。
- 市场数据只对 408/425/429/5xx 与网络故障做有界重试；404 不重试。重试耗尽后仍 fail closed，不以缺失或旧价格冒充成功。
- SEC 个别 13F 的 `index.json` 会漏列真实 information-table 附件（已确认 Trian 2024 Q1）。读取器现在只从原始 submission 中类型精确为 `INFORMATION TABLE` 的唯一安全 XML 文件名恢复，拒绝路径语法、零个或多个候选，不再把 cover sheet 误读成 0 持仓季度。

## 4. 头像完整性审计

头像目录由 [`server/guruAvatarCatalog.js`](../../server/guruAvatarCatalog.js) 和部署后 hook [`01-install-guru-avatars.sh`](../../.platform/hooks/postdeploy/01-install-guru-avatars.sh) 共同约束。

| 检查项 | 结果 |
| --- | ---: |
| 目录中配置 profile | 38 |
| 预期 PNG | 38 |
| 实际 PNG | 38 |
| 缺失 | 0 |
| 额外 | 0 |
| 格式/结构无效 | 0 |
| 非 144×144 | 0 |
| 唯一 SHA-256 | 38/38 |
| 总体积 | 1,037,900 bytes（< 1 MiB） |

新增 10 个视觉资产包括 9 位新经理及 Renaissance Technologies。它们是统一风格的 editorial/AI-generated profile illustrations，不应被表述为新闻照片。生产数据库已安装 38/38 条 canonical avatar 记录；API 仍保留 `/guru-avatars/<guru-id>.png` 静态 fallback，版本化 URL 已验证，避免浏览器继续显示旧头像。

## 5. Release candidate 测试证据

以下结果来自本次 release candidate 的当前工作树；它们不是生产 smoke test。

| 检查 | 结果 | 发布状态 |
| --- | --- | --- |
| `npm run test:server` | 464/464 passed | PASS |
| `flutter test` | 72/72 passed | PASS |
| `flutter analyze` | 0 issues | PASS |
| `npm run build` | Flutter web `dist/` build passed | PASS |
| `node --test scripts/audit-guru-curve-restoration.test.mjs` | 12/12 passed | PASS |
| `python3 -m unittest scripts/test_build_guru_sharadar_price_repair.py -v` | 7/7 passed | PASS |
| postdeploy hooks `bash -n` | both hooks passed syntax validation | PASS |
| `git diff --check` | no whitespace errors at time checked | PASS |
| `npm run test:performance` | 33/33 passed | PASS |
| `npm run test:ontology` | Python 3/3 + Node 17/17 passed | PASS |
| `npm run audit:i18n` | bilingual literal and Ontology coverage audit passed | PASS |
| isolated 27×5Y/10Y acceptance | 54/54 displayable；26 strict、28 proxy；0 failures；20/20 target matches | PASS |
| production 27×5Y/10Y attestation | 54/54 displayable；10 strict、44 proxy；0 failures；54/54 generation matches | PASS |
| production catalog/data aggregate | 38 profiles；29 manager13f；27 enabled；9/9 snapshot；9/9 exposure | PASS |

生产用私有价格修复候选包含 23 个精确 series group、14 个 symbol、10,420 条授权行和 20 个显式 manager/window 目标；offline dry-run 已验证其结构、行数与目标合同。隔离候选库另以一条经授权源审计的 `LAD` 2022-05-17 记录补齐本地缺口，生产库已有完整 Yahoo 记录，因此生产修复包明确不覆盖该行。这里只记录聚合审计数，不记录任何授权价格值。生产安装、重复执行幂等校验、54 条曲线预热、原子 bootstrap 和清理均已完成；精确云资源标识、对象键和哈希只保留在私有发布日志中。

## 6. GitHub、AWS 与 Vercel 发布记录

本节只公开发布必需的代码版本与聚合健康状态。AWS account、instance、volume、snapshot、security group、私有对象键及其哈希等精确标识只保留在私有发布日志中。

### 6.1 GitHub

- 分支：`trunk`
- Application-code release commit：[`f0d9c10`](https://github.com/yudonglu1136/fundamental-analysis/commit/f0d9c1000cc67ed81da132c893fd5f98787dc7ea)
- 远端一致性：**PASS**；2026-09-03 审计时 `origin/trunk` 已包含该 runtime commit；本报告的后续 report-only commit 不改变应用代码
- Licensed-data 文件路径审计：**PASS**；release tree 路径扫描未发现 SQLite/Parquet/gzip、私有价格修复 JSON 或私有 acceptance artifact

### 6.2 AWS Elastic Beanstalk（backend/API）

- 目标：production AWS Elastic Beanstalk backend/API；精确基础设施资源 ID 不在公开 Git 报告中记录
- Application version：`guru-catalog-final2-20260903-f0d9c10`
- 部署源 commit：`f0d9c10`
- AWS platform health：**Ready / Green**
- 回滚保护：**PASS**；pre-write source snapshot、encrypted rollback snapshot 与一致性数据库备份均已验证，精确 ID 与哈希保留在私有发布日志
- 私有修复交付绑定：**PASS**；结构、目标、release 与回滚保护绑定已验证，对象键与哈希不公开
- `/api/health`：**PASS**；HTTP 200、`healthy`
- 54 条 current-generation 曲线：**PASS**；27 位 × 5Y/10Y，54/54 displayable，0 failures
- 9 位新增经理原子 bootstrap 与 snapshot/exposure/activity：**PASS**；9/9 snapshot、9/9 exposure，目录 38/29/27
- EB command timeout：**PASS**；3600 seconds
- Release 环境：**PASS**；0 个 `GURU_PRICE_REPAIR_*` 变量；internal cron secret 已轮换并在 loopback 验证当前 token 200、无效 token 403

### 6.3 Vercel（Flutter frontend）

- Project：`fundamental-analysis`
- Production deployment：**READY**；精确 deployment ID 与构建 URL 保留在私有发布日志
- Build source：application-code commit `f0d9c10`
- `thesisforge.tech` 与 `www.thesisforge.tech` 同一 deployment：**PASS**；两次独立 inspect 返回同一 READY deployment
- 两域 `/api/health`：**PASS**；均代理到 AWS 并返回 JSON HTTP 200/`healthy`、54/54、0 failures
- 两域 `/api/internal/*`：**PASS**；公网均返回 404
- 1280×720：**PASS**；首屏 5Y 曲线、1Y/3Y/5Y/10Y/All controls 与自由 range bar 可见，无 overflow
- 390×844：**PASS**；可滚动、无 Flutter overflow；Market Lens 可完成列表→证券详情→返回流程
- 新增经理、头像、中英文、Position History、Market Lens 与 JHG：**PASS**；生产 UI 已抽查中英文和多个新增经理，数据库/API 对 9/9 做 exact audit

### 6.4 一次性发布资源清理

- 删除一次性私有修复对象：**PASS**；删除后对象不存在
- 撤销一次性读取权限/环境变量：**PASS**；临时 inline policy 已删除，repair 环境变量为 0
- 删除远端临时文件并撤销 SSH ingress：**PASS**；临时文件余量 0，审计来源 CIDR 的 TCP/22 规则余量 0
- 内部密钥卫生：**PASS**；current/invalid loopback 鉴权分别为 200/403，命令行、服务日志和 shell 历史扫描命中 0
- 保留 source snapshot、encrypted rollback copy 与一致性数据库备份：**PASS**；精确资源 ID 保留在私有发布日志

## 7. Licensed data 边界

Git 可以包含：

- 价格修复的选择、校验、绑定、安装与审计代码；
- 公开 SEC filing manifest；
- 公开 OpenFIGI 精确映射及其来源元数据；
- 不含授权行情值的测试 fixture、聚合数量与审计文档；
- 头像 PNG 与前端/后端功能代码。

Git 不得包含：

- Sharadar 原始、Parquet 或导出的逐日 OHLCV/adjusted-close rows；
- unbound/bound production price-repair JSON 或 gzip artifact；
- provider token、内部 bearer secret、数据库、用户组合或私有持仓；
- 为填补缺口而生成的插值、前向填充或合成价格。

私有修复包只允许经受控的私有对象存储一次性交付。生产安装、54 条曲线预热与健康验证完成后必须删除对象和临时读取权限。

## 8. 最终发布判定

本次发布按照以下条件判定：

1. 最终 isolation acceptance 为 **54/54 displayable、0 failures**，且每条实际 `ready`/`proxy_ready` 与显式 target contract 一致；
2. 9 位新增经理的 snapshot、activity、exposure、5Y、10Y、quarter contribution、concentration 和 deep-analysis 行为在生产数据库与 UI 均逐项可见；
3. 38/38 头像在静态目录和生产 `guru_assets` 均通过 exact catalog audit；
4. 全部测试（含 performance、Ontology、i18n）通过；
5. GitHub application-code commit、AWS application version 与 Vercel build 使用同一 runtime tree；报告提交允许是仅含审计文档的后续 commit；
6. `thesisforge.tech` 与 `www.thesisforge.tech` 明确 alias 到同一 Vercel deployment；
7. AWS/Vercel 健康、桌面与移动 UI smoke test 通过；
8. 一次性私有修复对象、临时权限、环境变量与 SSH ingress 已清理，恢复 snapshot/backup 已保留。

当前最终判定：**PASS。38 位 Guru 目录、9 位新增经理的生产数据、54 条 5Y/10Y 曲线、38/38 头像、双语功能、Market Lens 深入分析、AWS/Vercel 发布与安全清理均已完成，未发现残留发布 blocker。**
