import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
const releaseDate = '2026-08-30';
const outputDir = path.join(root, 'docs/brand', releaseDate);
const sourceScreenshot = path.resolve(
  process.env.NVDA_VALUATION_SCREENSHOT ||
    path.join(root, 'output/playwright/nvda-valuation-v55-windowed-tall.png'),
);
const databasePath = process.env.NVDA_VALUATION_DB;
if (!databasePath) {
  throw new Error(
    'Set NVDA_VALUATION_DB to the audited v55 candidate database. Refusing to fall back to a stale database.',
  );
}

const output = path.join(outputDir, 'nvda-q2-valuation-card-windowed-en-1600x900.png');
const curveOutput = path.join(outputDir, 'nvda-q2-valuation-curve-windowed-source.png');
const dataOutput = path.join(outputDir, 'nvda-q2-valuation-card-windowed-data.json');
const manifestOutput = path.join(outputDir, 'nvda-q2-valuation-card-windowed-manifest.json');
const copyOutput = path.join(outputDir, 'nvda-q2-valuation-card-windowed-copy-en.md');
const markSource = path.join(root, 'assets/branding/thesisforge-mark.png');
const nvidiaLogoSource = path.join(
  root,
  'assets/branding/external/nvidia-logo-horiz-wht-16x9-official.png',
);

const expectedModelVersion = 'pit-valuation-v55-actual-value-and-owner-audit-2026-08-30';
const officialReleaseUrl =
  'https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/default.aspx';
const officialLogoPage = 'https://nvidianews.nvidia.com/multimedia/corporate/nvidia-logos';
const width = 1600;
const height = 900;
const crop = { left: 20, top: 1455, width: 1070, height: 390 };

const colors = {
  ink: '#0B111D',
  panel: '#101826',
  panel2: '#141E2D',
  line: '#263248',
  mint: '#22D3A6',
  mintDeep: '#0E6D5B',
  amber: '#E0B15A',
  text: '#F8FAFC',
  muted: '#A8B2C4',
  subdued: '#718096',
};

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Missing finite ${label}`);
  return number;
}

function closeTo(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} changed: expected ${expected}, received ${actual}`);
  }
}

function money(value, digits = 0) {
  return `$${finite(value, 'money').toFixed(digits)}`;
}

function billions(valueM, digits = 1) {
  return `$${(finite(valueM, 'millions') / 1_000).toFixed(digits)}B`;
}

function percent(value, digits = 1) {
  return `${finite(value, 'percent').toFixed(digits)}%`;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

await mkdir(outputDir, { recursive: true });

const db = new DatabaseSync(databasePath, { readOnly: true });
const snapshotRow = db
  .prepare('SELECT generated_at, payload_json FROM valuation_ticker_snapshots WHERE ticker = ?')
  .get('NVDA');
db.close();
if (!snapshotRow?.payload_json) throw new Error(`NVDA is missing from ${databasePath}`);

const payload = JSON.parse(snapshotRow.payload_json);
const history = [...(payload.history || [])].sort((left, right) =>
  String(left.asOfDate).localeCompare(String(right.asOfDate)),
);
const currentNode = history.at(-1);
const previousNode = history.at(-2);
const modelVersion = payload.dataQuality?.modelVersion;
if (modelVersion !== expectedModelVersion) {
  throw new Error(`Unexpected NVDA model version: ${modelVersion}`);
}
if (currentNode?.label !== 'FY2027 Q2' || currentNode?.asOfDate !== '2026-08-26') {
  throw new Error('The latest NVDA valuation node is not the audited FY2027 Q2 point-in-time node.');
}

const latest = payload.latest || {};
const fiscal = currentNode.dataSnapshot?.fiscalFinancials || {};
const score = currentNode.dataSnapshot?.valuationSemantics?.scoreInputs || {};
const methodOutputs = Object.fromEntries(
  (currentNode.methodOutputs || []).map((item) => [item.key, item]),
);
const currentPrice = finite(latest.latestPrice, 'latest price');
const fairValue = finite(latest.baseFairValue, 'fair value');
const modelGapPct = finite(latest.upsideToBase, 'model gap') * 100;
const targetPrice3Y = finite(latest.targetPrice3Y, 'three-year model value');
const q2RevenueM = finite(fiscal.revenue_m, 'Q2 revenue');
const q2RevenueGrowthPct = finite(fiscal.revenue_growth_pct, 'Q2 revenue growth');
const q3RevenueGuideM = finite(score.quarterlyRevenueGuidanceM, 'Q3 revenue guide');
const ttmFcfM = finite(score.ttmFreeCashFlow, 'TTM free cash flow');
const forwardFcfM = finite(score.valuationFreeCashFlow, 'forward valuation free cash flow');
const fairValueChangePct =
  (finite(currentNode.fairValue, 'current node fair value') /
    finite(previousNode?.fairValue, 'previous node fair value') -
    1) *
  100;
const modelComponents = [
  {
    key: 'ev-sales-equity-value',
    label: 'EV / SALES',
    weightPct: finite(score.methodWeights?.['ev-sales-equity-value'], 'EV/sales weight') * 100,
    value: finite(methodOutputs['ev-sales-equity-value']?.value, 'EV/sales value'),
  },
  {
    key: 'normalized-earnings-power',
    label: 'EARNINGS',
    weightPct: finite(score.methodWeights?.['normalized-earnings-power'], 'earnings weight') * 100,
    value: finite(methodOutputs['normalized-earnings-power']?.value, 'earnings value'),
  },
  {
    key: 'fcfe-dcf',
    label: 'FCFE DCF',
    weightPct: finite(score.methodWeights?.['fcfe-dcf'], 'FCFE DCF weight') * 100,
    value: finite(methodOutputs['fcfe-dcf']?.value, 'FCFE DCF value'),
  },
];

closeTo(currentPrice, 227.97999572753906, 0.001, 'latest price');
closeTo(fairValue, 274.8572171026456, 0.001, 'fair value');
closeTo(modelGapPct, 20.56198888218681, 0.001, 'model gap');
closeTo(q2RevenueM, 96_221, 0.001, 'Q2 revenue');
closeTo(q3RevenueGuideM, 108_000, 0.001, 'Q3 guide');
closeTo(score.quarterlyRevenueGuidanceWeight, 0.65, 0.0001, 'quarterly guidance weight');

const [sourceScreenshotBytes, markBytes, nvidiaLogoBytes] = await Promise.all([
  readFile(sourceScreenshot),
  readFile(markSource),
  readFile(nvidiaLogoSource),
]);
const screenshotMetadata = await sharp(sourceScreenshotBytes).metadata();
if (screenshotMetadata.width !== 1800 || screenshotMetadata.height !== 2600) {
  throw new Error(
    `Unexpected NVDA screenshot dimensions: ${screenshotMetadata.width}x${screenshotMetadata.height}`,
  );
}

const curveBytes = await sharp(sourceScreenshotBytes)
  .extract(crop)
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(curveOutput, curveBytes);

const plot = { x: 76, y: 294, width: 1018, height: 371, radius: 18 };
const plotMask = Buffer.from(`
  <svg width="${plot.width}" height="${plot.height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${plot.width}" height="${plot.height}" rx="${plot.radius}" fill="white"/>
  </svg>
`);
const renderedCurve = await sharp(curveBytes)
  .resize(plot.width, plot.height, { fit: 'fill' })
  .composite([{ input: plotMask, blend: 'dest-in' }])
  .png()
  .toBuffer();
const renderedMark = await sharp(markBytes)
  .resize(46, 46, { fit: 'contain' })
  .png()
  .toBuffer();
const nvidiaLogoMetadata = await sharp(nvidiaLogoBytes).metadata();
if (nvidiaLogoMetadata.width !== 3840 || nvidiaLogoMetadata.height !== 2160) {
  throw new Error(
    `Unexpected official NVIDIA logo dimensions: ${nvidiaLogoMetadata.width}x${nvidiaLogoMetadata.height}`,
  );
}
// The official media-kit PNG is a 16:9 black canvas. Crop only its empty
// canvas while preserving the complete two-color artwork and its proportions.
const renderedNvidiaLogo = await sharp(nvidiaLogoBytes)
  .extract({ left: 432, top: 700, width: 2_976, height: 760 })
  .resize(168, 43, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  })
  .png()
  .toBuffer();

const topMetrics = [
  ['PRICE', money(currentPrice, 2), colors.text],
  ['MODEL FAIR VALUE', money(fairValue, 2), colors.mint],
  ['MODEL GAP', `+${percent(modelGapPct, 1)}`, colors.mint],
  ['3Y MODEL VALUE', money(targetPrice3Y, 0), colors.amber],
];

const metricCells = topMetrics
  .map(([label, value, color], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 1010 + col * 250;
    const y = 142 + row * 64;
    return `
      <text x="${x}" y="${y}" class="metric-label">${escapeXml(label)}</text>
      <text x="${x}" y="${y + 31}" class="metric-value" fill="${color}">${escapeXml(value)}</text>
    `;
  })
  .join('');

const componentCells = modelComponents
  .map((component, index) => {
    const x = 96 + index * 330;
    return `
      <text x="${x}" y="735" class="component-label">${Math.round(component.weightPct)}% ${escapeXml(component.label)}</text>
      <text x="${x}" y="775" class="component-value">${escapeXml(money(component.value, 0))}</text>
    `;
  })
  .join('');

const cardSvg = Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08111E"/>
      <stop offset="1" stop-color="#0B1421"/>
    </linearGradient>
    <linearGradient id="mintLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${colors.mint}"/>
      <stop offset="1" stop-color="#51E3C0" stop-opacity=".12"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#000814" flood-opacity=".55"/>
    </filter>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, Inter, "SF Pro Display", "Segoe UI", sans-serif; }
      .brand { fill: ${colors.text}; font-size: 19px; font-weight: 800; letter-spacing: 3.4px; }
      .meta { fill: ${colors.muted}; font-size: 13px; font-weight: 650; letter-spacing: 1.5px; }
      .eyebrow { fill: ${colors.mint}; font-size: 14px; font-weight: 800; letter-spacing: 2px; }
      .headline { fill: ${colors.text}; font-size: 47px; font-weight: 850; letter-spacing: -.8px; }
      .subhead { fill: ${colors.muted}; font-size: 18px; font-weight: 520; }
      .metric-label { fill: ${colors.subdued}; font-size: 11px; font-weight: 750; letter-spacing: 1.2px; }
      .metric-value { font-size: 27px; font-weight: 850; }
      .evidence-label { fill: ${colors.subdued}; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; }
      .evidence-value { fill: ${colors.text}; font-size: 31px; font-weight: 850; }
      .evidence-note { fill: ${colors.muted}; font-size: 13px; font-weight: 580; }
      .section-label { fill: ${colors.muted}; font-size: 12px; font-weight: 800; letter-spacing: 1.5px; }
      .component-label { fill: ${colors.muted}; font-size: 12px; font-weight: 800; letter-spacing: 1.1px; }
      .component-value { fill: ${colors.text}; font-size: 31px; font-weight: 850; }
      .blend-label { fill: ${colors.mint}; font-size: 12px; font-weight: 850; letter-spacing: 1.2px; }
      .blend-value { fill: ${colors.mint}; font-size: 36px; font-weight: 900; }
      .footer { fill: ${colors.subdued}; font-size: 11px; font-weight: 560; }
      .site { fill: ${colors.muted}; font-size: 13px; font-weight: 700; letter-spacing: .4px; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="1320" cy="100" r="260" fill="${colors.mint}" opacity=".025"/>
  <rect x="40" y="32" width="1520" height="836" rx="30" fill="${colors.panel}" stroke="${colors.line}" stroke-width="1.5" filter="url(#shadow)"/>
  <rect x="40" y="32" width="7" height="836" rx="3.5" fill="${colors.mint}"/>

  <text x="142" y="72" class="brand">THESISFORGE</text>
  <text x="142" y="92" class="meta" font-size="11">EVIDENCE BEFORE NARRATIVE</text>
  <text x="1520" y="72" class="meta" text-anchor="end">RELEASE 2026-08-30 · PIT NODE 2026-08-26 · PRICE 2026-08-27</text>
  <line x1="76" y1="108" x2="1524" y2="108" stroke="${colors.line}"/>

  <line x1="260" y1="123" x2="260" y2="157" stroke="${colors.line}"/>
  <text x="280" y="146" class="eyebrow">NVDA · FY2027 Q2</text>
  <text x="76" y="226" class="headline" font-size="54">NVDA LOOKS UNDERVALUED.</text>
  <text x="76" y="270" class="subhead">Q2 revenue +${percent(q2RevenueGrowthPct, 0)} YoY. Model fair value: ${money(fairValue, 0)} vs. ${money(currentPrice, 0)}.</text>

  <rect x="982" y="120" width="540" height="143" rx="18" fill="${colors.panel2}" stroke="${colors.line}"/>
  <line x1="1242" y1="134" x2="1242" y2="250" stroke="${colors.line}"/>
  <line x1="998" y1="192" x2="1506" y2="192" stroke="${colors.line}"/>
  ${metricCells}

  <rect x="${plot.x - 1}" y="${plot.y - 1}" width="${plot.width + 2}" height="${plot.height + 2}" rx="${plot.radius + 1}" fill="none" stroke="url(#mintLine)" stroke-width="2"/>

  <rect x="1116" y="294" width="406" height="371" rx="18" fill="${colors.panel2}" stroke="${colors.line}"/>
  <text x="1142" y="328" class="section-label">Q2 + FORWARD INPUTS</text>
  <line x1="1142" y1="343" x2="1496" y2="343" stroke="${colors.line}"/>

  <text x="1142" y="375" class="evidence-label">Q2 REVENUE</text>
  <text x="1142" y="412" class="evidence-value">${billions(q2RevenueM, 1)}</text>
  <text x="1496" y="410" class="evidence-note" fill="${colors.mint}" text-anchor="end">+${percent(q2RevenueGrowthPct, 0)} YoY</text>

  <text x="1142" y="458" class="evidence-label">Q3 REVENUE GUIDE</text>
  <text x="1142" y="495" class="evidence-value">${billions(q3RevenueGuideM, 0)} <tspan font-size="17" fill="${colors.muted}">±2%</tspan></text>
  <text x="1142" y="519" class="evidence-note">Management outlook</text>

  <text x="1142" y="565" class="evidence-label">TTM FCF / FORWARD MODEL FCF</text>
  <text x="1142" y="602" class="evidence-value">${billions(ttmFcfM, 0)} <tspan font-size="18" fill="${colors.subdued}">→</tspan> <tspan fill="${colors.mint}">${billions(forwardFcfM, 0)}</tspan></text>
  <text x="1142" y="628" class="evidence-note">Reported TTM / valuation input</text>

  <rect x="76" y="690" width="1446" height="111" rx="18" fill="${colors.panel2}" stroke="${colors.line}"/>
  <text x="96" y="718" class="section-label">BLENDED VALUATION MODEL · PRICE EXCLUDED FROM FAIR VALUE</text>
  ${componentCells}
  <line x1="1087" y1="714" x2="1087" y2="785" stroke="${colors.line}"/>
  <text x="1120" y="735" class="blend-label">BLENDED FAIR VALUE</text>
  <text x="1120" y="779" class="blend-value">${money(fairValue, 0)}</text>
  <text x="1298" y="775" class="evidence-note">+${percent(modelGapPct, 1)} vs. price</text>

  <line x1="76" y1="824" x2="1524" y2="824" stroke="${colors.line}"/>
  <text x="76" y="848" class="footer">NVIDIA and its logo are NVIDIA Corp. trademarks. Independent research; no affiliation or endorsement. Not investment advice.</text>
  <circle cx="1390" cy="844" r="4" fill="${colors.mint}"/>
  <text x="1524" y="849" class="site" text-anchor="end">thesisforge.tech</text>
</svg>
`);

const finalBytes = await sharp(cardSvg)
  .composite([
    { input: renderedMark, left: 82, top: 51 },
    { input: renderedNvidiaLogo, left: 76, top: 119 },
    { input: renderedCurve, left: plot.x, top: plot.y },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(output, finalBytes);

const sourcePayloadHash = hash(Buffer.from(snapshotRow.payload_json));
const data = {
  title: 'NVDA looks undervalued',
  releaseDate,
  ticker: 'NVDA',
  company: 'NVIDIA Corporation',
  modelVersion,
  snapshotGeneratedAt: payload.generatedAt,
  latestPrice: {
    value: currentPrice,
    date: latest.latestPriceDate,
    source: latest.latestPriceSource,
  },
  latestValuationNode: {
    label: currentNode.label,
    asOfDate: currentNode.asOfDate,
    periodEndDate: currentNode.dataSnapshot?.selectedFinancialPeriod?.periodEndDate,
    fairValue,
    previousFairValue: previousNode.fairValue,
    fairValueChangePct,
    modelGapPct,
    targetPrice3Y,
  },
  reportedAndGuidedInputs: {
    q2RevenueM,
    q2RevenueGrowthPct,
    q2GrossMarginPct: fiscal.gross_margin_pct,
    q2OperatingIncomeM: fiscal.operating_income_m,
    q2NetIncomeM: fiscal.net_income_m,
    q3RevenueGuideM,
    q3RevenueGuideTolerancePct: 2,
    ttmRevenueM: score.ttmRevenue,
    ttmFcfM,
    forwardValuationRevenueM: score.valuationRevenue,
    forwardValuationFcfM: forwardFcfM,
    forwardRevenueSource: score.forwardRevenueSource,
    annualizedQuarterlyRevenueGuidanceM: score.annualizedQuarterlyRevenueGuidanceM,
    quarterlyRevenueGuidanceWeight: score.quarterlyRevenueGuidanceWeight,
    formulaForwardWeight: 1 - score.quarterlyRevenueGuidanceWeight,
  },
  methodology: {
    name: currentNode.method,
    priceExcludedFromFairValue: true,
    components: modelComponents,
    dcfDiscountRate: score.equityDcf?.discountRate,
    dcfTerminalGrowth: score.equityDcf?.terminalGrowth,
  },
  chartSeries: {
    fairValueAndQuarterPrice: history.map((node) => ({
      asOfDate: node.asOfDate,
      label: node.label,
      quarterPrice: node.currentPrice,
      fairValue: node.fairValue,
      upsideDownside: node.upsideDownside,
    })),
    dailyPrice: payload.priceHistory || [],
  },
  sources: [
    {
      name: 'NVIDIA FY2027 Q2 earnings release',
      url: officialReleaseUrl,
      publishedAt: '2026-08-26',
      supports: ['Q2 revenue', 'Q2 revenue growth', 'Q3 revenue guidance'],
    },
    {
      name: 'NVIDIA official logo media asset',
      url: officialLogoPage,
      assetSha256: hash(nvidiaLogoBytes),
      usage: 'Editorial identification; artwork unchanged except empty-canvas crop and proportional resizing.',
    },
    {
      name: 'ThesisForge audited PIT valuation snapshot',
      modelVersion,
      valuationNodeDate: currentNode.asOfDate,
      marketPriceDate: latest.latestPriceDate,
      payloadSha256: sourcePayloadHash,
    },
  ],
  caveats: [
    'The $274.86 headline is a blended model fair value, not the standalone FCFE DCF output.',
    'The $182.2B forward valuation FCF is a model input; reported TTM FCF is $127.0B.',
    'The $108B Q3 revenue figure is management guidance with a plus-or-minus 2% range.',
    'The 3Y model value is not a current fair value or a guaranteed price target.',
    'Research only; not investment advice.',
  ],
};
await writeFile(dataOutput, `${JSON.stringify(data, null, 2)}\n`);

const copy = `# NVDA Q2 valuation card copy

## X post

NVDA's Q2 did not just beat — it reset the valuation inputs.

- Q2 revenue: ${billions(q2RevenueM, 1)} (+${percent(q2RevenueGrowthPct, 0)} YoY)
- Q3 revenue guide: ${billions(q3RevenueGuideM, 0)} ±2%
- TTM FCF: ${billions(ttmFcfM, 0)}
- Forward valuation FCF: ${billions(forwardFcfM, 0)}

Our point-in-time model fair value rose ${percent(fairValueChangePct, 1)} QoQ to ${money(fairValue, 0)}. At ${money(currentPrice, 0)}, that implies a ${percent(modelGapPct, 1)} model gap — meaningful, but not "very cheap."

The ${billions(ttmFcfM, 0)} is reported TTM FCF; ${billions(forwardFcfM, 0)} is a forward model input. Estimate, not investment advice.

## Suggested tags

Use **$NVDA**. Do not tag NVIDIA's corporate account: the post is independent valuation research and should not imply endorsement.
`;
await writeFile(copyOutput, copy);

const manifest = {
  title: 'NVDA Looks Undervalued',
  releaseDate,
  underlyingDataCut: {
    valuationNode: currentNode.asOfDate,
    marketPrice: latest.latestPriceDate,
    snapshotGeneratedAt: payload.generatedAt,
  },
  modelVersion,
  outputs: {
    card: path.relative(root, output),
    curveSource: path.relative(root, curveOutput),
    data: path.relative(root, dataOutput),
    copy: path.relative(root, copyOutput),
  },
  sourceScreenshot: {
    path: path.relative(root, sourceScreenshot),
    width: screenshotMetadata.width,
    height: screenshotMetadata.height,
    sha256: hash(sourceScreenshotBytes),
    crop,
    policy: 'Native chart pixels only; no smoothing, redrawing, relabeling, or curve reshaping.',
  },
  officialNvidiaLogo: {
    path: path.relative(root, nvidiaLogoSource),
    sourcePage: officialLogoPage,
    width: nvidiaLogoMetadata.width,
    height: nvidiaLogoMetadata.height,
    sha256: hash(nvidiaLogoBytes),
    transformation: 'Empty black-canvas crop plus proportional resizing; logo artwork, colors, and proportions preserved.',
  },
  provenance: {
    databaseBasename: path.basename(databasePath),
    nvdaSnapshotPayloadSha256: sourcePayloadHash,
    curveSha256: hash(curveBytes),
    cardSha256: hash(finalBytes),
    officialReleaseUrl,
  },
  claims: {
    currentPrice,
    fairValue,
    modelGapPct,
    targetPrice3Y,
    q2RevenueM,
    q2RevenueGrowthPct,
    q3RevenueGuideM,
    ttmFcfM,
    forwardFcfM,
    fairValueChangePct,
  },
  disclosures: [
    'NVIDIA and the NVIDIA logo are trademarks and/or registered trademarks of NVIDIA Corporation.',
    'Independent research; no NVIDIA affiliation or endorsement.',
    'Model output is not a guaranteed price target.',
    'Research only; not investment advice.',
  ],
};
await writeFile(manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      output,
      curveOutput,
      dataOutput,
      manifestOutput,
      copyOutput,
      currentPrice,
      fairValue,
      modelGapPct,
      fairValueChangePct,
      modelVersion,
    },
    null,
    2,
  ),
);
