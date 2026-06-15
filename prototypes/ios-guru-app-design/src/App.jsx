import {
  Bank,
  CalendarCheck,
  ChartLineUp,
  CheckCircle,
  DotsThree,
  DownloadSimple,
  Eye,
  FileText,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  TrendUp,
  Wallet,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

const directions = [
  {
    id: "terminal",
    name: "Terminal Native",
    cn: "终端原生版",
    intent: "最接近现在 Web 终端，压缩到 iPhone 后仍保持买方工作台密度。",
    accent: "#27d7ae",
    secondary: "#e5b85b",
    avatar: "/guru-avatars/bill-ackman.png",
    manager: "Bill Ackman",
    firm: "Pershing Square Capital Management",
    tag: "13F fund",
    metricA: "$13.71B",
    metricB: "11",
    metricC: "2026 Q1",
  },
  {
    id: "cards",
    name: "Research Cards",
    cn: "研究卡片版",
    intent: "提高移动端可读性，重点让 Guru、信号、拥挤持仓变成可快速扫读的卡片流。",
    accent: "#6be0c0",
    secondary: "#74a7ff",
    avatar: "/guru-avatars/gavin-baker.png",
    manager: "Gavin Baker",
    firm: "Atreides Management",
    tag: "High conviction",
    metricA: "$5.00B",
    metricB: "54",
    metricC: "2026 Q1",
  },
  {
    id: "deep",
    name: "Deep Dive Flow",
    cn: "深挖流程版",
    intent: "从 Guru 持仓一路进入估值和电话会 Q&A，最适合做研究闭环。",
    accent: "#24d3aa",
    secondary: "#f0bf55",
    avatar: "/guru-avatars/stanley-druckenmiller.png",
    manager: "Stanley Druckenmiller",
    firm: "Duquesne Family Office",
    tag: "Macro compounder",
    metricA: "$3.38B",
    metricB: "70",
    metricC: "2026 Q1",
  },
];

const screenshotPlan = [
  ["Guru manager cockpit", "经理卡片、三模块、模拟入口"],
  ["Portfolio vs SPY", "长历史模拟、range scrubber、长按 tooltip"],
  ["New buys / exits", "新买入/卖出列表和买入区间"],
  ["Valuation detail", "估值曲线、季度研究卡、Q&A"],
  ["Portfolio cockpit", "IBKR/Yodlee、NAV、持仓饼图"],
  ["Dividend calendar", "2025/2026 对比、月历、股息组成"],
];

const holdings = [
  ["QSR", "Restaurant Brands", "$1.60B", "11.7%"],
  ["HLT", "Hilton Worldwide", "$1.33B", "9.7%"],
  ["CMG", "Chipotle", "$1.21B", "8.8%"],
];

const signals = [
  ["AUR", "Reid Hoffman", "卖出", "$7.9M", "sell"],
  ["HAS", "Tiger Global", "新买入", "$4.3M", "buy"],
  ["PANW", "ARK Invest", "增持", "$3.1M", "buy"],
];

function cls(...items) {
  return items.filter(Boolean).join(" ");
}

export function App() {
  const [activeId, setActiveId] = useState("terminal");
  const active = useMemo(
    () => directions.find((item) => item.id === activeId) ?? directions[0],
    [activeId],
  );

  return (
    <main className="page">
      <section className="hero">
        <div className="brand">
          <div className="giMark" aria-label="Guru Intelligence app icon">GI</div>
          <div>
            <p>iOS Product Design Pack</p>
            <h1>Guru Intelligence</h1>
          </div>
        </div>
        <div className="heroCopy">
          <span className="pill">Guru 研究优先</span>
          <h2>把桌面买方终端压成 iPhone 上真正能用的研究 cockpit。</h2>
          <p>
            三套方向都沿用现有深色终端、真实头像素材、mint/amber/blue
            数据语义，并为 App Store 截图和未来 Flutter iOS 实现留好结构。
          </p>
        </div>
        <div className="statusCard">
          <ShieldCheck size={24} weight="fill" />
          <div>
            <strong>App Store ready path</strong>
            <span>Apple login · account deletion · privacy label · reviewer demo</span>
          </div>
        </div>
      </section>

      <nav className="directionNav" aria-label="Design directions">
        {directions.map((item) => (
          <button
            key={item.id}
            data-testid={`direction-${item.id}`}
            className={cls("directionButton", item.id === active.id && "active")}
            onClick={() => setActiveId(item.id)}
            style={{ "--accent": item.accent }}
          >
            <span>{item.name}</span>
            <strong>{item.cn}</strong>
          </button>
        ))}
      </nav>

      <section className="directionIntro">
        <div>
          <p>{active.name}</p>
          <h2>{active.cn}</h2>
        </div>
        <span>{active.intent}</span>
      </section>

      <section className="phones" style={{ "--accent": active.accent, "--secondary": active.secondary }}>
        <PhoneFrame title="Guru" subtitle="Manager cockpit">
          <GuruScreen active={active} />
        </PhoneFrame>
        <PhoneFrame title="Valuation" subtitle="Quarterly model book">
          <ValuationScreen active={active} />
        </PhoneFrame>
        <PhoneFrame title="Portfolio" subtitle="Holdings + dividends">
          <PortfolioScreen active={active} />
        </PhoneFrame>
      </section>

      <section className="assetBoard">
        <div className="assetHeader">
          <div>
            <p>App Store Screenshot Storyboard</p>
            <h2>第一版素材包清单</h2>
          </div>
          <span>6.9-inch portrait · 1320x2868 / 1290x2796</span>
        </div>
        <div className="shotGrid">
          {screenshotPlan.map(([title, detail], index) => (
            <article key={title} className="shotCard">
              <span>0{index + 1}</span>
              <strong>{title}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function PhoneFrame({ title, subtitle, children }) {
  return (
    <article className="phoneShell">
      <div className="phoneTop">
        <span>9:41</span>
        <div className="sensor" />
        <span>5G</span>
      </div>
      <div className="phoneHeader">
        <div>
          <p>{title}</p>
          <h3>{subtitle}</h3>
        </div>
        <button aria-label="More options">
          <DotsThree size={20} weight="bold" />
        </button>
      </div>
      <div className="phoneBody">{children}</div>
      <TabBar active={title} />
    </article>
  );
}

function GuruScreen({ active }) {
  return (
    <>
      <div className="search">
        <MagnifyingGlass size={18} weight="bold" />
        <span>Search guru / firm / ticker</span>
      </div>
      <div className="chipRow">
        <span className="activeChip">All</span>
        <span>13F</span>
        <span>Form 4</span>
      </div>
      <section className="managerHero">
        <img src={active.avatar} alt={`${active.manager} generated portrait`} />
        <div>
          <span className="smallPill">{active.tag}</span>
          <h2>{active.manager}</h2>
          <p>{active.firm}</p>
        </div>
      </section>
      <section className="metricGrid">
        <Metric label="AUM" value={active.metricA} />
        <Metric label="Holdings" value={active.metricB} />
        <Metric label="Latest" value={active.metricC} />
      </section>
      <section className="moduleTabs">
        <button className="selected">
          <ChartLineUp size={18} weight="bold" />
          模拟
        </button>
        <button>新买入/卖出</button>
        <button>季度贡献</button>
      </section>
      <ChartCard />
      <section className="tableMini">
        <div className="sectionLine">
          <strong>最新持仓</strong>
          <span>View all</span>
        </div>
        {holdings.map((row) => (
          <div className="holdingRow" key={row[0]}>
            <b>{row[0]}</b>
            <span>{row[1]}</span>
            <strong>{row[2]}</strong>
          </div>
        ))}
      </section>
    </>
  );
}

function ValuationScreen() {
  return (
    <>
      <section className="tickerHeader">
        <span className="tickerBadge">NOW</span>
        <div>
          <h2>ServiceNow</h2>
          <p>Enterprise Software / Workflow Automation</p>
        </div>
      </section>
      <section className="metricGrid two">
        <Metric label="Price" value="$136" />
        <Metric label="Fair value" value="$149" />
        <Metric label="Upside" value="+9.0%" tone="good" />
        <Metric label="3Y target" value="$220" />
      </section>
      <section className="valuationChart">
        <svg viewBox="0 0 320 172" role="img" aria-label="Fair value and price chart">
          <path className="grid" d="M8 32H312M8 88H312M8 144H312" />
          <path className="daily" d="M10 148 C40 142, 58 150, 82 134 S128 122, 150 126 S190 90, 212 72 S246 22, 274 66 S292 86, 312 72" />
          <path className="quarter" d="M12 148 L58 142 L96 130 L132 145 L166 132 L202 84 L232 24 L260 66 L300 60" />
          <path className="fair" d="M12 144 L64 138 L102 126 L146 130 L190 118 L224 82 L252 58 L300 54" />
          <circle className="selectedDot" cx="252" cy="58" r="7" />
        </svg>
        <div className="legend">
          <span><i className="mint" />Fair value</span>
          <span><i className="amber" />Quarter price</span>
          <span><i className="slate" />Daily price</span>
        </div>
      </section>
      <section className="quarterBook">
        <div className="sectionLine">
          <strong>季度研究卡</strong>
          <span>22 quarters</span>
        </div>
        <div className="quarterScroller">
          <article className="quarterCard active">
            <b>FY2026 Q1</b>
            <span>2026/04/23</span>
            <strong>$149</strong>
          </article>
          <article className="quarterCard">
            <b>FY2025 Q4</b>
            <span>2026/01/29</span>
            <strong>$203</strong>
          </article>
        </div>
      </section>
      <section className="qaList">
        <div className="sectionLine">
          <strong>电话会 Q&A</strong>
          <span>中文 · English</span>
        </div>
        <article className="qaItem open">
          <b>Q1</b>
          <p>How should investors think about AI monetization this quarter?</p>
        </article>
        <article className="qaItem">
          <b>Q2</b>
          <p>What changed in federal demand and RPO timing?</p>
        </article>
      </section>
    </>
  );
}

function PortfolioScreen() {
  return (
    <>
      <section className="portfolioHero">
        <Wallet size={24} weight="fill" />
        <div>
          <p>Portfolio cockpit</p>
          <h2>$428.8K</h2>
          <span>IBKR / Yodlee synced</span>
        </div>
      </section>
      <section className="metricGrid two">
        <Metric label="Day P/L" value="$0" />
        <Metric label="Unrealized" value="-$10.7K" tone="bad" />
        <Metric label="Cash" value="-$11.7K" />
        <Metric label="Top weight" value="25.1%" />
      </section>
      <section className="navChart">
        <div className="sectionLine">
          <strong>组合净值走势</strong>
          <span>real NAV</span>
        </div>
        <svg viewBox="0 0 320 110" role="img" aria-label="Portfolio NAV chart">
          <path className="grid" d="M6 26H314M6 64H314M6 102H314" />
          <path className="fair" d="M8 94 C44 76, 72 82, 104 68 S168 62, 198 44 S252 22, 312 18" />
        </svg>
      </section>
      <section className="holdingMix">
        <div>
          <span className="donut" />
          <strong>持仓饼图</strong>
        </div>
        <div className="mixRows">
          <span><b>AAPL</b><i style={{ width: "82%" }} /></span>
          <span><b>MSFT</b><i style={{ width: "56%" }} /></span>
          <span><b>V</b><i style={{ width: "34%" }} /></span>
        </div>
      </section>
      <section className="dividendCard">
        <div className="sectionLine">
          <strong>Dividend calendar</strong>
          <span>2025 · 2026 · ahead</span>
        </div>
        <div className="dividendBars">
          {[22, 4, 45, 18, 72, 7, 55].map((height, index) => (
            <span key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className="calendarMini">
          <CalendarCheck size={18} weight="fill" />
          <span>Aug 20 · MSFT · $117.45</span>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, tone }) {
  return (
    <article className={cls("metric", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ChartCard() {
  return (
    <section className="chartCard">
      <div className="rangeRow">
        {["1Y", "3Y", "5Y", "10Y", "All"].map((range) => (
          <span key={range} className={range === "All" ? "on" : ""}>{range}</span>
        ))}
      </div>
      <svg viewBox="0 0 320 156" role="img" aria-label="Portfolio vs SPY chart">
        <path className="grid" d="M8 28H312M8 78H312M8 128H312" />
        <path className="quarter" d="M10 124 C52 116, 78 126, 110 104 S154 90, 182 80 S222 64, 248 58 S286 42, 312 34" />
        <path className="fair" d="M10 126 C42 132, 82 122, 118 104 S156 112, 184 72 S224 42, 250 68 S282 30, 312 18" />
        <line className="cursor" x1="230" x2="230" y1="20" y2="134" />
        <circle className="selectedDot" cx="230" cy="53" r="7" />
      </svg>
      <div className="tooltipCard">
        <b>2021/11/23</b>
        <span>Portfolio 210.4%</span>
        <span>SPY 72.1%</span>
      </div>
    </section>
  );
}

function TabBar({ active }) {
  const items = [
    ["Guru", Sparkle],
    ["DBMF", Bank],
    ["Valuation", TrendUp],
    ["Portfolio", SquaresFour],
  ];
  return (
    <nav className="tabBar" aria-label="App tabs">
      {items.map(([label, Icon]) => (
        <span key={label} className={label === active ? "selected" : ""}>
          <Icon size={17} weight={label === active ? "fill" : "bold"} />
          {label}
        </span>
      ))}
    </nav>
  );
}
