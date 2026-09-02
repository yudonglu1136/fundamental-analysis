import express from "express";

function uniqueStrings(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeBacktestYears(value) {
  const raw = String(value ?? "10").trim().toLowerCase();
  if (["all", "max", "full", "history"].includes(raw)) return "all";
  if (!/^\d+$/.test(raw)) {
    throw new Error("Price-series import years must be an integer from 1 to 40, or all.");
  }
  const years = Number(raw);
  if (!Number.isSafeInteger(years) || years < 1 || years > 40) {
    throw new Error("Price-series import years must be an integer from 1 to 40, or all.");
  }
  return years;
}

export function registerAuditedPriceSeriesImportRoute(app, {
  requireInternalCron,
  gurus,
  writeAuditedPriceSeriesImport,
  loadGuruBacktest
}) {
  app.post(
    "/api/internal/prices/import-series",
    requireInternalCron,
    express.json({ limit: "5mb" }),
    async (request, response) => {
      const guruIds = uniqueStrings(request.body?.refreshGuruIds);
      const knownGuruIds = new Set(gurus
        .filter((guru) =>
          (guru.type === "manager13f" || guru.type === "congress") && !guru.disableSimulation
        )
        .map((guru) => guru.id));
      const unknownGuruIds = guruIds.filter((guruId) => !knownGuruIds.has(guruId));
      if (!guruIds.length || guruIds.length > 5 || unknownGuruIds.length) {
        response.status(400).json({
          error: "price_series_import_invalid_gurus",
          message: !guruIds.length
            ? "A price-series import must refresh at least one affected guru."
            : unknownGuruIds.length
            ? `Unknown guru id(s): ${unknownGuruIds.join(", ")}`
            : "A price-series import may refresh at most five gurus."
        });
        return;
      }

      let years;
      try {
        years = normalizeBacktestYears(request.query.years || request.body?.years || 10);
      } catch (error) {
        response.status(400).json({
          error: "price_series_import_invalid_window",
          message: error.message
        });
        return;
      }
      const requestedDetail = String(
        request.query.detail || request.body?.detail || "compact"
      ).trim().toLowerCase();
      const detail = ["compact", "full", "attribution"].includes(requestedDetail)
        ? requestedDetail
        : "compact";

      let imported;
      try {
        imported = writeAuditedPriceSeriesImport(request.body?.rows, {
          symbol: request.body?.symbol,
          startDate: request.body?.startDate,
          endDate: request.body?.endDate,
          provider: request.body?.provider,
          reason: request.body?.reason,
          snapshotId: request.body?.snapshotId,
          snapshotState: request.body?.snapshotState,
          sourceReference: request.body?.sourceReference,
          operator: request.body?.operator,
          affectedGuruIds: guruIds
        });
      } catch (error) {
        response.status(400).json({
          error: "price_series_import_rejected",
          message: error.message
        });
        return;
      }

      const backtests = [];
      for (const guruId of guruIds) {
        try {
          const payload = await loadGuruBacktest(guruId, {
            refresh: true,
            years,
            detail,
            refreshGeneration: imported.auditId
          });
          backtests.push({
            guruId,
            status: payload.status,
            start: payload.window?.start || "",
            end: payload.window?.end || "",
            minimumObservedExecutionCoverage:
              payload.dataQuality?.minimumObservedExecutionCoverage ?? null
          });
        } catch (error) {
          backtests.push({ guruId, status: "failed", message: error.message });
        }
      }

      const allRequestedBacktestsReady =
        backtests.length === guruIds.length && backtests.every((item) => item.status === "ready");
      response.setHeader("Cache-Control", "no-store");
      response.status(allRequestedBacktestsReady ? 201 : 422).json({
        ...(allRequestedBacktestsReady ? {} : {
          error: "price_series_import_backtest_refresh_failed",
          message: "The price series was imported, but at least one affected backtest is not ready."
        }),
        import: imported,
        years,
        backtests,
        allRequestedBacktestsReady
      });
    }
  );
}
