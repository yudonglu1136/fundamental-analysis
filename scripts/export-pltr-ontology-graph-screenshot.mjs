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
const screenshotSource = path.join(outputDir, 'pltr-ontology-graph-source.png');
const backgroundSource = path.join(outputDir, 'pltr-ontology-frame-background.png');
const markSource = path.join(root, 'assets/branding/thesisforge-mark.png');
const output = path.join(outputDir, 'pltr-ontology-graph-screenshot-en-1600x900.png');
const manifestOutput = path.join(outputDir, 'pltr-ontology-graph-screenshot-manifest.json');

const width = 1600;
const height = 900;
const frame = { x: 70, y: 105, width: 1460, radius: 20 };

await mkdir(outputDir, { recursive: true });
const [screenshotBytes, backgroundBytes, markBytes] = await Promise.all([
  readFile(screenshotSource),
  readFile(backgroundSource),
  readFile(markSource),
]);

const sourceMetadata = await sharp(screenshotBytes).metadata();
if (sourceMetadata.width !== 3022 || sourceMetadata.height !== 1606) {
  throw new Error(
    `Unexpected PLTR screenshot dimensions: ${sourceMetadata.width}x${sourceMetadata.height}`,
  );
}

const frameHeight = Math.round(
  (frame.width * sourceMetadata.height) / sourceMetadata.width,
);
if (frame.y + frameHeight > height - 14) {
  throw new Error('The screenshot frame exceeds the export safe area.');
}

const roundedMask = Buffer.from(`
  <svg width="${frame.width}" height="${frameHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${frame.width}" height="${frameHeight}" rx="${frame.radius}" fill="white"/>
  </svg>
`);

const screenshot = await sharp(screenshotBytes)
  .resize({ width: frame.width, fit: 'inside', withoutEnlargement: true })
  .composite([{ input: roundedMask, blend: 'dest-in' }])
  .png({ compressionLevel: 9 })
  .toBuffer();

const atmosphere = Buffer.from(`
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#020812" stop-opacity=".22"/>
        <stop offset="1" stop-color="#020812" stop-opacity=".52"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#31E1B5" stop-opacity=".68"/>
        <stop offset=".50" stop-color="#4CB4D8" stop-opacity=".18"/>
        <stop offset="1" stop-color="#31E1B5" stop-opacity=".50"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#shade)"/>
    <rect x="${frame.x - 10}" y="${frame.y + 15}" width="${frame.width + 20}" height="${frameHeight + 8}" rx="${frame.radius + 8}" fill="#000814" opacity=".72" filter="url(#shadow)"/>
    <rect x="${frame.x - 1}" y="${frame.y - 1}" width="${frame.width + 2}" height="${frameHeight + 2}" rx="${frame.radius + 1}" fill="none" stroke="url(#edge)" stroke-width="2"/>
    <rect x="62" y="22" width="318" height="65" rx="18" fill="#07131F" fill-opacity=".74" stroke="#244356" stroke-width="1"/>
    <text x="137" y="64" fill="#F7FAFC" font-family="-apple-system, BlinkMacSystemFont, Inter, SF Pro Display, Segoe UI, sans-serif" font-size="20" font-weight="800" letter-spacing="3.5">THESISFORGE</text>
    <path d="M405 55H1518" stroke="url(#edge)" stroke-width="1" opacity=".55"/>
  </svg>
`);

const background = await sharp(backgroundBytes)
  .resize(width, height, { fit: 'cover' })
  .modulate({ brightness: 0.72, saturation: 0.82 })
  .composite([{ input: atmosphere }])
  .png()
  .toBuffer();

const mark = await sharp(markBytes)
  .resize(50, 50, { fit: 'contain' })
  .png()
  .toBuffer();

await sharp(background)
  .composite([
    { input: screenshot, left: frame.x, top: frame.y },
    { input: mark, left: 76, top: 29 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const outputBytes = await readFile(output);
await writeFile(
  manifestOutput,
  `${JSON.stringify(
    {
      title: 'PLTR Ontology product screenshot — ThesisForge branded frame',
      releaseDate: '2026-08-30',
      dimensions: `${width}x${height}`,
      output: path.relative(root, output),
      outputSha256: sha256(outputBytes),
      sourceScreenshot: {
        path: path.relative(root, screenshotSource),
        dimensions: `${sourceMetadata.width}x${sourceMetadata.height}`,
        sha256: sha256(screenshotBytes),
        treatment:
          'Resized proportionally and rounded only; screenshot pixels, UI copy, PLTR data, and visual hierarchy are otherwise unchanged.',
      },
      background: {
        path: path.relative(root, backgroundSource),
        sha256: sha256(backgroundBytes),
        role: 'Generated low-contrast ontology atmosphere outside the product screenshot only.',
      },
      branding: {
        mark: path.relative(root, markSource),
        markSha256: sha256(markBytes),
        lockup: 'Official ThesisForge mark plus deterministic THESISFORGE wordmark.',
      },
      editorial: {
        palantirIdentification:
          'PLTR and Palantir appear only inside the user-supplied product screenshot. No Palantir logo, external UI, or endorsement treatment was added.',
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${output}`);
console.log(`Wrote ${manifestOutput}`);
