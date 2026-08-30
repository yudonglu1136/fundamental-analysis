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
const dataSource = path.join(outputDir, 'pltr-ontology-case-study-data.json');
const output = path.join(outputDir, 'pltr-ontology-case-study-en-1600x900.png');
const manifestOutput = path.join(outputDir, 'pltr-ontology-case-study-manifest.json');
const backgroundSource =
  process.env.PLTR_CASE_STUDY_BACKGROUND ||
  path.join(outputDir, 'guru-top3-consensus-background.png');
const markSource = path.join(root, 'assets/branding/thesisforge-mark.png');

const colors = {
  ink: '#060B12',
  panel: '#0C1522',
  panelStrong: '#101C2B',
  line: '#26374E',
  lineSoft: '#1A2A3E',
  mint: '#38E2B7',
  mintSoft: '#123D38',
  amber: '#F4B860',
  amberSoft: '#3A2B17',
  blue: '#68B8FF',
  text: '#F7FAFC',
  muted: '#ADB9CA',
  subdued: '#71839A',
};

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const assertNear = (actual, expected, label, tolerance = 1e-9) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} mismatch: ${actual} vs ${expected}`);
  }
};

await mkdir(outputDir, { recursive: true });
const dataBytes = await readFile(dataSource);
const data = JSON.parse(dataBytes.toString('utf8'));
const series = data.heatRankSeries;
const before = data.q2RankCheck.before;
const after = data.q2RankCheck.after;
const fundamentals = data.latestFundamentals;

if (
  data.releaseDate !== '2026-08-30' ||
  data.ticker !== 'PLTR' ||
  data.model.metric !== 'heat_score' ||
  !Array.isArray(series) ||
  series.length !== 6
) {
  throw new Error('Unexpected PLTR Q2 confirmation data contract.');
}

if (
  before.rank !== 2 ||
  before.universe !== 74 ||
  after.rank !== 2 ||
  after.universe !== 74 ||
  data.q2RankCheck.rankChange !== 0
) {
  throw new Error('The verified Q2 rank contract changed.');
}

assertNear(before.heatScore, 85.2, 'pre-Q2 heat score');
assertNear(after.heatScore, 85.7, 'post-Q2 heat score');
assertNear(after.heatScore - before.heatScore, data.q2RankCheck.heatScoreChange, 'heat-score change');
assertNear(fundamentals.revenueGrowthYoY, 0.7892124221826102, 'Q2 revenue growth');
assertNear(fundamentals.operatingMargin, 0.4279852584682017, 'Q2 operating margin');
assertNear(fundamentals.freeCashFlowMargin, 0.5455334935796168, 'Q2 FCF margin');

const chart = { x: 96, y: 363, width: 930, height: 270, topPad: 34, bottomPad: 40 };
const rankMin = 1;
const rankMax = 8;
const xFor = (index) => chart.x + (index / (series.length - 1)) * chart.width;
const yFor = (rank) =>
  chart.y +
  chart.topPad +
  ((rank - rankMin) / (rankMax - rankMin)) *
    (chart.height - chart.topPad - chart.bottomPad);
const coordinates = series.map((point, index) => [xFor(index), yFor(point.rank)]);
const linePath = coordinates
  .map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
  .join(' ');
const areaPath = `${linePath} L${coordinates.at(-1)[0].toFixed(2)} ${(
  chart.y + chart.height - chart.bottomPad
).toFixed(2)} L${coordinates[0][0].toFixed(2)} ${(
  chart.y + chart.height - chart.bottomPad
).toFixed(2)} Z`;

const dateLabels = ["AUG '25", 'NOV', "FEB '26", 'MAY', 'JUL 31', 'AUG 04'];
const yTicks = [1, 3, 5, 8];
const gridMarkup = yTicks
  .map((rank) => {
    const y = yFor(rank);
    return `
      <path d="M${chart.x} ${y.toFixed(2)}H${chart.x + chart.width}" stroke="${colors.lineSoft}" stroke-width="1"/>
      <text x="${chart.x - 16}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis">#${rank}</text>
    `;
  })
  .join('');

const pointMarkup = coordinates
  .map(([x, y], index) => {
    const point = series[index];
    const isPre = index === series.length - 2;
    const isPost = index === series.length - 1;
    const color = isPost ? colors.amber : colors.mint;
    const labelY = point.rank === 1 ? y + 31 : y - 21;
    const labelText = isPre ? '#2 BEFORE Q2' : isPost ? '#2 AFTER Q2' : `#${point.rank}`;
    const labelAnchor = isPost ? 'end' : isPre ? 'middle' : 'middle';
    const labelX = isPost ? x - 2 : x;
    const event = isPost
      ? `<path d="M${x.toFixed(2)} ${chart.y - 11}V${(
          chart.y + chart.height - chart.bottomPad
        ).toFixed(2)}" stroke="${colors.amber}" stroke-width="1.5" stroke-dasharray="5 6" opacity=".7"/>
         <rect x="${(x - 142).toFixed(2)}" y="${chart.y - 31}" width="142" height="24" rx="12" fill="${colors.amberSoft}" stroke="#765425"/>
         <text x="${(x - 71).toFixed(2)}" y="${chart.y - 15}" text-anchor="middle" class="event">Q2 · AUG 04</text>`
      : '';
    return `
      ${event}
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${isPre || isPost ? 8 : 6}" fill="${colors.panel}" stroke="${color}" stroke-width="${isPre || isPost ? 4 : 3}"/>
      <text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="${labelAnchor}" class="pointLabel" fill="${color}">${labelText}</text>
      <text x="${x.toFixed(2)}" y="${chart.y + chart.height - 9}" text-anchor="middle" class="axisDate">${dateLabels[index]}</text>
    `;
  })
  .join('');

const fontStack = `-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif`;
const svg = Buffer.from(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#08111D" stop-opacity=".95"/>
        <stop offset=".60" stop-color="#060B12" stop-opacity=".93"/>
        <stop offset="1" stop-color="#0A111C" stop-opacity=".97"/>
      </linearGradient>
      <linearGradient id="rankArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${colors.mint}" stop-opacity=".24"/>
        <stop offset="1" stop-color="${colors.mint}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="proofBand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#113C38"/>
        <stop offset=".68" stop-color="#102332"/>
        <stop offset="1" stop-color="#2E2517"/>
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <style>
        text { font-family: ${fontStack}; }
        .brand { fill: ${colors.text}; font-size: 18px; font-weight: 800; letter-spacing: 3.2px; }
        .brandSub { fill: ${colors.muted}; font-size: 11px; font-weight: 700; letter-spacing: 2.1px; }
        .chip { fill: ${colors.muted}; font-size: 11px; font-weight: 760; letter-spacing: 1.3px; }
        .hero { fill: ${colors.text}; font-size: 49px; font-weight: 820; letter-spacing: -1.5px; }
        .heroMint { fill: ${colors.mint}; }
        .deck { fill: ${colors.muted}; font-size: 18px; font-weight: 520; }
        .chartTitle { fill: ${colors.text}; font-size: 14px; font-weight: 800; letter-spacing: 1.5px; }
        .chartNote { fill: ${colors.subdued}; font-size: 10px; font-weight: 700; letter-spacing: 1px; }
        .axis { fill: ${colors.subdued}; font-size: 10px; font-weight: 680; }
        .axisDate { fill: ${colors.muted}; font-size: 10px; font-weight: 760; letter-spacing: .7px; }
        .pointLabel { font-size: 11px; font-weight: 820; letter-spacing: .35px; }
        .event { fill: ${colors.amber}; font-size: 10px; font-weight: 820; letter-spacing: 1px; }
        .railTitle { fill: ${colors.muted}; font-size: 11px; font-weight: 820; letter-spacing: 1.7px; }
        .railDate { fill: ${colors.subdued}; font-size: 10px; font-weight: 700; letter-spacing: .9px; }
        .rankBig { fill: ${colors.text}; font-size: 57px; font-weight: 840; letter-spacing: -2px; }
        .rankDenom { fill: ${colors.muted}; font-size: 21px; font-weight: 720; }
        .heat { fill: ${colors.mint}; font-size: 18px; font-weight: 800; }
        .arrow { fill: ${colors.amber}; font-size: 28px; font-weight: 800; }
        .metricValue { fill: ${colors.text}; font-size: 28px; font-weight: 820; letter-spacing: -.7px; }
        .metricLabel { fill: ${colors.subdued}; font-size: 9.5px; font-weight: 740; letter-spacing: .85px; }
        .proofKicker { fill: ${colors.mint}; font-size: 10px; font-weight: 820; letter-spacing: 1.7px; }
        .proof { fill: ${colors.text}; font-size: 24px; font-weight: 810; letter-spacing: -.4px; }
        .proofSub { fill: ${colors.muted}; font-size: 12px; font-weight: 580; }
        .footer { fill: ${colors.subdued}; font-size: 9.5px; font-weight: 560; }
        .url { fill: ${colors.text}; font-size: 11px; font-weight: 760; letter-spacing: .5px; }
      </style>
    </defs>

    <rect width="1600" height="900" fill="url(#page)"/>
    <path d="M18 198C322 41 631 58 854 212" fill="none" stroke="#42788A" stroke-width="1" opacity=".15"/>
    <path d="M1574 59C1356 145 1320 356 1464 519" fill="none" stroke="${colors.mint}" stroke-width="1" opacity=".11"/>

    <text x="148" y="82" class="brand">THESISFORGE</text>
    <text x="148" y="105" class="brandSub">ONTOLOGY · $PLTR Q2 CONFIRMATION · INDEPENDENT RESEARCH</text>
    <rect x="1228" y="63" width="126" height="31" rx="15.5" fill="${colors.mintSoft}" stroke="#276B5E"/>
    <text x="1291" y="83" text-anchor="middle" class="chip" fill="${colors.mint}">PIT REPLAY</text>
    <rect x="1366" y="63" width="148" height="31" rx="15.5" fill="#111B29" stroke="${colors.line}"/>
    <text x="1440" y="83" text-anchor="middle" class="chip">30 AUG 2026</text>

    <text x="86" y="174" class="hero">Q2 DIDN'T DISCOVER PLTR.</text>
    <text x="86" y="230" class="hero">ONTOLOGY WAS ALREADY AT <tspan class="heroMint">#2.</tspan></text>
    <text x="88" y="273" class="deck">The Aug 4 filing strengthened the evidence. The rank was already there.</text>

    <rect x="76" y="316" width="986" height="349" rx="22" fill="${colors.panel}" stroke="${colors.line}"/>
    <text x="96" y="345" class="chartTitle">AI VALUE-CHAIN FINANCIAL-CHANGE RANK</text>
    <text x="858" y="345" text-anchor="end" class="chartNote">SELECTED PIT SNAPSHOTS · 1 = STRONGEST · N=74</text>
    <rect x="${chart.x}" y="${(yFor(1) - 20).toFixed(2)}" width="${chart.width}" height="${(
      yFor(2) - yFor(1) + 40
    ).toFixed(2)}" rx="12" fill="${colors.mintSoft}" opacity=".38"/>
    ${gridMarkup}
    <path d="${areaPath}" fill="url(#rankArea)"/>
    <path d="${linePath}" fill="none" stroke="${colors.mint}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>
    ${pointMarkup}

    <rect x="1085" y="136" width="429" height="529" rx="22" fill="${colors.panelStrong}" stroke="${colors.line}"/>
    <text x="1117" y="177" class="railTitle">THE Q2 CHECK</text>

    <rect x="1112" y="202" width="155" height="141" rx="16" fill="#0B1623" stroke="${colors.line}"/>
    <text x="1134" y="228" class="railDate">BEFORE · JUL 31</text>
    <text x="1134" y="289" class="rankBig">#${before.rank}<tspan class="rankDenom">/${before.universe}</tspan></text>
    <text x="1135" y="321" class="heat">HEAT ${before.heatScore.toFixed(1)}</text>

    <text x="1299" y="281" text-anchor="middle" class="arrow">→</text>

    <rect x="1331" y="202" width="155" height="141" rx="16" fill="${colors.amberSoft}" stroke="#765425"/>
    <text x="1353" y="228" class="railDate" fill="${colors.amber}">AFTER · AUG 04</text>
    <text x="1353" y="289" class="rankBig">#${after.rank}<tspan class="rankDenom">/${after.universe}</tspan></text>
    <text x="1354" y="321" class="heat" fill="${colors.amber}">HEAT ${after.heatScore.toFixed(1)}</text>

    <rect x="1112" y="365" width="374" height="39" rx="19.5" fill="${colors.mintSoft}" stroke="#276B5E"/>
    <text x="1299" y="390" text-anchor="middle" class="chip" fill="${colors.mint}">RANK CHANGE 0 · ALREADY TOP 2.7%</text>

    <path d="M1117 431H1482" stroke="${colors.line}"/>
    <text x="1117" y="462" class="railTitle">WHAT Q2 CONFIRMED</text>

    <text x="1117" y="512" class="metricValue">${pct(fundamentals.revenueGrowthYoY)}</text>
    <text x="1118" y="533" class="metricLabel">TTM REVENUE GROWTH</text>
    <text x="1305" y="512" class="metricValue">+${fundamentals.revenueAccelerationPp.toFixed(1)}pp</text>
    <text x="1306" y="533" class="metricLabel">REVENUE ACCELERATION</text>

    <text x="1117" y="593" class="metricValue">${pct(fundamentals.operatingMargin)}</text>
    <text x="1118" y="614" class="metricLabel">OPERATING MARGIN</text>
    <text x="1305" y="593" class="metricValue">${pct(fundamentals.freeCashFlowMargin)}</text>
    <text x="1306" y="614" class="metricLabel">FREE-CASH-FLOW MARGIN</text>

    <rect x="76" y="690" width="1438" height="116" rx="22" fill="url(#proofBand)" stroke="#2B514D"/>
    <text x="108" y="724" class="proofKicker">THE REAL EDGE</text>
    <text x="108" y="763" class="proof">NOT REACTING TO THE Q2 BEAT. ARRIVING WITH PLTR ALREADY NEAR THE TOP.</text>
    <text x="108" y="788" class="proofSub">Our research read: Palantir is becoming operational infrastructure for the AI era. Interpretation—not a direct model output.</text>

    <path d="M86 838H1514" stroke="${colors.line}"/>
    <text x="86" y="861" class="footer">Point-in-time diagnostic replay generated Aug 2026—not an archived live alert. Independent research; not affiliated with Palantir Technologies. Not advice.</text>
    <text x="1514" y="861" text-anchor="end" class="footer">Q2 FILING DATA CUT · AUG 04, 2026</text>
    <circle cx="1374" cy="883" r="4.5" fill="${colors.mint}"/>
    <text x="1387" y="887" class="url">thesisforge.tech</text>
  </svg>
`);

const [background, mark] = await Promise.all([
  sharp(backgroundSource)
    .resize(1600, 900, { fit: 'cover' })
    .modulate({ brightness: 0.51, saturation: 0.58 })
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
      title: 'PLTR Ontology Q2 confirmation — ThesisForge social graphic',
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
          'Six exact selected historical heat-rank observations are plotted as an ordinal snapshot sequence with straight SVG segments; rank 1 is at the top and no smoothing is applied.',
        background: {
          source: path.relative(root, backgroundSource),
          role: 'Low-contrast atmospheric treatment only; logo, copy, evidence, and chart are deterministic overlays.',
        },
        mark: path.relative(root, markSource),
      },
      evidence: {
        rankingSurface: data.model,
        heatRankSeries: data.heatRankSeries,
        q2RankCheck: data.q2RankCheck,
        latestFundamentals: data.latestFundamentals,
        separateDecisionRankCheck: data.separateDecisionRankCheck,
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
