import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
const releaseDate = '2026-08-30';
const generatedAt = '2026-08-31';
const outputDir = path.join(root, 'docs/brand/2026-08-30');
const assetDir = path.join(outputDir, 'thesisforge-system-promo-assets');
const output = path.join(
  outputDir,
  'thesisforge-system-promo-en-10s-1920x1080.mp4',
);
const posterOutput = path.join(
  outputDir,
  'thesisforge-system-promo-en-10s-poster.jpg',
);
const manifestOutput = path.join(
  outputDir,
  'thesisforge-system-promo-en-10s-manifest.json',
);
const copyOutput = path.join(
  outputDir,
  'thesisforge-system-promo-en-10s-copy.md',
);
const sourceRecording =
  process.env.THESISFORGE_PROMO_RECORDING ||
  '/Users/yudonglu/Desktop/Screen Recording 2026-08-14 at 12.42.45 PM.mov';
const markSource = path.join(root, 'assets/branding/thesisforge-mark.png');

const width = 1920;
const height = 1080;
const duration = 10;
const colors = {
  background: '#07101B',
  ink: '#0B111D',
  panel: '#111827',
  line: '#263248',
  mint: '#22D3A6',
  mintSoft: '#55E3BC',
  amber: '#E0B15A',
  white: '#F8FAFC',
  muted: '#A8B2C4',
  subdued: '#718096',
};
const fontStack =
  "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

const sha256 = (buffer) =>
  createHash('sha256').update(buffer).digest('hex');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function svg(content, extraStyle = '') {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { font-family: ${fontStack}; }
        .eyebrow { font-size: 21px; font-weight: 800; letter-spacing: 2.3px; fill: ${colors.mint}; }
        .hero { font-size: 84px; font-weight: 860; letter-spacing: -2.7px; fill: ${colors.white}; }
        .heroMint { font-size: 84px; font-weight: 860; letter-spacing: -2.7px; fill: ${colors.mint}; }
        .body { font-size: 25px; font-weight: 560; fill: ${colors.muted}; }
        .brand { font-size: 30px; font-weight: 850; letter-spacing: 1.2px; fill: ${colors.white}; }
        .brandMeta { font-size: 13px; font-weight: 760; letter-spacing: 1.5px; fill: ${colors.muted}; }
        .chip { font-size: 16px; font-weight: 820; letter-spacing: 1.1px; fill: ${colors.white}; }
        ${extraStyle}
      </style>
      ${content}
    </svg>
  `);
}

async function renderLayer(fileName, markup, composites = []) {
  const target = path.join(assetDir, fileName);
  await sharp(svg(markup))
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(target);
  return target;
}

await mkdir(assetDir, { recursive: true });

const gridLines = [];
for (let x = 0; x <= width; x += 80) {
  gridLines.push(
    `<path d="M${x} 0V${height}" stroke="#6B7A92" stroke-opacity=".055"/>`,
  );
}
for (let y = 0; y <= height; y += 80) {
  gridLines.push(
    `<path d="M0 ${y}H${width}" stroke="#6B7A92" stroke-opacity=".055"/>`,
  );
}
const background = path.join(assetDir, 'background.png');
await sharp(
  svg(`
    <defs>
      <radialGradient id="mintGlow" cx="0" cy="0" r="1" gradientTransform="translate(1740 130) rotate(136) scale(820 640)">
        <stop stop-color="${colors.mint}" stop-opacity=".16"/>
        <stop offset="1" stop-color="${colors.mint}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="blueGlow" cx="0" cy="0" r="1" gradientTransform="translate(280 980) rotate(-40) scale(720 520)">
        <stop stop-color="#3178C6" stop-opacity=".13"/>
        <stop offset="1" stop-color="#3178C6" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000000" flood-opacity=".38"/></filter>
    </defs>
    <rect width="${width}" height="${height}" fill="${colors.background}"/>
    ${gridLines.join('')}
    <rect width="${width}" height="${height}" fill="url(#mintGlow)"/>
    <rect width="${width}" height="${height}" fill="url(#blueGlow)"/>
    <rect x="778" y="178" width="1104" height="629" rx="36" fill="#0B1220" stroke="${colors.line}" stroke-width="2" filter="url(#shadow)"/>
    <rect x="46" y="46" width="8" height="988" rx="4" fill="${colors.mint}"/>
    <circle cx="1742" cy="115" r="5" fill="${colors.mint}"/>
    <text x="1820" y="121" text-anchor="end" font-family="${fontStack}" font-size="15" font-weight="760" fill="${colors.muted}" letter-spacing="1">POINT-IN-TIME RESEARCH</text>
  `),
)
  .png({ compressionLevel: 9 })
  .toFile(background);

const mark = await sharp(markSource)
  .resize(72, 72, { fit: 'contain' })
  .png()
  .toBuffer();

const brand = await renderLayer(
  'brand.png',
  `
    <text x="195" y="106" class="brand">THESISFORGE</text>
    <text x="195" y="133" class="brandMeta">INVESTMENT RESEARCH SYSTEM</text>
  `,
  [{ input: mark, left: 105, top: 67 }],
);

const scene1 = await renderLayer(
  'scene-1.png',
  `
    <text x="108" y="314" class="eyebrow">500+ COMPANIES · ONE SYSTEM</text>
    <text x="108" y="405" class="hero">THE MARKET</text>
    <text x="108" y="498" class="hero">IS NOT A LIST.</text>
    <text x="110" y="558" class="body">See the connections that move fundamentals.</text>
  `,
);

const scene2 = await renderLayer(
  'scene-2.png',
  `
    <text x="108" y="314" class="eyebrow">FOLLOW THE EVIDENCE</text>
    <text x="108" y="405" class="hero">MAP THE</text>
    <text x="108" y="498" class="heroMint">SYSTEM.</text>
    <rect x="108" y="548" width="190" height="48" rx="24" fill="#123E38" stroke="#28675D"/>
    <text x="203" y="579" text-anchor="middle" class="chip">VALUE CHAIN</text>
    <rect x="314" y="548" width="190" height="48" rx="24" fill="#2F281A" stroke="#6A5430"/>
    <text x="409" y="579" text-anchor="middle" class="chip">CAPITAL FLOW</text>
  `,
);

const scene3 = await renderLayer(
  'scene-3.png',
  `
    <text x="108" y="314" class="eyebrow">FROM COMPLEXITY TO SIGNAL</text>
    <text x="108" y="405" class="hero">FIND WHAT</text>
    <text x="108" y="498" class="heroMint">CHANGED.</text>
    <rect x="108" y="548" width="236" height="48" rx="24" fill="#123E38" stroke="#28675D"/>
    <text x="226" y="579" text-anchor="middle" class="chip">PIT FUNDAMENTALS</text>
    <rect x="360" y="548" width="214" height="48" rx="24" fill="#2F281A" stroke="#6A5430"/>
    <text x="467" y="579" text-anchor="middle" class="chip">RANKED SIGNALS</text>
  `,
);

const finalMark = await sharp(markSource)
  .resize(112, 112, { fit: 'contain' })
  .png()
  .toBuffer();
const final = await renderLayer(
  'final.png',
  `
    <defs>
      <radialGradient id="finalGlow" cx="0" cy="0" r="1" gradientTransform="translate(960 470) rotate(90) scale(520 850)">
        <stop stop-color="${colors.mint}" stop-opacity=".17"/>
        <stop offset="1" stop-color="${colors.mint}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${colors.background}"/>
    ${gridLines.join('')}
    <rect width="${width}" height="${height}" fill="url(#finalGlow)"/>
    <text x="960" y="349" text-anchor="middle" font-family="${fontStack}" font-size="42" font-weight="860" fill="${colors.white}" letter-spacing="2">THESISFORGE</text>
    <text x="960" y="454" text-anchor="middle" font-family="${fontStack}" font-size="72" font-weight="880" fill="${colors.white}" letter-spacing="-1.5">EVIDENCE BEFORE</text>
    <text x="960" y="537" text-anchor="middle" font-family="${fontStack}" font-size="72" font-weight="880" fill="${colors.mint}" letter-spacing="-1.5">NARRATIVE.</text>
    <rect x="735" y="601" width="450" height="74" rx="37" fill="${colors.mint}"/>
    <text x="960" y="648" text-anchor="middle" font-family="${fontStack}" font-size="23" font-weight="850" fill="#06131B" letter-spacing="1.4">EXPLORE THE SYSTEM</text>
    <circle cx="820" cy="742" r="5" fill="${colors.mint}"/>
    <text x="838" y="750" font-family="${fontStack}" font-size="25" font-weight="800" fill="${colors.white}" letter-spacing=".8">thesisforge.tech</text>
    <text x="960" y="949" text-anchor="middle" font-family="${fontStack}" font-size="14" font-weight="650" fill="${colors.muted}" letter-spacing="1.1">RESEARCH ONLY · NOT INVESTMENT ADVICE</text>
  `,
  [{ input: finalMark, left: 904, top: 170 }],
);

const filter = [
  '[0:v]trim=start=0:end=10,setpts=PTS-STARTPTS,crop=2916:1640:54:320,fps=30,scale=1040:585:flags=lanczos,eq=contrast=1.035:saturation=0.90:brightness=-0.015,pad=1060:605:10:10:color=0x263248,format=rgba,fade=t=in:st=0.35:d=0.38:alpha=1,fade=t=out:st=8:d=0.42:alpha=1[product]',
  '[1:v]fps=30,format=rgba[bg]',
  "[bg][product]overlay=x='if(lt(t,0.75),1960-(t-0.35)*2900,800)':y=190:enable='between(t,0.35,8.5)'[withProduct]",
  "[withProduct]drawbox=x='800+mod((t-0.8)*185,1038)':y=190:w=3:h=605:color=0x22D3A6@0.52:t=fill:enable='between(t,0.8,8.0)'[scan]",
  '[2:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=8:d=0.3:alpha=1[brand]',
  '[scan][brand]overlay=0:0[base]',
  '[3:v]format=rgba,fade=t=in:st=0.2:d=0.3:alpha=1,fade=t=out:st=2.15:d=0.28:alpha=1[s1]',
  '[base][s1]overlay=0:0[v1]',
  '[4:v]format=rgba,fade=t=in:st=2.22:d=0.28:alpha=1,fade=t=out:st=4.62:d=0.28:alpha=1[s2]',
  '[v1][s2]overlay=0:0[v2]',
  '[5:v]format=rgba,fade=t=in:st=4.7:d=0.3:alpha=1,fade=t=out:st=8:d=0.3:alpha=1[s3]',
  '[v2][s3]overlay=0:0[v3]',
  '[6:v]format=rgba,fade=t=in:st=8.02:d=0.42:alpha=1[final]',
  '[v3][final]overlay=0:0,format=yuv420p[vout]',
  '[7:a]pan=stereo|c0=c0|c1=c0,volume=0.85,afade=t=in:st=0:d=0.35,afade=t=out:st=9.35:d=0.65[bed]',
  '[8:a]pan=stereo|c0=c0|c1=c0,afade=t=out:st=0.02:d=0.16,volume=0.16,asplit=4[p0][p1][p2][p3]',
  '[p0]adelay=250|250[a0]',
  '[p1]adelay=2250|2250[a1]',
  '[p2]adelay=4700|4700[a2]',
  '[p3]adelay=8050|8050[a3]',
  '[bed][a0][a1][a2][a3]amix=inputs=5:duration=longest:normalize=0,alimiter=limit=.85[aout]',
].join(';');

run('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'warning',
  '-y',
  '-i',
  sourceRecording,
  '-loop',
  '1',
  '-framerate',
  '30',
  '-t',
  String(duration),
  '-i',
  background,
  '-loop',
  '1',
  '-framerate',
  '30',
  '-t',
  String(duration),
  '-i',
  brand,
  '-loop',
  '1',
  '-framerate',
  '30',
  '-t',
  String(duration),
  '-i',
  scene1,
  '-loop',
  '1',
  '-framerate',
  '30',
  '-t',
  String(duration),
  '-i',
  scene2,
  '-loop',
  '1',
  '-framerate',
  '30',
  '-t',
  String(duration),
  '-i',
  scene3,
  '-loop',
  '1',
  '-framerate',
  '30',
  '-t',
  String(duration),
  '-i',
  final,
  '-f',
  'lavfi',
  '-i',
  `aevalsrc=0.028*sin(2*PI*55*t)+0.012*sin(2*PI*110*t):s=48000:d=${duration}`,
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=720:sample_rate=48000:duration=0.18',
  '-filter_complex',
  filter,
  '-map',
  '[vout]',
  '-map',
  '[aout]',
  '-t',
  String(duration),
  '-r',
  '30',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-movflags',
  '+faststart',
  output,
]);

run('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-ss',
  '5.8',
  '-i',
  output,
  '-frames:v',
  '1',
  '-q:v',
  '2',
  posterOutput,
]);

const sourceHash = sha256(await readFile(sourceRecording));
const imageAssetHashes = {};
for (const [name, file] of Object.entries({
  background,
  brand,
  scene1,
  scene2,
  scene3,
  final,
})) {
  imageAssetHashes[name] = sha256(await readFile(file));
}
const videoHash = sha256(await readFile(output));
const posterHash = sha256(await readFile(posterOutput));

const manifest = {
  title: 'ThesisForge — Evidence Before Narrative',
  releaseDate,
  generatedAt,
  durationSeconds: duration,
  dimensions: { width, height },
  frameRate: 30,
  output: path.relative(root, output),
  poster: path.relative(root, posterOutput),
  source: {
    recording: sourceRecording,
    recordingDate: '2026-08-14',
    sha256: sourceHash,
    trimSeconds: [0, 10],
    preservedContent: true,
    treatment:
      'The source product recording is cropped, scaled, color-balanced, framed and overlaid with deterministic branding; its UI content is not redrawn or relabeled.',
  },
  encoding: {
    video: 'H.264 / libx264 / CRF 18 / yuv420p',
    audio: 'Original deterministic electronic tone bed / AAC 160 kbps',
    fastStart: true,
  },
  hashes: {
    videoSha256: videoHash,
    posterSha256: posterHash,
    assets: imageAssetHashes,
  },
  exactCopy: [
    'THE MARKET IS NOT A LIST.',
    'MAP THE SYSTEM.',
    'FIND WHAT CHANGED.',
    'EVIDENCE BEFORE NARRATIVE.',
    'EXPLORE THE SYSTEM',
    'thesisforge.tech',
  ],
};
await writeFile(manifestOutput, JSON.stringify(manifest, null, 2) + '\n');

const postCopy = [
  '# X post copy — ThesisForge 10-second product promo',
  '',
  "The market isn't a list. It's a system.",
  '',
  'ThesisForge maps 500+ companies across value chains, capital flows and point-in-time fundamentals—so you can see what changed before the narrative catches up.',
  '',
  'Evidence before narrative.',
  'Explore: https://thesisforge.tech',
  '',
  '#Investing #StockResearch #AI',
  '',
].join('\n');
await writeFile(copyOutput, postCopy);

console.log(
  JSON.stringify(
    {
      output,
      posterOutput,
      manifestOutput,
      copyOutput,
      videoHash,
      posterHash,
    },
    null,
    2,
  ),
);
