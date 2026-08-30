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
const output = path.join(
  outputDir,
  'ontology-soft-overlay-6m-en-1600x900.png',
);
const manifestOutput = path.join(
  outputDir,
  'ontology-soft-overlay-6m-manifest.json',
);
const dataSource = path.join(
  outputDir,
  'ontology-soft-overlay-6m-equity-daily.json',
);
const backgroundSource =
  process.env.ONTOLOGY_SOCIAL_BACKGROUND ||
  path.join(outputDir, 'guru-top3-consensus-background.png');
const markSource = path.join(root, 'assets/branding/thesisforge-mark.png');

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
  id: 'ontology-soft-overlay-6m',
  version: 'event-ontology-v4',
  period: ['2018-01-02', '2026-08-13'],
  observations: 2165,
  totalReturn: 509.1252057247211,
  spyTotalReturn: 230.81866072025474,
  cagr: 23.40639626780123,
  spyCagr: 14.942022841459246,
  sharpe: 0.9396205058983732,
  spySharpe: 0.8248097713963506,
  maxDrawdown: -42.53297671496234,
  spyMaxDrawdown: -33.71726769000346,
  annualTurnover: 1003.0634392485801,
  endingEquity: 609125.2057247235,
  modeledCost: 12580.820258165622,
  dataCut: '2026-08-13',
  releasedAt: '2026-08-30',
};

await mkdir(outputDir, { recursive: true });

const rawData = JSON.parse(await readFile(dataSource, 'utf8'));
const rawSeries =
  rawData.series || rawData.nav || rawData.curve?.series || rawData.data;

if (!Array.isArray(rawSeries)) {
  throw new Error(`No daily series found in ${dataSource}`);
}

const curvePoints = rawSeries.map((point) => {
  if (Array.isArray(point)) {
    return { date: point[0], ontology: point[1], spy: point[2] };
  }
  return {
    date: String(point.date).slice(0, 10),
    ontology:
      point.ontology ?? point.strategy ?? point.strategy_nav ?? point.nav,
    spy: point.spy ?? point.spy_nav ?? point.benchmark,
  };
});

if (
  curvePoints.length !== strategy.observations ||
  curvePoints[0].date !== strategy.period[0] ||
  curvePoints.at(-1).date !== strategy.period[1]
) {
  throw new Error(
    `Unexpected Ontology series bounds: ${curvePoints.length} points, ` +
      `${curvePoints[0]?.date} to ${curvePoints.at(-1)?.date}`,
  );
}

const lastPoint = curvePoints.at(-1);
const assertNear = (actual, expected, label, tolerance = 1e-8) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} mismatch: ${actual} vs ${expected}`);
  }
};
assertNear(lastPoint.ontology, 6.091252057247211, 'ending strategy NAV');
assertNear(lastPoint.spy, 3.3081866072025474, 'ending SPY NAV');
assertNear(
  rawData.metrics?.strategy?.total_return,
  strategy.totalReturn / 100,
  'strategy total return',
);
assertNear(
  rawData.metrics?.spy?.total_return,
  strategy.spyTotalReturn / 100,
  'SPY total return',
);
assertNear(
  rawData.metrics?.strategy?.cagr,
  strategy.cagr / 100,
  'strategy CAGR',
);
assertNear(
  rawData.metrics?.strategy?.sharpe,
  strategy.sharpe,
  'strategy Sharpe',
);
assertNear(
  rawData.metrics?.strategy?.annual_turnover,
  strategy.annualTurnover / 100,
  'strategy annual turnover',
);

const curveChart = {
  x: 130,
  y: 562,
  width: 930,
  height: 168,
  min: 0.55,
  max: 6.45,
};
const startMs = Date.parse(`${curvePoints[0].date}T00:00:00Z`);
const endMs = Date.parse(`${lastPoint.date}T00:00:00Z`);

function coordinates(point, field) {
  const time = Date.parse(`${point.date}T00:00:00Z`);
  const x =
    curveChart.x + ((time - startMs) / (endMs - startMs)) * curveChart.width;
  const y =
    curveChart.y +
    ((curveChart.max - point[field]) / (curveChart.max - curveChart.min)) *
      curveChart.height;
  return [x, y];
}

function curvePath(field) {
  return curvePoints
    .map((point, index) => {
      const [x, y] = coordinates(point, field);
      return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function xForDate(date) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return curveChart.x + ((time - startMs) / (endMs - startMs)) * curveChart.width;
}

function yForValue(value) {
  return (
    curveChart.y +
    ((curveChart.max - value) / (curveChart.max - curveChart.min)) *
      curveChart.height
  );
}

const ontologyPath = curvePath('ontology');
const spyPath = curvePath('spy');
const [ontologyEndX, ontologyEndY] = coordinates(lastPoint, 'ontology');
const [spyEndX, spyEndY] = coordinates(lastPoint, 'spy');
const ontologyAreaPath = `${ontologyPath} L${ontologyEndX.toFixed(2)} ${(
  curveChart.y + curveChart.height
).toFixed(2)} L${curveChart.x} ${(
  curveChart.y + curveChart.height
).toFixed(2)} Z`;

let runningPeak = curvePoints[0];
let drawdownPeak = curvePoints[0];
let drawdownTrough = curvePoints[0];
let worstDrawdown = 0;
for (const point of curvePoints) {
  if (point.ontology > runningPeak.ontology) runningPeak = point;
  const drawdown = point.ontology / runningPeak.ontology - 1;
  if (drawdown < worstDrawdown) {
    worstDrawdown = drawdown;
    drawdownPeak = runningPeak;
    drawdownTrough = point;
  }
}
assertNear(worstDrawdown, strategy.maxDrawdown / 100, 'maximum drawdown');
const [drawdownX, drawdownY] = coordinates(drawdownTrough, 'ontology');

const yearTicks = [2018, 2020, 2022, 2024, 2026];
const valueTicks = [
  { value: 1, label: '$100' },
  { value: 2.5, label: '$250' },
  { value: 4, label: '$400' },
  { value: 5.5, label: '$550' },
];

const steps = [
  {
    title: 'PIT FILING',
    lines: ['Public information only', 'Next-session open'],
  },
  {
    title: 'COMPANY SIGNAL',
    lines: ['50% ops · 20% cash · 20% quality', '5% value · 5% safety'],
  },
  {
    title: 'NETWORK CHECK',
    lines: ['+25% peer context', '+15% graph confirmation'],
  },
  {
    title: 'PORTFOLIO',
    lines: ['Top 20 · Rank-40 buffer', 'Max 126 trading days'],
  },
  {
    title: 'SOFT OVERLAY',
    lines: ['New filings resize risk', 'Only when factor shifts ≥10%'],
  },
];

function processStep(step, index) {
  const x = 104 + index * 198;
  const circleX = x + 13;
  return `
    <circle cx="${circleX}" cy="393" r="13" fill="${colors.mint}"/>
    <text x="${circleX}" y="398" text-anchor="middle" class="stepNo">${index + 1}</text>
    <text x="${x + 34}" y="398" class="stepTitle">${step.title}</text>
    <text x="${x}" y="430" class="stepBody">${step.lines[0]}</text>
    <text x="${x}" y="451" class="stepBody">${step.lines[1]}</text>
    ${
      index < steps.length - 1
        ? `<path d="M${x + 176} 411H${x + 190}" stroke="${colors.line}" stroke-width="2"/><path d="M${x + 186} 407L${x + 190} 411L${x + 186} 415" fill="none" stroke="${colors.line}" stroke-width="2"/>`
        : ''
    }
  `;
}

const fontStack = `-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif`;
const svg = Buffer.from(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${colors.mint}" stop-opacity=".30"/>
        <stop offset="100%" stop-color="${colors.mint}" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="curve-clip">
        <rect x="${curveChart.x}" y="${curveChart.y}" width="${curveChart.width}" height="${curveChart.height}" rx="5"/>
      </clipPath>
    </defs>
    <style>
      text { font-family: ${fontStack}; }
      .brand { font-size: 25px; font-weight: 800; fill: ${colors.text}; letter-spacing: .8px; }
      .topMeta { font-size: 15px; font-weight: 700; fill: ${colors.muted}; letter-spacing: .35px; }
      .eyebrow { font-size: 17px; font-weight: 800; fill: ${colors.mint}; letter-spacing: 1.15px; }
      .headline { font-size: 45px; font-weight: 830; fill: ${colors.text}; letter-spacing: -.75px; }
      .subtitle { font-size: 18px; font-weight: 560; fill: ${colors.muted}; }
      .stepNo { font-size: 12px; font-weight: 850; fill: ${colors.ink}; }
      .stepTitle { font-size: 14px; font-weight: 820; fill: ${colors.text}; letter-spacing: .3px; }
      .stepBody { font-size: 12px; font-weight: 590; fill: ${colors.muted}; }
      .chartTitle { font-size: 13px; font-weight: 760; fill: ${colors.muted}; letter-spacing: .65px; }
      .legend { font-size: 12px; font-weight: 740; fill: ${colors.text}; }
      .axis { font-size: 11px; font-weight: 620; fill: ${colors.subdued}; }
      .callout { font-size: 12px; font-weight: 820; }
      .railTitle { font-size: 15px; font-weight: 800; fill: ${colors.mint}; letter-spacing: 1px; }
      .hero { font-size: 57px; font-weight: 840; fill: ${colors.mint}; letter-spacing: -1.6px; }
      .railLabel { font-size: 11px; font-weight: 720; fill: ${colors.muted}; letter-spacing: .5px; }
      .benchmark { font-size: 16px; font-weight: 800; fill: ${colors.amber}; }
      .stat { font-size: 27px; font-weight: 830; fill: ${colors.text}; }
      .statRisk { font-size: 27px; font-weight: 830; fill: ${colors.red}; }
      .dialLabel { font-size: 11px; font-weight: 720; fill: ${colors.muted}; letter-spacing: .35px; }
      .dialValue { font-size: 13px; font-weight: 820; fill: ${colors.text}; }
      .validation { font-size: 10.5px; font-weight: 740; fill: ${colors.amber}; letter-spacing: .15px; }
      .fine { font-size: 12px; font-weight: 560; fill: ${colors.muted}; }
      .url { font-size: 16px; font-weight: 760; fill: ${colors.text}; }
    </style>

    <rect width="1600" height="900" fill="#06101B" fill-opacity=".64"/>
    <rect x="52" y="44" width="1496" height="812" rx="30" fill="#0B111D" fill-opacity=".95" stroke="${colors.line}" stroke-width="1.5"/>
    <rect x="52" y="44" width="8" height="812" rx="4" fill="${colors.mint}"/>
    <path d="M88 150H1512" stroke="${colors.line}" stroke-width="1"/>

    <text x="156" y="104" class="brand">THESISFORGE</text>
    <text x="1472" y="104" text-anchor="end" class="topMeta">ONTOLOGY STRATEGY · RELEASED AUG 30, 2026</text>

    <text x="104" y="193" class="eyebrow">ONTOLOGY 6M · POINT-IN-TIME FUNDAMENTALS · DATA THROUGH AUG 13</text>
    <text x="104" y="246" class="headline">A filing tells you what changed.</text>
    <text x="104" y="298" class="headline">Ontology asks if it is spreading.</text>
    <text x="104" y="336" class="subtitle">Score the company, test the peers, confirm the value chain—then size the position.</text>

    <rect x="88" y="363" width="1018" height="124" rx="20" fill="${colors.panel2}" stroke="${colors.line}"/>
    ${steps.map(processStep).join('')}

    <rect x="88" y="505" width="1018" height="271" rx="20" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="118" y="540" class="chartTitle">GROWTH OF $100 · EVALUATION PERIOD · MODELED COSTS INCLUDED</text>
    <circle cx="813" cy="536" r="5" fill="${colors.mint}"/>
    <text x="826" y="540" class="legend">ONTOLOGY</text>
    <circle cx="930" cy="536" r="5" fill="${colors.amber}"/>
    <text x="943" y="540" class="legend">SPY</text>

    ${valueTicks
      .map(({ value, label }) => {
        const y = yForValue(value);
        return `
          <path d="M${curveChart.x} ${y.toFixed(2)}H${curveChart.x + curveChart.width}" stroke="${colors.line}" stroke-width="1" opacity=".70"/>
          <text x="118" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis">${label}</text>
        `;
      })
      .join('')}
    ${yearTicks
      .map((year) => {
        const x = xForDate(year === 2018 ? curvePoints[0].date : `${year}-01-01`);
        return `
          <path d="M${x.toFixed(2)} ${curveChart.y}V${curveChart.y + curveChart.height}" stroke="${colors.line}" stroke-width="1" opacity=".40"/>
          <text x="${x.toFixed(2)}" y="751" text-anchor="middle" class="axis">${year}</text>
        `;
      })
      .join('')}

    <g clip-path="url(#curve-clip)">
      <path d="${ontologyAreaPath}" fill="url(#curve-fill)"/>
      <path d="${spyPath}" fill="none" stroke="${colors.amber}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>
      <path d="${ontologyPath}" fill="none" stroke="${colors.mint}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <circle cx="${ontologyEndX.toFixed(2)}" cy="${ontologyEndY.toFixed(2)}" r="6" fill="${colors.mint}" stroke="#D9FFF4" stroke-width="2"/>
    <path d="M${(ontologyEndX - 8).toFixed(2)} ${ontologyEndY.toFixed(2)}H889" stroke="${colors.mint}" stroke-width="1.5" opacity=".78"/>
    <rect x="886" y="${(ontologyEndY - 18).toFixed(2)}" width="164" height="34" rx="9" fill="${colors.mintSoft}" stroke="#28675D"/>
    <text x="968" y="${(ontologyEndY + 4).toFixed(2)}" text-anchor="middle" class="callout" fill="${colors.mint}">ONTOLOGY +509.1%</text>

    <circle cx="${spyEndX.toFixed(2)}" cy="${spyEndY.toFixed(2)}" r="5" fill="${colors.amber}" stroke="#FFF2CF" stroke-width="2"/>
    <path d="M${(spyEndX - 7).toFixed(2)} ${spyEndY.toFixed(2)}H905" stroke="${colors.amber}" stroke-width="1.5" opacity=".78"/>
    <rect x="902" y="${(spyEndY - 17).toFixed(2)}" width="148" height="32" rx="9" fill="${colors.amberSoft}" stroke="#6A5430"/>
    <text x="976" y="${(spyEndY + 4).toFixed(2)}" text-anchor="middle" class="callout" fill="${colors.amber}">SPY +230.8%</text>

    <circle cx="${drawdownX.toFixed(2)}" cy="${drawdownY.toFixed(2)}" r="5" fill="${colors.red}" stroke="#FFD6D6" stroke-width="2"/>
    <path d="M${drawdownX.toFixed(2)} ${(drawdownY - 7).toFixed(2)}V${(drawdownY - 40).toFixed(2)}" stroke="${colors.red}" stroke-width="1.5"/>
    <rect x="${(drawdownX - 76).toFixed(2)}" y="${(drawdownY - 74).toFixed(2)}" width="152" height="33" rx="9" fill="${colors.redSoft}" stroke="#6B3440"/>
    <text x="${drawdownX.toFixed(2)}" y="${(drawdownY - 52).toFixed(2)}" text-anchor="middle" class="callout" fill="${colors.red}">−42.5% MAX DD</text>

    <rect x="1130" y="184" width="344" height="592" rx="22" fill="#101826" stroke="${colors.line}"/>
    <text x="1160" y="220" class="railTitle">EVALUATION RESULT</text>
    <text x="1160" y="286" class="hero">+509.1%</text>
    <text x="1162" y="312" class="railLabel">CUMULATIVE RETURN · 2018—AUG 2026</text>
    <rect x="1160" y="329" width="284" height="36" rx="10" fill="${colors.amberSoft}" stroke="#6A5430"/>
    <text x="1302" y="353" text-anchor="middle" class="benchmark">SPY +230.8% · 14.9% CAGR</text>
    <path d="M1160 388H1444" stroke="${colors.line}" stroke-width="1"/>

    <text x="1160" y="428" class="stat">23.4%</text>
    <text x="1162" y="450" class="railLabel">CAGR</text>
    <text x="1310" y="428" class="stat">0.94</text>
    <text x="1312" y="450" class="railLabel">SHARPE</text>
    <text x="1160" y="492" class="statRisk">−42.5%</text>
    <text x="1162" y="514" class="railLabel">MAX DRAWDOWN</text>
    <text x="1310" y="492" class="stat">1,003%</text>
    <text x="1312" y="514" class="railLabel">ANNUAL TURNOVER</text>
    <path d="M1160 532H1444" stroke="${colors.line}" stroke-width="1"/>

    <text x="1160" y="558" class="railTitle">THE RISK DIAL</text>
    <text x="1160" y="586" class="dialLabel">QUALITY PERSISTENCE</text>
    <text x="1444" y="586" text-anchor="end" class="dialValue">0.70×—1.10×</text>
    <rect x="1160" y="596" width="284" height="5" rx="2.5" fill="#1E293B"/>
    <rect x="1220" y="596" width="172" height="5" rx="2.5" fill="${colors.mint}" opacity=".82"/>
    <text x="1160" y="624" class="dialLabel">LATEST QUARTER</text>
    <text x="1444" y="624" text-anchor="end" class="dialValue">0.55×—1.08×</text>
    <rect x="1160" y="634" width="284" height="5" rx="2.5" fill="#1E293B"/>
    <rect x="1188" y="634" width="188" height="5" rx="2.5" fill="${colors.amber}" opacity=".82"/>
    <text x="1160" y="662" class="dialLabel">PEER + GRAPH CONTEXT</text>
    <text x="1444" y="662" text-anchor="end" class="dialValue">0.90×—1.10×</text>
    <rect x="1160" y="672" width="284" height="5" rx="2.5" fill="#1E293B"/>
    <rect x="1250" y="672" width="142" height="5" rx="2.5" fill="#58B9FF" opacity=".88"/>

    <rect x="1160" y="696" width="284" height="30" rx="9" fill="${colors.mintSoft}" stroke="#28675D"/>
    <text x="1302" y="716" text-anchor="middle" class="dialValue" fill="${colors.mint}">7% INITIAL CAP · NO LEVERAGE</text>
    <rect x="1160" y="736" width="284" height="26" rx="8" fill="${colors.amberSoft}" stroke="#6A5430"/>
    <text x="1302" y="753" text-anchor="middle" class="validation">OVERLAY EDGE: +0.7pp CAGR · CI CROSSES ZERO</text>

    <path d="M104 808H1474" stroke="${colors.line}" stroke-width="1"/>
    <text x="104" y="833" class="fine">PIT research simulation using Sharadar adjusted prices + SF1 ART. Includes modeled commissions/slippage; excludes taxes. Evaluation was previously reviewed. Research only—not advice.</text>
    <circle cx="1308" cy="828" r="5" fill="${colors.mint}"/>
    <text x="1322" y="833" class="url">thesisforge.tech</text>
  </svg>
`);

const [background, mark] = await Promise.all([
  sharp(backgroundSource)
    .resize(1600, 900, { fit: 'cover' })
    .modulate({ brightness: 0.72, saturation: 0.78 })
    .png()
    .toBuffer(),
  sharp(markSource).resize(58, 58, { fit: 'contain' }).png().toBuffer(),
]);

await sharp(background)
  .composite([
    { input: svg, left: 0, top: 0 },
    { input: mark, left: 88, top: 70 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

await writeFile(
  manifestOutput,
  `${JSON.stringify(
    {
      title: 'Ontology Soft Overlay 6M — ThesisForge social graphic',
      generatedAt: strategy.releasedAt,
      dimensions: '1600x900',
      output: path.relative(root, output),
      curveData: {
        source: path.relative(root, dataSource),
        frequency: 'daily trading observations',
        observations: curvePoints.length,
        period: strategy.period,
        rendering:
          'All daily observations, shared linear axis, straight SVG line segments without smoothing.',
      },
      background: {
        source: path.relative(root, backgroundSource),
        role: 'Low-contrast atmospheric treatment only; all copy, data, logo, and charts are deterministic overlays.',
      },
      assets: { mark: path.relative(root, markSource) },
      strategy,
      methodology: [
        'Use only point-in-time financial information public before portfolio formation; execute at the next-session open.',
        'Company score: 50% operating surprise, 20% cash confirmation, 20% durable quality, 5% valuation support, and 5% balance-sheet/dilution safety.',
        'Add 25% same-stage peer context and 15% adjacent value-chain graph confirmation to the V2 selection score.',
        'Select the top 20 with a rank-40 buffer and a maximum 126-trading-day holding period.',
        'The V4 soft overlay adjusts risk budget after new filings when its factor changes by at least 10%; it does not replace the V2 eligibility or ranking rules.',
      ],
      caveats: [
        'The 2018–2026 evaluation period was previously reviewed and is not a fresh blind test.',
        'The V4 overlay improved evaluation-period CAGR by approximately 0.7 percentage points versus V2, but its incremental block-bootstrap 95% confidence interval crosses zero.',
        'The graph is a structural stage map rather than company-level customer revenue weights.',
        'Includes modeled commissions and slippage; excludes taxes.',
        'Research only; not investment advice.',
      ],
      verification: {
        worstDrawdown: {
          value: worstDrawdown,
          peakDate: drawdownPeak.date,
          troughDate: drawdownTrough.date,
        },
        endingNav: {
          ontology: lastPoint.ontology,
          spy: lastPoint.spy,
        },
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${output}`);
console.log(`Wrote ${manifestOutput}`);
