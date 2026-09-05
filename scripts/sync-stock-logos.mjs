// Read-only financial inputs. This job writes branding assets, never market data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const directory = path.join(root, 'web/stock-logos');
fs.mkdirSync(directory, { recursive: true });
const manifestPath = path.join(directory, 'manifest.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : { assets: {} };
const universe = new Map();
const add = (ticker, name = '', source = '', website = '') => {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return;
  const record = universe.get(symbol) || { ticker: symbol, name, sources: [], website };
  if (!record.website && website) record.website = website;
  if (source && !record.sources.includes(source)) record.sources.push(source);
  universe.set(symbol, record);
};
const index = JSON.parse(fs.readFileSync('server/config/sp500-valuation-universe.json'));
for (const company of index.companies) {
  add(company.ticker, company.name, 'valuation_universe', company.companySite);
  for (const share of company.shareClasses || []) add(share.ticker, company.name, 'valuation_share_class', company.companySite);
}
const master = JSON.parse(fs.readFileSync('server/config/guru-security-master.json'));
for (const security of master.securities) add(security.ticker, security.name, 'guru_security_master');
const database = process.env.LOGO_UNIVERSE_DATABASE || 'server/data/guru-analysis.sqlite';
if (fs.existsSync(database)) {
  const db = new DatabaseSync(database, { readOnly: true });
  for (const { payload_json } of db.prepare('SELECT payload_json FROM guru_snapshots').all()) {
    const guru = JSON.parse(payload_json);
    for (const holding of [...(guru.holdings || []), ...(guru.activity || []), ...(guru.transactions || [])]) add(holding.ticker, holding.issuer, 'local_guru_snapshot');
    add(guru.focusTicker, guru.focusIssuer, 'guru_profile');
  }
  for (const { ticker } of db.prepare('SELECT ticker FROM valuation_ticker_snapshots').all()) add(ticker, '', 'local_valuation_snapshot');
  db.close();
}
// Retained non-index research and explicit venue symbols; never drop the venue
// suffix to substitute an unrelated issuer. These aliases are branding only.
for (const ticker of ['LSEG','LSEG.L','AZN.L','BA.L','DGE.L','BRK.A','BRK.B','SPY','SPCX','CBRS','BN','HHH','ISRG','NVDA']) add(ticker, '', 'tracked_research');
const sourceAliases = { 'BRK.A': 'BRK-A', 'BRK.B': 'BRK-B', 'UHAL.B': 'UHAL-B', LSEG: 'LSEG.L', FTCHQ: 'FTCH', JWSMF:'JWSM' };
// Exact issuer-owned image URLs discovered on these official company pages.
const officialAssets = {
  ASIC: {url:'https://ategrity.com/Ategrity_logo.png', page:'https://ategrity.com/'},
  HNGE: {url:'https://www.hingehealth.com/favicon-32x32.png', page:'https://www.hingehealth.com/about/'},
  SLDE: {url:'https://www.slideinsurance.com/images/favicon-180x180.png', page:'https://www.slideinsurance.com/about'},
  VOYG: {url:'https://www.google.com/s2/favicons?domain=voyagertechnologies.com&sz=128', page:'https://voyagertechnologies.com/', source:'Verified official-domain favicon via Google'},
  NXH: {url:'https://www.google.com/s2/favicons?domain=neighborhoodintelligence.com&sz=128', page:'https://www.neighborhoodintelligence.com/', source:'Verified official-domain favicon via Google'},
  VMRK: {url:'https://www.google.com/s2/favicons?domain=investors.vivmarkresidential.com&sz=128', page:'https://investors.vivmarkresidential.com/', source:'Verified official-domain favicon via Google'},
};
// Visually audited provider placeholder: a US flag is not an issuer logo.
const rejectedHashes = new Set(['413521d6b4e0f713ac6854faac7aacbed648e578c48bb5e9a0d435cabbee22d0']);
const records = [...universe.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
const assets = {};
let cursor = 0;
let completed = 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function getPng(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'ThesisForge-Branding/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 524288) throw new Error('image_too_large');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 524288 || bytes.length < 150 || !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw new Error('invalid_png');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 4 || height < 4 || width > 4096 || height > 4096) throw new Error('invalid_dimensions');
  if (rejectedHashes.has(digest(bytes))) throw new Error('provider_placeholder_not_logo');
  return { bytes, width, height };
}
function saveManifest() {
  const sorted = Object.fromEntries(Object.entries(assets).sort(([a],[b]) => a.localeCompare(b)));
  const ready = Object.values(sorted).filter(a => a.status === 'available').length;
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, assetVersion: '20260905a', generatedAt: new Date().toISOString(), usage: 'Editorial issuer identification. Marks belong to their respective owners; no endorsement. Current branding is not historical security identity.', expected: records.length, available: ready, missing: Object.keys(sorted).length-ready, identityUnresolved: master.unresolved.length + master.ambiguous.length, assets: sorted }, null, 2) + '\n');
}
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < records.length) {
    const record = records[cursor++];
    const file = `${record.ticker}.png`;
    const cached = previous.assets[record.ticker];
    if (cached?.status === 'available' && !rejectedHashes.has(cached.sha256) && fs.existsSync(path.join(directory, file)) && digest(fs.readFileSync(path.join(directory,file))) === cached.sha256) {
      assets[record.ticker] = { ...cached, ...record };
    } else {
      const providerSymbol = sourceAliases[record.ticker] || record.ticker;
      const sourceUrl = officialAssets[record.ticker]?.url || `https://financialmodelingprep.com/image-stock/${encodeURIComponent(providerSymbol)}.png`;
      try {
        const image = await getPng(sourceUrl);
        fs.writeFileSync(path.join(directory, file), image.bytes);
        assets[record.ticker] = { ...record, status: 'available', file, sourceUrl, source: officialAssets[record.ticker]?.source || (officialAssets[record.ticker] ? 'Official company image' : 'FMP ticker image'), identitySourceUrl: officialAssets[record.ticker]?.page, fetchedAt: new Date().toISOString(), sha256: digest(image.bytes), bytes: image.bytes.length, width: image.width, height: image.height };
      } catch (error) {
        assets[record.ticker] = { ...record, status: 'missing', sourceUrl, reason: error.message };
        if (fs.existsSync(path.join(directory, file))) {
          const rejectedDir = path.join(root, 'output/stock-logo-audit-2026-09-05/rejected');
          fs.mkdirSync(rejectedDir, { recursive: true });
          fs.renameSync(path.join(directory, file), path.join(rejectedDir, file));
        }
      }
    }
    completed++;
    if (completed % 100 === 0) { saveManifest(); console.log(`Logos ${completed}/${records.length}; available ${Object.values(assets).filter(a=>a.status==='available').length}`); }
  }
}));
saveManifest();
const result = JSON.parse(fs.readFileSync(manifestPath));
console.log(JSON.stringify({ expected: result.expected, available: result.available, missing: result.missing, unresolvedSecurityIdentities: result.identityUnresolved }));
