import { createHash } from 'node:crypto';
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
const dataSource = path.join(
  outputDir,
  'pltr-ontology-case-study-data.json',
);
const output = path.join(
  outputDir,
  'pltr-ontology-case-study-en-1600x900.png',
);
const manifestOutput = path.join(
  outputDir,
  'pltr-ontology-case-study-manifest.json',
);
const backgroundSource =
  process.env.PLTR_CASE_STUDY_BACKGROUND ||
  path.join(outputDir, 'guru-top3-consensus-background.png');
const markSource = path.join(root, 'assets/branding/thesisforge-mark.png');

const colors = {
  ink: '#070C14',
  panel: '#0D1522',
  panel2: '#101B2A',
  line: '#26364D',
  lineSoft: '#1B293C',
  mint: '#2DE1B3',
  mintSoft: '#123F3A',
  amber: '#F3B95F',
  amberSoft: '#3D2E18',
  red: '#FF7181',
  redSoft: '#3C1E28',
  blue: '#65B8FF',
  text: '#F8FAFC',
  muted: '#AAB6C8',
  subdued: '#718198',
};

const assertNear = (actual, expected, label, tolerance = 1e-9) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} mismatch: ${actual} vs ${expected}`);
  }
};

await mkdir(outputDir, { recursive: true });
const dataBytes = await readFile(dataSource);
const data = JSON.parse(dataBytes.toString('utf8'));
const series = data.peerContextSeries;

if (
  data.releaseDate !== '2026-08-30' ||
  data.ticker !== 'PLTR' ||
  !Array.isArray(series) ||
  series.length !== 5
) {
  throw new Error('Unexpected PLTR case-study data contract.');
}

assertNear(series[0].peerContext, 0.3268910813223564, 'first peer context');
assertNear(series[1].peerContext, 0.2710812960055518, 'watch peer context');
assertNear(series[2].peerContext, 1.0608210381675502, 'breakout peer context');
assertNear(series[3].peerContext, 1.238862837045721, 'peak peer context');
assertNear(series[4].peerContext, 1.190569689234177, 'latest peer context');
assertNear(
  series[2].peerContext / series[1].peerContext,
  data.peerBreakout.multiple,
  'peer-context breakout multiple',
);
assertNear(
  data.portfolioReplay.snapshotPrice /
    data.portfolioReplay.modeledFillPrice -
    1,
  data.portfolioReplay.unrealizedReturn,
  'simulated position return',
);

const chart = {
  x: 132,
  y: 414,
  width: 930,
  height: 185,
  min: 0,
  max: 1.35,
};
const startMs = Date.parse(`${series[0].informationDate}T00:00:00Z`);
const endMs = Date.parse(`${series.at(-1).informationDate}T00:00:00Z`);

function pointCoordinates(point) {
  const time = Date.parse(`${point.informationDate}T00:00:00Z`);
  const x = chart.x + ((time - startMs) / (endMs - startMs)) * chart.width;
  const y =
    chart.y +
    ((chart.max - point.peerContext) / (chart.max - chart.min)) *
      chart.height;
  return [x, y];
}

const coordinates = series.map(pointCoordinates);
const curvePath = coordinates
  .map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
  .join(' ');
const areaPath = `${curvePath} L${coordinates.at(-1)[0].toFixed(2)} ${(
  chart.y + chart.height
).toFixed(2)} L${coordinates[0][0].toFixed(2)} ${(
  chart.y + chart.height
).toFixed(2)} Z`;

const yTicks = [0, 0.4, 0.8, 1.2];
const xLabels = ["AUG '25", 'NOV', "FEB '26", 'MAY', 'AUG'];
const pointLabels = [
  { text: '0.33 · FIRST FLAG', color: colors.mint, dx: 0, dy: -24, anchor: 'start' },
  { text: '0.27 · WATCH', color: colors.red, dx: 0, dy: 28, anchor: 'middle' },
  { text: '1.06 · 3.9× Q/Q', color: colors.mint, dx: 0, dy: -24, anchor: 'middle' },
  { text: '1.24', color: colors.mint, dx: -4, dy: -24, anchor: 'middle' },
  { text: '1.19 · STILL HIGH', color: colors.mint, dx: 0, dy: -24, anchor: 'end' },
];

const gridMarkup = yTicks
  .map((value) => {
    const y =
      chart.y +
      ((chart.max - value) / (chart.max - chart.min)) * chart.height;
    return `
      <path d="M${chart.x} ${y.toFixed(2)}H${chart.x + chart.width}" stroke="${colors.lineSoft}" stroke-width="1"/>
      <text x="${chart.x - 17}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis">${value.toFixed(1)}</text>
    `;
  })
  .join('');

const pointsMarkup = coordinates
  .map(([x, y], index) => {
    const isWatch = index === 1;
    const label = pointLabels[index];
    const lineToAxis = index === 2
      ? `<path d="M${x.toFixed(2)} ${chart.y}V${(
          chart.y + chart.height
        ).toFixed(2)}" stroke="${colors.mint}" stroke-width="1" stroke-dasharray="4 6" opacity=".35"/>`
      : '';
    return `
      ${lineToAxis}
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${isWatch ? 7 : 6}" fill="${isWatch ? colors.panel : colors.mint}" stroke="${isWatch ? colors.red : '#D9FFF5'}" stroke-width="${isWatch ? 3 : 2}"/>
      <text x="${(x + label.dx).toFixed(2)}" y="${(y + label.dy).toFixed(2)}" text-anchor="${label.anchor}" class="pointLabel" fill="${label.color}">${label.text}</text>
      <text x="${x.toFixed(2)}" y="${chart.y + chart.height + 28}" text-anchor="middle" class="axisDate">${xLabels[index]}</text>
    `;
  })
  .join('');

const milestones = [
  {
    date: "AUG 06 ’25",
    title: 'FIRST GREEN FLAG',
    detail: 'Rank 64/141 · flagged, not selected',
    color: colors.mint,
  },
  {
    date: "FEB 18 ’26",
    title: 'PEER-CONTEXT BREAKOUT',
    detail: '3.9× q/q · rank 32/124',
    color: colors.blue,
  },
  {
    date: "MAY 08 ’26",
    title: 'TOP-20 PORTFOLIO ENTRY',
    detail: 'Simulated fill $136.01 · rank 12',
    color: colors.amber,
  },
  {
    date: "AUG 13 ’26",
    title: 'RANK BUFFER HOLDS',
    detail: '+31.6% simulated · HOLD',
    color: colors.mint,
  },
];

const milestoneMarkup = milestones
  .map((milestone, index) => {
    const x = 86 + index * 260;
    return `
      <rect x="${x}" y="687" width="244" height="118" rx="16" fill="${colors.panel}" stroke="${colors.line}"/>
      <rect x="${x}" y="687" width="5" height="118" rx="2.5" fill="${milestone.color}"/>
      <text x="${x + 22}" y="716" class="milestoneDate" fill="${milestone.color}">${milestone.date}</text>
      <text x="${x + 22}" y="746" class="milestoneTitle">${milestone.title}</text>
      <text x="${x + 22}" y="779" class="milestoneDetail">${milestone.detail}</text>
    `;
  })
  .join('');

const fontStack = `-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif`;
const svg = Buffer.from(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#08101C" stop-opacity=".95"/>
        <stop offset=".58" stop-color="#070C14" stop-opacity=".92"/>
        <stop offset="1" stop-color="#0B111D" stop-opacity=".96"/>
      </linearGradient>
      <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${colors.mint}" stop-opacity=".28"/>
        <stop offset="1" stop-color="${colors.mint}" stop-opacity="0"/>
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <style>
        text { font-family: ${fontStack}; }
        .brand { fill: ${colors.text}; font-size: 18px; font-weight: 800; letter-spacing: 3.2px; }
        .brandSub { fill: ${colors.muted}; font-size: 11px; font-weight: 700; letter-spacing: 2.1px; }
        .chip { fill: ${colors.muted}; font-size: 11px; font-weight: 750; letter-spacing: 1.4px; }
        .hero { fill: ${colors.text}; font-size: 48px; font-weight: 780; letter-spacing: -1.35px; }
        .deck { fill: ${colors.muted}; font-size: 18px; font-weight: 500; }
        .chartTitle { fill: ${colors.text}; font-size: 14px; font-weight: 780; letter-spacing: 1.5px; }
        .chartNote { fill: ${colors.subdued}; font-size: 10px; font-weight: 700; letter-spacing: .9px; }
        .axis { fill: ${colors.subdued}; font-size: 10px; font-weight: 650; }
        .axisDate { fill: ${colors.muted}; font-size: 11px; font-weight: 750; letter-spacing: .8px; }
        .pointLabel { font-size: 11px; font-weight: 800; letter-spacing: .35px; }
        .railTitle { fill: ${colors.muted}; font-size: 11px; font-weight: 800; letter-spacing: 1.7px; }
        .railHero { fill: ${colors.mint}; font-size: 58px; font-weight: 820; letter-spacing: -2.3px; }
        .railLabel { fill: ${colors.muted}; font-size: 10px; font-weight: 750; letter-spacing: 1px; }
        .railStat { fill: ${colors.text}; font-size: 30px; font-weight: 790; letter-spacing: -.7px; }
        .railGain { fill: ${colors.amber}; font-size: 44px; font-weight: 820; letter-spacing: -1.5px; }
        .railFine { fill: ${colors.subdued}; font-size: 10px; font-weight: 600; }
        .thesisKicker { fill: ${colors.mint}; font-size: 10px; font-weight: 800; letter-spacing: 1.6px; }
        .thesis { fill: ${colors.text}; font-size: 26px; font-weight: 790; letter-spacing: -.4px; }
        .milestoneDate { font-size: 11px; font-weight: 820; letter-spacing: 1.2px; }
        .milestoneTitle { fill: ${colors.text}; font-size: 12px; font-weight: 790; letter-spacing: .35px; }
        .milestoneDetail { fill: ${colors.muted}; font-size: 10.5px; font-weight: 580; }
        .footer { fill: ${colors.subdued}; font-size: 9.5px; font-weight: 560; }
        .url { fill: ${colors.text}; font-size: 11px; font-weight: 760; letter-spacing: .5px; }
      </style>
    </defs>

    <rect width="1600" height="900" fill="url(#page)"/>
    <path d="M42 149C342 38 568 73 805 215" fill="none" stroke="#3A7A91" stroke-width="1" opacity=".13"/>
    <path d="M1572 83C1347 164 1314 336 1418 473" fill="none" stroke="${colors.mint}" stroke-width="1" opacity=".11"/>

    <text x="148" y="82" class="brand">THESISFORGE</text>
    <text x="148" y="105" class="brandSub">ONTOLOGY V2 · $PLTR CASE STUDY · INDEPENDENT RESEARCH</text>

    <rect x="1233" y="63" width="123" height="31" rx="15.5" fill="${colors.mintSoft}" stroke="#276B5E"/>
    <text x="1294.5" y="83" text-anchor="middle" class="chip" fill="${colors.mint}">PIT REPLAY</text>
    <rect x="1368" y="63" width="146" height="31" rx="15.5" fill="#111B29" stroke="${colors.line}"/>
    <text x="1441" y="83" text-anchor="middle" class="chip">30 AUG 2026</text>

    <text x="86" y="181" class="hero">THIS QUARTER MADE PLTR OBVIOUS.</text>
    <text x="86" y="238" class="hero">THE SIGNAL STARTED A YEAR EARLIER.</text>
    <text x="88" y="280" class="deck">First green flag: Aug 2025. Broad-stage peer context broke out in Feb—and stayed elevated.</text>

    <rect x="86" y="321" width="1038" height="337" rx="22" fill="${colors.panel}" stroke="${colors.line}"/>
    <text x="120" y="361" class="chartTitle">BROAD-STAGE PEER CONTEXT · V2 MODEL SCORE</text>
    <text x="1087" y="361" text-anchor="end" class="chartNote">COMPOSITE SIGNAL · NOT PEER-STOCK PERFORMANCE</text>
    ${gridMarkup}
    <path d="${areaPath}" fill="url(#chart-area)"/>
    <path d="${curvePath}" fill="none" stroke="${colors.mint}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>
    ${pointsMarkup}
    <rect x="774" y="378" width="292" height="27" rx="13.5" fill="${colors.mintSoft}" stroke="#28685D"/>
    <text x="920" y="396" text-anchor="middle" class="chartNote" fill="${colors.mint}">BREAKOUT BEGAN FEB ’26 · LATEST REMAINS 3.64× AUG ’25</text>

    <rect x="1148" y="137" width="366" height="668" rx="22" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="1180" y="181" class="railTitle">LATEST Q2 EVIDENCE</text>
    <text x="1180" y="252" class="railHero">78.9%</text>
    <text x="1182" y="278" class="railLabel">TTM REVENUE GROWTH · +11.2pp ACCELERATION</text>
    <path d="M1180 302H1482" stroke="${colors.line}"/>

    <text x="1180" y="345" class="railStat">42.8%</text>
    <text x="1182" y="367" class="railLabel">OPERATING MARGIN</text>
    <text x="1340" y="345" class="railStat">54.6%</text>
    <text x="1342" y="367" class="railLabel">FCF MARGIN</text>
    <path d="M1180 392H1482" stroke="${colors.line}"/>

    <text x="1180" y="427" class="railTitle">FIXED-RULE 6M REPLAY</text>
    <text x="1180" y="480" class="railGain">+31.6%</text>
    <text x="1182" y="504" class="railLabel">SIMULATED · MAY 08 → AUG 13, 2026</text>
    <text x="1182" y="526" class="railFine">Modeled fill $136.01 · Snapshot $179.01 · HOLD</text>
    <path d="M1180 548H1482" stroke="${colors.line}"/>

    <rect x="1175" y="572" width="312" height="192" rx="17" fill="${colors.mintSoft}" stroke="#28685D"/>
    <text x="1200" y="605" class="thesisKicker">OUR RESEARCH THESIS</text>
    <text x="1200" y="642" class="thesis">PALANTIR IS</text>
    <text x="1200" y="674" class="thesis">BECOMING</text>
    <text x="1200" y="706" class="thesis">MISSION-CRITICAL</text>
    <text x="1200" y="738" class="thesis" fill="${colors.mint}">AI SOFTWARE.</text>

    ${milestoneMarkup}

    <path d="M86 835H1514" stroke="${colors.line}"/>
    <text x="86" y="859" class="footer">Point-in-time diagnostic replay generated Aug 2026—not an archived live alert. Historical simulation. Independent research; not affiliated with Palantir Technologies. Not advice.</text>
    <text x="1514" y="859" text-anchor="end" class="footer">FILING DATA AUG 04 · SNAPSHOT AUG 13</text>
    <circle cx="1380" cy="881" r="4.5" fill="${colors.mint}"/>
    <text x="1393" y="885" class="url">thesisforge.tech</text>
  </svg>
`);

const [background, mark] = await Promise.all([
  sharp(backgroundSource)
    .resize(1600, 900, { fit: 'cover' })
    .modulate({ brightness: 0.55, saturation: 0.62 })
    .png()
    .toBuffer(),
  sharp(markSource).resize(48, 48, { fit: 'contain' }).png().toBuffer(),
]);

await sharp(background)
  .composite([
    { input: svg, left: 0, top: 0 },
    { input: mark, left: 84, top: 59 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

const dataSha256 = createHash('sha256').update(dataBytes).digest('hex');
await writeFile(
  manifestOutput,
  `${JSON.stringify(
    {
      title: 'PLTR Ontology V2 case study — ThesisForge social graphic',
      generatedAt: data.releaseDate,
      dimensions: '1600x900',
      output: path.relative(root, output),
      data: {
        source: path.relative(root, dataSource),
        sha256: dataSha256,
        sourceArtifact: data.source.artifact,
        sourceArtifactSha256: data.source.artifactSha256,
        routeKeys: data.source.routeKeys,
      },
      rendering: {
        chart:
          'All five quarterly peer-context observations are rendered on a shared linear axis using straight SVG line segments without smoothing.',
        background: {
          source: path.relative(root, backgroundSource),
          role: 'Low-contrast atmospheric treatment only; logo, copy, evidence, and chart are deterministic overlays.',
        },
        mark: path.relative(root, markSource),
      },
      evidence: {
        firstGreenFlag: data.milestones[0],
        peerBreakout: data.peerBreakout,
        portfolioEntry: data.milestones[2],
        latestFundamentals: data.latestFundamentals,
        portfolioReplay: data.portfolioReplay,
      },
      editorial: {
        interpretation: data.interpretation,
        palantirIdentification:
          'The Palantir name and PLTR ticker are used only for editorial identification. No Palantir logo, UI, trade dress, or endorsement is used or implied.',
      },
      caveats: data.caveats,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${output}`);
console.log(`Wrote ${manifestOutput}`);
