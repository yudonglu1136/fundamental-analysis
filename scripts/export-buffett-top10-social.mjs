import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
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
const output = path.join(outputDir, 'buffett-top10-homework-en-1600x900.png');
const dataOutput = path.join(outputDir, 'buffett-top10-homework-data.json');
const manifestOutput = path.join(outputDir, 'buffett-top10-homework-manifest.json');
const copyOutput = path.join(outputDir, 'buffett-top10-homework-copy-en.md');

const assets = {
  mark: path.join(root, 'assets/branding/thesisforge-mark.png'),
  portrait: path.join(root, 'web/guru-avatars/warren-buffett.png'),
};

const filing = {
  reportDate: '2026-06-30',
  filingDate: '2026-08-14',
  accession: '0001193125-26-352200',
  totalValueUsd: 299_253_556_246,
  totalPositions: 29,
  top10Weight: 0.8846890527822717,
  primaryDocument:
    'https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/xslForm13F_X02/primary_doc.xml',
  informationTable:
    'https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/56757.xml',
};

const holdings = [
  { ticker: 'AAPL', company: 'APPLE', weight: 22.04, valueUsd: 65_950_296_923 },
  { ticker: 'AXP', company: 'AMERICAN EXPRESS', weight: 17.14, valueUsd: 51_282_319_275 },
  { ticker: 'KO', company: 'COCA-COLA', weight: 10.86, valueUsd: 32_508_000_000 },
  { ticker: 'GOOGL', company: 'ALPHABET · CLASS A', weight: 9.41, valueUsd: 28_157_599_351, action: 'INCREASED' },
  { ticker: 'BAC', company: 'BANK OF AMERICA', weight: 9.20, valueUsd: 27_543_790_975, action: 'TRIMMED' },
  { ticker: 'CVX', company: 'CHEVRON', weight: 4.67, valueUsd: 13_986_141_890 },
  { ticker: 'OXY', company: 'OCCIDENTAL', weight: 4.30, valueUsd: 12_868_205_304 },
  { ticker: 'CB', company: 'CHUBB', weight: 3.90, valueUsd: 11_670_066_615 },
  { ticker: 'MCO', company: "MOODY'S", weight: 3.73, valueUsd: 11_173_435_852 },
  { ticker: 'GOOG', company: 'ALPHABET · CLASS C', weight: 3.21, valueUsd: 9_606_489_032, action: 'INCREASED' },
];

const colors = {
  ink: '#0B111D',
  panel: '#101826',
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

const fontStack = `-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif`;

function holdingCard(holding, index) {
  const column = index < 5 ? 0 : 1;
  const row = index % 5;
  const x = 680 + column * 405;
  const y = 236 + row * 104;
  const barWidth = Math.max(16, (holding.weight / holdings[0].weight) * 326);
  const action = holding.action
    ? `
      <rect x="${x + 231}" y="${y + 44}" width="92" height="20" rx="7" fill="${holding.action === 'TRIMMED' ? colors.redSoft : colors.mintSoft}"/>
      <text x="${x + 277}" y="${y + 58}" text-anchor="middle" class="action" fill="${holding.action === 'TRIMMED' ? colors.red : colors.mint}">${holding.action}</text>`
    : '';
  return `
    <rect x="${x}" y="${y}" width="380" height="88" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="${x + 20}" y="${y + 35}" class="rank">${String(index + 1).padStart(2, '0')}</text>
    <text x="${x + 58}" y="${y + 36}" class="ticker">${holding.ticker}</text>
    ${action}
    <text x="${x + 352}" y="${y + 36}" text-anchor="end" class="weight">${holding.weight.toFixed(2)}%</text>
    <text x="${x + 58}" y="${y + 60}" class="company">${holding.company}</text>
    <rect x="${x + 20}" y="${y + 72}" width="326" height="5" rx="2.5" fill="#202B3E"/>
    <rect x="${x + 20}" y="${y + 72}" width="${barWidth.toFixed(1)}" height="5" rx="2.5" fill="${index === 0 ? colors.amber : colors.mint}"/>
  `;
}

function processStep(x, number, label) {
  return `
    <circle cx="${x}" cy="740" r="15" fill="${colors.mint}"/>
    <text x="${x}" y="745" text-anchor="middle" class="stepNo">${number}</text>
    <text x="${x + 24}" y="745" class="step">${label}</text>
  `;
}

await mkdir(outputDir, { recursive: true });

const mark = await sharp(assets.mark).resize(58, 58, { fit: 'contain' }).png().toBuffer();
const portraitMask = Buffer.from(
  '<svg width="132" height="132" xmlns="http://www.w3.org/2000/svg"><circle cx="66" cy="66" r="66" fill="white"/></svg>',
);
const portrait = await sharp(assets.portrait)
  .resize(132, 132, { fit: 'cover', position: 'centre' })
  .modulate({ brightness: 0.98, saturation: 0.84 })
  .composite([{ input: portraitMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const svg = Buffer.from(`
  <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="mintGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(400 470) rotate(15) scale(520 430)">
        <stop stop-color="${colors.mint}" stop-opacity=".13"/>
        <stop offset="1" stop-color="${colors.mint}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
        <path d="M42 0H0V42" fill="none" stroke="#344158" stroke-width="1" opacity=".18"/>
      </pattern>
    </defs>
    <style>
      text { font-family: ${fontStack}; }
      .brand { font-size: 25px; font-weight: 800; fill: ${colors.text}; letter-spacing: .8px; }
      .meta { font-size: 15px; font-weight: 650; fill: ${colors.muted}; letter-spacing: .35px; }
      .eyebrow { font-size: 17px; font-weight: 780; fill: ${colors.mint}; letter-spacing: 1.05px; }
      .headline { font-size: 50px; font-weight: 840; fill: ${colors.text}; letter-spacing: -1.1px; }
      .headlineMint { font-size: 43px; font-weight: 840; fill: ${colors.mint}; letter-spacing: -.7px; }
      .subtitle { font-size: 18px; font-weight: 560; fill: ${colors.muted}; }
      .portraitTitle { font-size: 21px; font-weight: 800; fill: ${colors.text}; }
      .portraitMeta { font-size: 13px; font-weight: 650; fill: ${colors.muted}; letter-spacing: .45px; }
      .kpi { font-size: 31px; font-weight: 830; fill: ${colors.text}; letter-spacing: -.5px; }
      .kpiMint { font-size: 31px; font-weight: 830; fill: ${colors.mint}; letter-spacing: -.5px; }
      .kpiLabel { font-size: 11px; font-weight: 720; fill: ${colors.muted}; letter-spacing: .65px; }
      .section { font-size: 23px; font-weight: 820; fill: ${colors.text}; }
      .rank { font-size: 13px; font-weight: 760; fill: ${colors.subdued}; }
      .ticker { font-size: 22px; font-weight: 840; fill: ${colors.text}; }
      .company { font-size: 12px; font-weight: 650; fill: ${colors.muted}; letter-spacing: .35px; }
      .weight { font-size: 19px; font-weight: 820; fill: ${colors.text}; }
      .action { font-size: 9px; font-weight: 850; letter-spacing: .6px; }
      .step { font-size: 12px; font-weight: 790; fill: ${colors.text}; letter-spacing: .35px; }
      .stepNo { font-size: 13px; font-weight: 850; fill: ${colors.ink}; }
      .fine { font-size: 12px; font-weight: 540; fill: ${colors.muted}; }
      .source { font-size: 12px; font-weight: 720; fill: ${colors.text}; }
      .url { font-size: 15px; font-weight: 780; fill: ${colors.text}; }
    </style>

    <rect width="1600" height="900" fill="#07101B"/>
    <rect width="1600" height="900" fill="url(#grid)"/>
    <rect width="1600" height="900" fill="url(#mintGlow)"/>
    <circle cx="1508" cy="72" r="210" fill="${colors.amber}" opacity=".035"/>

    <rect x="52" y="44" width="1496" height="812" rx="30" fill="${colors.ink}" fill-opacity=".96" stroke="${colors.line}" stroke-width="1.5"/>
    <rect x="52" y="44" width="8" height="812" rx="4" fill="${colors.mint}"/>
    <path d="M88 158H1512" stroke="${colors.line}"/>
    <path d="M638 184V772" stroke="${colors.line}"/>

    <text x="156" y="104" class="brand">THESISFORGE</text>
    <text x="1472" y="104" text-anchor="end" class="meta">BERKSHIRE HATHAWAY · Q2 2026 13F</text>
    <text x="1472" y="129" text-anchor="end" class="meta">POSITIONS 06.30.2026 · FILED 08.14.2026</text>

    <text x="104" y="205" class="eyebrow">PUBLIC FILINGS · LOW-FREQUENCY RESEARCH</text>
    <text x="104" y="268" class="headline">COPY BUFFETT'S</text>
    <text x="104" y="328" class="headline">HOMEWORK.</text>
    <text x="104" y="382" class="headlineMint">NOT HIS TRADES.</text>
    <text x="104" y="421" class="subtitle">Study what Berkshire disclosed. Rebuild every thesis.</text>

    <circle cx="170" cy="514" r="71" fill="#0D1726" stroke="${colors.amber}" stroke-width="2"/>
    <text x="262" y="490" class="portraitTitle">BERKSHIRE 13F</text>
    <text x="262" y="517" class="portraitMeta">PUBLIC LONG-EQUITY PROXY</text>
    <rect x="262" y="538" width="202" height="31" rx="9" fill="${colors.amberSoft}" stroke="#6A5430"/>
    <text x="363" y="558" text-anchor="middle" class="portraitMeta" fill="${colors.amber}">NOT REAL-TIME HOLDINGS</text>

    <rect x="104" y="604" width="158" height="98" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="124" y="645" class="kpi">$299.3B</text>
    <text x="124" y="675" class="kpiLabel">REPORTED 13F VALUE</text>
    <rect x="274" y="604" width="158" height="98" rx="16" fill="${colors.panel2}" stroke="#28675D"/>
    <text x="294" y="645" class="kpiMint">88.5%</text>
    <text x="294" y="675" class="kpiLabel">IN THE TOP 10</text>
    <rect x="444" y="604" width="158" height="98" rx="16" fill="${colors.panel2}" stroke="${colors.line}"/>
    <text x="464" y="645" class="kpi">29</text>
    <text x="464" y="675" class="kpiLabel">DISCLOSED POSITIONS</text>

    ${processStep(119, '1', 'WAIT FOR 13F')}
    <path d="M227 740H247" stroke="${colors.line}" stroke-width="2"/>
    ${processStep(265, '2', 'TAKE TOP 10')}
    <path d="M374 740H394" stroke="${colors.line}" stroke-width="2"/>
    ${processStep(412, '3', 'AUDIT EACH THESIS')}

    <text x="680" y="201" class="section">BERKSHIRE'S DISCLOSED TOP 10</text>
    <text x="1466" y="201" text-anchor="end" class="meta">WEIGHT OF REPORTED 13F VALUE</text>
    ${holdings.map(holdingCard).join('')}

    <path d="M104 790H1474" stroke="${colors.line}"/>
    <text x="104" y="817" class="fine">13F can lag 45 days and omits cash, T-bills, private businesses, shorts and many non-U.S. assets. Decisions are not manager-attributed.</text>
    <text x="104" y="839" class="source">SOURCE: SEC FORM 13F-HR · RESEARCH ONLY — NOT INVESTMENT ADVICE</text>
    <circle cx="1312" cy="830" r="5" fill="${colors.mint}"/>
    <text x="1326" y="836" class="url">thesisforge.tech</text>
  </svg>
`);

await sharp(svg)
  .composite([
    { input: mark, left: 88, top: 70 },
    { input: portrait, left: 104, top: 448 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

const dataPayload = {
  generatedAt: '2026-08-30',
  basis: 'Berkshire Hathaway public 13F securities ranked by disclosed market value',
  filing,
  holdings,
};

await writeFile(dataOutput, `${JSON.stringify(dataPayload, null, 2)}\n`);
await writeFile(
  manifestOutput,
  `${JSON.stringify(
    {
      title: "Copy Buffett's Homework — Top 10",
      generatedAt: '2026-08-30',
      dimensions: { width: 1600, height: 900 },
      output: path.relative(root, output),
      data: path.relative(root, dataOutput),
      copy: path.relative(root, copyOutput),
      assets: Object.fromEntries(
        Object.entries(assets).map(([key, value]) => [key, path.relative(root, value)]),
      ),
      contentRules: [
        'GOOGL and GOOG remain separate because the SEC information table reports distinct securities.',
        'Weights use the full reported 13F value as denominator and round to two decimal places.',
        'No Berkshire logo or endorsement claim is used.',
        'All copy, holdings, dates, values and disclosures are deterministic SVG overlays.',
      ],
      caveats: [
        '13F can lag quarter-end by up to 45 days.',
        '13F omits cash, T-bills, private businesses, shorts, many non-U.S. assets and intra-quarter trades.',
        'The filing does not identify whether Buffett, Todd Combs or Ted Weschler made a specific decision.',
        'Research only; not investment advice.',
      ],
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  copyOutput,
  `# X post copy — Buffett Top 10\n\nMost people copy Buffett's holdings. Better: copy the homework.\n\nBerkshire's latest disclosed Top 10 represent 88.5% of its reported 13F value. I turned the filing into a research queue: understand the business, test the moat, audit the fundamentals, value it, then write down the risks.\n\n13F data is delayed and incomplete. This is a starting point—not a buy list. Which company should I audit first?\n\n$AAPL $AXP $KO $GOOGL $BAC $CVX $OXY $CB $MCO $GOOG #13F\n\nSource: SEC Form 13F-HR filed Aug 14, 2026. Independent research; no affiliation or endorsement.\n`,
);

console.log(`Wrote ${output}`);
console.log(`Wrote ${dataOutput}`);
console.log(`Wrote ${manifestOutput}`);
console.log(`Wrote ${copyOutput}`);
