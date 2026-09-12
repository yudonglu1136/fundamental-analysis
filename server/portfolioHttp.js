// Set before authentication and body parsing: even denied/failed portfolio
// requests must never leave account data in a shared or browser HTTP cache.
export function portfolioResponsePrivacy(_request, response, next) {
  response.setHeader('Cache-Control', 'no-store');
  response.vary('Authorization');
  next();
}

export function respondPortfolioBusy(error, response) {
  if (error?.code !== 'portfolio_sync_busy') return false;
  response.setHeader('Retry-After', '5');
  response.setHeader('Cache-Control', 'no-store');
  response.status(503).json({ error: error.code, message: error.message });
  return true;
}
