import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only, allowlisted public extract. Never import server modules: their
// database initializers can migrate or update an unrelated runtime database.
export const EXPECTED_MODEL = 'pit-valuation-v55-actual-value-and-owner-audit-2026-08-30';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, label, tolerance = 1e-8) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance,
    `${label} changed: expected ${expected}; received ${actual}`);
}

export function curateIsrgCase(payload, { generatedAt, sourcePayloadSha256, ledger, eventPriceObservations = [] } = {}) {
  assert(payload.ticker === 'ISRG', 'Only the reviewed ISRG case may be exported.');
  assert(payload.dataQuality?.modelVersion === EXPECTED_MODEL, 'Unreviewed model version.');
  assert(ledger?.status === 'pass' && ledger?.database?.modelVersion === EXPECTED_MODEL,
    'A matching passing audit ledger is required.');
  const nodes = [...payload.history].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const current = nodes.at(-1);
  const previous = nodes.at(-2);
  assert(current.asOfDate === '2026-07-21' && previous.asOfDate === '2026-04-22',
    'Model dates changed; review the public case before publishing.');
  const score = current.dataSnapshot.valuationSemantics.scoreInputs;
  const prior = previous.dataSnapshot.valuationSemantics.scoreInputs;
  const dcf = score.equityDcf;
  const earnings = current.methodOutputs.find((item) => item.key === 'normalized-earnings-power').value;
  near(payload.latest.baseFairValue, 442.8260912091792, 'Fair value');
  near(payload.latest.latestPrice, 367.07000732421875, 'Reference price');
  near(score.methodWeights['normalized-earnings-power'], 0.66, 'Earnings weight');
  near(score.methodWeights['fcfe-dcf'], 0.34, 'DCF weight');
  assert(payload.latest.latestPriceDate === '2026-08-27', 'Price date changed.');
  near(earnings * 0.66 + dcf.fairValue * 0.34, current.fairValue, 'Blended valuation');
  near(score.normalizedNetIncome / score.sharesM * score.targetPE, earnings, 'Earnings calculation');
  const explicitPv = dcf.annualCashFlows.reduce((sum, row) => sum + row.fcfM / (1 + dcf.discountRate) ** row.year, 0);
  const terminalPv = dcf.annualCashFlows.at(-1).fcfM * (1 + dcf.terminalGrowth)
    / (dcf.discountRate - dcf.terminalGrowth) / (1 + dcf.discountRate) ** 5;
  near((explicitPv + terminalPv) / score.sharesM, dcf.fairValue, 'DCF calculation');

  const start = '2021-08-27';
  const end = payload.latest.latestPriceDate;
  const historical = nodes.filter((row) => row.asOfDate >= start && row.asOfDate <= end);
  const opening = nodes.filter((row) => row.asOfDate < start).at(-1);
  const selectedNodes = [...(opening ? [opening] : []), ...historical];
  const allPrices = [...payload.priceHistory]
    .filter((row) => row.date >= start && row.date <= end && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  assert(allPrices.length > 400 && selectedNodes.length >= 20, 'Insufficient chart coverage.');
  const monthly = new Map();
  for (const row of allPrices) monthly.set(row.date.slice(0, 7), row);
  const selectedPrices = new Map([...monthly.values()].map((row) => [row.date, row]));
  // Keep the exact first/latest observations and event-date observations too.
  for (const row of allPrices) {
    if (row === allPrices[0] || row === allPrices.at(-1)
        || selectedNodes.some((node) => node.asOfDate === row.date)) selectedPrices.set(row.date, row);
  }
  for (const row of eventPriceObservations) {
    if (row.date >= start && row.date <= end) {
      assert(Number.isFinite(row.close) && row.close > 0, 'Invalid audited event price.');
      const existing = selectedPrices.get(row.date);
      if (existing) near(existing.close, row.close, `Audited event price ${row.date}`);
      selectedPrices.set(row.date, row);
    }
  }
  const prices = [...selectedPrices.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, price: row.close }));
  near(prices.at(-1).price, payload.latest.latestPrice, 'Latest plotted price');
  for (const row of selectedNodes.filter((node) => node.asOfDate >= start)) {
    const observed = selectedPrices.get(row.priceDate);
    assert(observed, `Missing exact model-date price for ${row.asOfDate}`);
    near(observed.close, row.currentPrice, `Model-date price ${row.asOfDate}`);
  }

  const inputs = (row) => ({
    forwardRevenueM: row.valuationRevenue,
    forwardFcfM: row.valuationFreeCashFlow,
    normalizedNetIncomeM: row.normalizedNetIncome,
    effectiveNetMarginPct: row.effectiveNormalizedNetMargin,
    targetPE: row.targetPE,
    sharesM: row.sharesM,
  });
  const components = [
    { key: 'normalized-earnings-power', label: 'Normalized earnings', weight: 0.66,
      value: earnings, contribution: earnings * 0.66,
      formula: 'Forward revenue × effective normalized net margin ÷ period-end shares × target P/E' },
    { key: 'fcfe-dcf', label: 'Five-year FCFE DCF', weight: 0.34,
      value: dcf.fairValue, contribution: dcf.fairValue * 0.34,
      formula: '(Sum of year-end discounted FCFE + discounted Gordon-growth terminal value) ÷ period-end shares' },
  ];
  const stressedEarnings = earnings * 0.85 * 35 / score.targetPE;
  const stressedDcf = dcf.fairValue * 0.85;
  const stressedValue = stressedEarnings * 0.66 + stressedDcf * 0.34;
  const change = (value, baseline) => (value / baseline - 1) * 100;
  return {
    schemaVersion: 1,
    ticker: 'ISRG', company: 'Intuitive Surgical', currency: 'USD',
    modelVersion: EXPECTED_MODEL,
    asOfDate: current.asOfDate,
    fiscalPeriodEnd: current.dataSnapshot.selectedFinancialPeriod.periodEndDate,
    fiscalPeriod: current.label,
    snapshotDate: '2026-08-30',
    priceDate: end,
    price: payload.latest.latestPrice,
    fairValue: current.fairValue,
    upsideToPrice: payload.latest.upsideToBase,
    standaloneDcf: dcf.fairValue,
    method: '66% normalized earnings power + 34% five-year FCFE DCF',
    previous: { asOfDate: previous.asOfDate, fiscalPeriod: previous.label,
      fairValue: previous.fairValue, ...inputs(prior) },
    assumptions: {
      ...inputs(score),
      normalizedGrowthPct: score.revenueGrowth,
      growthLookbackQuarters: score.growthInput.normalizedWindow,
      forwardRevenueSource: 'Formula estimate; not management revenue guidance',
      forwardFcfSource: 'Reported trailing cash flow after capex, scaled by the model growth assumption; not management guidance',
      costOfEquity: dcf.discountRate,
      terminalGrowth: dcf.terminalGrowth,
      discountConvention: 'Five year-end periods; terminal value at the end of year 5',
      terminalValueShareOfDcf: dcf.terminalValueShare,
      reportedTrailingRevenueM: score.ttmRevenue,
      reportedTrailingFcfM: score.ttmFreeCashFlow,
    },
    components,
    dcf: {
      initialGrowth: dcf.initialGrowth,
      growthFadeFormula: 'FCFE1 = forward FCFE; for years t = 2…5, growth(t) = initialGrowth + (terminalGrowth − initialGrowth) × (t − 1) / 4; FCFE(t) = FCFE(t−1) × (1 + growth(t)). Year labels are model periods, not calendar-year forecasts.',
      annualCashFlows: dcf.annualCashFlows.map(({year, growth, fcfM, presentValueM}) => ({year, growth, fcfM, presentValueM})),
      explicitPresentValueM: explicitPv,
      terminalPresentValueM: terminalPv,
      terminalValueM: dcf.terminalValueM,
      equityPresentValueM: dcf.presentValueM,
      additionalNetDebtDeductionM: 0,
    },
    change: {
      fairValue: current.fairValue - previous.fairValue,
      fairValuePct: change(current.fairValue, previous.fairValue),
      revenuePct: change(score.valuationRevenue, prior.valuationRevenue),
      fcfPct: change(score.valuationFreeCashFlow, prior.valuationFreeCashFlow),
      normalizedEarningsPct: change(score.normalizedNetIncome, prior.normalizedNetIncome),
      earningsContribution: (earnings - previous.methodOutputs.find((row) => row.key === 'normalized-earnings-power').value) * 0.66,
      dcfContribution: (dcf.fairValue - prior.equityDcf.fairValue) * 0.34,
      explanation: 'The formula-forward revenue estimate rose with reported trailing revenue, and forward FCFE rose with trailing cash flow after capex. The normalized growth input stayed at 20.2944%, Ke stayed at 10%, and method weights stayed at 66%/34%. Model-normalized margin, period-end shares and target P/E also changed; the entire increase is not caused by FCF alone.',
    },
    chart: {
      startDate: start, endDate: end,
      openingCarry: opening ? { sourceDate: opening.asOfDate, displayedFrom: start, fairValue: opening.fairValue } : null,
      priceSampling: 'Exact last stored close per calendar month from the released sampled price history, plus chart endpoints and audited model-event price observations. A sampled observation is not necessarily the final trading day of its month. No synthetic prices.',
      fairValueSampling: 'All actual model nodes in the window, plus the immediately preceding node for the opening step. Carry the last known model value until the next node; do not invent intermediate estimates.',
      historicalMethod: 'Retrospective constant-method PIT replay using the current v55 methodology, not a record of forecasts published on each historical date.',
    },
    history: selectedNodes.map((row) => ({ date: row.asOfDate, fairValue: row.fairValue, price: row.currentPrice })),
    prices,
    scenario: {
      title: 'What if the premium does not hold?',
      kind: 'Illustrative sensitivity, not a forecast or probability-weighted bear case',
      explanation: 'Cut normalized earnings and every projected FCFE by 15%, and reduce target P/E from 49.1× to 35×. Keep shares, growth fade, Ke, terminal growth and 66%/34% method weights unchanged.',
      earningsFactor: 0.85, fcfFactor: 0.85, targetPE: 35,
      earningsValue: stressedEarnings, dcfValue: stressedDcf,
      fairValue: stressedValue,
      upsideToPrice: stressedValue / payload.latest.latestPrice - 1,
      formula: '0.66 × base earnings value × 0.85 × (35 / base P/E) + 0.34 × base DCF value × 0.85',
      risk: 'A lower share price is not sufficient evidence of a bargain: the model depends materially on a premium earnings multiple and sustained cash generation.',
    },
    sources: [
      { title: 'Intuitive Q2 2026 earnings release (issuer / SEC, July 16)', url: 'https://www.sec.gov/Archives/edgar/data/1035267/000103526726000047/q226ex-991earningsrelease.htm', purpose: 'Primary-source company context; model estimates are not company guidance.' },
      { title: 'Intuitive Q2 2026 Form 10-Q filing details (July 21)', url: 'https://www.sec.gov/Archives/edgar/data/1035267/000103526726000058/0001035267-26-000058-index.htm', purpose: 'Quarterly filing date and period of report; accepted after the market close.' },
      { title: 'Download this case’s model inputs and sampled chart observations', url: './snapshot.json', purpose: 'The exact reviewed inputs used by this public case.' },
    ],
    provenance: {
      publishedOn: '2026-09-05', generatedAt,
      sourceRelease: 'Audited v55 valuation release dated 2026-08-30',
      sourcePayloadSha256,
      auditStatus: ledger.status,
      financialSource: 'Jansen Sharadar as-reported PIT financials',
      recordedPriceSource: payload.latest.latestPriceSource,
      pricePolicy: 'Comparison only; never an input to fair value. No live quote is requested by this public page.',
      exportPolicy: 'Allowlisted model outputs, assumptions and limited dated chart observations only. Excludes raw provider rows, transcripts, credentials, portfolio/user data and local filesystem paths.',
      modelLimitations: 'This reproduces the existing platform model; it is not an independent fair-value certification. Historical replay uses current model rules and was not necessarily available to investors at the displayed historical dates.',
      datePolicy: 'July 21 is the stored model availability date, not the July 16 earnings-release date. August 27 is the last observed market close; August 30 is the release snapshot date. This is a dated case, not today’s valuation.',
    },
    disclaimer: 'Independent research illustration, not investment advice or a recommendation to buy. Values depend on assumptions and can be wrong. ThesisForge is not affiliated with Intuitive Surgical.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databasePath = process.env.ISRG_CASE_DB;
  assert(databasePath, 'Set ISRG_CASE_DB to the audited v55 SQLite release; no stale fallback is allowed.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ledger = JSON.parse(readFileSync(path.join(root, 'server/reports/valuation-audit-ledger.json'), 'utf8'));
  const db = new DatabaseSync(databasePath, { readOnly: true });
  let row;
  let eventPriceObservations;
  try {
    row = db.prepare('SELECT generated_at, payload_json FROM valuation_ticker_snapshots WHERE ticker = ?').get('ISRG');
    eventPriceObservations = db.prepare('SELECT price_date AS date, close FROM valuation_pit_price_observations WHERE ticker = ? AND model_version = ? ORDER BY price_date')
      .all('ISRG', EXPECTED_MODEL);
  } finally {
    db.close();
  }
  assert(row?.payload_json, 'ISRG snapshot is missing.');
  const sourcePayloadSha256 = createHash('sha256').update(row.payload_json).digest('hex');
  process.stdout.write(`${JSON.stringify(curateIsrgCase(JSON.parse(row.payload_json), {
    generatedAt: row.generated_at, sourcePayloadSha256, ledger, eventPriceObservations,
  }), null, 2)}\n`);
}
