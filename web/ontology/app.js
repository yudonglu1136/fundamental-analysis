const state = {
  overview: null,
  graph: null,
  methodology: null,
  marketHome: null,
  marketDetail: null,
  marketGroupId: null,
  marketIndustry: null,
  marketStage: null,
  marketFlowMode: "product",
  marketNodeMetric: "ontology_score",
  marketTimelineIndex: null,
  marketSnapshotRequest: 0,
  marketPlaying: false,
  marketTrendMode: "revenue",
  marketCompanies: [],
  marketCompanyOffset: 0,
  marketCompanyTotal: 0,
  decision: null,
  decisionSignals: [],
  decisionSelectedTicker: null,
  decisionStateFilter: "all",
  decisionSectorFilter: "all",
  decisionSearch: "",
  decisionSort: "ontology_score",
  decisionTimelineIndex: null,
  decisionSnapshotRequest: 0,
  strategyCatalog: null,
  strategyDetails: new Map(),
  strategyId: null,
  strategyPeriod: "evaluation_2018_2026",
  strategyRangeStart: null,
  strategyRangeEnd: null,
  strategySnapshotRequest: 0,
  activeView: "strategy",
  timeline: null,
  latestCompanies: null,
  timelineIndex: null,
  asOf: null,
  playing: false,
  snapshotRequest: 0,
  selectedTicker: null,
  flowMode: "product",
  nodeMetric: "revenue_yoy",
  activeLayers: new Set(),
  activeStates: new Set(["surging", "improving", "mixed", "cooling"]),
  includeDelisted: false,
  showRelations: true,
  search: "",
  zoom: 1,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const stateColors = {
  surging: { fill: "#12362f", stroke: "#22d3a6", text: "#7cebc8" },
  improving: { fill: "#162f48", stroke: "#54b8f6", text: "#9bd8ff" },
  mixed: { fill: "#30291c", stroke: "#e0b15a", text: "#f2cc7c" },
  cooling: { fill: "#382027", stroke: "#e15a5a", text: "#ff9c9c" },
};

const ontologyStateColors = {
  green_graph_confirmed: { fill: "#103630", stroke: "#22d3a6", text: "#7cebc8" },
  green_peer_capture: { fill: "#102b27", stroke: "#18a878", text: "#72d5b4" },
  blue_company_event: { fill: "#162f48", stroke: "#54b8f6", text: "#9bd8ff" },
  invalid_or_watch: { fill: "#30291c", stroke: "#e0b15a", text: "#f2cc7c" },
  unavailable: { fill: "#172033", stroke: "#708093", text: "#aab5c4" },
};

const stateLabels = {
  surging: "财务爆发",
  improving: "财务改善",
  mixed: "中性/混合",
  cooling: "降温/风险",
  unavailable: "数据不可用",
};

const decisionStateLabels = {
  green_graph_confirmed: "图谱确认",
  green_peer_capture: "同行确认",
  blue_company_event: "公司改善",
  invalid_or_watch: "观察/无效",
};

const decisionStateClasses = {
  green_graph_confirmed: "graph",
  green_peer_capture: "peer",
  blue_company_event: "company",
  invalid_or_watch: "watch",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmtPct(value, digits = 1) {
  const number = safeNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(digits)}%`;
}

function fmtPpt(value, digits = 1) {
  const number = safeNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(digits)}pp`;
}

function fmtUnsignedPct(value, digits = 1) {
  const number = safeNumber(value);
  return number === null ? "--" : `${(number * 100).toFixed(digits)}%`;
}

const capBucketLabels = {
  mega: "超大盘",
  large: "大盘",
  mid: "中盘",
  small: "小盘",
  micro: "微盘",
  unknown: "未知",
};

function fmtMoney(value) {
  const number = safeNumber(value);
  if (number === null) return "--";
  const abs = Math.abs(number);
  if (abs >= 1e12) return `$${(number / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(number / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(number / 1e6).toFixed(1)}M`;
  return `$${number.toFixed(0)}`;
}

function fmtDate(value) {
  return value ? String(value).slice(0, 10) : "--";
}

function fmtScore(value, digits = 2) {
  const number = safeNumber(value);
  if (number === null) return "--";
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function fmtCompact(value) {
  const number = safeNumber(value);
  if (number === null) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function metricFormatter(metric, value) {
  if (["ontology_score", "company_score", "peer_score"].includes(metric)) return fmtScore(value);
  if (metric === "heat_score") return safeNumber(value) === null ? "--" : `${Number(value).toFixed(0)}`;
  if (metric.includes("delta") || metric === "revenue_acceleration") return fmtPpt(value);
  return fmtPct(value);
}

function metricLabel(metric) {
  return {
    ontology_score: "Ontology分",
    company_score: "公司事件",
    peer_score: "同行确认",
    revenue_yoy: "收入同比",
    revenue_acceleration: "收入加速",
    operating_income_yoy: "营业利润",
    operating_margin_delta_yoy: "营业率变化",
    capex_yoy: "资本开支同比",
    heat_score: "热度",
  }[metric] || metric;
}

function metricClass(value) {
  const number = safeNumber(value);
  if (number === null) return "";
  return number >= 0 ? "metric-positive" : "metric-negative";
}

const supabaseProjectRef = "__GURU_SUPABASE_PROJECT_REF__";
const authRetryKey = "guru-ontology-auth-retry";
const authRetryWindowMs = 10_000;
let authRedirectStarted = false;

function ontologyReturnPath() {
  const path = `${location.pathname}${location.search}${location.hash}`;
  return path.startsWith("/ontology") ? path : "/ontology/";
}

function redirectToGuruAuth() {
  const previousAttempt = Number(sessionStorage.getItem(authRetryKey) || 0);
  if (authRedirectStarted || Date.now() - previousAttempt < authRetryWindowMs) return false;
  authRedirectStarted = true;
  sessionStorage.setItem(authRetryKey, String(Date.now()));
  const loginUrl = new URL("/", location.origin);
  loginUrl.searchParams.set("returnTo", ontologyReturnPath());
  location.replace(loginUrl.toString());
  return true;
}

async function getJson(url) {
  const accessToken = readSupabaseAccessToken();
  if (!accessToken) {
    redirectToGuruAuth();
    throw new Error("正在验证登录状态…");
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.ok) {
    sessionStorage.removeItem(authRetryKey);
    return response.json();
  }
  if (response.status === 401 && redirectToGuruAuth()) {
    throw new Error("登录已过期，正在重新验证…");
  }
  const payload = await response.json().catch(() => ({}));
  const message = response.status === 401
    ? "登录验证失败，请返回 Guru 重新登录"
    : (payload.message || payload.error || response.statusText);
  throw new Error(`${response.status} ${message}`);
}

function readSupabaseAccessToken() {
  const findToken = (value, depth = 0) => {
    if (!value || depth > 4) return "";
    if (typeof value === "object" && typeof value.access_token === "string") {
      return value.access_token;
    }
    if (typeof value !== "object") return "";
    for (const child of Object.values(value)) {
      const token = findToken(child, depth + 1);
      if (token) return token;
    }
    return "";
  };
  if (!/^[a-z0-9]+$/i.test(supabaseProjectRef)) return "";
  const storageKey = `sb-${supabaseProjectRef}-auth-token`;
  try {
    return findToken(JSON.parse(localStorage.getItem(storageKey) || "null"));
  } catch {
    return "";
  }
}

function groupCard(group, variant = "theme") {
  const coverage = group.companies
    ? Math.round(((group.companies_with_fundamentals || 0) / group.companies) * 100)
    : 0;
  return `
    <button class="market-group-card ${variant}" data-group-id="${escapeHtml(group.id)}" style="--group-color:${escapeHtml(group.color)}">
      <span class="group-card-accent"></span>
      <span class="group-card-top"><strong>${escapeHtml(group.short_name)}</strong><em>${Number(group.companies || 0).toLocaleString()} 家</em></span>
      <span class="group-card-name">${escapeHtml(group.name)}</span>
      <span class="group-card-metrics">
        <span><small>收入同比</small><b class="${metricClass(group.revenue_yoy)}">${fmtPct(group.revenue_yoy)}</b></span>
        <span><small>营业利润率</small><b>${fmtPct(group.operating_margin)}</b></span>
        <span><small>基本面覆盖</small><b>${coverage}%</b></span>
      </span>
    </button>
  `;
}

function renderMarketHome() {
  const data = state.marketHome;
  if (!data) return;
  const meta = data.metadata;
  $("#market-asof").textContent = fmtDate(meta.latest_datekey || meta.as_of);
  $("#market-home-note").textContent = `${Number(meta.companies || 0).toLocaleString()} 家活跃美国上市普通股与 ADR · ${Number(meta.industries || 0)} 个行业 · 当前成员历史回放`;
  $("#market-universe-grid").innerHTML = data.market_groups.map((group) => groupCard(group, "universe")).join("");
  $("#market-theme-grid").innerHTML = data.themes.map((group) => groupCard(group, "theme")).join("");
  $("#market-sector-grid").innerHTML = data.sectors.map((group) => groupCard(group, "sector")).join("");
  $("#market-leaders-body").innerHTML = data.market_leaders.map((company) => `
    <tr data-market-ticker="${escapeHtml(company.ticker)}">
      <td class="ticker-cell"><strong>${escapeHtml(company.ticker)}</strong><span>${escapeHtml(company.name)}</span></td>
      <td>${escapeHtml(company.industry || company.sector || "--")}</td>
      <td>${fmtMoney(company.marketcap_usd)}</td>
      <td class="${metricClass(company.revenue_yoy)}">${fmtPct(company.revenue_yoy)}</td>
      <td>${fmtPct(company.operating_margin)}</td>
      <td>${fmtDate(company.datekey)}</td>
    </tr>
  `).join("");
  $$(".market-group-card").forEach((button) => button.addEventListener("click", () => openMarketGroup(button.dataset.groupId)));
  $$('[data-market-ticker]').forEach((row) => row.addEventListener("click", () => showMarketCompany(row.dataset.marketTicker)));
  if (state.activeView === "market") {
    $("#data-status").textContent = `本地 Sharadar · 财务截至 ${fmtDate(meta.latest_datekey)} · ${Number(meta.companies || 0).toLocaleString()} 家上市公司`;
  }
}

function groupTypeLabel(type) {
  return { market: "MARKET UNIVERSE", theme: "INDUSTRY THEME", sector: "SECTOR" }[type] || "MARKET GROUP";
}

function renderGroupSummary(group) {
  const coverage = group.companies
    ? (group.companies_with_fundamentals || 0) / group.companies
    : null;
  const items = [
    ["公司", Number(group.companies || 0).toLocaleString()],
    ["合计市值", fmtMoney(group.marketcap_usd)],
    ["TTM 收入", fmtMoney(group.revenue_usd)],
    ["收入同比", fmtPct(group.revenue_yoy), metricClass(group.revenue_yoy)],
    ["营业利润", fmtMoney(group.operating_income_usd)],
    ["营业利润率", fmtPct(group.operating_margin)],
    ["净利率", fmtPct(group.net_margin)],
    ["基本面覆盖", fmtUnsignedPct(coverage)],
  ];
  $("#group-summary-band").innerHTML = items.map(([label, value, className = ""]) => `
    <div class="group-summary-item"><span>${label}</span><strong class="${className}">${value}</strong></div>
  `).join("");
}

const trendDefinitions = {
  revenue: [
    { field: "revenue_usd", label: "TTM 收入", color: "#16705b", format: fmtMoney },
  ],
  profit: [
    { field: "operating_income_usd", label: "营业利润", color: "#315fa8", format: fmtMoney },
    { field: "net_income_usd", label: "净利润", color: "#b74755", format: fmtMoney },
  ],
  margin: [
    { field: "gross_margin", label: "毛利率", color: "#16705b", format: fmtPct },
    { field: "operating_margin", label: "营业利润率", color: "#315fa8", format: fmtPct },
    { field: "net_margin", label: "净利率", color: "#b66b25", format: fmtPct },
  ],
};

function renderMarketTrend() {
  const trends = state.marketDetail?.trends || [];
  const series = trendDefinitions[state.marketTrendMode];
  const width = 900;
  const height = 292;
  const pad = { left: 76, right: 24, top: 22, bottom: 44 };
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, class: "market-trend-svg" });
  const values = trends.flatMap((item) => series.map((entry) => safeNumber(item[entry.field]))).filter((value) => value !== null);
  if (!values.length) {
    $("#market-trend-chart").textContent = "该分组没有足够的历史财务数据。";
    $("#market-trend-legend").innerHTML = "";
    return;
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  const span = max - min || 1;
  const xAt = (index) => pad.left + (index / Math.max(1, trends.length - 1)) * (width - pad.left - pad.right);
  const yAt = (value) => pad.top + ((max - value) / span) * (height - pad.top - pad.bottom);

  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = pad.top + ratio * (height - pad.top - pad.bottom);
    const value = max - ratio * span;
    svg.appendChild(svgElement("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y, stroke: "#273244", "stroke-width": 1 }));
    addText(svg, series[0].format(value), pad.left - 10, y + 4, { fill: "#aab5c4", "font-size": 10, "text-anchor": "end" });
  }

  const tickEvery = Math.max(1, Math.ceil(trends.length / 7));
  trends.forEach((item, index) => {
    if (index % tickEvery !== 0 && index !== trends.length - 1) return;
    addText(svg, fmtDate(item.as_of).slice(0, 7), xAt(index), height - 16, { fill: "#aab5c4", "font-size": 9, "text-anchor": "middle" });
  });

  series.forEach((entry) => {
    let path = "";
    let started = false;
    trends.forEach((item, index) => {
      const value = safeNumber(item[entry.field]);
      if (value === null) return;
      path += `${started ? " L" : "M"} ${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`;
      started = true;
    });
    if (!started) return;
    svg.appendChild(svgElement("path", { d: path, fill: "none", stroke: entry.color, "stroke-width": 2.4, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const latestIndex = [...trends].reverse().findIndex((item) => safeNumber(item[entry.field]) !== null);
    if (latestIndex >= 0) {
      const actualIndex = trends.length - 1 - latestIndex;
      const latestValue = safeNumber(trends[actualIndex][entry.field]);
      svg.appendChild(svgElement("circle", { cx: xAt(actualIndex), cy: yAt(latestValue), r: 3.8, fill: entry.color, stroke: "#0b111d", "stroke-width": 2 }));
    }
  });
  $("#market-trend-chart").innerHTML = "";
  $("#market-trend-chart").appendChild(svg);
  const latest = trends.at(-1) || {};
  $("#market-trend-legend").innerHTML = series.map((entry) => `
    <span><i style="background:${entry.color}"></i>${entry.label}<strong>${entry.format(latest[entry.field])}</strong></span>
  `).join("");
}

function renderCapMix() {
  const rows = state.marketDetail?.cap_mix || [];
  const total = rows.reduce((sum, item) => sum + Number(item.companies || 0), 0) || 1;
  $("#group-cap-mix").innerHTML = rows.map((item) => {
    const share = Number(item.companies || 0) / total;
    return `
      <div class="cap-mix-row">
        <div><span>${capBucketLabels[item.cap_bucket] || item.cap_bucket}</span><strong>${Number(item.companies || 0).toLocaleString()} 家</strong></div>
        <div class="cap-mix-track"><i style="width:${Math.max(1, share * 100).toFixed(1)}%"></i></div>
        <small>${fmtMoney(item.marketcap_usd)}</small>
      </div>
    `;
  }).join("");
}

function renderMarketEcosystemOntology(svg, ontology, stages) {
  const compact = window.innerWidth < 700;
  const columns = compact ? 2 : 3;
  const width = compact ? 550 : 1160;
  const height = compact ? 932 : 572;
  const rootX = compact ? 168 : 36;
  const rootY = compact ? 20 : 222;
  const rootWidth = 214;
  const rootHeight = 108;
  const nodeWidth = 238;
  const nodeHeight = 104;
  const startX = compact ? 20 : 332;
  const startY = compact ? 170 : 38;
  const columnGap = compact ? 24 : 26;
  const rowGap = 24;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const positions = stages.map((stage, index) => ({
    stage,
    x: startX + (index % columns) * (nodeWidth + columnGap),
    y: startY + Math.floor(index / columns) * (nodeHeight + rowGap),
  }));
  positions.forEach(({ x, y }) => {
    svg.appendChild(svgElement("path", {
      d: compact
        ? `M ${rootX + rootWidth / 2} ${rootY + rootHeight} C ${rootX + rootWidth / 2} ${rootY + rootHeight + 34}, ${x + nodeWidth / 2} ${y - 34}, ${x + nodeWidth / 2} ${y}`
        : `M ${rootX + rootWidth} ${rootY + rootHeight / 2} C ${rootX + rootWidth + 48} ${rootY + rootHeight / 2}, ${x - 48} ${y + nodeHeight / 2}, ${x} ${y + nodeHeight / 2}`,
      fill: "none", stroke: "#41536b", "stroke-width": 1.25, opacity: 0.72,
    }));
  });

  const root = svgElement("g");
  root.appendChild(svgElement("rect", {
    x: rootX, y: rootY, width: rootWidth, height: rootHeight, rx: 5,
    fill: "#111f31", stroke: "#24c9a4", "stroke-width": 1.6,
  }));
  root.appendChild(svgElement("rect", { x: rootX, y: rootY, width: 5, height: rootHeight, fill: "#24c9a4" }));
  addText(root, "MARKET UNIVERSE", rootX + 18, rootY + 25, { fill: "#7cebc8", "font-size": 9, "font-weight": 700 });
  addText(root, state.marketDetail.group.short_name || state.marketDetail.group.name, rootX + 18, rootY + 51, { fill: "#f4f7fb", "font-size": 16, "font-weight": 750 });
  addText(root, `${Number(state.marketDetail.group.companies || 0).toLocaleString()} 家 · ${fmtDate(ontology.as_of)}`, rootX + 18, rootY + 75, { fill: "#aab5c4", "font-size": 9.5 });
  addText(root, "点击行业进入产业链", rootX + 18, rootY + 94, { fill: "#718096", "font-size": 8.5 });
  svg.appendChild(root);

  positions.forEach(({ stage, x, y }) => {
    const groupId = stage.stage_id === "unclassified" ? null : `sector-${stage.stage_id}`;
    const node = svgElement("g", { tabindex: groupId ? 0 : -1, role: groupId ? "button" : "group" });
    if (groupId) node.style.cursor = "pointer";
    node.appendChild(svgElement("rect", {
      x, y, width: nodeWidth, height: nodeHeight, rx: 5,
      fill: "#121d2e", stroke: stage.color || "#52657c", "stroke-width": 1.25,
    }));
    node.appendChild(svgElement("rect", { x, y, width: nodeWidth, height: 4, fill: stage.color || "#52657c" }));
    addText(node, stage.name.slice(0, 16), x + 14, y + 25, { fill: "#f4f7fb", "font-size": 13, "font-weight": 750 });
    addText(node, `${Number(stage.companies || 0).toLocaleString()} 家`, x + nodeWidth - 13, y + 25, { fill: "#aab5c4", "font-size": 9, "text-anchor": "end" });
    const score = safeNumber(stage.event_median_ontology_score);
    addText(node, `可执行 ${Number(stage.event_actionable || 0).toLocaleString()} · 中位分 ${score === null ? "--" : score.toFixed(2)}`, x + 14, y + 47, { fill: "#9fb0c4", "font-size": 8.7 });
    const breadth = [
      [stage.event_graph_confirmed, ontologyStateColors.green_graph_confirmed.stroke],
      [stage.event_peer_confirmed, ontologyStateColors.green_peer_capture.stroke],
      [stage.event_company, ontologyStateColors.blue_company_event.stroke],
      [stage.event_watch, ontologyStateColors.invalid_or_watch.stroke],
    ];
    const total = Math.max(1, breadth.reduce((sum, [count]) => sum + Number(count || 0), 0));
    let barX = x + 14;
    breadth.forEach(([count, color]) => {
      const segmentWidth = 210 * (Number(count || 0) / total);
      if (segmentWidth > 0) node.appendChild(svgElement("rect", { x: barX, y: y + 61, width: segmentWidth, height: 6, fill: color }));
      barX += segmentWidth;
    });
    addText(node, `图谱 ${stage.event_graph_confirmed || 0}  同行 ${stage.event_peer_confirmed || 0}  公司 ${stage.event_company || 0}  观察 ${stage.event_watch || 0}`, x + 14, y + 88, { fill: "#7f91a7", "font-size": 8.2 });
    const title = svgElement("title");
    title.textContent = groupId
      ? `${stage.name}：打开行业价值链与公司 Event Ontology。`
      : `${stage.name}：尚无可用行业价值链映射。`;
    node.appendChild(title);
    if (groupId) {
      const activate = () => openMarketGroup(groupId);
      node.addEventListener("click", activate);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") activate();
      });
    }
    svg.appendChild(node);
  });
}

function renderValueChainOntology() {
  const ontology = state.marketDetail?.ontology;
  if (!ontology?.profile) {
    $("#market-ontology-graph").innerHTML = "";
    $("#market-value-chain-policy").textContent = "";
    return;
  }
  const svg = $("#market-ontology-graph");
  const ecosystem = ontology.profile.ontology_type === "ecosystem";
  const flowControl = $("#market-flow-control");
  const metricControl = $("#market-node-metric-control");
  svg.innerHTML = "";
  $("#market-ontology-scroll").classList.toggle("ecosystem", ecosystem);
  if (flowControl) flowControl.hidden = ecosystem;
  if (metricControl) metricControl.hidden = ecosystem;
  $("#ontology-section-eyebrow").textContent = ecosystem ? "全市场 Event Ontology" : "行业 Event Ontology";
  const stages = ontology.stages.filter((stage) => Number(stage.companies || 0) > 0);
  if (ecosystem) {
    $("#value-chain-title").textContent = "行业入口与事件信号广度";
    $("#market-value-chain-policy").textContent = `按 ${fmtDate(ontology.as_of)} 当时可用的 PIT 数据扫描各经济部门。连线仅表示市场到行业的分类关系；点击行业后才展示产业阶段与上下游结构。`;
    renderMarketEcosystemOntology(svg, ontology, stages);
    return;
  }

  const byStage = new Map(stages.map((stage) => [stage.stage_id, stage.companies_preview || []]));
  $("#value-chain-title").textContent = ontology.profile.title;
  $("#market-value-chain-policy").textContent = `按 ${fmtDate(ontology.as_of)} 当时可用的数据重放；颜色表示 Event Ontology 的确认层级。阶段连线是研究定义的行业结构，不代表已测量的公司合同或收入占比。`;

  const left = 54;
  const top = 76;
  const columnWidth = 208;
  const nodeWidth = 180;
  const nodeHeight = 47;
  const rowGap = 9;
  const maxRows = Math.max(1, ...stages.map((stage) => byStage.get(stage.stage_id).length));
  const width = Math.max(980, left * 2 + stages.length * columnWidth);
  const height = Math.max(590, top + 76 + maxRows * (nodeHeight + rowGap) + 38);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const defs = svgElement("defs");
  const productMarker = svgElement("marker", { id: "market-arrow", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth" });
  productMarker.appendChild(svgElement("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#7d8793" }));
  defs.appendChild(productMarker);
  const capitalMarker = svgElement("marker", { id: "market-arrow-capital", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth" });
  capitalMarker.appendChild(svgElement("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#b66b25" }));
  defs.appendChild(capitalMarker);
  svg.appendChild(defs);

  const positions = new Map();
  stages.forEach((stage, index) => positions.set(stage.stage_id, {
    x: left + index * columnWidth,
    center: left + index * columnWidth + nodeWidth / 2,
  }));
  const productMode = state.marketFlowMode === "product";
  ontology.edges.forEach((edge) => {
    const source = positions.get(productMode ? edge.source_stage_id : edge.target_stage_id);
    const target = positions.get(productMode ? edge.target_stage_id : edge.source_stage_id);
    if (!source || !target) return;
    const lift = 16 + Math.abs(target.center - source.center) * 0.055;
    const path = svgElement("path", {
      d: `M ${source.center} 55 C ${source.center} ${55 - lift}, ${target.center} ${55 - lift}, ${target.center} 55`,
      fill: "none", stroke: productMode ? "#7d8793" : "#b66b25", "stroke-width": 1.6,
      opacity: 0.65, "marker-end": `url(#${productMode ? "market-arrow" : "market-arrow-capital"})`,
    });
    const title = svgElement("title");
    title.textContent = `${edge.label}：${edge.description}`;
    path.appendChild(title);
    svg.appendChild(path);
  });

  stages.forEach((stage) => {
    const x = positions.get(stage.stage_id).x;
    const selected = state.marketStage === stage.stage_id;
    const header = svgElement("g", { tabindex: 0, role: "button", "data-stage-id": stage.stage_id });
    header.style.cursor = "pointer";
    header.appendChild(svgElement("rect", {
      x, y: top, width: nodeWidth, height: 56, rx: 4, fill: stage.color,
      stroke: selected ? "#f7fafc" : stage.color, "stroke-width": selected ? 2.5 : 1,
    }));
    addText(header, stage.name.slice(0, 16), x + 11, top + 19, { fill: "white", "font-size": 11.5, "font-weight": 700 });
    addText(header, `${stage.event_actionable || 0}/${stage.companies || 0} 可执行`, x + nodeWidth - 10, top + 19, { fill: "white", "font-size": 8.3, "text-anchor": "end", opacity: 0.9 });
    addText(header, `图谱 ${stage.event_graph_confirmed || 0} · 同行 ${stage.event_peer_confirmed || 0} · 公司 ${stage.event_company || 0}`, x + 11, top + 38, { fill: "white", "font-size": 8.1, opacity: 0.92 });
    addText(header, `中位分 ${safeNumber(stage.event_median_ontology_score)?.toFixed(2) || "--"}`, x + 11, top + 51, { fill: "white", "font-size": 7.5, opacity: 0.75 });
    const activateStage = () => {
      state.marketStage = stage.stage_id;
      state.marketIndustry = null;
      $("#clear-value-chain-filter").hidden = false;
      $("#clear-industry-filter").hidden = true;
      renderValueChainOntology();
      renderIndustryStructure();
      loadMarketCompanies(true);
    };
    header.addEventListener("click", activateStage);
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activateStage();
    });
    svg.appendChild(header);

    byStage.get(stage.stage_id).forEach((company, rowIndex) => {
      const y = top + 70 + rowIndex * (nodeHeight + rowGap);
      const palette = ontologyStateColors[company.signal_state] || ontologyStateColors.unavailable;
      const group = svgElement("g", { tabindex: 0, role: "button", "data-market-ticker": company.ticker });
      group.style.cursor = "pointer";
      group.appendChild(svgElement("rect", { x, y, width: nodeWidth, height: nodeHeight, rx: 4, fill: palette.fill, stroke: palette.stroke, "stroke-width": 1.1 }));
      const strength = Math.min(1, Math.max(0.05, (safeNumber(company.ontology_score) || 0) / 2.5));
      group.appendChild(svgElement("rect", { x, y, width: nodeWidth * strength, height: 3, fill: palette.stroke }));
      group.appendChild(svgElement("circle", { cx: x + 12, cy: y + 16, r: 4, fill: palette.stroke }));
      addText(group, company.ticker, x + 21, y + 19, { fill: palette.text, "font-size": 11.5, "font-weight": 750 });
      const metric = company[state.marketNodeMetric];
      addText(group, metricFormatter(state.marketNodeMetric, metric), x + nodeWidth - 9, y + 19, {
        fill: safeNumber(metric) !== null && metric < 0 ? "#ff9c9c" : "#f7fafc", "font-size": 9.5, "font-weight": 650, "text-anchor": "end",
      });
      addText(group, `${company.signal_label || decisionStateLabels[company.signal_state] || "事件"} · ${fmtDate(company.information_date)}`, x + 10, y + 37, { fill: "#aab5c4", "font-size": 8.1 });
      const title = svgElement("title");
      title.textContent = `${company.ticker} · ${company.signal_label || decisionStateLabels[company.signal_state]} · ${metricLabel(state.marketNodeMetric)} ${metricFormatter(state.marketNodeMetric, metric)} · 信息日 ${fmtDate(company.information_date)}`;
      group.appendChild(title);
      group.addEventListener("click", () => showMarketCompany(company.ticker, company));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") showMarketCompany(company.ticker, company);
      });
      svg.appendChild(group);
    });
  });
}

function marketTimelinePoint(index) {
  return state.marketDetail?.signal_timeline?.[index] || null;
}

function renderMarketTimelineTrack() {
  const points = state.marketDetail?.signal_timeline || [];
  if (!points.length) return;
  const maxActionable = Math.max(1, ...points.map((point) => point.event_actionable || point.surging || 0));
  $("#market-timeline-bars").innerHTML = points.map((point, index) => {
    const height = 5 + ((point.event_actionable || point.surging || 0) / maxActionable) * 25;
    const active = index === state.marketTimelineIndex ? " active" : "";
    return `<button class="market-timeline-bar${active}" data-market-index="${index}" style="--bar-height:${height.toFixed(1)}px" title="${fmtDate(point.as_of)} · 可执行 ${point.event_actionable || 0} · 图谱 ${point.event_graph_confirmed || 0} · 同行 ${point.event_peer_confirmed || 0} · 公司 ${point.event_company || 0}" aria-label="Event Ontology 快照 ${fmtDate(point.as_of)}"></button>`;
  }).join("");
  $$(".market-timeline-bar").forEach((bar) => bar.addEventListener("click", () => {
    stopMarketTimelinePlayback();
    setMarketTimelineIndex(Number(bar.dataset.marketIndex));
  }));
  const years = [...new Set(points.map((point) => fmtDate(point.as_of).slice(0, 4)))];
  $("#market-timeline-years").innerHTML = years.map((year) => `<span>${year}</span>`).join("");
}

function updateMarketTimelineReadout(index, loading = false) {
  const point = marketTimelinePoint(index);
  if (!point) return;
  const latest = index === state.marketDetail.signal_timeline.length - 1;
  $("#market-timeline-date").textContent = `${latest ? "最新 · " : "历史 · "}${fmtDate(point.as_of)}`;
  $("#market-timeline-status").textContent = loading
    ? `正在重建 ${fmtDate(point.as_of)} 的 PIT Event Ontology…`
    : `${Number(point.event_actionable || 0).toLocaleString()} 个可执行事件 · 图谱确认 ${point.event_graph_confirmed || 0} · 同行确认 ${point.event_peer_confirmed || 0} · 公司改善 ${point.event_company || 0} · 观察 ${point.event_watch || 0}`;
}

async function setMarketTimelineIndex(index) {
  const points = state.marketDetail?.signal_timeline || [];
  if (!points.length || !state.marketGroupId) return;
  const bounded = Math.max(0, Math.min(index, points.length - 1));
  const point = points[bounded];
  state.marketTimelineIndex = bounded;
  $("#market-timeline-range").value = String(bounded);
  renderMarketTimelineTrack();
  updateMarketTimelineReadout(bounded, true);
  const requestId = ++state.marketSnapshotRequest;
  const groupId = state.marketGroupId;
  try {
    const payload = await getJson(`/api/market/groups/${encodeURIComponent(groupId)}/snapshot?as_of=${encodeURIComponent(fmtDate(point.as_of))}`);
    if (requestId !== state.marketSnapshotRequest || groupId !== state.marketGroupId) return;
    state.marketDetail.ontology = payload.ontology;
    renderValueChainOntology();
    updateMarketTimelineReadout(bounded);
  } catch (error) {
    if (requestId !== state.marketSnapshotRequest) return;
    $("#market-timeline-status").textContent = `历史快照载入失败：${error.message}`;
    stopMarketTimelinePlayback();
  }
}

function stopMarketTimelinePlayback() {
  state.marketPlaying = false;
  $("#market-timeline-play").textContent = "▶";
  $("#market-timeline-play").title = "播放历史";
  $("#market-timeline-play").setAttribute("aria-label", "播放历史");
}

async function toggleMarketTimelinePlayback() {
  const points = state.marketDetail?.signal_timeline || [];
  if (!points.length) return;
  if (state.marketPlaying) {
    stopMarketTimelinePlayback();
    return;
  }
  state.marketPlaying = true;
  $("#market-timeline-play").textContent = "■";
  $("#market-timeline-play").title = "暂停回放";
  $("#market-timeline-play").setAttribute("aria-label", "暂停回放");
  if (state.marketTimelineIndex >= points.length - 1) state.marketTimelineIndex = -1;
  while (state.marketPlaying && state.marketTimelineIndex < points.length - 1) {
    await setMarketTimelineIndex(state.marketTimelineIndex + 1);
    if (!state.marketPlaying) break;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  stopMarketTimelinePlayback();
}

function initializeMarketTimeline() {
  const points = state.marketDetail?.signal_timeline || [];
  const range = $("#market-timeline-range");
  if (!points.length) {
    range.disabled = true;
    $("#market-timeline-date").textContent = "不可用";
    $("#market-timeline-status").textContent = "没有可用的历史信号快照。";
    return;
  }
  state.marketTimelineIndex = points.length - 1;
  range.min = "0";
  range.max = String(points.length - 1);
  range.value = String(state.marketTimelineIndex);
  range.disabled = false;
  $("#market-timeline-play").disabled = false;
  $("#market-timeline-latest").disabled = false;
  renderMarketTimelineTrack();
  updateMarketTimelineReadout(state.marketTimelineIndex);
}

function renderIndustryStructure() {
  const industries = state.marketDetail?.industries || [];
  const visible = industries.slice(0, 24);
  const maxMarketcap = Math.max(1, ...visible.map((item) => safeNumber(item.marketcap_usd) || 0));
  $("#industry-structure").innerHTML = visible.map((item) => {
    const active = state.marketIndustry === item.industry;
    const width = ((safeNumber(item.marketcap_usd) || 0) / maxMarketcap) * 100;
    return `
      <button class="industry-row ${active ? "active" : ""}" data-industry="${escapeHtml(item.industry)}">
        <span class="industry-name"><strong>${escapeHtml(item.industry)}</strong><small>${Number(item.companies || 0).toLocaleString()} 家</small></span>
        <span class="industry-bar-track"><i style="width:${Math.max(1, width).toFixed(1)}%"></i></span>
        <span class="industry-metric"><small>收入同比</small><b class="${metricClass(item.revenue_yoy)}">${fmtPct(item.revenue_yoy)}</b></span>
        <span class="industry-metric"><small>营业率</small><b>${fmtPct(item.operating_margin)}</b></span>
        <span class="industry-metric"><small>市值</small><b>${fmtMoney(item.marketcap_usd)}</b></span>
      </button>
    `;
  }).join("") + (industries.length > visible.length ? `<p class="structure-note">按市值显示前 ${visible.length} 个子行业，共 ${industries.length} 个。</p>` : "");
  $$(".industry-row").forEach((button) => button.addEventListener("click", () => {
    state.marketIndustry = button.dataset.industry;
    state.marketStage = null;
    $("#clear-industry-filter").hidden = false;
    $("#clear-value-chain-filter").hidden = true;
    renderValueChainOntology();
    renderIndustryStructure();
    loadMarketCompanies(true);
  }));
}

function companyNode(company) {
  const stateClass = decisionStateClasses[company.signal_state] || "watch";
  return `
    <button class="market-company-node ${stateClass}" data-market-ticker="${escapeHtml(company.ticker)}" title="${escapeHtml(company.name)} · ${escapeHtml(company.signal_label || "暂无事件")}">
      <strong>${escapeHtml(company.ticker)}</strong>
      <span>${fmtScore(company.ontology_score)}</span>
      <small>${escapeHtml(company.signal_label || "暂无事件")} · ${fmtDate(company.information_date)}</small>
    </button>
  `;
}

function renderCompanyOntology(companies) {
  const byStage = new Map();
  companies.forEach((company) => {
    const stage = company.stage_name || company.industry || "未分类";
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage).push(company);
  });
  const order = new Map((state.marketDetail?.ontology?.stages || []).map((stage, index) => [stage.name, index]));
  const groups = [...byStage.entries()].sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999)).slice(0, state.marketIndustry ? 1 : 12);
  $("#company-ontology").innerHTML = groups.map(([stage, items]) => `
    <section class="ontology-lane">
      <header><strong>${escapeHtml(stage)}</strong><span>${items.length} 家已载入 · Event Ontology 排序</span></header>
      <div>${items.slice(0, state.marketIndustry ? 60 : 14).map(companyNode).join("")}</div>
    </section>
  `).join("");
  $$('[data-market-ticker]').forEach((button) => button.addEventListener("click", () => showMarketCompany(button.dataset.marketTicker)));
}

function renderMarketCompanyTable(companies, append = false) {
  const html = companies.map((company) => `
    <tr data-market-ticker="${escapeHtml(company.ticker)}">
      <td class="ticker-cell"><strong>${escapeHtml(company.ticker)}</strong><span>${escapeHtml(company.name)}</span></td>
      <td>${escapeHtml(company.stage_name || company.industry || "--")}</td>
      <td><span class="decision-state ${decisionStateClasses[company.signal_state] || "watch"}">${escapeHtml(company.signal_label || "暂无事件")}</span></td>
      <td>${fmtScore(company.ontology_score)}</td>
      <td>${fmtMoney(company.marketcap_usd)}</td>
      <td class="${metricClass(company.revenue_yoy)}">${fmtPct(company.revenue_yoy)}</td>
      <td class="${metricClass(company.operating_income_yoy)}">${fmtPct(company.operating_income_yoy)}</td>
      <td>${fmtPct(company.operating_margin)}</td>
      <td>${fmtPct(company.net_margin)}</td>
    </tr>
  `).join("");
  if (append) $("#market-companies-body").insertAdjacentHTML("beforeend", html);
  else $("#market-companies-body").innerHTML = html;
  $$('[data-market-ticker]').forEach((row) => row.addEventListener("click", () => showMarketCompany(row.dataset.marketTicker)));
}

async function loadMarketCompanies(reset = true) {
  if (!state.marketGroupId) return;
  const limit = 120;
  const offset = reset ? 0 : state.marketCompanyOffset;
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort: $("#market-company-sort").value,
  });
  const search = $("#market-company-search").value.trim();
  if (search) query.set("search", search);
  if (state.marketIndustry) query.set("industry", state.marketIndustry);
  if (state.marketStage) query.set("stage", state.marketStage);
  const payload = await getJson(`/api/market/groups/${encodeURIComponent(state.marketGroupId)}/companies?${query.toString()}`);
  state.marketCompanyTotal = payload.total;
  state.marketCompanyOffset = offset + payload.companies.length;
  state.marketCompanies = reset ? payload.companies : state.marketCompanies.concat(payload.companies);
  renderMarketCompanyTable(payload.companies, !reset);
  renderCompanyOntology(state.marketCompanies);
  $("#company-ontology-title").textContent = state.marketIndustry
    ? `${state.marketIndustry} → 公司`
    : state.marketStage
      ? `${state.marketDetail.ontology.stages.find((stage) => stage.stage_id === state.marketStage)?.name || state.marketStage} → 公司`
      : `${state.marketDetail.group.name} → ${state.marketDetail.ontology.profile.ontology_type === "ecosystem" ? "行业分类" : "产业阶段"} → 公司`;
  const more = state.marketCompanyOffset < state.marketCompanyTotal;
  $("#market-load-more").hidden = !more;
  $("#market-load-more").textContent = more
    ? `载入更多 · 已显示 ${state.marketCompanyOffset.toLocaleString()} / ${Number(state.marketCompanyTotal).toLocaleString()}`
    : "已显示全部";
}

async function openMarketGroup(groupId) {
  stopMarketTimelinePlayback();
  state.marketSnapshotRequest += 1;
  state.marketGroupId = groupId;
  state.marketIndustry = null;
  state.marketStage = null;
  state.marketFlowMode = "product";
  state.marketNodeMetric = "ontology_score";
  state.marketTimelineIndex = null;
  state.marketTrendMode = "revenue";
  $("#market-home").hidden = true;
  $("#market-group-detail").hidden = false;
  $("#market-group-detail").classList.add("loading-group");
  $("#group-title").textContent = "载入中";
  try {
    state.marketDetail = await getJson(`/api/market/groups/${encodeURIComponent(groupId)}`);
    const group = state.marketDetail.group;
    $("#group-type-label").textContent = groupTypeLabel(group.group_type);
    $("#group-title").textContent = group.name;
    $("#group-description").textContent = group.description;
    $("#open-ai-ontology").hidden = group.id !== "theme-ai";
    $("#clear-industry-filter").hidden = true;
    $("#clear-value-chain-filter").hidden = true;
    $("#market-company-search").value = "";
    $("#market-company-sort").value = "ontology_score";
    $("#market-node-metric").value = state.marketNodeMetric;
    $$(".trend-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.trend === "revenue"));
    renderGroupSummary(group);
    renderMarketTrend();
    renderCapMix();
    $$(".ontology-flow-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.marketFlow === "product"));
    renderValueChainOntology();
    initializeMarketTimeline();
    renderIndustryStructure();
    state.marketCompanies = state.marketDetail.companies;
    state.marketCompanyOffset = state.marketCompanies.length;
    state.marketCompanyTotal = group.companies;
    renderMarketCompanyTable(state.marketCompanies);
    renderCompanyOntology(state.marketCompanies);
    $("#company-ontology-title").textContent = `${group.name} → ${state.marketDetail.ontology.profile.ontology_type === "ecosystem" ? "行业分类" : "产业阶段"} → 公司`;
    $("#market-load-more").hidden = state.marketCompanyOffset >= state.marketCompanyTotal;
    if (!$("#market-load-more").hidden) {
      $("#market-load-more").textContent = `载入更多 · 已显示 ${state.marketCompanyOffset.toLocaleString()} / ${Number(state.marketCompanyTotal).toLocaleString()}`;
    }
    history.replaceState(null, "", `#group=${encodeURIComponent(groupId)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    $("#group-title").textContent = "载入失败";
    $("#group-description").textContent = error.message;
  } finally {
    $("#market-group-detail").classList.remove("loading-group");
  }
}

function closeMarketGroup() {
  stopMarketTimelinePlayback();
  state.marketSnapshotRequest += 1;
  state.marketGroupId = null;
  state.marketDetail = null;
  state.marketIndustry = null;
  state.marketStage = null;
  state.marketTimelineIndex = null;
  $("#market-group-detail").hidden = true;
  $("#market-home").hidden = false;
  history.replaceState(null, "", location.pathname);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCompanyOntologyStructure(ontology, ticker) {
  const structure = ontology?.structure;
  if (!structure?.profile) {
    return `
      <section class="dialog-ontology-section">
        <div class="company-ontology-heading"><span>新 Ontology 结构</span><small>无行业阶段映射</small></div>
        <p class="company-ontology-empty">当前公司没有可用的行业阶段与上下游关系。</p>
      </section>
    `;
  }
  const profile = structure.profile;
  const currentStageId = profile.stage_id;
  const stagesById = Object.fromEntries((structure.stages || []).map((stage) => [stage.stage_id, stage]));
  const edges = [...(structure.edges || [])].sort((left, right) => {
    const leftConnected = left.source_stage_id === currentStageId || left.target_stage_id === currentStageId;
    const rightConnected = right.source_stage_id === currentStageId || right.target_stage_id === currentStageId;
    return Number(rightConnected) - Number(leftConnected);
  });
  const edgeRows = edges.length ? edges.map((edge) => {
    const source = stagesById[edge.source_stage_id] || { name: edge.source_name, companies: null };
    const target = stagesById[edge.target_stage_id] || { name: edge.target_name, companies: null };
    const connected = edge.source_stage_id === currentStageId || edge.target_stage_id === currentStageId;
    return `
      <div class="company-flow-edge${connected ? " connected" : ""}">
        <div class="company-flow-node${edge.source_stage_id === currentStageId ? " current" : ""}">
          <strong>${escapeHtml(source.name)}</strong><small>${fmtCompact(source.companies)} 家公司</small>
        </div>
        <div class="company-flow-link"><span>${escapeHtml(edge.label || "价值流")}</span><i>→</i></div>
        <div class="company-flow-node${edge.target_stage_id === currentStageId ? " current" : ""}">
          <strong>${escapeHtml(target.name)}</strong><small>${fmtCompact(target.companies)} 家公司</small>
        </div>
      </div>
    `;
  }).join("") : (structure.stages || []).map((stage) => `
    <div class="company-flow-node${stage.stage_id === currentStageId ? " current" : ""}">
      <strong>${escapeHtml(stage.name)}</strong><small>${fmtCompact(stage.companies)} 家公司</small>
    </div>
  `).join("");
  return `
    <section class="dialog-ontology-section">
      <div class="company-ontology-heading">
        <span>新 Ontology 结构</span>
        <small>${escapeHtml(profile.group_id)} · ${escapeHtml(ontology.version || "event-ontology-v2")}</small>
      </div>
      <div class="company-stage-anchor">
        <span><b>${escapeHtml(ticker)}</b><small>公司</small></span>
        <i>→</i>
        <span class="stage"><b>${escapeHtml(profile.stage_name)}</b><small>${escapeHtml(profile.stage_role)}</small></span>
      </div>
      <div class="company-ontology-profile">
        <strong>${escapeHtml(profile.title)}</strong>
        <span>阶段是行业结构映射；连线表达经济价值流，不代表已核实的公司合同。</span>
      </div>
      <div class="company-flow-map">${edgeRows}</div>
    </section>
  `;
}

function renderCompanyDecisionSignal(ontology, legacySignal) {
  const signal = ontology?.strategy_signal;
  const legacyNote = legacySignal ? `
    <div class="legacy-signal-note">
      <span>旧版浏览热度</span>
      <strong>${safeNumber(legacySignal.heat_score)?.toFixed(0) || "--"} / 100 · ${escapeHtml(stateLabels[legacySignal.signal_state] || legacySignal.signal_state)}</strong>
      <small>仅用于全市场财务温度浏览，不参与 Event Ontology v2 的买卖决策。</small>
    </div>
  ` : "";
  if (!signal) {
    return `
      <section class="company-decision-status excluded">
        <div><span>EVENT ONTOLOGY V2</span><strong>不在新策略有效事件池</strong></div>
        <ul>${(ontology?.exclusion_reasons || ["没有PIT可执行事件"]).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      </section>
      ${legacyNote}
    `;
  }
  const peerContribution = (safeNumber(signal.peer_score) || 0) - (safeNumber(signal.company_score) || 0);
  const graphContribution = (safeNumber(signal.ontology_score) || 0) - (safeNumber(signal.peer_score) || 0);
  return `
    <section class="company-decision-status eligible">
      <div>
        <span>EVENT ONTOLOGY V2 · PIT ${fmtDate(signal.information_date)}</span>
        <strong><span class="decision-state-pill ${decisionSignalClass(signal)}"><i></i>${escapeHtml(signal.signal_label || decisionStateLabels[signal.signal_state] || signal.signal_state)}</span></strong>
      </div>
      <small>报告 ${fmtDate(signal.reportperiod)} → 公开 ${fmtDate(signal.information_date)} → 交易 ${fmtDate(signal.trade_date)}</small>
    </section>
    <div class="company-score-bridge" aria-label="新Ontology分数分解">
      <div><span>公司事件</span><strong>${fmtScore(signal.company_score)}</strong></div>
      <i>+</i>
      <div><span>同行增量</span><strong>${fmtScore(peerContribution)}</strong></div>
      <i>+</i>
      <div><span>上下游增量</span><strong>${fmtScore(graphContribution)}</strong></div>
      <i>=</i>
      <div class="final"><span>最终分数</span><strong>${fmtScore(signal.ontology_score)}</strong></div>
    </div>
    <div class="company-signal-components">
      <span><small>经营超预期</small><b>${fmtScore(signal.operating_surprise)}</b></span>
      <span><small>现金确认</small><b>${fmtScore(signal.cash_confirmation)}</b></span>
      <span><small>持续质量</small><b>${fmtScore(signal.durable_quality)}</b></span>
      <span><small>估值支持</small><b>${fmtScore(signal.valuation_support)}</b></span>
      <span><small>负债/稀释</small><b>${fmtScore(signal.balance_dilution_safety)}</b></span>
      <span><small>同行广度</small><b>${fmtUnsignedPct(signal.stage_breadth)}</b></span>
      <span><small>连接广度</small><b>${fmtUnsignedPct(signal.connected_breadth)}</b></span>
      <span><small>仓位倍率</small><b>${safeNumber(signal.context_position_multiplier)?.toFixed(2) || "--"}x</b></span>
    </div>
    ${legacyNote}
  `;
}

async function showMarketCompany(ticker, signalContext = null) {
  const dialog = $("#market-company-dialog");
  $("#market-company-dialog-content").innerHTML = `<div class="market-dialog-loading">载入 ${escapeHtml(ticker)}…</div>`;
  if (!dialog.open) dialog.showModal();
  try {
    const selectedAsOf = signalContext ? state.marketDetail?.ontology?.as_of : null;
    const query = selectedAsOf ? `?as_of=${encodeURIComponent(fmtDate(selectedAsOf))}` : "";
    const payload = await getJson(`/api/market/companies/${encodeURIComponent(ticker)}${query}`);
    const company = payload.company;
    $("#market-company-dialog-content").innerHTML = `
      <header class="market-dialog-header">
        <div><span class="section-kicker">${escapeHtml(company.sector || "UNCLASSIFIED")}</span><h2>${escapeHtml(company.ticker)}</h2><p>${escapeHtml(company.name)}</p></div>
        <button id="market-dialog-close" class="dialog-close" aria-label="关闭" title="关闭">×</button>
      </header>
      <div class="dialog-meta"><span>${escapeHtml(company.exchange || "--")}</span><span>${escapeHtml(company.industry || "--")}</span><span>报告期 ${fmtDate(company.reportperiod)}</span><span>公开日 ${fmtDate(company.datekey)}</span></div>
      ${renderCompanyDecisionSignal(payload.ontology, signalContext)}
      ${renderCompanyOntologyStructure(payload.ontology, company.ticker)}
      <div class="dialog-metric-grid">
        <div><span>市值</span><strong>${fmtMoney(company.marketcap_usd)}</strong></div>
        <div><span>TTM收入</span><strong>${fmtMoney(company.revenue_usd)}</strong></div>
        <div><span>收入同比</span><strong class="${metricClass(company.revenue_yoy)}">${fmtPct(company.revenue_yoy)}</strong></div>
        <div><span>营业利润同比</span><strong class="${metricClass(company.operating_income_yoy)}">${fmtPct(company.operating_income_yoy)}</strong></div>
        <div><span>毛利率</span><strong>${fmtPct(company.gross_margin)}</strong></div>
        <div><span>营业利润率</span><strong>${fmtPct(company.operating_margin)}</strong></div>
        <div><span>净利率</span><strong>${fmtPct(company.net_margin)}</strong></div>
        <div><span>FCF率</span><strong>${fmtPct(company.fcf_margin)}</strong></div>
      </div>
      <section class="dialog-memberships"><h3>市场分类入口</h3><p>这些按钮只负责导航，不代表新策略信号。</p><div>${payload.memberships.map((item) => `<button data-dialog-group="${escapeHtml(item.id)}" style="--group-color:${escapeHtml(item.color)}">${escapeHtml(item.short_name)}</button>`).join("")}</div></section>
    `;
    $("#market-dialog-close").addEventListener("click", () => dialog.close());
    $$('[data-dialog-group]').forEach((button) => button.addEventListener("click", () => {
      dialog.close();
      switchView("market");
      openMarketGroup(button.dataset.dialogGroup);
    }));
  } catch (error) {
    $("#market-company-dialog-content").innerHTML = `<div class="market-dialog-loading">载入失败：${escapeHtml(error.message)}</div>`;
  }
}

function decisionSignalClass(signal) {
  return decisionStateClasses[signal?.signal_state] || "watch";
}

function decisionMetricBar(value, scale = 2.5) {
  const number = safeNumber(value);
  const width = number === null ? 0 : Math.min(100, Math.abs(number) / scale * 100);
  const tone = number === null ? "muted" : number >= 0 ? "positive" : "negative";
  return `<span class="score-bar ${tone}"><i style="width:${width.toFixed(1)}%"></i></span>`;
}

function renderDecisionStats() {
  const data = state.decision;
  if (!data) return;
  const stats = data.stats || {};
  const validation = data.validation || {};
  const activeCount = (data.state_counts || []).reduce((sum, item) => sum + Number(item.companies || 0), 0);
  const pitPass = Object.entries(validation).every(([key, value]) => !key.includes("violation") || Number(value) === 0);
  $("#decision-stats").innerHTML = `
    <div><span>历史事件</span><strong>${fmtCompact(stats.event_rows)}</strong><small>${fmtCompact(stats.tickers)} 家公司</small></div>
    <div><span>合格事件</span><strong>${fmtCompact(stats.actionable_events)}</strong><small>全历史可执行</small></div>
    <div><span>当前候选</span><strong>${fmtCompact(activeCount)}</strong><small>最新公司状态</small></div>
    <div><span>PIT 验证</span><strong class="${pitPass ? "metric-positive" : "metric-negative"}">${pitPass ? "PASS" : "CHECK"}</strong><small>无未来数据</small></div>
  `;
  $("#decision-asof").textContent = fmtDate(stats.latest_information_date);
  $("#decision-version").textContent = data.version || "--";
  $("#decision-bias").textContent = `${activeCount} 个当前候选`;
  $("#data-status").textContent = `Sharadar PIT · ${fmtCompact(stats.event_rows)} 个财报事件 · 截至 ${fmtDate(stats.latest_information_date)}`;
}

function renderDecisionTape() {
  const signals = state.decision?.recent_signals || [];
  $("#decision-signal-tape").innerHTML = signals.slice(0, 7).map((signal) => `
    <button data-decision-ticker="${escapeHtml(signal.ticker)}">
      <i class="signal-marker ${decisionSignalClass(signal)}"></i>
      <span><strong>${escapeHtml(signal.ticker)}</strong><small>${escapeHtml(signal.stage_name || signal.industry || signal.sector || "--")}</small></span>
      <span><b>${escapeHtml(decisionStateLabels[signal.signal_state] || signal.signal_state)}</b><small>${fmtDate(signal.information_date)}</small></span>
    </button>
  `).join("");
}

function renderDecisionHoldings() {
  const holdings = state.decision?.holdings || [];
  const maxWeight = Math.max(...holdings.map((item) => Number(item.weight || 0)), 0.01);
  $("#decision-holdings").innerHTML = holdings.slice(0, 8).map((holding) => `
    <button data-decision-ticker="${escapeHtml(holding.ticker)}">
      <span><strong>${escapeHtml(holding.ticker)}</strong><small>${escapeHtml(holding.stage_name || holding.sector || "--")}</small></span>
      <span class="holding-exposure"><i style="width:${(Number(holding.weight || 0) / maxWeight * 100).toFixed(1)}%"></i></span>
      <b>${fmtUnsignedPct(holding.weight)}</b>
    </button>
  `).join("");
}

function renderDecisionFilters() {
  const counts = new Map((state.decision?.state_counts || []).map((item) => [item.signal_state, item.companies]));
  const total = [...counts.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  $$("[data-decision-state]").forEach((button) => {
    const key = button.dataset.decisionState;
    const count = key === "all" ? total : counts.get(key) || 0;
    button.querySelector("b").textContent = Number(count).toLocaleString();
    button.classList.toggle("active", key === state.decisionStateFilter);
  });
  const sectors = (state.decision?.sectors || []).filter((item) => Number(item.actionable || 0) > 0);
  $("#decision-sector-filters").innerHTML = `
    <button class="${state.decisionSectorFilter === "all" ? "active" : ""}" data-decision-sector="all"><span>全部行业</span><b>${fmtCompact(total)}</b></button>
    ${sectors.map((sector) => `
      <button class="${state.decisionSectorFilter === sector.sector ? "active" : ""}" data-decision-sector="${escapeHtml(sector.sector)}">
        <span>${escapeHtml(sector.sector)}</span><b>${fmtCompact(sector.actionable)}</b>
      </button>
    `).join("")}
  `;
}

function decisionVisibleSignals() {
  const search = state.decisionSearch.trim().toLowerCase();
  const sort = state.decisionSort;
  return [...state.decisionSignals]
    .filter((signal) => state.decisionStateFilter === "all" || signal.signal_state === state.decisionStateFilter)
    .filter((signal) => state.decisionSectorFilter === "all" || signal.sector === state.decisionSectorFilter)
    .filter((signal) => !search || signal.ticker.toLowerCase().includes(search) || (signal.name || "").toLowerCase().includes(search))
    .sort((a, b) => {
      if (sort === "information_date") return String(b.information_date || "").localeCompare(String(a.information_date || ""));
      return (safeNumber(b[sort]) ?? -Infinity) - (safeNumber(a[sort]) ?? -Infinity);
    });
}

function renderDecisionTable() {
  const signals = decisionVisibleSignals();
  const historical = state.decisionTimelineIndex !== null
    && state.decisionTimelineIndex < (state.decision?.timeline?.length || 0) - 1;
  $("#decision-table-status").textContent = `${historical ? "历史 PIT 快照" : "最新状态"} · 显示 ${signals.length} 个候选 · 按 ${$("#decision-sort")?.selectedOptions?.[0]?.textContent || "Ontology"} 排序`;
  $("#decision-table-body").innerHTML = signals.length ? signals.map((signal) => `
    <tr data-decision-ticker="${escapeHtml(signal.ticker)}" class="${state.decisionSelectedTicker === signal.ticker ? "selected" : ""}">
      <td class="decision-company-cell">
        <strong>${escapeHtml(signal.ticker)}</strong>
        <span>${escapeHtml(signal.name || signal.industry || "--")}</span>
        <small>${fmtDate(signal.information_date)} · ${escapeHtml(signal.stage_name || signal.sector || "--")}</small>
      </td>
      <td><span class="decision-state-pill ${decisionSignalClass(signal)}"><i></i>${escapeHtml(decisionStateLabels[signal.signal_state] || signal.signal_state)}</span></td>
      <td class="score-cell"><b>${fmtScore(signal.company_score)}</b>${decisionMetricBar(signal.company_score)}</td>
      <td class="score-cell"><b>${fmtScore(signal.peer_context)}</b>${decisionMetricBar(signal.peer_context)}</td>
      <td class="score-cell"><b>${fmtScore(signal.graph_context)}</b>${decisionMetricBar(signal.graph_context)}</td>
      <td class="score-cell final"><b>${fmtScore(signal.ontology_score)}</b>${decisionMetricBar(signal.ontology_score)}</td>
      <td><strong>${safeNumber(signal.context_position_multiplier)?.toFixed(2) || "--"}x</strong></td>
    </tr>
  `).join("") : '<tr><td colspan="7" class="decision-no-data">当前筛选没有可交易候选。</td></tr>';
}

function scoreComponent(label, value, description) {
  return `
    <div class="component-row">
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></span>
      ${decisionMetricBar(value, 3)}
      <b class="${safeNumber(value) >= 0 ? "metric-positive" : "metric-negative"}">${fmtScore(value)}</b>
    </div>
  `;
}

async function openDecisionCompany(ticker) {
  state.decisionSelectedTicker = ticker;
  renderDecisionTable();
  const panel = $("#decision-detail");
  panel.innerHTML = '<div class="decision-detail-loading">正在读取事件历史…</div>';
  try {
    const data = await getJson(`/api/decision/company/${encodeURIComponent(ticker)}`);
    const signal = data.current;
    const holding = data.holding;
    panel.innerHTML = `
      <header class="decision-detail-header">
        <div><span>${escapeHtml(signal.sector || "--")} · ${escapeHtml(signal.stage_name || signal.industry || "--")}</span><h3>${escapeHtml(signal.ticker)} <small>${escapeHtml(signal.name || "")}</small></h3></div>
        <span class="decision-state-pill ${decisionSignalClass(signal)}"><i></i>${escapeHtml(decisionStateLabels[signal.signal_state] || signal.signal_state)}</span>
      </header>
      <div class="decision-score-bridge" aria-label="分数桥">
        <div><span>公司</span><strong>${fmtScore(signal.company_score)}</strong></div>
        <i>+</i>
        <div><span>同行</span><strong>${fmtScore((safeNumber(signal.peer_score) || 0) - (safeNumber(signal.company_score) || 0))}</strong></div>
        <i>+</i>
        <div><span>图谱</span><strong>${fmtScore((safeNumber(signal.ontology_score) || 0) - (safeNumber(signal.peer_score) || 0))}</strong></div>
        <i>=</i>
        <div class="final"><span>最终</span><strong>${fmtScore(signal.ontology_score)}</strong></div>
      </div>
      <section class="decision-detail-section">
        <div class="detail-section-title"><span>公司事件</span><small>主信号 100%</small></div>
        ${scoreComponent("经营超预期", signal.operating_surprise, "收入、利润率与经营拐点")}
        ${scoreComponent("现金确认", signal.cash_confirmation, "FCF、OCF 与低应计")}
        ${scoreComponent("持续质量", signal.durable_quality, "ROIC、现金流与利润率稳定性")}
        ${scoreComponent("估值支持", signal.valuation_support, "FCF / 盈利 / 销售收益率")}
        ${scoreComponent("资产负债安全", signal.balance_dilution_safety, "低负债、低稀释、低SBC")}
      </section>
      <section class="decision-detail-section">
        <div class="detail-section-title"><span>Ontology 确认</span><small>不取代公司信号</small></div>
        ${scoreComponent("同行价值捕获", signal.peer_context, `相对 ${signal.stage_peer_count || 0} 家同阶段公司`)}
        ${scoreComponent("上下游图谱", signal.graph_context, `${signal.connected_count || 0} 个连接事件`)}
        <div class="context-facts">
          <span><small>相对阶段捕获</small><b>${fmtScore(signal.value_capture_vs_stage)}</b></span>
          <span><small>阶段改善广度</small><b>${fmtUnsignedPct(signal.stage_breadth)}</b></span>
          <span><small>连接改善广度</small><b>${fmtUnsignedPct(signal.connected_breadth)}</b></span>
          <span><small>建议倍率</small><b>${safeNumber(signal.context_position_multiplier)?.toFixed(2) || "--"}x</b></span>
        </div>
      </section>
      <section class="decision-detail-section execution-proof">
        <div class="detail-section-title"><span>执行证据</span><small>${signal.execution_pit_valid ? "PIT PASS" : "CHECK"}</small></div>
        <dl>
          <div><dt>报告期</dt><dd>${fmtDate(signal.reportperiod)}</dd></div>
          <div><dt>公开日</dt><dd>${fmtDate(signal.information_date)}</dd></div>
          <div><dt>交易日</dt><dd>${fmtDate(signal.trade_date)}</dd></div>
          <div><dt>价格 / ADV</dt><dd>$${safeNumber(signal.prior_close_unadj)?.toFixed(2) || "--"} / ${fmtMoney(signal.prior_adv_60d)}</dd></div>
          <div><dt>市值</dt><dd>${fmtMoney(signal.marketcap)}</dd></div>
          <div><dt>当前组合</dt><dd>${holding ? `${fmtUnsignedPct(holding.weight)} · ${Number(holding.shares).toLocaleString()} 股` : "未持有"}</dd></div>
        </dl>
      </section>
      <section class="decision-detail-section">
        <div class="detail-section-title"><span>历史事件</span><small>最近 ${data.history.length} 期</small></div>
        <div class="event-history-strip">
          ${[...data.history].reverse().map((event) => `<button title="${fmtDate(event.information_date)} · ${decisionStateLabels[event.signal_state] || event.signal_state}" class="${decisionSignalClass(event)}" style="--event-height:${Math.max(12, Math.min(56, 24 + (safeNumber(event.ontology_score) || 0) * 10))}px"></button>`).join("")}
        </div>
      </section>
    `;
  } catch (error) {
    panel.innerHTML = `<div class="decision-detail-empty"><span>载入失败</span><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderDecisionPerformance() {
  const perf = state.decision?.performance?.evaluation;
  if (!perf) return;
  $("#decision-performance").innerHTML = `
    <div><span>CAGR</span><strong class="metric-positive">${fmtUnsignedPct(perf.cagr)}</strong><small>SPY ${fmtUnsignedPct(perf.spy_cagr)}</small></div>
    <div><span>Sharpe</span><strong>${safeNumber(perf.sharpe)?.toFixed(2) || "--"}</strong><small>样本外</small></div>
    <div><span>最大回撤</span><strong class="metric-negative">${fmtPct(perf.max_drawdown)}</strong><small>仍然偏高</small></div>
    <div><span>年换手</span><strong>${safeNumber(perf.annual_turnover)?.toFixed(1) || "--"}x</strong><small>含交易成本</small></div>
  `;
}

function renderDecisionTimeline() {
  const points = state.decision?.timeline || [];
  if (!points.length) return;
  if (state.decisionTimelineIndex === null) state.decisionTimelineIndex = points.length - 1;
  const maxEvents = Math.max(...points.map((point) => Number(point.events || 0)), 1);
  $("#decision-timeline-bars").innerHTML = points.map((point, index) => {
    const height = 10 + Number(point.events || 0) / maxEvents * 42;
    const active = index === state.decisionTimelineIndex ? " active" : "";
    return `<button class="decision-timeline-bar${active}" data-decision-timeline="${index}" style="--timeline-height:${height.toFixed(1)}px" title="${fmtDate(point.month)} · ${point.events} 个事件 · ${point.graph_confirmed} 个图谱确认"></button>`;
  }).join("");
  const years = [...new Set(points.map((point) => String(point.month).slice(0, 4)))];
  $("#decision-timeline-years").innerHTML = years.map((year) => `<span>${year}</span>`).join("");
  const range = $("#decision-timeline-range");
  range.max = String(points.length - 1);
  range.value = String(state.decisionTimelineIndex);
  const selected = points[state.decisionTimelineIndex];
  const latest = state.decisionTimelineIndex === points.length - 1;
  $("#decision-timeline-date").textContent = latest ? `最新 · ${fmtDate(selected.month)}` : `历史 · ${fmtDate(selected.month)}`;
}

async function setDecisionTimeline(index) {
  const points = state.decision?.timeline || [];
  if (!points.length) return;
  const bounded = Math.max(0, Math.min(index, points.length - 1));
  state.decisionTimelineIndex = bounded;
  renderDecisionTimeline();
  if (bounded === points.length - 1) {
    state.decisionSignals = state.decision.current_signals.map((signal) => ({ ...signal }));
    renderDecisionTable();
    return;
  }
  const request = ++state.decisionSnapshotRequest;
  const point = points[bounded];
  $("#decision-table-status").textContent = `正在重建 ${fmtDate(point.month)} 的 PIT 快照…`;
  try {
    const payload = await getJson(`/api/decision/snapshot?as_of=${encodeURIComponent(fmtDate(point.month))}&limit=200`);
    if (request !== state.decisionSnapshotRequest) return;
    state.decisionSignals = payload.signals;
    renderDecisionTable();
  } catch (error) {
    $("#decision-table-status").textContent = `历史快照载入失败：${error.message}`;
  }
}

function renderDecision() {
  renderDecisionStats();
  renderDecisionTape();
  renderDecisionHoldings();
  renderDecisionFilters();
  renderDecisionTable();
  renderDecisionTimeline();
  renderDecisionPerformance();
}

async function runGlobalMarketSearch(query) {
  const panel = $("#global-search-results");
  if (!query.trim()) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const payload = await getJson(`/api/market/search?q=${encodeURIComponent(query.trim())}&limit=12`);
  panel.innerHTML = payload.companies.length ? payload.companies.map((company) => `
    <button data-search-ticker="${escapeHtml(company.ticker)}"><strong>${escapeHtml(company.ticker)}</strong><span>${escapeHtml(company.name)}</span><small>${escapeHtml(company.industry || company.sector || "--")}</small></button>
  `).join("") : '<p>没有匹配公司</p>';
  panel.hidden = false;
  $$('[data-search-ticker]').forEach((button) => button.addEventListener("click", () => {
    panel.hidden = true;
    showMarketCompany(button.dataset.searchTicker);
  }));
}

function fmtSignedMoney(value) {
  const number = safeNumber(value);
  if (number === null) return "--";
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${fmtMoney(Math.abs(number))}`;
}

function strategyDetail() {
  return state.strategyDetails.get(state.strategyId) || null;
}

function strategyPeriod() {
  return strategyDetail()?.periods?.[state.strategyPeriod] || null;
}

function dateValue(value) {
  return new Date(`${fmtDate(value)}T00:00:00Z`).getTime();
}

function selectedStrategyNav() {
  const period = strategyPeriod();
  if (!period) return [];
  const start = state.strategyRangeStart || period.start;
  const end = state.strategyRangeEnd || period.end;
  return period.nav.filter((row) => fmtDate(row.date) >= start && fmtDate(row.date) <= end);
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function rangeMetrics(rows, returnField, navField) {
  if (rows.length < 2) return {};
  const returns = rows.map((row) => safeNumber(row[returnField]) || 0);
  const totalReturn = returns.reduce((value, dailyReturn) => value * (1 + dailyReturn), 1) - 1;
  const years = Math.max((dateValue(rows.at(-1).date) - dateValue(rows[0].date)) / (365.25 * 86400000), 1 / 252);
  const volatility = standardDeviation(returns) * Math.sqrt(252);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const normalized = [1];
  returns.forEach((dailyReturn) => normalized.push(normalized.at(-1) * (1 + dailyReturn)));
  let peak = 1;
  let maxDrawdown = 0;
  normalized.forEach((value) => {
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  });
  return {
    total_return: totalReturn,
    cagr: (1 + totalReturn) ** (1 / years) - 1,
    volatility,
    sharpe: volatility > 0 ? mean * 252 / volatility : null,
    max_drawdown: maxDrawdown,
  };
}

function rangeBeta(rows) {
  const pairs = rows.slice(1).map((row) => [safeNumber(row.daily_return) || 0, safeNumber(row.spy_return) || 0]);
  if (pairs.length < 2) return null;
  const meanStrategy = pairs.reduce((sum, row) => sum + row[0], 0) / pairs.length;
  const meanSpy = pairs.reduce((sum, row) => sum + row[1], 0) / pairs.length;
  const covariance = pairs.reduce((sum, row) => sum + (row[0] - meanStrategy) * (row[1] - meanSpy), 0) / (pairs.length - 1);
  const variance = pairs.reduce((sum, row) => sum + (row[1] - meanSpy) ** 2, 0) / (pairs.length - 1);
  return variance > 0 ? covariance / variance : null;
}

function renderStrategyLibrary() {
  const catalog = state.strategyCatalog;
  if (!catalog) return;
  $("#strategy-asof").textContent = fmtDate(catalog.as_of);
  $("#strategy-library").innerHTML = catalog.strategies.map((strategy) => {
    const metrics = strategy.evaluation || {};
    return `
      <button class="strategy-card ${strategy.id === state.strategyId ? "active" : ""}" data-strategy-id="${escapeHtml(strategy.id)}" style="--strategy-accent:${escapeHtml(strategy.accent)}">
        <span class="strategy-card-top"><i></i><b>${escapeHtml(strategy.type)}</b><small>${escapeHtml(strategy.version)}</small></span>
        <strong>${escapeHtml(strategy.name)}</strong>
        <p>${escapeHtml(strategy.tagline)}</p>
        <span class="strategy-card-metrics">
          <span><small>评估 CAGR</small><b>${fmtPct(metrics.cagr)}</b></span>
          <span><small>Sharpe</small><b>${safeNumber(metrics.sharpe)?.toFixed(2) ?? "--"}</b></span>
          <span><small>最大回撤</small><b>${fmtPct(metrics.max_drawdown)}</b></span>
          <span><small>年换手</small><b>${fmtUnsignedPct(metrics.annual_turnover, 0)}</b></span>
        </span>
        <em>${escapeHtml(strategy.validation_status)}</em>
      </button>`;
  }).join("");
}

function strategyAnnualRows(navRows = selectedStrategyNav()) {
  const grouped = new Map();
  navRows.forEach((row) => {
    const year = Number(fmtDate(row.date).slice(0, 4));
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(row);
  });
  return Array.from(grouped.entries()).map(([year, rows]) => {
    return {
      year,
      strategy_return: rows.reduce((value, row) => value * (1 + (safeNumber(row.daily_return) || 0)), 1) - 1,
      spy_return: rows.reduce((value, row) => value * (1 + (safeNumber(row.spy_return) || 0)), 1) - 1,
    };
  });
}

function renderStrategyMetrics() {
  const rows = selectedStrategyNav();
  const strategy = rangeMetrics(rows, "daily_return", "strategy_nav");
  const spy = rangeMetrics(rows, "spy_return", "spy_nav");
  const beta = rangeBeta(rows);
  const items = [
    ["区间收益", fmtPct(strategy.total_return), `SPY ${fmtPct(spy.total_return)}`],
    ["年化收益", fmtPct(strategy.cagr), `SPY ${fmtPct(spy.cagr)}`],
    ["Sharpe", safeNumber(strategy.sharpe)?.toFixed(2) ?? "--", `SPY ${safeNumber(spy.sharpe)?.toFixed(2) ?? "--"}`],
    ["最大回撤", fmtPct(strategy.max_drawdown), `SPY ${fmtPct(spy.max_drawdown)}`],
    ["年化波动", fmtUnsignedPct(strategy.volatility), `SPY ${fmtUnsignedPct(spy.volatility)}`],
    ["市场 Beta", safeNumber(beta)?.toFixed(2) ?? "--", `CAGR alpha ${fmtPpt((strategy.cagr || 0) - (spy.cagr || 0))}`],
  ];
  $("#strategy-metrics").innerHTML = items.map(([label, value, benchmark]) => `
    <div><span>${label}</span><strong>${value}</strong><small>${benchmark}</small></div>
  `).join("");
}

function svgPath(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ");
}

function renderStrategyNav() {
  const rows = selectedStrategyNav();
  const svg = $("#strategy-nav-chart");
  if (rows.length < 2) {
    svg.innerHTML = "";
    return;
  }
  const width = 1120;
  const height = 360;
  const pad = { left: 58, right: 20, top: 24, bottom: 38 };
  const firstStrategy = safeNumber(rows[0].strategy_nav) || 1;
  const firstSpy = safeNumber(rows[0].spy_nav) || 1;
  const values = rows.flatMap((row) => [
    (safeNumber(row.strategy_nav) || firstStrategy) / firstStrategy,
    (safeNumber(row.spy_nav) || firstSpy) / firstSpy,
  ]);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  const margin = Math.max((maxValue - minValue) * 0.08, 0.04);
  minValue -= margin;
  maxValue += margin;
  const x = (index) => pad.left + index / (rows.length - 1) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (maxValue - value) / (maxValue - minValue) * (height - pad.top - pad.bottom);
  const strategyPoints = rows.map((row, index) => [x(index), y((safeNumber(row.strategy_nav) || firstStrategy) / firstStrategy)]);
  const spyPoints = rows.map((row, index) => [x(index), y((safeNumber(row.spy_nav) || firstSpy) / firstSpy)]);
  const yLines = Array.from({ length: 5 }, (_, index) => minValue + index / 4 * (maxValue - minValue));
  const tickIndexes = Array.from(new Set(Array.from({ length: 6 }, (_, index) => Math.round(index / 5 * (rows.length - 1)))));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    ${yLines.map((value) => `<g><line x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}" class="strategy-grid-line"/><text x="${pad.left - 10}" y="${y(value) + 4}" text-anchor="end" class="strategy-axis-text">${value.toFixed(1)}x</text></g>`).join("")}
    ${tickIndexes.map((index) => `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" class="strategy-axis-text">${fmtDate(rows[index].date).slice(0, 7)}</text>`).join("")}
    <path d="${svgPath(spyPoints)}" class="strategy-spy-path"/>
    <path d="${svgPath(strategyPoints)}" class="strategy-nav-path"/>
    <line id="strategy-crosshair" x1="0" x2="0" y1="${pad.top}" y2="${height - pad.bottom}" class="strategy-crosshair" hidden/>
    <circle id="strategy-dot" cx="0" cy="0" r="5" class="strategy-dot" hidden/>
    <rect x="${pad.left}" y="${pad.top}" width="${width - pad.left - pad.right}" height="${height - pad.top - pad.bottom}" class="strategy-chart-hit"/>
  `;
  const tooltip = $("#strategy-nav-tooltip");
  const showPoint = (event, select = false) => {
    const rect = svg.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / rect.width * width;
    const ratio = Math.max(0, Math.min(1, (localX - pad.left) / (width - pad.left - pad.right)));
    const index = Math.round(ratio * (rows.length - 1));
    const row = rows[index];
    const strategyValue = (safeNumber(row.strategy_nav) || firstStrategy) / firstStrategy;
    const spyValue = (safeNumber(row.spy_nav) || firstSpy) / firstSpy;
    const crosshair = $("#strategy-crosshair");
    const dot = $("#strategy-dot");
    crosshair.hidden = false;
    dot.hidden = false;
    crosshair.setAttribute("x1", x(index));
    crosshair.setAttribute("x2", x(index));
    dot.setAttribute("cx", x(index));
    dot.setAttribute("cy", y(strategyValue));
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(82, Math.max(8, x(index) / width * 100))}%`;
    tooltip.style.top = `${Math.max(8, y(Math.max(strategyValue, spyValue)) / height * 100 - 8)}%`;
    tooltip.innerHTML = `<strong>${fmtDate(row.date)}</strong><span>策略 <b>${strategyValue.toFixed(2)}x</b></span><span>SPY <b>${spyValue.toFixed(2)}x</b></span><small>超额 ${fmtPpt(strategyValue - spyValue)}</small>`;
    if (select) selectStrategySnapshot(row.date);
  };
  svg.onpointermove = (event) => showPoint(event, false);
  svg.onpointerleave = () => {
    tooltip.hidden = true;
    $("#strategy-crosshair").hidden = true;
    $("#strategy-dot").hidden = true;
  };
  svg.onclick = (event) => showPoint(event, true);
}

function renderStrategyAnnualBars() {
  const annual = strategyAnnualRows();
  const maxAbs = Math.max(0.1, ...annual.flatMap((row) => [Math.abs(row.strategy_return), Math.abs(row.spy_return)]));
  $("#strategy-annual-bars").innerHTML = annual.map((row) => `
    <div class="annual-bar-row">
      <strong>${row.year}</strong>
      <div class="annual-bar-track">
        <span class="annual-zero"></span>
        <i class="annual-strategy ${row.strategy_return < 0 ? "negative" : ""}" style="--bar:${Math.abs(row.strategy_return) / maxAbs * 48}%;--side:${row.strategy_return < 0 ? "left" : "right"}"></i>
        <i class="annual-spy ${row.spy_return < 0 ? "negative" : ""}" style="--bar:${Math.abs(row.spy_return) / maxAbs * 48}%;--side:${row.spy_return < 0 ? "left" : "right"}"></i>
      </div>
      <span><b>${fmtPct(row.strategy_return)}</b><small>${fmtPct(row.spy_return)}</small></span>
    </div>
  `).join("");
}

function selectedClosedTrades() {
  const trades = strategyPeriod()?.analytics?.closed_trades || [];
  const start = state.strategyRangeStart || strategyPeriod()?.start;
  const end = state.strategyRangeEnd || strategyPeriod()?.end;
  return trades.filter((row) => fmtDate(row.exit_date) >= start && fmtDate(row.exit_date) <= end);
}

function summarizeTrades(rows) {
  const pnls = rows.map((row) => safeNumber(row.pnl) || 0);
  const winners = pnls.filter((value) => value > 0);
  const losers = pnls.filter((value) => value < 0);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const grossProfit = winners.reduce((sum, value) => sum + value, 0);
  const grossLoss = -losers.reduce((sum, value) => sum + value, 0);
  return {
    count: rows.length,
    win_rate: rows.length ? winners.length / rows.length : null,
    pnl: pnls.reduce((sum, value) => sum + value, 0),
    profit_factor: grossLoss > 0 ? grossProfit / grossLoss : null,
    average_pnl: average(pnls),
    median_pnl: median(pnls),
    average_win: average(winners),
    average_loss: average(losers),
  };
}

function renderStrategyTradeSummary() {
  const detail = strategyDetail();
  if (detail?.closed_trade_analytics_available === false) {
    const summary = detail.execution_summary || {};
    const items = [
      ["调仓快照", Number(summary.rebalances || 0).toLocaleString()],
      ["新进入", Number(summary.buys || 0).toLocaleString()],
      ["退出", Number(summary.sells || 0).toLocaleString()],
      ["最新唯一持仓", Number(summary.latest_unique_holdings || 0).toLocaleString()],
      ["年化换手", fmtUnsignedPct(summary.annual_turnover)],
      ["模型成本", summary.modeled_cost > 0 ? fmtMoney(summary.modeled_cost) : "未计入"],
    ];
    $("#strategy-execution-kicker").textContent = "EXECUTION LOG";
    $("#strategy-execution-title").textContent = "披露驱动调仓";
    $("#strategy-execution-note").textContent = "13F 公开后执行 · 重复只买一次";
    $("#strategy-trade-summary").innerHTML = items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
    $("#strategy-pnl-distribution").innerHTML = "";
    $("#strategy-pnl-distribution").hidden = true;
    return;
  }
  $("#strategy-execution-kicker").textContent = "TRADE OUTCOMES";
  $("#strategy-execution-title").textContent = "已实现交易质量";
  $("#strategy-execution-note").textContent = "FIFO · 含成本";
  $("#strategy-pnl-distribution").hidden = false;
  const trades = selectedClosedTrades();
  const summary = summarizeTrades(trades);
  const items = [
    ["退出笔数", summary.count?.toLocaleString() || "0"],
    ["胜率", fmtUnsignedPct(summary.win_rate)],
    ["Profit factor", safeNumber(summary.profit_factor)?.toFixed(2) ?? "--"],
    ["已实现盈亏", fmtSignedMoney(summary.pnl)],
    ["单笔中位数", fmtSignedMoney(summary.median_pnl)],
    ["平均盈利 / 亏损", `${fmtSignedMoney(summary.average_win)} / ${fmtSignedMoney(summary.average_loss)}`],
  ];
  $("#strategy-trade-summary").innerHTML = items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  const buckets = [
    ["<-25%", -Infinity, -0.25], ["-25~-10%", -0.25, -0.1], ["-10~0%", -0.1, 0],
    ["0~10%", 0, 0.1], ["10~25%", 0.1, 0.25], [">25%", 0.25, Infinity],
  ].map(([label, low, high]) => ({
    label,
    count: trades.filter((row) => (safeNumber(row.pnl_pct) || 0) >= low && (safeNumber(row.pnl_pct) || 0) < high).length,
  }));
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  $("#strategy-pnl-distribution").innerHTML = buckets.map((bucket, index) => `
    <div><i class="${index < 3 ? "loss" : "win"}" style="height:${Math.max(3, bucket.count / maxCount * 70)}px"></i><b>${bucket.count}</b><span>${bucket.label}</span></div>
  `).join("");
}

function renderStrategyYearly() {
  const annual = strategyAnnualRows();
  const trades = selectedClosedTrades();
  $("#strategy-yearly-body").innerHTML = annual.map((annualRow) => {
    const yearTrades = trades.filter((row) => Number(fmtDate(row.exit_date).slice(0, 4)) === annualRow.year);
    const summary = summarizeTrades(yearTrades);
    const tickerPnl = new Map();
    yearTrades.forEach((row) => tickerPnl.set(row.ticker, (tickerPnl.get(row.ticker) || 0) + (safeNumber(row.pnl) || 0)));
    const ranked = Array.from(tickerPnl.entries()).sort((a, b) => b[1] - a[1]);
    const best = ranked[0];
    const worst = ranked.at(-1);
    return `<tr>
      <td><strong>${annualRow.year}</strong></td><td class="${metricClass(annualRow.strategy_return)}">${fmtPct(annualRow.strategy_return)}</td><td>${fmtPct(annualRow.spy_return)}</td>
      <td>${summary.count}</td><td>${fmtUnsignedPct(summary.win_rate)}</td><td class="${metricClass(summary.pnl)}">${fmtSignedMoney(summary.pnl)}</td>
      <td>${fmtSignedMoney(summary.average_pnl)}</td><td class="metric-positive">${fmtSignedMoney(summary.average_win)}</td><td class="metric-negative">${fmtSignedMoney(summary.average_loss)}</td>
      <td>${best ? `<b>${escapeHtml(best[0])}</b><small>${fmtSignedMoney(best[1])}</small>` : "--"}</td>
      <td>${worst ? `<b>${escapeHtml(worst[0])}</b><small>${fmtSignedMoney(worst[1])}</small>` : "--"}</td>
    </tr>`;
  }).join("");
  $("#strategy-trades-body").innerHTML = trades.map((row) => `<tr>
    <td>${fmtDate(row.exit_date)}</td><td><strong>${escapeHtml(row.ticker)}</strong><small>${escapeHtml(row.name || "")}</small></td>
    <td>${escapeHtml(row.selection_source)}</td><td>${Math.round(safeNumber(row.holding_days) || 0)}</td><td>${fmtMoney(row.cost)}</td><td>${fmtMoney(row.proceeds)}</td>
    <td class="${metricClass(row.pnl)}">${fmtSignedMoney(row.pnl)}</td><td class="${metricClass(row.pnl_pct)}">${fmtPct(row.pnl_pct)}</td><td>${escapeHtml(row.exit_reason)}</td>
  </tr>`).join("");
}

function renderStrategyMethodology() {
  const methodology = strategyDetail()?.methodology;
  if (!methodology) return;
  $("#strategy-objective").textContent = methodology.objective;
  $("#strategy-process").innerHTML = methodology.process.map((item, index) => `
    <div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.step)}</strong><p>${escapeHtml(item.detail)}</p></div>
  `).join("");
  $("#strategy-formula").innerHTML = methodology.formula.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.value)}</p></div>`).join("");
  $("#strategy-parameters").innerHTML = methodology.parameters.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.value)}</p></div>`).join("");
  $("#strategy-risks").innerHTML = methodology.risk_controls.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("#strategy-caveats").innerHTML = methodology.caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderStrategyDetail() {
  const detail = strategyDetail();
  const period = strategyPeriod();
  if (!detail || !period) return;
  $("#strategy-type").textContent = `${detail.type} · ${detail.version}`;
  $("#strategy-name").textContent = detail.name;
  $("#strategy-description").textContent = detail.description;
  $("#strategy-validation").textContent = detail.validation_status;
  $("#strategy-analytics-panel").hidden = detail.closed_trade_analytics_available === false;
  $("#strategy-period-tabs").innerHTML = Object.values(detail.periods).map((item) => `
    <button class="${item.id === state.strategyPeriod ? "active" : ""}" data-strategy-period="${escapeHtml(item.id)}"><strong>${escapeHtml(item.label)}</strong><small>${fmtDate(item.start)} 至 ${fmtDate(item.end)}</small></button>
  `).join("");
  $("#strategy-start-date").min = period.start;
  $("#strategy-start-date").max = period.end;
  $("#strategy-start-date").value = state.strategyRangeStart;
  $("#strategy-end-date").min = period.start;
  $("#strategy-end-date").max = period.end;
  $("#strategy-end-date").value = state.strategyRangeEnd;
  renderStrategyMetrics();
  renderStrategyNav();
  renderStrategyAnnualBars();
  renderStrategyTradeSummary();
  renderStrategyYearly();
  renderStrategyMethodology();
}

async function selectStrategySnapshot(selectedDate) {
  const period = strategyPeriod();
  if (!period?.snapshot_dates?.length) return;
  const requested = fmtDate(selectedDate);
  const available = period.snapshot_dates.filter((value) => fmtDate(value) <= requested);
  const snapshotDate = available.at(-1) || period.snapshot_dates[0];
  const requestId = ++state.strategySnapshotRequest;
  $("#strategy-snapshot-loading").hidden = false;
  try {
    const query = new URLSearchParams({ period: state.strategyPeriod, as_of: snapshotDate });
    const snapshot = await getJson(`/api/strategies/${encodeURIComponent(state.strategyId)}/snapshot?${query.toString()}`);
    if (requestId !== state.strategySnapshotRequest) return;
    renderStrategySnapshot(snapshot);
  } finally {
    if (requestId === state.strategySnapshotRequest) $("#strategy-snapshot-loading").hidden = true;
  }
}

function renderStrategySnapshot(snapshot) {
  $("#strategy-snapshot-date").textContent = snapshot.snapshot_date;
  $("#strategy-snapshot-account").innerHTML = `
    <span><small>净值</small><b>${fmtMoney(snapshot.equity)}</b></span>
    <span><small>现金</small><b>${fmtMoney(snapshot.cash)}</b></span>
    <span><small>持仓</small><b>${snapshot.positions_count}</b></span>
    <span><small>总敞口</small><b>${fmtUnsignedPct(snapshot.gross_exposure)}</b></span>
    <span><small>未实现盈亏</small><b class="${metricClass(snapshot.unrealized_pnl)}">${fmtSignedMoney(snapshot.unrealized_pnl)}</b></span>`;
  const actionLabels = { BUY: "买入", ADD: "加仓", TRIM: "减仓", HOLD: "持有" };
  $("#strategy-snapshot-body").innerHTML = snapshot.positions.map((row) => {
    const rank = row.selection_score_label || (safeNumber(row.prediction) !== null
      ? `ML ${fmtScore(row.prediction)} · #${row.core_rank || "--"}`
      : `Ontology ${fmtScore(row.ontology_score)}`);
    return `<tr>
      <td><span class="strategy-action ${String(row.action || "hold").toLowerCase()}">${actionLabels[row.action] || row.action}</span></td>
      <td><strong>${escapeHtml(row.ticker)}</strong><small>${escapeHtml(row.name || "")}</small></td>
      <td>${fmtUnsignedPct(row.weight)}</td><td>${Math.round(safeNumber(row.shares) || 0).toLocaleString()}</td><td>${fmtDate(row.entry_date)}</td>
      <td>${fmtMoney(row.average_cost)}</td><td>${fmtMoney(row.current_price)}</td><td class="${metricClass(row.unrealized_pnl)}"><b>${fmtSignedMoney(row.unrealized_pnl)}</b><small>${fmtPct(row.unrealized_pnl_pct)}</small></td>
      <td><b>${escapeHtml(row.selection_source)}</b><small>${escapeHtml(row.selection_reason)}</small></td><td>${escapeHtml(rank)}</td>
    </tr>`;
  }).join("");
  const activity = snapshot.activity || [];
  $("#strategy-snapshot-activity").innerHTML = activity.length
    ? `<strong>自上次组合快照的变动</strong><div>${activity.map((row) => `<span class="${String(row.side).toLowerCase()}"><b>${escapeHtml(row.side)} ${escapeHtml(row.ticker)}</b><small>${fmtDate(row.date)} · ${Number(row.shares || 0).toLocaleString()} 股 · ${escapeHtml(row.reason || "")}</small></span>`).join("")}</div>`
    : "<strong>自上次组合快照无变动</strong>";
}

function setStrategyPeriod(periodId) {
  const detail = strategyDetail();
  if (!detail?.periods?.[periodId]) return;
  state.strategyPeriod = periodId;
  state.strategyRangeStart = detail.periods[periodId].start;
  state.strategyRangeEnd = detail.periods[periodId].end;
  renderStrategyDetail();
  selectStrategySnapshot(state.strategyRangeEnd);
}

async function loadStrategy(strategyId) {
  state.strategyId = strategyId;
  renderStrategyLibrary();
  let detail = state.strategyDetails.get(strategyId);
  if (!detail) {
    $("#strategy-name").textContent = "载入策略研究档案…";
    detail = await getJson(`/api/strategies/${encodeURIComponent(strategyId)}`);
    state.strategyDetails.set(strategyId, detail);
  }
  const preferredPeriod = detail.periods.evaluation_2018_2026 ? "evaluation_2018_2026" : Object.keys(detail.periods)[0];
  state.strategyPeriod = preferredPeriod;
  state.strategyRangeStart = detail.periods[preferredPeriod].start;
  state.strategyRangeEnd = detail.periods[preferredPeriod].end;
  renderStrategyLibrary();
  renderStrategyDetail();
  await selectStrategySnapshot(state.strategyRangeEnd);
}

function applyStrategyRange() {
  const period = strategyPeriod();
  if (!period) return;
  const start = $("#strategy-start-date").value;
  const end = $("#strategy-end-date").value;
  if (!start || !end || start > end) return;
  state.strategyRangeStart = start < period.start ? period.start : start;
  state.strategyRangeEnd = end > period.end ? period.end : end;
  renderStrategyDetail();
  selectStrategySnapshot(state.strategyRangeEnd);
}

function switchView(view) {
  state.activeView = view;
  $$(".view-tab").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${view}-view`));
  const marketMode = view === "market";
  const decisionMode = view === "decision";
  const strategyMode = view === "strategy";
  $(".app-shell").classList.toggle("market-mode", marketMode);
  $(".app-shell").classList.toggle("decision-mode", decisionMode);
  $(".app-shell").classList.toggle("strategy-mode", strategyMode);
  $(".topbar").classList.toggle("strategy-mode", strategyMode);
  $("#mobile-filter-toggle").hidden = marketMode || decisionMode || strategyMode;
  $$(".ai-only-control").forEach((control) => { control.hidden = marketMode || decisionMode || strategyMode; });
  $("#search-input").closest(".search-box").hidden = strategyMode;
  $("#search-input").placeholder = decisionMode ? "搜索决策信号" : marketMode ? "搜索全市场 ticker 或公司" : "搜索 AI ticker 或公司";
  $("#global-search-results").hidden = true;
  if (strategyMode) {
    $("#data-status").textContent = `策略回测 · 数据截至 ${fmtDate(state.strategyCatalog?.as_of)} · PIT + 公开信息后执行`;
    $("#detail-panel").innerHTML = "";
  } else if (decisionMode) {
    renderDecisionStats();
    $("#detail-panel").innerHTML = "";
  } else if (marketMode) {
    const meta = state.marketHome?.metadata || {};
    $("#data-status").textContent = `本地 Sharadar · 财务截至 ${fmtDate(meta.latest_datekey)} · ${Number(meta.companies || 0).toLocaleString()} 家上市公司`;
    closeDetail();
  } else {
    renderOverview();
  }
  if (view === "ranking") loadRanking();
}

function renderOverview(totals = state.overview.totals, asOf = null) {
  $("#summary-companies").textContent = totals.companies ?? "--";
  $("#summary-surging").textContent = totals.surging ?? "--";
  $("#summary-revenue").textContent = fmtPct(totals.median_revenue_yoy);
  $("#summary-margin").textContent = fmtPpt(totals.median_operating_margin_delta);
  const displayDate = asOf || state.overview.build.as_of || totals.latest_reportperiod || "--";
  const mode = asOf ? "历史 PIT 回放" : "本地 Sharadar";
  if (state.activeView !== "market") {
    $("#data-status").textContent = `${mode} · 财务截至 ${displayDate} · ${totals.companies} 家公司`;
  }
}

function renderLayerFilters() {
  const counts = new Map(state.overview.layers.map((layer) => [layer.id, layer.companies]));
  $("#layer-filters").innerHTML = state.graph.layers.map((layer) => `
    <label>
      <input type="checkbox" value="${layer.id}" checked />
      <span class="layer-swatch" style="background:${layer.color}"></span>
      <span class="layer-filter-name">${layer.short_name}</span>
      <span class="layer-count" data-layer="${layer.id}">${counts.get(layer.id) || 0}</span>
    </label>
  `).join("");
  state.activeLayers = new Set(state.graph.layers.map((layer) => layer.id));
  $("#select-all-layers").textContent = "清空";
  $$("#layer-filters input").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.activeLayers.add(input.value);
    else state.activeLayers.delete(input.value);
    renderGraph();
  }));
}

function updateLayerCounts() {
  const counts = new Map(state.graph.layers.map((layer) => [layer.id, 0]));
  state.graph.companies.forEach((company) => {
    if (!state.asOf || company.reportperiod) {
      counts.set(company.primary_layer, (counts.get(company.primary_layer) || 0) + 1);
    }
  });
  $$(".layer-count").forEach((element) => {
    element.textContent = counts.get(element.dataset.layer) || 0;
  });
}

function visibleCompanies() {
  const query = state.search.trim().toLowerCase();
  return state.graph.companies.filter((company) => {
    if (state.asOf && !company.reportperiod) return false;
    if (!state.activeLayers.has(company.primary_layer)) return false;
    if (!state.activeStates.has(company.signal_state)) return false;
    if (!state.includeDelisted && company.isdelisted === "Y") return false;
    if (query && !company.ticker.toLowerCase().includes(query) && !(company.name || "").toLowerCase().includes(query)) return false;
    return true;
  });
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function addText(parent, text, x, y, attributes = {}) {
  const element = svgElement("text", { x, y, ...attributes });
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function renderGraph() {
  const svg = $("#ontology-graph");
  svg.innerHTML = "";
  const companies = visibleCompanies();
  const layers = state.graph.layers.filter((layer) => state.activeLayers.has(layer.id));
  const byLayer = new Map(layers.map((layer) => [layer.id, []]));
  companies.forEach((company) => byLayer.get(company.primary_layer)?.push(company));
  byLayer.forEach((items) => items.sort((a, b) => (b.heat_score || 0) - (a.heat_score || 0)));

  const left = 68;
  const top = 76;
  const columnWidth = 202;
  const nodeWidth = 174;
  const nodeHeight = 42;
  const rowGap = 11;
  const maxRows = Math.max(1, ...Array.from(byLayer.values()).map((items) => items.length));
  const width = Math.max(980, left * 2 + layers.length * columnWidth);
  const height = Math.max(650, top + 74 + maxRows * (nodeHeight + rowGap) + 50);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.transform = `scale(${state.zoom})`;

  const defs = svgElement("defs");
  const marker = svgElement("marker", { id: "arrow", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth" });
  marker.appendChild(svgElement("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#8e99a5" }));
  defs.appendChild(marker);
  const markerCapital = svgElement("marker", { id: "arrow-capital", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth" });
  markerCapital.appendChild(svgElement("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#c27a13" }));
  defs.appendChild(markerCapital);
  svg.appendChild(defs);

  const layerPositions = new Map();
  layers.forEach((layer, index) => {
    layerPositions.set(layer.id, {
      x: left + index * columnWidth,
      center: left + index * columnWidth + nodeWidth / 2,
    });
  });

  const flowsGroup = svgElement("g", { class: "layer-flow-group" });
  state.graph.layer_flows.forEach((flow) => {
    if (!layerPositions.has(flow.from) || !layerPositions.has(flow.to)) return;
    const productFrom = layerPositions.get(flow.from).center;
    const productTo = layerPositions.get(flow.to).center;
    const startX = state.flowMode === "product" ? productFrom : productTo;
    const endX = state.flowMode === "product" ? productTo : productFrom;
    const startY = 53;
    const endY = 53;
    const lift = 18 + Math.abs(endX - startX) * 0.05;
    const path = svgElement("path", {
      d: `M ${startX} ${startY} C ${startX} ${startY - lift}, ${endX} ${endY - lift}, ${endX} ${endY}`,
      fill: "none",
      stroke: state.flowMode === "product" ? "#8e99a5" : "#c27a13",
      "stroke-width": Math.max(1.2, flow.intensity * 0.48),
      opacity: 0.58,
      "marker-end": `url(#${state.flowMode === "product" ? "arrow" : "arrow-capital"})`,
    });
    const title = svgElement("title");
    title.textContent = `${flow.relation}：${flow.description}`;
    path.appendChild(title);
    flowsGroup.appendChild(path);
  });
  svg.appendChild(flowsGroup);

  const nodePositions = new Map();
  layers.forEach((layer) => {
    const x = layerPositions.get(layer.id).x;
    const header = svgElement("g");
    header.appendChild(svgElement("rect", { x, y: top, width: nodeWidth, height: 48, rx: 4, fill: layer.color }));
    addText(header, layer.short_name, x + 12, top + 21, { fill: "white", "font-size": 13, "font-weight": 700 });
    addText(header, `${byLayer.get(layer.id).length} 家`, x + nodeWidth - 12, top + 21, { fill: "white", "font-size": 10, "text-anchor": "end", opacity: 0.85 });
    addText(header, layer.name, x + 12, top + 38, { fill: "white", "font-size": 9, opacity: 0.78 });
    const headerTitle = svgElement("title");
    headerTitle.textContent = layer.description;
    header.appendChild(headerTitle);
    svg.appendChild(header);

    byLayer.get(layer.id).forEach((company, rowIndex) => {
      const y = top + 62 + rowIndex * (nodeHeight + rowGap);
      nodePositions.set(company.ticker, { x: x + nodeWidth / 2, y: y + nodeHeight / 2 });
      const palette = stateColors[company.signal_state] || stateColors.mixed;
      const group = svgElement("g", { tabindex: 0, role: "button", "data-ticker": company.ticker });
      group.style.cursor = "pointer";
      group.appendChild(svgElement("rect", {
        x, y, width: nodeWidth, height: nodeHeight, rx: 4,
        fill: palette.fill,
        stroke: company.ticker === state.selectedTicker ? "#f7fafc" : palette.stroke,
        "stroke-width": company.ticker === state.selectedTicker ? 2.2 : 1.1,
      }));
      group.appendChild(svgElement("rect", {
        x, y, width: Math.max(3, nodeWidth * Math.min(1, Math.max(0, (company.heat_score || 0) / 100))), height: 3,
        fill: palette.stroke,
      }));
      group.appendChild(svgElement("circle", { cx: x + 12, cy: y + 15, r: 4, fill: palette.stroke }));
      addText(group, company.ticker, x + 21, y + 18, { fill: palette.text, "font-size": 12, "font-weight": 750 });
      const metric = company[state.nodeMetric];
      addText(group, metricFormatter(state.nodeMetric, metric), x + nodeWidth - 9, y + 18, {
        fill: safeNumber(metric) !== null && metric < 0 ? "#ff9c9c" : "#f7fafc",
        "font-size": 10,
        "font-weight": 650,
        "text-anchor": "end",
      });
      const companyName = (company.name || "").replace(/ INC$| CORP$| LTD$| PLC$/g, "");
      addText(group, companyName.slice(0, 22), x + 10, y + 34, { fill: "#aab5c4", "font-size": 8.5 });
      const title = svgElement("title");
      title.textContent = `${company.ticker} · ${metricLabel(state.nodeMetric)} ${metricFormatter(state.nodeMetric, metric)} · ${company.role}`;
      group.appendChild(title);
      group.addEventListener("click", () => selectCompany(company.ticker));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectCompany(company.ticker);
      });
      svg.appendChild(group);
    });
  });

  if (state.showRelations) {
    const relationsGroup = svgElement("g", { class: "company-relations", opacity: 0.68 });
    state.graph.company_relationships.forEach((relation) => {
      const a = nodePositions.get(relation.from);
      const b = nodePositions.get(relation.to);
      if (!a || !b) return;
      if (state.selectedTicker && relation.from !== state.selectedTicker && relation.to !== state.selectedTicker) return;
      const path = svgElement("path", {
        d: `M ${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.38} ${a.y}, ${a.x + (b.x - a.x) * 0.62} ${b.y}, ${b.x} ${b.y}`,
        fill: "none",
        stroke: relation.evidence === "disclosed" ? "#2457a6" : "#7d8793",
        "stroke-width": relation.evidence === "disclosed" ? 1.8 : 1.2,
        "stroke-dasharray": relation.evidence === "disclosed" ? "0" : "5 4",
        "pointer-events": "none",
      });
      relationsGroup.appendChild(path);
    });
    svg.insertBefore(relationsGroup, svg.children[2] || null);
  }

  $("#zoom-reset").textContent = `${Math.round(state.zoom * 100)}%`;
}

function renderRanking(companies) {
  const layers = new Map(state.graph.layers.map((layer) => [layer.id, layer.short_name]));
  $("#ranking-body").innerHTML = companies.map((company) => `
    <tr data-ticker="${company.ticker}">
      <td class="ticker-cell"><strong>${company.ticker}</strong><span>${company.name || ""}</span></td>
      <td>${layers.get(company.primary_layer) || company.primary_layer}</td>
      <td>${safeNumber(company.heat_score) === null ? "--" : Number(company.heat_score).toFixed(0)}</td>
      <td class="${metricClass(company.revenue_yoy)}">${fmtPct(company.revenue_yoy)}</td>
      <td class="${metricClass(company.revenue_acceleration)}">${fmtPpt(company.revenue_acceleration)}</td>
      <td class="${metricClass(company.operating_income_yoy)}">${fmtPct(company.operating_income_yoy)}</td>
      <td class="${metricClass(company.gross_margin_delta_yoy)}">${fmtPpt(company.gross_margin_delta_yoy)}</td>
      <td class="${metricClass(company.operating_margin_delta_yoy)}">${fmtPpt(company.operating_margin_delta_yoy)}</td>
      <td class="${metricClass(company.capex_yoy)}">${fmtPct(company.capex_yoy)}</td>
    </tr>
  `).join("");
  $$("#ranking-body tr").forEach((tr) => tr.addEventListener("click", () => selectCompany(tr.dataset.ticker)));
}

async function loadRanking() {
  const sort = $("#ranking-sort").value;
  if (state.asOf) {
    const field = {
      operating_margin_delta: "operating_margin_delta_yoy",
      gross_margin_delta: "gross_margin_delta_yoy",
      marketcap: "marketcap_usd",
    }[sort] || sort;
    const companies = state.graph.companies
      .filter((company) => company.reportperiod)
      .filter((company) => state.activeLayers.has(company.primary_layer) && state.activeStates.has(company.signal_state))
      .filter((company) => !state.search || company.ticker.toLowerCase().includes(state.search.toLowerCase()) || (company.name || "").toLowerCase().includes(state.search.toLowerCase()))
      .sort((a, b) => (safeNumber(b[field]) ?? -Infinity) - (safeNumber(a[field]) ?? -Infinity));
    renderRanking(companies);
    return;
  }
  const query = new URLSearchParams({ sort, limit: "100" });
  if (state.search) query.set("search", state.search);
  const data = await getJson(`/api/rankings?${query.toString()}`);
  renderRanking(data.companies.filter((company) => state.activeLayers.has(company.primary_layer) && state.activeStates.has(company.signal_state)));
}

function linePath(values, width, height, pad, accessor) {
  const points = values.map(accessor).filter((value) => value !== null && Number.isFinite(value));
  if (!points.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  let started = false;
  return values.map((item, index) => {
    const value = accessor(item);
    if (value === null || !Number.isFinite(value)) return null;
    const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    const command = started ? "L" : "M";
    started = true;
    return `${command} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

function renderMiniChart(container, history, series) {
  const width = 330;
  const height = 150;
  const pad = 25;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, class: "mini-chart" });
  [0.25, 0.5, 0.75].forEach((ratio) => {
    svg.appendChild(svgElement("line", { x1: pad, x2: width - pad, y1: pad + ratio * (height - pad * 2), y2: pad + ratio * (height - pad * 2), stroke: "#273244", "stroke-width": 1 }));
  });
  series.forEach((item) => {
    const path = linePath(history, width, height, pad, (row) => safeNumber(row[item.field]));
    if (path) svg.appendChild(svgElement("path", { d: path, fill: "none", stroke: item.color, "stroke-width": 2 }));
  });
  if (history.length) {
    addText(svg, String(history[0].reportperiod).slice(0, 7), pad, height - 6, { fill: "#aab5c4", "font-size": 9 });
    addText(svg, String(history.at(-1).reportperiod).slice(0, 7), width - pad, height - 6, { fill: "#aab5c4", "font-size": 9, "text-anchor": "end" });
  }
  container.innerHTML = "";
  container.appendChild(svg);
}

async function selectCompany(ticker) {
  state.selectedTicker = ticker;
  renderGraph();
  const panel = $("#detail-panel");
  panel.classList.add("open");
  panel.innerHTML = `<div class="detail-empty"><span>载入 ${ticker}…</span></div>`;
  const query = state.asOf ? `?as_of=${encodeURIComponent(state.asOf)}` : "";
  const data = await getJson(`/api/company/${encodeURIComponent(ticker)}${query}`);
  const company = data.company;
  const flags = company.flags || [];
  const reasons = company.reasons || [];
  panel.innerHTML = `
    <div class="detail-header">
      <button id="detail-close" class="detail-close" title="关闭详情" aria-label="关闭详情">×</button>
      <div class="detail-kicker"><span class="layer-swatch" style="background:${company.layer_color}"></span>${company.layer_name}</div>
      <h2>${company.ticker}</h2>
      <div class="detail-company-name">${company.name || ""}</div>
      <p class="detail-role">${company.role}</p>
      <div class="detail-data-dates">
        <span>报告期 ${fmtDate(company.reportperiod)}</span>
        <span>公开日 ${fmtDate(company.datekey)}</span>
        ${state.asOf ? `<span>形成日 ${fmtDate(state.asOf)}</span>` : ""}
      </div>
      <div class="detail-score">
        <div class="score-number">${safeNumber(company.heat_score) === null ? "--" : Number(company.heat_score).toFixed(0)}<small>财务变化热度 / 100</small></div>
        <div class="score-track"><div class="score-fill" style="width:${company.heat_score || 0}%"></div></div>
      </div>
    </div>
    <section class="detail-section">
      <h3>当前标签</h3>
      <div class="flag-list">${flags.length ? flags.map((flag) => `<span class="flag ${flag.kind}">${flag.label}</span>`).join("") : '<span class="flag">无显著标签</span>'}</div>
    </section>
    <section class="detail-section">
      <h3>为什么发生变化</h3>
      <div class="reason-list">${reasons.map((reason) => `
        <div class="reason-item ${reason.type}"><strong>${reason.title}</strong><p>${reason.text}</p></div>
      `).join("")}</div>
    </section>
    <section class="detail-section">
      <h3>最新 TTM 财务</h3>
      <div class="metric-grid">
        <div class="metric-box"><span>收入</span><strong>${fmtMoney(company.revenue_usd)}</strong></div>
        <div class="metric-box"><span>收入同比</span><strong class="${metricClass(company.revenue_yoy)}">${fmtPct(company.revenue_yoy)}</strong></div>
        <div class="metric-box"><span>营业利润同比</span><strong class="${metricClass(company.operating_income_yoy)}">${fmtPct(company.operating_income_yoy)}</strong></div>
        <div class="metric-box"><span>营业利润率</span><strong>${fmtPct(company.operating_margin)}</strong></div>
        <div class="metric-box"><span>毛利率</span><strong>${fmtPct(company.gross_margin)}</strong></div>
        <div class="metric-box"><span>FCF率</span><strong>${fmtPct(company.fcf_margin)}</strong></div>
        <div class="metric-box"><span>资本开支</span><strong>${fmtMoney(company.capex_usd)}</strong></div>
        <div class="metric-box"><span>资本开支同比</span><strong class="${metricClass(company.capex_yoy)}">${fmtPct(company.capex_yoy)}</strong></div>
      </div>
      <div class="chart-shell"><div class="chart-title">TTM 收入（USD）</div><div id="revenue-chart"></div></div>
      <div class="chart-shell"><div class="chart-title">毛利率 / 营业利润率 / FCF率</div><div id="margin-chart"></div></div>
    </section>
    <section class="detail-section">
      <h3>上下游关系与证据</h3>
      <div>${data.relationships.length ? data.relationships.map((rel) => `
        <div class="relation-item">
          <div class="relation-top"><strong>${rel.from} → ${rel.to}</strong><span class="evidence-badge">${rel.evidence}</span></div>
          <p>${rel.relation}：${rel.description}</p>
          ${rel.source_url ? `<a href="${rel.source_url}" target="_blank" rel="noreferrer">查看官方来源</a>` : ""}
        </div>
      `).join("") : '<p class="detail-role">当前仅有产业层级关系，没有录入公司级披露关系。</p>'}</div>
    </section>
    <section class="detail-section">
      <h3>同层公司</h3>
      <div class="peer-list">${data.peers.map((peer) => `<button class="peer-button" data-ticker="${peer.ticker}">${peer.ticker} · ${Number(peer.heat_score || 0).toFixed(0)}</button>`).join("")}</div>
    </section>
  `;
  renderMiniChart($("#revenue-chart"), data.history, [{ field: "revenue_usd", color: "#2457a6" }]);
  renderMiniChart($("#margin-chart"), data.history, [
    { field: "gross_margin", color: "#14805e" },
    { field: "operating_margin", color: "#3379a8" },
    { field: "fcf_margin", color: "#c27a13" },
  ]);
  $("#detail-close").addEventListener("click", closeDetail);
  $$(".peer-button").forEach((button) => button.addEventListener("click", () => selectCompany(button.dataset.ticker)));
}

function closeDetail() {
  state.selectedTicker = null;
  const panel = $("#detail-panel");
  panel.classList.remove("open");
  panel.innerHTML = `
    <div class="detail-empty">
      <span>选择一家公司</span>
      <p>查看收入、利润、利润率、现金流、资本开支及变化原因。</p>
    </div>
  `;
  renderGraph();
}

function renderMethodology() {
  const definitions = state.methodology.signal_definition;
  $("#methodology-content").innerHTML = `
    <div class="method-card"><h3>财务热度</h3><p>${definitions.heat_score}</p></div>
    <div class="method-card"><h3>爆发状态</h3><p>${definitions.surging}</p></div>
    <div class="method-card"><h3>时点边界</h3><p>${definitions.point_in_time}</p></div>
    <div class="method-card"><h3>历史时间轴</h3><p>${definitions.timeline_replay}</p></div>
    <div class="method-card"><h3>Ontology关系边界</h3><p>${definitions.relationship_caveat}</p></div>
    <div class="method-card"><h3>指标字典</h3><p>${state.methodology.field_notes.map((field) => `${field.label}（${field.unit}）`).join(" · ")}</p></div>
  `;
  $("#source-list").innerHTML = state.methodology.sources.map((source) => `
    <div class="source-item"><a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a><p>${source.publisher} · ${source.use}</p></div>
  `).join("");
}

function timelinePoint(index) {
  return state.timeline?.points?.[index] || null;
}

function renderTimelineTrack() {
  if (!state.timeline) return;
  const points = state.timeline.points;
  const maxSurging = Math.max(1, ...points.map((point) => point.surging || 0));
  $("#timeline-bars").innerHTML = points.map((point, index) => {
    const height = 5 + ((point.surging || 0) / maxSurging) * 25;
    const classes = ["timeline-bar"];
    if (point.new_surges?.length) classes.push("has-new");
    if (index === state.timelineIndex) classes.push("active");
    const reporters = point.reporting_tickers?.length ? `财报：${point.reporting_tickers.join("、")}` : "无新财报";
    return `<button class="${classes.join(" ")}" data-index="${index}" style="--bar-height:${height.toFixed(1)}px" title="${point.as_of} · ${reporters}" aria-label="财报事件日 ${point.as_of}"></button>`;
  }).join("");
  $$(".timeline-bar").forEach((bar) => bar.addEventListener("click", () => {
    stopTimelinePlayback();
    setTimelineIndex(Number(bar.dataset.index));
  }));

  const years = [...new Set(points.map((point) => point.as_of.slice(0, 4)))];
  $("#timeline-years").innerHTML = years.map((year) => `<span>${year}</span>`).join("");
}

function updateTimelineReadout(index, loading = false) {
  const point = timelinePoint(index);
  if (!point) return;
  const isLatest = index === state.timeline.points.length - 1;
  $("#timeline-date").textContent = isLatest ? `最新 · ${point.as_of}` : `财报触发日 · ${point.as_of}`;
  const names = point.new_surges?.length ? ` · 新爆发：${point.new_surges.join("、")}` : " · 无新爆发";
  const reporters = point.reporting_tickers?.length ? ` · 财报：${point.reporting_tickers.join("、")}` : " · 无新财报";
  $("#timeline-status").textContent = loading
    ? `正在重建 ${point.as_of} 的 PIT 财务快照…`
    : `${point.event_count || 0} 份新财报 · ${point.surging} 家处于爆发状态${reporters}${names}`;
}

async function setTimelineIndex(index) {
  if (!state.timeline) return;
  const bounded = Math.max(0, Math.min(index, state.timeline.points.length - 1));
  const point = timelinePoint(bounded);
  state.timelineIndex = bounded;
  $("#timeline-range").value = String(bounded);
  renderTimelineTrack();

  const latestIndex = state.timeline.points.length - 1;
  if (bounded === latestIndex) {
    state.asOf = null;
    state.graph.companies = state.latestCompanies;
    updateLayerCounts();
    renderOverview();
    updateTimelineReadout(bounded);
    renderGraph();
    if ($("#ranking-view").classList.contains("active")) await loadRanking();
    if (state.selectedTicker) await selectCompany(state.selectedTicker);
    return;
  }

  const requestId = ++state.snapshotRequest;
  updateTimelineReadout(bounded, true);
  const payload = await getJson(`/api/snapshot?as_of=${encodeURIComponent(point.as_of)}`);
  if (requestId !== state.snapshotRequest) return;
  state.asOf = point.as_of;
  state.graph.companies = payload.companies;
  updateLayerCounts();
  renderOverview(payload.summary, point.as_of);
  updateTimelineReadout(bounded);
  renderGraph();
  if ($("#ranking-view").classList.contains("active")) await loadRanking();
  if (state.selectedTicker) {
    const selected = payload.companies.find((company) => company.ticker === state.selectedTicker && company.reportperiod);
    if (selected) await selectCompany(state.selectedTicker);
    else closeDetail();
  }
}

function stopTimelinePlayback() {
  state.playing = false;
  $("#timeline-play").textContent = "▶";
  $("#timeline-play").title = "播放历史";
  $("#timeline-play").setAttribute("aria-label", "播放历史");
}

async function toggleTimelinePlayback() {
  if (!state.timeline) return;
  if (state.playing) {
    stopTimelinePlayback();
    return;
  }
  state.playing = true;
  $("#timeline-play").textContent = "■";
  $("#timeline-play").title = "暂停回放";
  $("#timeline-play").setAttribute("aria-label", "暂停回放");
  if (state.timelineIndex >= state.timeline.points.length - 1) state.timelineIndex = -1;
  while (state.playing && state.timelineIndex < state.timeline.points.length - 1) {
    await setTimelineIndex(state.timelineIndex + 1);
    if (!state.playing) break;
    await new Promise((resolve) => setTimeout(resolve, 850));
  }
  stopTimelinePlayback();
}

async function loadTimeline() {
  try {
    state.timeline = await getJson("/api/timeline");
    state.timelineIndex = state.timeline.points.length - 1;
    const range = $("#timeline-range");
    range.max = String(state.timelineIndex);
    range.value = String(state.timelineIndex);
    range.disabled = false;
    $("#timeline-play").disabled = false;
    $("#timeline-latest").disabled = false;
    renderTimelineTrack();
    updateTimelineReadout(state.timelineIndex);
  } catch (error) {
    $("#timeline-date").textContent = "不可用";
    $("#timeline-status").textContent = `时间轴载入失败：${error.message}`;
  }
}

function bindControls() {
  $("#strategy-library").addEventListener("click", (event) => {
    const target = event.target.closest("[data-strategy-id]");
    if (target) loadStrategy(target.dataset.strategyId);
  });
  $("#strategy-period-tabs").addEventListener("click", (event) => {
    const target = event.target.closest("[data-strategy-period]");
    if (target) setStrategyPeriod(target.dataset.strategyPeriod);
  });
  $("#strategy-apply-range").addEventListener("click", applyStrategyRange);
  $("#strategy-reset-range").addEventListener("click", () => {
    const period = strategyPeriod();
    if (!period) return;
    state.strategyRangeStart = period.start;
    state.strategyRangeEnd = period.end;
    renderStrategyDetail();
    selectStrategySnapshot(period.end);
  });
  $("#decision-view").addEventListener("click", (event) => {
    const tickerTarget = event.target.closest("[data-decision-ticker]");
    if (tickerTarget) {
      openDecisionCompany(tickerTarget.dataset.decisionTicker);
      return;
    }
    const stateTarget = event.target.closest("[data-decision-state]");
    if (stateTarget) {
      state.decisionStateFilter = stateTarget.dataset.decisionState;
      renderDecisionFilters();
      renderDecisionTable();
      return;
    }
    const sectorTarget = event.target.closest("[data-decision-sector]");
    if (sectorTarget) {
      state.decisionSectorFilter = sectorTarget.dataset.decisionSector;
      renderDecisionFilters();
      renderDecisionTable();
      return;
    }
    const timelineTarget = event.target.closest("[data-decision-timeline]");
    if (timelineTarget) setDecisionTimeline(Number(timelineTarget.dataset.decisionTimeline));
  });
  $("#decision-search-input").addEventListener("input", (event) => {
    state.decisionSearch = event.target.value;
    renderDecisionTable();
  });
  $("#decision-sort").addEventListener("change", (event) => {
    state.decisionSort = event.target.value;
    renderDecisionTable();
  });
  $("#decision-clear-filters").addEventListener("click", () => {
    state.decisionStateFilter = "all";
    state.decisionSectorFilter = "all";
    state.decisionSearch = "";
    $("#decision-search-input").value = "";
    renderDecisionFilters();
    renderDecisionTable();
  });
  let decisionTimelineTimer;
  $("#decision-timeline-range").addEventListener("input", (event) => {
    const index = Number(event.target.value);
    state.decisionTimelineIndex = index;
    renderDecisionTimeline();
    clearTimeout(decisionTimelineTimer);
    decisionTimelineTimer = setTimeout(() => setDecisionTimeline(index), 140);
  });
  $("#decision-timeline-latest").addEventListener("click", () => {
    const points = state.decision?.timeline || [];
    if (points.length) setDecisionTimeline(points.length - 1);
  });

  let timelineTimer;
  $("#timeline-range").addEventListener("input", (event) => {
    stopTimelinePlayback();
    const index = Number(event.target.value);
    state.timelineIndex = index;
    renderTimelineTrack();
    updateTimelineReadout(index, index !== state.timeline.points.length - 1);
    clearTimeout(timelineTimer);
    timelineTimer = setTimeout(() => setTimelineIndex(index), 140);
  });
  $("#timeline-play").addEventListener("click", toggleTimelinePlayback);
  $("#timeline-latest").addEventListener("click", () => {
    stopTimelinePlayback();
    setTimelineIndex(state.timeline.points.length - 1);
  });

  $("#mobile-filter-toggle").addEventListener("click", (event) => {
    const rail = $("#filter-rail");
    const expanded = rail.classList.toggle("mobile-open");
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.textContent = expanded ? "收起筛选" : "筛选";
  });

  $$(".segment").forEach((button) => button.addEventListener("click", () => {
    state.flowMode = button.dataset.flow;
    $$(".segment").forEach((item) => item.classList.toggle("active", item === button));
    const capital = state.flowMode === "capital";
    $("#flow-title").textContent = capital ? "AI 支出从需求方向供应链上游回流" : "AI 产品能力从上游向下游传导";
    $("#flow-subtitle").textContent = capital ? "箭头表示付款方到供应商的资金方向；不代表数据库测得的合同金额。" : "箭头表示产品、产能与服务进入下一层；点击公司查看财务变化原因。";
    renderGraph();
  }));

  $$(".view-tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));

  $("#market-back").addEventListener("click", closeMarketGroup);
  $("#open-ai-ontology").addEventListener("click", () => switchView("graph"));
  $$(".trend-tab").forEach((button) => button.addEventListener("click", () => {
    state.marketTrendMode = button.dataset.trend;
    $$(".trend-tab").forEach((item) => item.classList.toggle("active", item === button));
    renderMarketTrend();
  }));
  $$(".ontology-flow-tab").forEach((button) => button.addEventListener("click", () => {
    state.marketFlowMode = button.dataset.marketFlow;
    $$(".ontology-flow-tab").forEach((item) => item.classList.toggle("active", item === button));
    renderValueChainOntology();
  }));
  $("#market-node-metric").addEventListener("change", (event) => {
    state.marketNodeMetric = event.target.value;
    renderValueChainOntology();
  });
  let marketTimelineTimer;
  $("#market-timeline-range").addEventListener("input", (event) => {
    stopMarketTimelinePlayback();
    const index = Number(event.target.value);
    state.marketTimelineIndex = index;
    renderMarketTimelineTrack();
    updateMarketTimelineReadout(index, true);
    clearTimeout(marketTimelineTimer);
    marketTimelineTimer = setTimeout(() => setMarketTimelineIndex(index), 140);
  });
  $("#market-timeline-play").addEventListener("click", toggleMarketTimelinePlayback);
  $("#market-timeline-latest").addEventListener("click", () => {
    const points = state.marketDetail?.signal_timeline || [];
    if (!points.length) return;
    stopMarketTimelinePlayback();
    setMarketTimelineIndex(points.length - 1);
  });
  $("#clear-value-chain-filter").addEventListener("click", () => {
    state.marketStage = null;
    $("#clear-value-chain-filter").hidden = true;
    renderValueChainOntology();
    loadMarketCompanies(true);
  });
  $("#clear-industry-filter").addEventListener("click", () => {
    state.marketIndustry = null;
    $("#clear-industry-filter").hidden = true;
    renderIndustryStructure();
    loadMarketCompanies(true);
  });
  $("#market-company-sort").addEventListener("change", () => loadMarketCompanies(true));
  $("#market-load-more").addEventListener("click", () => loadMarketCompanies(false));
  let marketCompanyTimer;
  $("#market-company-search").addEventListener("input", () => {
    clearTimeout(marketCompanyTimer);
    marketCompanyTimer = setTimeout(() => loadMarketCompanies(true), 180);
  });
  $("#market-company-dialog").addEventListener("click", (event) => {
    if (event.target === $("#market-company-dialog")) $("#market-company-dialog").close();
  });

  $("#node-metric").addEventListener("change", (event) => {
    state.nodeMetric = event.target.value;
    renderGraph();
  });
  $("#show-relations").addEventListener("change", (event) => {
    state.showRelations = event.target.checked;
    renderGraph();
  });
  $("#include-delisted").addEventListener("change", (event) => {
    state.includeDelisted = event.target.checked;
    renderGraph();
  });
  $$(".state-filters input").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.activeStates.add(input.value);
    else state.activeStates.delete(input.value);
    renderGraph();
  }));
  $("#select-all-layers").addEventListener("click", () => {
    const allSelected = state.activeLayers.size === state.graph.layers.length;
    state.activeLayers = new Set(allSelected ? [] : state.graph.layers.map((layer) => layer.id));
    $$("#layer-filters input").forEach((input) => { input.checked = !allSelected; });
    $("#select-all-layers").textContent = allSelected ? "全选" : "清空";
    renderGraph();
  });
  let searchTimer;
  $("#search-input").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.search = event.target.value;
      if (state.activeView === "decision") {
        state.decisionSearch = state.search;
        $("#decision-search-input").value = state.search;
        $("#global-search-results").hidden = true;
        renderDecisionTable();
      } else if (state.activeView === "market") {
        await runGlobalMarketSearch(state.search);
      } else {
        $("#global-search-results").hidden = true;
        renderGraph();
        if ($("#ranking-view").classList.contains("active")) await loadRanking();
      }
    }, 120);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) $("#global-search-results").hidden = true;
  });
  $("#ranking-sort").addEventListener("change", loadRanking);
  $("#zoom-in").addEventListener("click", () => { state.zoom = Math.min(1.35, state.zoom + 0.1); renderGraph(); });
  $("#zoom-out").addEventListener("click", () => { state.zoom = Math.max(0.7, state.zoom - 0.1); renderGraph(); });
  $("#zoom-reset").addEventListener("click", () => { state.zoom = 1; renderGraph(); });
}

async function initialize() {
  try {
    [state.strategyCatalog, state.decision, state.marketHome, state.overview, state.graph, state.methodology] = await Promise.all([
      getJson("/api/strategies"),
      getJson("/api/decision/overview"),
      getJson("/api/market/home"),
      getJson("/api/overview"),
      getJson("/api/graph"),
      getJson("/api/methodology"),
    ]);
    state.decisionSignals = state.decision.current_signals.map((signal) => ({ ...signal }));
    state.latestCompanies = state.graph.companies.map((company) => ({ ...company }));
    renderOverview();
    renderMarketHome();
    renderLayerFilters();
    renderMethodology();
    bindControls();
    renderGraph();
    renderDecision();
    renderStrategyLibrary();
    switchView("strategy");
    await loadStrategy(state.strategyCatalog.strategies[0].id);
    $("#loading").classList.add("hidden");
    loadTimeline();
    const groupMatch = location.hash.match(/^#group=(.+)$/);
    if (groupMatch) {
      switchView("market");
      openMarketGroup(decodeURIComponent(groupMatch[1]));
    }
  } catch (error) {
    $("#loading").textContent = `载入失败：${error.message}`;
    console.error(error);
  }
}

initialize();
