import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { gurus } from '../server/gurus.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(rootDir, 'web', 'index.html');
const vercelPath = path.join(rootDir, 'vercel.json');
const avatarDir = path.join(rootDir, 'web', 'guru-avatars');
const mainPath = path.join(rootDir, 'lib', 'main.dart');
const ontologyAppPath = path.join(rootDir, 'web', 'ontology', 'app.js');
const ontologyIndexPath = path.join(rootDir, 'web', 'ontology', 'index.html');
const ontologyI18nPath = path.join(rootDir, 'web', 'ontology', 'i18n.js');
const ontologyStylesPath = path.join(rootDir, 'web', 'ontology', 'styles.css');
const flutterBuildPath = path.join(rootDir, 'scripts', 'flutter-build.sh');
const browserLocationPath = path.join(rootDir, 'lib', 'browser_location_web.dart');

function inlineBootScript() {
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/<body>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(match, 'web/index.html must contain the inline Flutter bootstrap');
  return match[1];
}

function createBrowserHarness(url, storage = new Map()) {
  const counters = {
    cacheDeletes: 0,
    unregisters: 0,
    flutterLoads: 0,
    redirects: [],
  };
  const location = new URL(url);
  location.replace = (target) => counters.redirects.push(target);
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const cacheStorage = {
    keys: async () => ['legacy-flutter-cache'],
    delete: async () => {
      counters.cacheDeletes += 1;
      return true;
    },
  };
  const window = { location, localStorage, caches: cacheStorage };
  const context = {
    URL,
    Promise,
    window,
    localStorage,
    navigator: {
      serviceWorker: {
        controller: {},
        getRegistrations: async () => [
          {
            unregister: async () => {
              counters.unregisters += 1;
              return true;
            },
          },
        ],
      },
    },
    caches: cacheStorage,
    document: {
      createElement: () => ({}),
      body: {
        appendChild: () => {
          counters.flutterLoads += 1;
        },
      },
    },
  };
  return { context, counters, storage };
}

async function runBoot(harness) {
  vm.runInNewContext(inlineBootScript(), harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function pngDimensions(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  assert.equal(header.toString('hex', 0, 8), '89504e470d0a1a0a', `${filePath} is not PNG`);
  assert.equal(header.toString('ascii', 12, 16), 'IHDR', `${filePath} has no PNG IHDR`);
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

function cacheHeaderFor(vercel, resourcePath) {
  for (const route of vercel.routes) {
    if (!route.headers?.['Cache-Control']) continue;
    if (new RegExp(route.src).test(resourcePath)) {
      return route.headers['Cache-Control'];
    }
  }
  return '';
}

test('legacy cache migration runs once and repeat visits keep the Flutter cache', async () => {
  const storage = new Map();
  const first = createBrowserHarness('https://www.thesisforge.tech/', storage);
  await runBoot(first);
  assert.equal(first.counters.unregisters, 1);
  assert.equal(first.counters.cacheDeletes, 1);
  assert.equal(first.counters.flutterLoads, 0);
  assert.equal(first.counters.redirects.length, 1);
  assert.match(first.counters.redirects[0], /cache-migration=flutter-cache-migration-v2/);

  const repeat = createBrowserHarness('https://www.thesisforge.tech/', storage);
  await runBoot(repeat);
  assert.equal(repeat.counters.unregisters, 0);
  assert.equal(repeat.counters.cacheDeletes, 0);
  assert.equal(repeat.counters.flutterLoads, 1);
});

test('auth callbacks load Flutter without cleanup and legacy Ontology routes redirect first', async () => {
  const auth = createBrowserHarness('https://www.thesisforge.tech/?code=oauth-code');
  await runBoot(auth);
  assert.equal(auth.counters.unregisters, 0);
  assert.equal(auth.counters.cacheDeletes, 0);
  assert.equal(auth.counters.flutterLoads, 1);
  assert.deepEqual(auth.counters.redirects, []);

  const ontology = createBrowserHarness('https://www.thesisforge.tech/?view=ontology');
  await runBoot(ontology);
  assert.equal(ontology.counters.unregisters, 0);
  assert.equal(ontology.counters.cacheDeletes, 0);
  assert.equal(ontology.counters.flutterLoads, 0);
  assert.deepEqual(ontology.counters.redirects, ['/ontology/']);
});

test('entry resources revalidate and versioned assets use immutable caching', () => {
  const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  for (const resource of ['/', '/index.html', '/main.dart.js', '/flutter_bootstrap.js']) {
    const header = cacheHeaderFor(vercel, resource);
    assert.ok(header, `${resource} must have an explicit cache policy`);
    assert.doesNotMatch(header, /(?:^|,)\s*no-store(?:\s|,|$)/i, `${resource} must be cacheable`);
    assert.match(header, /must-revalidate/i, `${resource} must revalidate safely`);
  }

  assert.match(cacheHeaderFor(vercel, '/guru-avatars/warren-buffett.png'), /immutable/i);
  assert.match(cacheHeaderFor(vercel, '/ontology/app.js'), /immutable/i);
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  assert.match(mainSource, /_guruAvatarAssetVersion\s*=\s*'144-\d{8}'/);
  assert.match(mainSource, /versionedGuruAvatarUrl\(guru\['avatarUrl'\]\)/);
});

test('UI avatar payload stays within the 144px and 1 MiB performance budgets', () => {
  const avatarFiles = fs
    .readdirSync(avatarDir)
    .filter((name) => name.endsWith('.png'))
    .sort();
  const expectedAvatarFiles = gurus.map((guru) => `${guru.id}.png`).sort();
  assert.deepEqual(
    avatarFiles,
    expectedAvatarFiles,
    'every configured guru must have exactly one matching UI avatar',
  );

  let totalBytes = 0;
  for (const fileName of avatarFiles) {
    const filePath = path.join(avatarDir, fileName);
    const dimensions = pngDimensions(filePath);
    assert.ok(dimensions.width <= 144, `${fileName} is ${dimensions.width}px wide`);
    assert.ok(dimensions.height <= 144, `${fileName} is ${dimensions.height}px high`);
    totalBytes += fs.statSync(filePath).size;
  }
  assert.ok(totalBytes <= 1024 * 1024, `avatar payload is ${totalBytes} bytes`);
});

test('Ontology local QA auth is compile-time gated and production remains fail-closed', () => {
  const ontologySource = fs.readFileSync(ontologyAppPath, 'utf8');
  const buildSource = fs.readFileSync(flutterBuildPath, 'utf8');
  assert.match(
    ontologySource,
    /const authDevBypass = "__GURU_AUTH_DEV_BYPASS__" === "true";/,
  );
  assert.match(ontologySource, /if \(authDevBypass\) return localDevToken;/);
  assert.match(buildSource, /ONTOLOGY_AUTH_DEV_BYPASS="\$resolved_auth_bypass"/);
  assert.match(buildSource, /__GURU_AUTH_DEV_BYPASS__/);
});

test('Ontology simulation copy and critical controls preserve truthful 44px targets', () => {
  const indexSource = fs.readFileSync(ontologyIndexPath, 'utf8');
  const i18nSource = fs.readFileSync(ontologyI18nPath, 'utf8');
  const stylesSource = fs.readFileSync(ontologyStylesPath, 'utf8');
  assert.doesNotMatch(indexSource, /真实持仓/);
  assert.doesNotMatch(i18nSource, /actual holdings/i);
  assert.match(indexSource, /模拟重建持仓/);
  assert.match(i18nSource, /reconstructed model portfolio/i);
  for (const selector of [
    '.decision-filter-list button',
    '.strategy-date-range button',
    '.view-load-error button',
    '.guru-back-link',
    '#decision-timeline-range',
  ]) {
    assert.ok(stylesSource.includes(selector), `${selector} must have a touch-target rule`);
  }
  assert.match(
    stylesSource,
    /Interactive controls keep a 44px touch target[\s\S]*min-height:\s*44px;/,
  );
});

test('browser history normalization preserves the Forward stack', () => {
  const browserLocationSource = fs.readFileSync(browserLocationPath, 'utf8');
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  assert.match(browserLocationSource, /bool replaceCurrent = false/);
  assert.match(browserLocationSource, /replaceCurrent[\s\S]*history\.replaceState/);
  assert.match(browserLocationSource, /history\.pushState/);
  assert.match(
    mainSource,
    /_persistRouteState\(replaceCurrent: true\)/,
    'data-driven default selection must normalize the current entry instead of creating a new one',
  );
});
