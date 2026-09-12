import { isoDate } from './investmentMath.js';
import { readFileSync } from 'node:fs';

// A search index, not a valuation payload or a certification of model quality.
// Keep full financial/transcript blobs in SQLite; return identity + dated coverage.
const indexes = new WeakMap();
const issuerNames = new Map();
for (const file of ['sp500-valuation-universe.json', 'guru-valuation-universe.json']) {
  const catalog = JSON.parse(readFileSync(new URL(`./config/${file}`, import.meta.url), 'utf8'));
  for (const company of catalog.companies ?? []) {
    if (company.ticker && company.name) issuerNames.set(company.ticker, company.name);
  }
}
export function researchCompanies(source, asOf) {
  isoDate(asOf);
  const generation = source.db.prepare('PRAGMA data_version').get().data_version;
  let cache = indexes.get(source);
  if (!cache || cache.generation !== generation || cache.changes !== source.db.prepare('SELECT total_changes() n').get().n) {
    cache = {generation, changes: source.db.prepare('SELECT total_changes() n').get().n, dates: new Map()};
    indexes.set(source, cache);
  }
  if (cache.dates.has(asOf)) return structuredClone(cache.dates.get(asOf));
  const models = source.db.prepare(`
      SELECT ticker, MAX(as_of_date) availableAt
      FROM valuation_pit_model_runs
      WHERE as_of_date <= ? AND financial_available_at <= as_of_date
        AND (guidance_max_observed_at IS NULL OR guidance_max_observed_at <= as_of_date)
      GROUP BY ticker ORDER BY ticker
  `).all(asOf);
  // The existing issuer catalogs cover most names. Parse snapshot metadata only
  // for the remainder, not 500+ multi-megabyte chart/transcript documents.
  const lookup = source.db.prepare("SELECT json_extract(payload_json, '$.name') name FROM valuation_ticker_snapshots WHERE ticker=?");
  const companies = models.map(row => ({...row,
    name: issuerNames.get(row.ticker) || lookup.get(row.ticker)?.name || row.ticker,
    coverage: 'stored_model'}));
  const result = {asOf, companies, identityPolicy: 'Current stored issuer names; model dates respect the research cutoff. Full research validation occurs when opened.'};
  if (cache.dates.size >= 3) cache.dates.delete(cache.dates.keys().next().value);
  cache.dates.set(asOf, result);
  return structuredClone(result);
}
