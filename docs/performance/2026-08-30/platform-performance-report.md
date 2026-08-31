# Guru Intelligence 平台性能优化报告

基线/发布标签：2026-08-30
基线提交：`5495371a6bdf27670d1749e9d1057b4174d98aac`
优化对象：当前本地工作树（尚未提交、推送或部署）

## 结论与停止判断

本轮目标是：至少一条关键路径的并发 p95 提升 30% 以上，其他关键路径不得回退超过 5%，同时保持返回语义不变、完成性能回归与完整项目测试。

目标已经达到，因此按约定停止继续优化：

- 5/6 条路径的并发 p95 提升 `76.1%–99.6%`。
- `/api/gurus` 的并发 p95 也提升 `7.6%`，没有任何路径回退。
- 六条路径的传输体积合计从 `3,733,524 B` 降至 `568,805 B`，减少 `84.8%`。
- 优化前后六条路径的规范化业务语义 SHA-256 全部一致。
- 当前版本六条路径全部支持 ETag 条件请求并返回 `304`。
- 性能门禁结果为 `ok: true`，没有失败项。
- Server、Flutter、Ontology、Proxy、i18n、静态预算和 release build 均通过。

## 基准方法

- 运行环境：Node `v26.7.0`，Darwin `24.6.0`，Apple Silicon `arm64`。
- 两个版本使用完全相同的数据：
  - 主 SQLite：`709,148,672 B`，SHA-256 `f0e5e902eb09a029f2344bf73a6daf65032d6de75707b905fdabb79824875cca`
  - Ontology SQLite：`105,721,856 B`，SHA-256 `f6defbaa991617744c691b9cf598b30eeae53045e5550625054221dd92857a24`
- 自动同步、定时刷新和陈旧数据后台刷新全部关闭，避免外部 I/O 干扰。
- 基线与优化版交错运行，各三轮；每轮每条路径包含冷请求、预热、60 次顺序请求和 60 次并发请求，并发度为 20。
- 表内结果均为三轮中位数。p95 停止线只比较同机热并发请求。
- 这是本地 loopback 基准，不冒充 AWS、Vercel 或真实用户网络延迟。

## API 结果

| 路径 | 并发 p50 ms | 并发 p95 ms | p95 提升 | RPS | Identity → Brotli |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/api/valuation` | 8.20 → 1.99 | 14.77 → 3.52 | 76.1% | 1,271 → 5,669（+346%） | 246.6 KB → 28.1 KB（-88.6%） |
| `/api/valuation/LSEG?pricePoints=900` | 29.76 → 1.76 | 55.58 → 3.09 | 94.4% | 344 → 5,990（+1,641%） | 644.4 KB → 47.5 KB（-92.6%） |
| `/api/gurus` | 56.64 → 51.26 | 105.66 → 97.59 | 7.6% | 185 → 195（+5%） | 901.3 KB → 113.3 KB（-87.4%） |
| `/api/backtests?years=all&detail=compact` | 422.05 → 2.37 | 791.72 → 3.47 | 99.6% | 24 → 5,341（+21,944%） | 1,164.6 KB → 224.9 KB（-80.7%） |
| `/api/ontology/overview` | 19.05 → 1.10 | 35.27 → 1.95 | 94.5% | 551 → 9,482（+1,620%） | 612.2 KB → 124.7 KB（-79.6%） |
| `/api/graph` | 4.20 → 0.88 | 8.15 → 1.61 | 80.2% | 2,507 → 11,437（+356%） | 77.0 KB → 16.9 KB（-78.0%） |

补充观察：

- 进程 ready 中位数为 `216.71 ms → 216.21 ms`，基本持平。
- 基准结束时 RSS 快照为 `258.5 MiB → 229.6 MiB`，下降 `11.2%`。这只是统一负载下的快照，不是进程峰值。
- 首个未缓存请求增加了 `0.46–3.39 ms` 的同步压缩成本；但六条路径减少了 84.8% 网络字节。真实线上净收益仍需在 Vercel/AWS 部署后用端到端指标确认。

## 前端与静态资源结果

### Valuation 两阶段加载

默认 ticker 请求从完整研究改为 `pricePoints=300&detail=summary`，用户点击 “Open full research” 后才请求 `pricePoints=900&detail=full`。

| Ticker | Full raw → Summary raw | Full gzip → Summary gzip |
| --- | ---: | ---: |
| LSEG | 659,835 B → 64,193 B（-90.3%） | 53,607 B → 11,980 B（-77.7%） |
| ISRG | 776,760 B → 83,355 B（-89.3%） | 97,279 B → 20,395 B（-79.0%） |
| APP | 377,360 B → 59,750 B（-84.2%） | 56,463 B → 13,028 B（-76.9%） |

浏览器复验确认：

1. 初始 Valuation 只请求 `/api/valuation` 和 `pricePoints=300&detail=summary`。
2. 初始阶段没有 `/api/gurus`，也没有 `detail=full`。
3. 点击完整研究后才请求 `pricePoints=900&detail=full`。
4. 收起后再次打开不重复请求 full API，命中前端 full-detail cache。
5. 切换 Guru 后 `/api/gurus` 才首次请求。
6. 1440×1000 下无 RenderFlex overflow；全流程 console `0 errors / 0 warnings`。

### 构建体积与复访缓存

- 28 张 Guru 头像：`4,945,158 B → 935,093 B`，减少 `81.1%`。
- release `dist/`：`48,643,486 B → 44,634,994 B`，减少 `4,008,492 B / 8.24%`。
- `main.dart.js` raw 只增加 `0.033%`，gzip 增加 `0.036%`；资源节省没有被转移进主 JS。
- 入口 HTML、Flutter bootstrap/main/service worker 和 Ontology HTML 使用 revalidation。
- URL 已版本化的 Ontology JS/CSS 与 Guru 头像使用 immutable cache。
- 旧 Flutter PWA cache 清理改为每个 migration release 只执行一次；OAuth callback 不清缓存、不强制重载。

## 实施内容

### 后端与代理

- 新增统一 JSON transport：16 KiB 阈值、Brotli/gzip、弱 ETag、304、`Vary: Accept-Encoding` 和 32 MiB 编码结果预算。
- Vercel API proxy 改为流式转发响应，不再先把上游完整 body 缓存在内存；保留压缩、长度、ETag 和条件请求头。
- `/api/backtests` 增加按 window/detail/version 的聚合缓存、single-flight、LRU、精确 TTL 和 30 秒 stale retry 窗口。
- Valuation 缓存从全库 mtime 改为表级 SQLite revision trigger；相同 `generated_at` 的直接 SQL 更新也会立即失效。
- ticker cache 使用 12 条目和 24 MiB 双重 LRU 预算，避免 48 个大型研究对象带来的低内存实例风险。
- Guru、Backtest 和 Valuation 响应增加受控的 private browser cache。

### 前端

- 非 Guru 初始路由不再加载 `/api/gurus`。
- Valuation summary/full 使用独立 API 和独立前端 cache。
- Guru 头像缩至 UI 实际需要的 144×144，并加入内容版本。
- 修复拥挤持仓列表最后一行多余间距造成的 2px overflow。

### 可重复性能工具

- `npm run bench:api`：冷/热、顺序/并发、RPS、压缩、304、语义 hash、RSS、数据 hash。
- `npm run bench:bundle`：构建总大小和主要文件 raw/gzip/Brotli 大小。
- `npm run summarize:performance`：将多轮结果按中位数汇总。
- `npm run check:performance`：执行 30% 提升、5% 回退、压缩、304 和语义一致性门禁。
- 性能回归要求已写入仓库根目录 `AGENTS.md`。

## 审计中发现并修复的正确性问题

- 聚合回测缓存原先可能越过 individual TTL；现在按最早 freshness deadline 失效，stale 聚合最多缓存 30 秒。
- 聚合冷 miss 原先可能在并发下重复构建；现在相同 key/version 共享一个 in-flight Promise。
- 仅用 `generated_at` 无法识别同时间戳覆写；现在由持久化 SQLite trigger 递增 revision。
- 条件请求原先可能把带 ETag 的 404 变成 304，且 204 可能带 body；现已保持正确状态与无实体语义。
- 上游在 header 后、body 前失败时，代理可能把 gzip/length 头带进本地 502；现已清空上游表示头并发送可完整读取的 `no-store` JSON 502。
- ticker count LRU 原先有条目上限但没有内存预算；现在同时受条目和字节上限约束。

## 测试结果

- `npm run test:server`：最终发布候选 `169/169` 通过（包含 7 个 LSEG
  估值与 supersession 回归测试）。
- `npm run test:performance`：`17/17` 通过。
- `flutter test --reporter compact`：`12/12` 通过。
- `flutter analyze`：无问题。
- `npm run test:ontology`：`9/9` 通过。
- `npm run test:proxy`：`6/6` 通过。
- `npm run audit:i18n`：通过。
- `npm run verify:ontology-module`：通过。
- `git diff --check`：通过。
- `AUTH_DEV_BYPASS=true npm run build`：release build 通过，最终编译约 13.1 秒。
- 独立压力复核：定向组合连续 30/30 轮、Backtest 20/20 轮、Proxy/JSON transport 20/20 轮通过。

本机没有生产 Supabase 环境变量，因此不带 bypass 的 `npm run build` 会按预期在配置守卫处拒绝构建；这不是编译失败。部署时必须由 Vercel/CI 注入真实 production env 后再构建。

## 产物

- `api-baseline-run-1..3.json` / `api-optimized-run-1..3.json`：原始三轮结果。
- `api-baseline-median.json` / `api-optimized-median.json`：三轮中位汇总。
- `performance-gate.json`：机器可读停止线结果。
- `bundle-baseline.json` / `bundle-optimized.json`：构建体积对照。

## 限制与下一步

本轮没有提交、推送或部署。下一步若获授权，应先同步 GitHub，然后分别部署 AWS backend 与 Vercel frontend，并在真实链路验证：

1. Vercel proxy 是否保留 Brotli/gzip、ETag 和 304。
2. AWS 进程 24 小时 p95、CPU、RSS 与 cache hit rate。
3. Valuation 首屏、Guru 首开、Ontology 首开及复访的 LCP/INP/传输大小。

在本地目标已经满足且完整回归通过的前提下，本轮优化到此停止。
