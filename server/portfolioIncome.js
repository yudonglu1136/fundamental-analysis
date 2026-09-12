import crypto from 'node:crypto';

const categories = new Map([
  ['Dividends', 'dividends'],
  ['Bond Interest Received', 'bond_interest'],
  ['Broker Interest Received', 'cash_interest'],
  ['Payment In Lieu Of Dividends', 'substitute_dividends'],
]);
const excluded = new Set(['Withholding Tax', 'Other Fees', 'Broker Interest Paid', 'Bond Interest Paid',
  'Commission Adjustments', 'Sales Tax', 'Transaction Fees', 'Advisor Fees',
  'Deposits/Withdrawals', 'Internal Cash Transfer', 'Internal Cash Transfers']);
const finite = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v)) ? Number(v) : null;
const iso = value => {
  const d = String(value ?? '').split(';')[0].replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d ? d : null;
};

// Cash transactions only: never accruals, expected dividends, security market
// values or trade profits. Currency conversion uses the transaction's own FX.
export function brokerIncome(statement, currency, rows) {
  const fromDate = iso(statement.fromDate), toDate = iso(statement.toDate);
  const cash = rows(statement, 'CashTransaction');
  const events = cash.filter(r => categories.has(r.type)).map(r => {
    const sourceAmount = finite(r.amount), sourceCurrency = String(r.currency ?? '');
    const fx = sourceCurrency === currency ? 1 : finite(r.fxRateToBase);
    const ticker = String(r.symbol ?? '').trim(), category = categories.get(r.type);
    // Same economic row without a distinct transaction ID is ambiguous, not a
    // second receipt. The account boundary is retained by the snapshot table.
    const identity = r.transactionID || r.transactionId || JSON.stringify([
      r.dateTime, r.type, ticker, r.assetCategory, r.description, sourceAmount, sourceCurrency, fx,
    ]);
    return {eventKey: crypto.createHash('sha256').update(String(identity)).digest('hex'),
      date: iso(r.dateTime), ticker, assetCategory: String(r.assetCategory ?? ''), category,
      sourceCurrency, sourceAmount, fxRateToBase: fx,
      amount: sourceAmount !== null && fx > 0 ? sourceAmount * fx : null};
  });
  const status = !rows(statement, 'CashTransactions').length ? 'cash_section_missing' :
    !currency || !fromDate || !toDate || fromDate > toDate ||
    cash.some(r => !categories.has(r.type) && !excluded.has(r.type)) ||
    events.some(r => !r.sourceCurrency || !r.date || r.date < fromDate || r.date > toDate || r.amount === null ||
      (!r.ticker && r.category !== 'cash_interest')) ||
    new Set(events.map(r => r.eventKey)).size !== events.length ? 'income_rows_need_review' : 'ready';
  return {incomeStatus: status, income: status === 'ready' ? events : []};
}

export function portfolioIncome(accounts) {
  const histories = accounts.map(a => a.historyEvidence);
  const covered = histories.length > 0 && histories.every(h => h?.fromDate && h?.toDate);
  const fromDate = covered ? histories.map(h => h.fromDate).sort().at(-1) : null;
  const toDate = covered ? histories.map(h => h.toDate).sort()[0] : null;
  const ready = covered && fromDate <= toDate && histories.every(h => h.incomeStatus === 'ready');
  const events = ready ? histories.flatMap(h => h.income ?? []).filter(r => r.date >= fromDate && r.date <= toDate) : [];
  // Positive received amounts form the pie. Negative reversals remain separate;
  // a pie of gross receipts must never be described as net income or a yield.
  const receipts = events.filter(r => r.amount > 0);
  const grossReceived = ready ? receipts.reduce((n, r) => n + r.amount, 0) : null;
  const reversals = ready ? events.filter(r => r.amount < 0).reduce((n, r) => n + r.amount, 0) : null;
  const sources = new Map(), types = new Map();
  for (const r of receipts) {
    const ticker = r.ticker || 'CASH', key = `${r.category}:${r.assetCategory}:${ticker}`;
    sources.set(key, {id: key, ticker, category: r.category, amount: (sources.get(key)?.amount ?? 0) + r.amount});
    types.set(r.category, (types.get(r.category) ?? 0) + r.amount);
  }
  const weight = amount => grossReceived > 0 ? amount / grossReceived : 0;
  return {status: ready ? 'ready' : 'income_history_required', fromDate, toDate,
    grossReceived, reversals, eventCount: events.length,
    byInstrument: [...sources.values()].map(r => ({...r, weight: weight(r.amount)})).sort((a, b) => b.amount - a.amount),
    byType: [...categories.values()].map(category => ({id: category, category, amount: ready ? types.get(category) ?? 0 : null,
      weight: ready ? weight(types.get(category) ?? 0) : null})),
    basis: 'reported_positive_cash_income_before_tax_fees_and_reversals_not_yield',
    // Bond interest may include accrued interest on a trade, not just coupons.
    source: 'ibkr_cash_transactions_reported_fx',
  };
}
