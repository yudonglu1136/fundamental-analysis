// Reviewed valuation linkage, NOT a security/price alias. Alphabet's A and C
// shares participate equally in company earnings. Never generalize this to
// unequal share units (BRK), ADRs, recycled symbols, or a successor claim.
const alphabet = Object.freeze({
  ticker:'GOOG',cusip:'02079K107',modelTicker:'GOOGL',currency:'USD',
  availableAt:'2016-02-11',version:'alphabet-equal-economic-rights-v1',
  sourceUrl:'https://www.sec.gov/Archives/edgar/data/1652044/000165204416000012/goog10-k2015.htm',
  basis:'equal_per_share_economic_rights; held_share_class_own_close',
});

export function reviewedStrategyValuationLink(ticker) {
  return ticker===alphabet.ticker?alphabet:null;
}

export function strategyModelTickers(tickers) {
  return new Set([...tickers].flatMap(ticker=>[ticker,reviewedStrategyValuationLink(ticker)?.modelTicker].filter(Boolean)));
}

export function strategyValuationModel(holding,date,valuations) {
  const own=(valuations.get(holding.ticker)??[]).filter(n=>n.date<=date).at(-1);
  // An existing unusable/stale own-class model must not be silently replaced.
  if(own)return {model:own};
  const link=reviewedStrategyValuationLink(holding.ticker);
  if(!link||date<link.availableAt||!holding.identityResolved||holding.cusip!==link.cusip||holding.priceSymbol!==link.ticker)return {};
  const model=(valuations.get(link.modelTicker)??[]).filter(n=>n.date<=date).at(-1);
  if(!model||model.currency!==link.currency||model.sourceTicker!==link.modelTicker)return {};
  return {model,valuationLink:link};
}
