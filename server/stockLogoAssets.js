import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const stockLogoVersion = '20260905a';
export const stockLogoDirectory = fileURLToPath(new URL('../web/stock-logos/', import.meta.url));
const rejectedHash = '413521d6b4e0f713ac6854faac7aacbed648e578c48bb5e9a0d435cabbee22d0';
export function validLogoPng(bytes) {
  return bytes.length >= 150 && bytes.length <= 524288 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.readUInt32BE(16) >= 4 && bytes.readUInt32BE(20) >= 4 &&
    bytes.readUInt32BE(16) <= 4096 && bytes.readUInt32BE(20) <= 4096 &&
    createHash('sha256').update(bytes).digest('hex') !== rejectedHash;
}

export function createStockLogoLoader({ directory = stockLogoDirectory, fetchImpl = fetch, now = Date.now } = {}) {
  let manifestPromise;
  const cache = new Map(), pending = new Map();
  async function read(symbol) {
    manifestPromise ??= fs.readFile(path.join(directory, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => ({ assets: {} }));
    const record = (await manifestPromise).assets?.[symbol];
    if (record?.status === 'available') {
      try {
        const bytes = await fs.readFile(path.join(directory, `${symbol}.png`));
        if (validLogoPng(bytes) && createHash('sha256').update(bytes).digest('hex') === record.sha256) {
          return { body: bytes, contentType: 'image/png', source: 'bundled_issuer_catalog' };
        }
      } catch { /* Try the exact-symbol provider if a packaged asset is absent. */ }
    }
    if (record?.status === 'missing') return null;
    const sourceSymbol = ({ 'BRK.A': 'BRK-A', 'BRK.B': 'BRK-B', 'UHAL.B': 'UHAL-B', LSEG: 'LSEG.L' })[symbol] || symbol;
    try {
      const response = await fetchImpl(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(sourceSymbol)}.png`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok || Number(response.headers.get('content-length')) > 524288) return null;
      const reader = response.body.getReader(), chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 524288) { await reader.cancel(); return null; }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      return validLogoPng(bytes) ? { body: bytes, contentType: 'image/png', source: 'exact_ticker_provider' } : null;
    } catch { return null; }
  }
  return async function load(symbol) {
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return null;
    const hit = cache.get(symbol);
    if (hit && hit.until > now()) return hit.asset;
    if (pending.has(symbol)) return pending.get(symbol);
    // Bound untrusted misses and concurrent outbound lookups.
    if (pending.size >= 12) return null;
    const request = read(symbol).then(asset => {
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(symbol, { asset, until: now() + (asset ? 86400000 : 300000) });
      return asset;
    }).finally(() => pending.delete(symbol));
    pending.set(symbol, request);
    return request;
  };
}
