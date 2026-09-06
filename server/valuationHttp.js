// A missing released model is a coverage state, not a transport failure. Keep
// this contract independent of the source/import pipeline: GET never builds one.
export class ValuationNotCoveredError extends Error {
  constructor(ticker) {
    super(`Valuation ticker not found: ${ticker}`);
    this.name = "ValuationNotCoveredError";
    this.ticker = ticker;
  }
}

export function createValuationTickerHandler(loadTicker) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const ticker = String(request.params.ticker || "").trim().toUpperCase();
    // Do not silently strip invalid characters and resolve another security.
    if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(ticker)) {
      response.status(400).json({ error: "invalid_valuation_ticker" });
      return;
    }
    try {
      const payload = await loadTicker(ticker, {
        pricePoints: request.query.pricePoints,
        detail: request.query.detail
      });
      response.setHeader("Cache-Control", "private, max-age=120");
      response.json(payload);
    } catch (error) {
      if (error instanceof ValuationNotCoveredError) {
        response.status(404).json({
          error: "valuation_not_covered",
          ticker,
          coverageStatus: "not_published",
          message: "No released valuation model is available for this security."
        });
      } else {
        // SQL, storage and parsing failures must not masquerade as missing
        // coverage or expose server paths/internal diagnostics to the browser.
        response.status(503).json({
          error: "valuation_request_failed",
          ticker,
          message: "The valuation service is temporarily unavailable."
        });
      }
    }
  };
}
