import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require(
    process.env.SHARP_MODULE ||
      '/Users/yudonglu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp',
  );
}

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'docs/brand/2026-08-30');
const output = path.join(outputDir, 'guru-top3-consensus-1600x900.png');
const englishOutput = path.join(
  outputDir,
  'guru-top3-consensus-en-1600x900.png',
);
const englishCurveOutput = path.join(
  outputDir,
  'guru-top3-consensus-en-curve-1600x900.png',
);
const manifestOutput = path.join(
  outputDir,
  'guru-top3-consensus-manifest.json',
);
const backgroundSource =
  process.env.GURU_SOCIAL_BACKGROUND ||
  path.join(
    root,
    'docs/brand/2026-08-30/guru-top3-consensus-background.png',
  );
const curveDataSource = path.join(
  outputDir,
  'guru-top3-consensus-equity-daily.json',
);

const assets = {
  mark: path.join(root, 'assets/branding/thesisforge-mark.png'),
  gavin: path.join(root, 'web/guru-avatars/gavin-baker.png'),
  bill: path.join(root, 'web/guru-avatars/bill-ackman.png'),
  stanley: path.join(root, 'web/guru-avatars/stanley-druckenmiller.png'),
};

const colors = {
  ink: '#0B111D',
  panel: '#111827',
  panel2: '#141E2D',
  line: '#263248',
  mint: '#22D3A6',
  mintSoft: '#123F3A',
  amber: '#E0B15A',
  amberSoft: '#3A2F20',
  red: '#FF7B7B',
  redSoft: '#3A2027',
  text: '#F8FAFC',
  muted: '#A8B2C4',
  subdued: '#718096',
};

const strategy = {
  id: 'guru-top3-consensus',
  name: 'Guru Top 3 Consensus',
  backtestPeriod: ['2020-02-14', '2026-08-27'],
  totalReturn: 475.46,
  spyTotalReturn: 128.41,
  cagr: 30.72,
  spyCagr: 13.48,
  sharpe: 1.05,
  maxDrawdown: -41.14,
  latestRebalance: '2026-08-14',
  managers: [
    {
      name: 'Gavin Baker',
      role: 'Atreides Management',
      avatar: assets.gavin,
      tickers: ['MU', 'ALAB', 'CIEN'],
    },
    {
      name: 'Bill Ackman',
      role: 'Pershing Square',
      avatar: assets.bill,
      tickers: ['UBER', 'BN', 'MSFT'],
    },
    {
      name: 'Stanley Druckenmiller',
      role: 'Duquesne Family Office',
      avatar: assets.stanley,
      tickers: ['NTRA', 'TSM', 'STM'],
    },
  ],
  latestBuys: ['MU', 'MSFT', 'STM'],
  latestSells: ['U', 'AMZN', 'INSM'],
};

await mkdir(outputDir, { recursive: true });

function svgBuffer(svg) {
  return Buffer.from(svg);
}

function pill(x, y, width, label, tone = 'neutral') {
  const palette = {
    neutral: [colors.panel2, colors.line, colors.text],
    mint: [colors.mintSoft, '#28675D', colors.mint],
    amber: [colors.amberSoft, '#6A5430', colors.amber],
    red: [colors.redSoft, '#6B3440', colors.red],
  }[tone];
  return `
    <rect x="${x}" y="${y}" width="${width}" height="42" rx="10" fill="${palette[0]}" stroke="${palette[1]}"/>
    <text x="${x + width / 2}" y="${y + 27}" text-anchor="middle" class="ticker" fill="${palette[2]}">${label}</text>
  `;
}

function managerCard(manager, index) {
  const y = 224 + index * 132;
  const x = 756;
  const tickerStart = 1112;
  return `
    <rect x="${x}" y="${y}" width="718" height="112" rx="18" fill="${colors.panel2}" stroke="${colors.line}"/>
    <circle cx="812" cy="${y + 56}" r="42" fill="#0E1624" stroke="${index === 1 ? colors.amber : colors.mint}" stroke-width="2"/>
    <text x="870" y="${y + 46}" class="manager">${manager.name}</text>
    <text x="870" y="${y + 72}" class="role">${manager.role}</text>
    ${manager.tickers
      .map((ticker, tickerIndex) =>
        pill(tickerStart + tickerIndex * 112, y + 35, 94, ticker),
      )
      .join('')}
  `;
}

async function circularAvatar(source, size = 76) {
  const radius = size / 2;
  const mask = svgBuffer(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/></svg>`,
  );
  return sharp(source)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

const [mark, gavinAvatar, billAvatar, stanleyAvatar] = await Promise.all([
  sharp(assets.mark).resize(58, 58, { fit: 'contain' }).png().toBuffer(),
  circularAvatar(assets.gavin),
  circularAvatar(assets.bill),
  circularAvatar(assets.stanley),
]);
const [gavinAvatarSmall, billAvatarSmall, stanleyAvatarSmall] =
  await Promise.all([
    circularAvatar(assets.gavin, 46),
    circularAvatar(assets.bill, 46),
    circularAvatar(assets.stanley, 46),
  ]);

const curveData = JSON.parse(await readFile(curveDataSource, 'utf8'));
const curvePoints = curveData.series.map(([date, guru, spy]) => ({
  date,
  guru,
  spy,
}));

const curveChart = {
  x: 130,
  y: 426,
  width: 930,
  height: 286,
  min: 0.5,
  max: 6.15,
};
const curveStartMs = Date.parse(`${curvePoints[0].date}T00:00:00Z`);
const curveEndMs = Date.parse(`${curvePoints.at(-1).date}T00:00:00Z`);

function curveCoordinates(point, field) {
  const time = Date.parse(`${point.date}T00:00:00Z`);
  const x =
    curveChart.x +
    ((time - curveStartMs) / (curveEndMs - curveStartMs)) * curveChart.width;
  const y =
    curveChart.y +
    ((curveChart.max - point[field]) / (curveChart.max - curveChart.min)) *
      curveChart.height;
  return [x, y];
}

function curvePath(field) {
  return curvePoints
    .map((point, index) => {
      const [x, y] = curveCoordinates(point, field);
      return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

const guruCurvePath = curvePath('guru');
const spyCurvePath = curvePath('spy');
const [guruEndX, guruEndY] = curveCoordinates(curvePoints.at(-1), 'guru');
const [spyEndX, spyEndY] = curveCoordinates(curvePoints.at(-1), 'spy');
const guruAreaPath = `${guruCurvePath} L${guruEndX.toFixed(2)} ${(curveChart.y + curveChart.height).toFixed(2)} L${curveChart.x} ${(curveChart.y + curveChart.height).toFixed(2)} Z`;

let runningPeak = curvePoints[0];
let drawdownPeak = curvePoints[0];
let drawdownTrough = curvePoints[0];
let worstDrawdown = 0;
curvePoints.forEach((point) => {
  if (point.guru > runningPeak.guru) runningPeak = point;
  const drawdown = point.guru / runningPeak.guru - 1;
  if (drawdown < worstDrawdown) {
    worstDrawdown = drawdown;
    drawdownPeak = runningPeak;
    drawdownTrough = point;
  }
});
const [drawdownX, drawdownY] = curveCoordinates(drawdownTrough, 'guru');

function xForDate(date) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return (
    curveChart.x +
    ((time - curveStartMs) / (curveEndMs - curveStartMs)) * curveChart.width
  );
}

function yForValue(value) {
  return (
    curveChart.y +
    ((curveChart.max - value) / (curveChart.max - curveChart.min)) *
      curveChart.height
  );
}

const fontStack = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif`;
const layout = svgBuffer(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <style>
      text { font-family: ${fontStack}; }
      .brand { font-size: 25px; font-weight: 800; fill: ${colors.text}; letter-spacing: .8px; }
      .meta { font-size: 17px; font-weight: 650; fill: ${colors.muted}; letter-spacing: .3px; }
      .eyebrow { font-size: 20px; font-weight: 750; fill: ${colors.mint}; letter-spacing: 1.2px; }
      .headline { font-size: 49px; font-weight: 800; fill: ${colors.text}; letter-spacing: -.5px; }
      .body { font-size: 21px; font-weight: 520; fill: ${colors.muted}; }
      .step { font-size: 18px; font-weight: 720; fill: ${colors.text}; }
      .stepNo { font-size: 14px; font-weight: 800; fill: ${colors.ink}; }
      .kpiHero { font-size: 67px; font-weight: 820; fill: ${colors.mint}; letter-spacing: -2px; }
      .kpiBenchmark { font-size: 34px; font-weight: 800; fill: ${colors.amber}; letter-spacing: -.5px; }
      .label { font-size: 16px; font-weight: 680; fill: ${colors.muted}; letter-spacing: .2px; }
      .stat { font-size: 28px; font-weight: 800; fill: ${colors.text}; }
      .statRisk { font-size: 28px; font-weight: 800; fill: ${colors.red}; }
      .section { font-size: 25px; font-weight: 800; fill: ${colors.text}; }
      .manager { font-size: 22px; font-weight: 780; fill: ${colors.text}; }
      .role { font-size: 14px; font-weight: 560; fill: ${colors.muted}; }
      .ticker { font-size: 18px; font-weight: 800; }
      .change { font-size: 16px; font-weight: 750; }
      .fine { font-size: 14px; font-weight: 550; fill: ${colors.muted}; }
      .fineStrong { font-size: 14px; font-weight: 700; fill: ${colors.text}; }
      .url { font-size: 16px; font-weight: 750; fill: ${colors.text}; }
    </style>

    <rect width="1600" height="900" fill="#06101B" fill-opacity=".62"/>
    <rect x="52" y="44" width="1496" height="812" rx="30" fill="#0B111D" fill-opacity=".94" stroke="${colors.line}" stroke-width="1.5"/>
    <rect x="52" y="44" width="8" height="812" rx="4" fill="${colors.mint}"/>
    <path d="M88 158H1512" stroke="${colors.line}" stroke-width="1"/>
    <path d="M712 184V784" stroke="${colors.line}" stroke-width="1"/>

    <text x="156" y="104" class="brand">THESISFORGE</text>
    <text x="1472" y="104" text-anchor="end" class="meta">GURU STRATEGY · DATA CUT 2026.08.27</text>

    <text x="104" y="210" class="eyebrow">公开披露 · 低频跟踪 · 去重等权</text>
    <text x="104" y="272" class="headline">一个普通投资者也能</text>
    <text x="104" y="330" class="headline">理解与复核的策略</text>
    <text x="104" y="372" class="body">三位 Guru，各取公开 13F 市值 Top 3</text>

    <circle cx="117" cy="425" r="15" fill="${colors.mint}"/>
    <text x="117" y="430" text-anchor="middle" class="stepNo">1</text>
    <text x="143" y="431" class="step">等披露</text>
    <path d="M226 425H254" stroke="${colors.line}" stroke-width="2"/>
    <circle cx="272" cy="425" r="15" fill="${colors.mint}"/>
    <text x="272" y="430" text-anchor="middle" class="stepNo">2</text>
    <text x="298" y="431" class="step">取 Top 3</text>
    <path d="M400 425H428" stroke="${colors.line}" stroke-width="2"/>
    <circle cx="446" cy="425" r="15" fill="${colors.mint}"/>
    <text x="446" y="430" text-anchor="middle" class="stepNo">3</text>
    <text x="472" y="431" class="step">去重等权</text>

    <rect x="104" y="468" width="568" height="200" rx="20" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="132" y="510" class="label">价格回测累计收益 · 2020.02.14—2026.08.27</text>
    <text x="132" y="579" class="kpiHero">+475.5%</text>
    <text x="132" y="612" class="label">GURU TOP 3</text>
    <text x="638" y="564" text-anchor="end" class="kpiBenchmark">+128.4%</text>
    <text x="638" y="594" text-anchor="end" class="label">SPY</text>
    <rect x="132" y="632" width="506" height="8" rx="4" fill="#1E293B"/>
    <rect x="132" y="632" width="506" height="8" rx="4" fill="${colors.mint}"/>
    <rect x="132" y="650" width="136" height="6" rx="3" fill="${colors.amber}"/>

    <rect x="104" y="688" width="174" height="90" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="124" y="720" class="label">年化回报</text>
    <text x="124" y="755" class="stat">30.7%</text>
    <rect x="293" y="688" width="174" height="90" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="313" y="720" class="label">最大回撤</text>
    <text x="313" y="755" class="statRisk">−41.1%</text>
    <rect x="482" y="688" width="190" height="90" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="502" y="720" class="label">Sharpe</text>
    <text x="502" y="755" class="stat">1.05</text>

    <text x="756" y="196" class="section">当前组合</text>
    <text x="1474" y="196" text-anchor="end" class="meta">2026.08.14 再平衡 · 9 只 · 每只约 11.1%</text>
    ${strategy.managers.map(managerCard).join('')}

    <rect x="756" y="628" width="718" height="76" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="780" y="661" class="change" fill="${colors.mint}">最新新增</text>
    ${pill(878, 645, 74, 'MU', 'mint')}
    ${pill(964, 645, 86, 'MSFT', 'mint')}
    ${pill(1062, 645, 74, 'STM', 'mint')}
    <text x="1172" y="661" class="change" fill="${colors.red}">移出</text>
    ${pill(1220, 645, 64, 'U', 'red')}
    ${pill(1296, 645, 78, 'AMZN', 'red')}
    ${pill(1386, 645, 72, 'INSM', 'red')}

    <rect x="756" y="724" width="718" height="54" rx="14" fill="#1A1820" stroke="#4D3E2F"/>
    <circle cx="782" cy="751" r="6" fill="${colors.amber}"/>
    <text x="800" y="756" class="fineStrong">简单不等于低风险：</text>
    <text x="930" y="756" class="fine">13F 最长滞后 45 天，组合集中且历史最大回撤为 −41.1%</text>

    <path d="M104 808H1474" stroke="${colors.line}" stroke-width="1"/>
    <text x="104" y="833" class="fine">回测未计佣金、税费与滑点；13F 不含空头、现金及季度内交易。研究用途，不构成投资建议。</text>
    <circle cx="1308" cy="828" r="5" fill="${colors.mint}"/>
    <text x="1322" y="833" class="url">thesisforge.tech</text>
  </svg>
`);

const englishLayout = svgBuffer(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <style>
      text { font-family: ${fontStack}; }
      .brand { font-size: 25px; font-weight: 800; fill: ${colors.text}; letter-spacing: .8px; }
      .meta { font-size: 16px; font-weight: 650; fill: ${colors.muted}; letter-spacing: .3px; }
      .eyebrow { font-size: 18px; font-weight: 750; fill: ${colors.mint}; letter-spacing: 1.1px; }
      .headline { font-size: 49px; font-weight: 800; fill: ${colors.text}; letter-spacing: -.5px; }
      .body { font-size: 21px; font-weight: 520; fill: ${colors.muted}; }
      .step { font-size: 16px; font-weight: 720; fill: ${colors.text}; }
      .stepNo { font-size: 14px; font-weight: 800; fill: ${colors.ink}; }
      .kpiHero { font-size: 67px; font-weight: 820; fill: ${colors.mint}; letter-spacing: -2px; }
      .kpiBenchmark { font-size: 34px; font-weight: 800; fill: ${colors.amber}; letter-spacing: -.5px; }
      .label { font-size: 15px; font-weight: 680; fill: ${colors.muted}; letter-spacing: .2px; }
      .stat { font-size: 28px; font-weight: 800; fill: ${colors.text}; }
      .statRisk { font-size: 28px; font-weight: 800; fill: ${colors.red}; }
      .section { font-size: 25px; font-weight: 800; fill: ${colors.text}; }
      .manager { font-size: 22px; font-weight: 780; fill: ${colors.text}; }
      .role { font-size: 14px; font-weight: 560; fill: ${colors.muted}; }
      .ticker { font-size: 18px; font-weight: 800; }
      .change { font-size: 14px; font-weight: 780; letter-spacing: .4px; }
      .fine { font-size: 13px; font-weight: 550; fill: ${colors.muted}; }
      .fineStrong { font-size: 13px; font-weight: 720; fill: ${colors.text}; }
      .url { font-size: 16px; font-weight: 750; fill: ${colors.text}; }
    </style>

    <rect width="1600" height="900" fill="#06101B" fill-opacity=".62"/>
    <rect x="52" y="44" width="1496" height="812" rx="30" fill="#0B111D" fill-opacity=".94" stroke="${colors.line}" stroke-width="1.5"/>
    <rect x="52" y="44" width="8" height="812" rx="4" fill="${colors.mint}"/>
    <path d="M88 158H1512" stroke="${colors.line}" stroke-width="1"/>
    <path d="M712 184V784" stroke="${colors.line}" stroke-width="1"/>

    <text x="156" y="104" class="brand">THESISFORGE</text>
    <text x="1472" y="104" text-anchor="end" class="meta">GURU STRATEGY · DATA CUT AUG 27, 2026</text>

    <text x="104" y="210" class="eyebrow">PUBLIC 13F FILINGS · LOW FREQUENCY · EQUAL WEIGHT</text>
    <text x="104" y="272" class="headline">A simple rule set</text>
    <text x="104" y="330" class="headline">any investor can verify</text>
    <text x="104" y="372" class="body">3 managers · top 3 reported 13F positions each</text>

    <circle cx="117" cy="425" r="15" fill="${colors.mint}"/>
    <text x="117" y="430" text-anchor="middle" class="stepNo">1</text>
    <text x="143" y="431" class="step">WAIT FOR 13F</text>
    <path d="M259 425H279" stroke="${colors.line}" stroke-width="2"/>
    <circle cx="297" cy="425" r="15" fill="${colors.mint}"/>
    <text x="297" y="430" text-anchor="middle" class="stepNo">2</text>
    <text x="323" y="431" class="step">TAKE TOP 3</text>
    <path d="M423 425H443" stroke="${colors.line}" stroke-width="2"/>
    <circle cx="461" cy="425" r="15" fill="${colors.mint}"/>
    <text x="461" y="430" text-anchor="middle" class="stepNo">3</text>
    <text x="487" y="431" class="step">DEDUPE + EQUAL-WEIGHT</text>

    <rect x="104" y="468" width="568" height="200" rx="20" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="132" y="510" class="label">PRICE BACKTEST · FEB 14, 2020—AUG 27, 2026</text>
    <text x="132" y="579" class="kpiHero">+475.5%</text>
    <text x="132" y="612" class="label">GURU TOP 3</text>
    <text x="638" y="564" text-anchor="end" class="kpiBenchmark">+128.4%</text>
    <text x="638" y="594" text-anchor="end" class="label">SPY</text>
    <rect x="132" y="632" width="506" height="8" rx="4" fill="#1E293B"/>
    <rect x="132" y="632" width="506" height="8" rx="4" fill="${colors.mint}"/>
    <rect x="132" y="650" width="136" height="6" rx="3" fill="${colors.amber}"/>

    <rect x="104" y="688" width="174" height="90" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="124" y="720" class="label">ANNUALIZED</text>
    <text x="124" y="755" class="stat">30.7%</text>
    <rect x="293" y="688" width="174" height="90" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="313" y="720" class="label">MAX DRAWDOWN</text>
    <text x="313" y="755" class="statRisk">−41.1%</text>
    <rect x="482" y="688" width="190" height="90" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="502" y="720" class="label">SHARPE</text>
    <text x="502" y="755" class="stat">1.05</text>

    <text x="756" y="196" class="section">CURRENT POSITIONS</text>
    <text x="1474" y="196" text-anchor="end" class="meta">REBALANCED AUG 14, 2026 · 9 × ~11.1%</text>
    ${strategy.managers.map(managerCard).join('')}

    <rect x="756" y="628" width="718" height="76" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="780" y="661" class="change" fill="${colors.mint}">LATEST ADDS</text>
    ${pill(900, 645, 74, 'MU', 'mint')}
    ${pill(986, 645, 86, 'MSFT', 'mint')}
    ${pill(1084, 645, 74, 'STM', 'mint')}
    <text x="1184" y="661" class="change" fill="${colors.red}">EXITS</text>
    ${pill(1228, 645, 64, 'U', 'red')}
    ${pill(1304, 645, 78, 'AMZN', 'red')}
    ${pill(1394, 645, 72, 'INSM', 'red')}

    <rect x="756" y="724" width="718" height="54" rx="14" fill="#1A1820" stroke="#4D3E2F"/>
    <circle cx="782" cy="751" r="6" fill="${colors.amber}"/>
    <text x="800" y="756" class="fineStrong">SIMPLE ≠ LOW RISK:</text>
    <text x="952" y="756" class="fine">45-day filing lag · concentrated portfolio · historical max drawdown −41.1%</text>

    <path d="M104 808H1474" stroke="${colors.line}" stroke-width="1"/>
    <text x="104" y="833" class="fine">Excludes commissions, taxes and slippage. 13F omits shorts, cash and intra-quarter trades. Research only—not investment advice.</text>
    <circle cx="1308" cy="828" r="5" fill="${colors.mint}"/>
    <text x="1322" y="833" class="url">thesisforge.tech</text>
  </svg>
`);

const curveYearTicks = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const curveValueTicks = [
  { value: 1, label: '$100' },
  { value: 2.5, label: '$250' },
  { value: 4, label: '$400' },
  { value: 5.5, label: '$550' },
];

const englishCurveLayout = svgBuffer(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${colors.mint}" stop-opacity=".28"/>
        <stop offset="100%" stop-color="${colors.mint}" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="curve-clip">
        <rect x="${curveChart.x}" y="${curveChart.y}" width="${curveChart.width}" height="${curveChart.height}" rx="6"/>
      </clipPath>
    </defs>
    <style>
      text { font-family: ${fontStack}; }
      .brand { font-size: 25px; font-weight: 800; fill: ${colors.text}; letter-spacing: .8px; }
      .topMeta { font-size: 16px; font-weight: 650; fill: ${colors.muted}; letter-spacing: .3px; }
      .eyebrow { font-size: 18px; font-weight: 780; fill: ${colors.mint}; letter-spacing: 1.2px; }
      .headline { font-size: 48px; font-weight: 820; fill: ${colors.text}; letter-spacing: -.7px; }
      .subtitle { font-size: 19px; font-weight: 560; fill: ${colors.muted}; }
      .chartTitle { font-size: 14px; font-weight: 760; fill: ${colors.muted}; letter-spacing: .7px; }
      .legend { font-size: 13px; font-weight: 720; fill: ${colors.text}; }
      .axis { font-size: 12px; font-weight: 620; fill: ${colors.subdued}; }
      .callout { font-size: 13px; font-weight: 800; }
      .railTitle { font-size: 15px; font-weight: 780; fill: ${colors.mint}; letter-spacing: 1px; }
      .hero { font-size: 57px; font-weight: 830; fill: ${colors.mint}; letter-spacing: -1.5px; }
      .railLabel { font-size: 12px; font-weight: 700; fill: ${colors.muted}; letter-spacing: .5px; }
      .benchmark { font-size: 17px; font-weight: 780; fill: ${colors.amber}; }
      .stat { font-size: 27px; font-weight: 820; fill: ${colors.text}; }
      .statRisk { font-size: 27px; font-weight: 820; fill: ${colors.red}; }
      .managerLabel { font-size: 10px; font-weight: 760; fill: ${colors.muted}; letter-spacing: .4px; }
      .ticker { font-size: 16px; font-weight: 800; }
      .fine { font-size: 13px; font-weight: 550; fill: ${colors.muted}; }
      .url { font-size: 16px; font-weight: 750; fill: ${colors.text}; }
    </style>

    <rect width="1600" height="900" fill="#06101B" fill-opacity=".62"/>
    <rect x="52" y="44" width="1496" height="812" rx="30" fill="#0B111D" fill-opacity=".94" stroke="${colors.line}" stroke-width="1.5"/>
    <rect x="52" y="44" width="8" height="812" rx="4" fill="${colors.mint}"/>
    <path d="M88 150H1512" stroke="${colors.line}" stroke-width="1"/>

    <text x="156" y="104" class="brand">THESISFORGE</text>
    <text x="1472" y="104" text-anchor="end" class="topMeta">GURU STRATEGY · DATA CUT AUG 27, 2026</text>

    <text x="104" y="194" class="eyebrow">GURU TOP 3 CONSENSUS</text>
    <text x="104" y="252" class="headline">3 managers. 9 names.</text>
    <text x="104" y="307" class="headline">One transparent strategy.</text>
    <text x="104" y="342" class="subtitle">Public 13F · Top 3 each · Dedupe · Equal-weight · No leverage</text>

    <rect x="88" y="368" width="1018" height="408" rx="22" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="118" y="405" class="chartTitle">GROWTH OF $100 · PRICE BACKTEST</text>
    <circle cx="762" cy="400" r="5" fill="${colors.mint}"/>
    <text x="776" y="405" class="legend">GURU TOP 3</text>
    <circle cx="902" cy="400" r="5" fill="${colors.amber}"/>
    <text x="916" y="405" class="legend">SPY</text>

    ${curveValueTicks
      .map(({ value, label }) => {
        const y = yForValue(value);
        return `
          <path d="M${curveChart.x} ${y.toFixed(2)}H${curveChart.x + curveChart.width}" stroke="${colors.line}" stroke-width="1" opacity=".7"/>
          <text x="118" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis">${label}</text>
        `;
      })
      .join('')}
    ${curveYearTicks
      .map((year) => {
        const date = year === 2020 ? curvePoints[0].date : `${year}-01-01`;
        const x = xForDate(date);
        return `
          <path d="M${x.toFixed(2)} ${curveChart.y}V${curveChart.y + curveChart.height}" stroke="${colors.line}" stroke-width="1" opacity=".42"/>
          <text x="${x.toFixed(2)}" y="742" text-anchor="middle" class="axis">${year}</text>
        `;
      })
      .join('')}

    <g clip-path="url(#curve-clip)">
      <path d="${guruAreaPath}" fill="url(#curve-fill)"/>
      <path d="${spyCurvePath}" fill="none" stroke="${colors.amber}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
      <path d="${guruCurvePath}" fill="none" stroke="${colors.mint}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <circle cx="${guruEndX.toFixed(2)}" cy="${guruEndY.toFixed(2)}" r="6" fill="${colors.mint}" stroke="#D9FFF4" stroke-width="2"/>
    <path d="M${(guruEndX - 8).toFixed(2)} ${guruEndY.toFixed(2)}H875" stroke="${colors.mint}" stroke-width="1.5" opacity=".75"/>
    <rect x="872" y="${(guruEndY - 20).toFixed(2)}" width="178" height="38" rx="9" fill="${colors.mintSoft}" stroke="#28675D"/>
    <text x="961" y="${(guruEndY + 5).toFixed(2)}" text-anchor="middle" class="callout" fill="${colors.mint}">GURU +475.5%</text>

    <circle cx="${spyEndX.toFixed(2)}" cy="${spyEndY.toFixed(2)}" r="5" fill="${colors.amber}" stroke="#FFF2CF" stroke-width="2"/>
    <path d="M${(spyEndX - 7).toFixed(2)} ${spyEndY.toFixed(2)}H891" stroke="${colors.amber}" stroke-width="1.5" opacity=".75"/>
    <rect x="888" y="${(spyEndY - 19).toFixed(2)}" width="162" height="36" rx="9" fill="${colors.amberSoft}" stroke="#6A5430"/>
    <text x="969" y="${(spyEndY + 5).toFixed(2)}" text-anchor="middle" class="callout" fill="${colors.amber}">SPY +128.4%</text>

    <circle cx="${drawdownX.toFixed(2)}" cy="${drawdownY.toFixed(2)}" r="5" fill="${colors.red}" stroke="#FFD6D6" stroke-width="2"/>
    <path d="M${drawdownX.toFixed(2)} ${(drawdownY - 7).toFixed(2)}V${(drawdownY - 41).toFixed(2)}" stroke="${colors.red}" stroke-width="1.5"/>
    <rect x="${(drawdownX - 82).toFixed(2)}" y="${(drawdownY - 78).toFixed(2)}" width="164" height="36" rx="9" fill="${colors.redSoft}" stroke="#6B3440"/>
    <text x="${drawdownX.toFixed(2)}" y="${(drawdownY - 54).toFixed(2)}" text-anchor="middle" class="callout" fill="${colors.red}">−41.1% MAX DD</text>

    <rect x="1130" y="184" width="344" height="592" rx="22" fill="#101826" stroke="${colors.line}"/>
    <text x="1160" y="220" class="railTitle">BACKTEST RESULT</text>
    <text x="1160" y="286" class="hero">+475.5%</text>
    <text x="1162" y="312" class="railLabel">CUMULATIVE PRICE RETURN</text>
    <rect x="1160" y="329" width="284" height="36" rx="10" fill="${colors.amberSoft}" stroke="#6A5430"/>
    <text x="1302" y="353" text-anchor="middle" class="benchmark">SPY +128.4%</text>
    <path d="M1160 388H1444" stroke="${colors.line}" stroke-width="1"/>

    <text x="1160" y="428" class="stat">30.7%</text>
    <text x="1162" y="450" class="railLabel">ANNUALIZED</text>
    <text x="1310" y="428" class="stat">1.05</text>
    <text x="1312" y="450" class="railLabel">SHARPE</text>
    <text x="1160" y="492" class="statRisk">−41.1%</text>
    <text x="1162" y="514" class="railLabel">MAX DRAWDOWN</text>
    <text x="1310" y="492" class="stat">1.24</text>
    <text x="1312" y="514" class="railLabel">BETA</text>
    <path d="M1160 532H1444" stroke="${colors.line}" stroke-width="1"/>

    <text x="1160" y="556" class="railTitle">CURRENT · AUG 14, 2026</text>
    <circle cx="1184" cy="588" r="25" fill="#0E1624" stroke="${colors.mint}" stroke-width="2"/>
    <circle cx="1288" cy="588" r="25" fill="#0E1624" stroke="${colors.amber}" stroke-width="2"/>
    <circle cx="1392" cy="588" r="25" fill="#0E1624" stroke="${colors.mint}" stroke-width="2"/>
    <text x="1184" y="621" text-anchor="middle" class="managerLabel">BAKER</text>
    <text x="1288" y="621" text-anchor="middle" class="managerLabel">ACKMAN</text>
    <text x="1392" y="621" text-anchor="middle" class="managerLabel">DRUCK.</text>
    ${pill(1142, 631, 84, 'MU')}
    ${pill(1246, 631, 84, 'UBER')}
    ${pill(1350, 631, 84, 'NTRA')}
    ${pill(1142, 677, 84, 'ALAB')}
    ${pill(1246, 677, 84, 'BN')}
    ${pill(1350, 677, 84, 'TSM')}
    ${pill(1142, 723, 84, 'CIEN')}
    ${pill(1246, 723, 84, 'MSFT')}
    ${pill(1350, 723, 84, 'STM')}

    <path d="M104 808H1474" stroke="${colors.line}" stroke-width="1"/>
    <text x="104" y="833" class="fine">Price backtest; excludes fees, taxes, slippage and dividend reinvestment. 13F lags up to 45 days; omits shorts, cash and intra-quarter trades. Research only—not advice.</text>
    <circle cx="1308" cy="828" r="5" fill="${colors.mint}"/>
    <text x="1322" y="833" class="url">thesisforge.tech</text>
  </svg>
`);

const background = await sharp(backgroundSource)
  .resize(1600, 900, { fit: 'cover' })
  .modulate({ brightness: 0.72, saturation: 0.78 })
  .png()
  .toBuffer();

const managerY = [242, 374, 506];
async function exportGraphic(overlay, destination) {
  await sharp(background)
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: mark, left: 88, top: 70 },
      { input: gavinAvatar, left: 774, top: managerY[0] },
      { input: billAvatar, left: 774, top: managerY[1] },
      { input: stanleyAvatar, left: 774, top: managerY[2] },
    ])
    .png({ compressionLevel: 9 })
    .toFile(destination);
}

async function exportCurveGraphic() {
  await sharp(background)
    .composite([
      { input: englishCurveLayout, left: 0, top: 0 },
      { input: mark, left: 88, top: 70 },
      { input: gavinAvatarSmall, left: 1161, top: 565 },
      { input: billAvatarSmall, left: 1265, top: 565 },
      { input: stanleyAvatarSmall, left: 1369, top: 565 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(englishCurveOutput);
}

await Promise.all([
  exportGraphic(layout, output),
  exportGraphic(englishLayout, englishOutput),
  exportCurveGraphic(),
]);

await writeFile(
  manifestOutput,
  `${JSON.stringify(
    {
      title: 'Guru Top 3 Consensus — ThesisForge social graphic',
      generatedAt: '2026-08-30',
      dimensions: '1600x900',
      outputs: {
        chinese: path.relative(root, output),
        english: path.relative(root, englishOutput),
        englishCurve: path.relative(root, englishCurveOutput),
      },
      curveData: {
        source: path.relative(root, curveDataSource),
        frequency: curveData.period.frequency,
        observations: curveData.period.observations,
        normalization: curveData.normalization,
        rendering: 'All daily observations, shared linear axis, straight SVG line segments without smoothing.',
      },
      background: {
        source: path.relative(root, backgroundSource),
        role: 'Low-contrast atmospheric treatment only; all copy, data, logos, and charts are deterministic overlays.',
      },
      assets: Object.fromEntries(
        Object.entries(assets).map(([key, value]) => [key, path.relative(root, value)]),
      ),
      strategy,
      methodology: [
        'After each public 13F disclosure, take the manager top three positions by disclosed market value.',
        'Merge duplicates and equal-weight the remaining unique securities.',
        'Rebalance after a new disclosure, with no leverage.',
      ],
      caveats: [
        '13F filings can lag quarter-end by up to 45 days.',
        '13F does not disclose shorts, cash, non-reportable assets, or intra-quarter trades.',
        'Backtest excludes commissions, taxes, and slippage.',
        'Research only; not investment advice.',
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${output}`);
console.log(`Wrote ${englishOutput}`);
console.log(`Wrote ${englishCurveOutput}`);
console.log(`Wrote ${manifestOutput}`);
