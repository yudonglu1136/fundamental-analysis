// These simulations execute on daily closing observations, never on the open.
// Preserve a corroborated close without presenting contradictory ancillary
// fields as a valid OHLC bar. The raw document must remain in source_documents.
export function validateClosingObservation(row) {
  const {open, high, low, close} = row;
  if (![high, low, close].every(x => Number.isFinite(x) && x > 0)
      || low > high || close < low || close > high) {
    throw Error('invalid_daily_close');
  }
  if (open != null && (!Number.isFinite(open) || open <= 0 || open < low || open > high)) {
    return {...row, open: null, openQuarantined: true};
  }
  return {...row, openQuarantined: false};
}
