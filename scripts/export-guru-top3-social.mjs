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
const output = path.join(outputDir, 'guru-top3-consensus-1600x900.png');
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

async function circularAvatar(source) {
  const mask = svgBuffer(
    '<svg width="76" height="76" xmlns="http://www.w3.org/2000/svg"><circle cx="38" cy="38" r="38" fill="white"/></svg>',
  );
  return sharp(source)
    .resize(76, 76, { fit: 'cover', position: 'centre' })
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

const background = await sharp(backgroundSource)
  .resize(1600, 900, { fit: 'cover' })
  .modulate({ brightness: 0.72, saturation: 0.78 })
  .png()
  .toBuffer();

const managerY = [242, 374, 506];
await sharp(background)
  .composite([
    { input: layout, left: 0, top: 0 },
    { input: mark, left: 88, top: 70 },
    { input: gavinAvatar, left: 774, top: managerY[0] },
    { input: billAvatar, left: 774, top: managerY[1] },
    { input: stanleyAvatar, left: 774, top: managerY[2] },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

await writeFile(
  manifestOutput,
  `${JSON.stringify(
    {
      title: 'Guru Top 3 Consensus — ThesisForge social graphic',
      generatedAt: '2026-08-30',
      dimensions: '1600x900',
      output: path.relative(root, output),
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
console.log(`Wrote ${manifestOutput}`);
