import { createServer } from "vite";

function closeTo(actual, expected, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}

function hasHanText(value) {
  return /[\p{Script=Han}]/u.test(JSON.stringify(value));
}

function statusRecorder() {
  const results = [];
  return {
    pass(id, detail) {
      results.push({ status: "PASS", id, detail });
    },
    warn(id, detail) {
      results.push({ status: "WARNING", id, detail });
    },
    fail(id, detail) {
      results.push({ status: "FAIL", id, detail });
    },
    results,
  };
}

function assertRange(record, value, min, max, id, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    record.fail(id, `${label} ${value} is outside ${min} to ${max}.`);
  } else {
    record.pass(id, `${label} ${value} is inside ${min} to ${max}.`);
  }
}

export async function runDefensePrimeValidation(ticker) {
  const record = statusRecorder();
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "silent",
  });

  try {
    const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");
    const module = registryModule.stockRegistry[ticker];
    if (!module) {
      record.fail("registry", `${ticker} is not registered in src/stocks/registry.ts.`);
      return finalize(ticker, record.results);
    }

    const data = module.data;
    const valuation = module.calculateValuation(data, undefined, "Base");
    const assumptions = data.assumptions;

    record.pass("registry", `${ticker} module is registered through src/stocks/registry.ts.`);
    ["data", "calculateSummary", "calculateValuation", "Dashboard", "valuationConfig"].forEach((field) => {
      if (field in module && module[field]) record.pass(`contract-${field}`, `Module exposes ${field}.`);
      else record.fail(`contract-${field}`, `Module missing ${field}.`);
    });

    const annual = data.periods.find((period) => period.periodType === "FY") ?? data.periods[0];
    const segmentSales = data.segments.reduce((sum, segment) => sum + segment.sales, 0);
    const segmentProfit = data.segments.reduce((sum, segment) => sum + segment.operatingProfit, 0);
    const salesDelta = Math.abs(segmentSales - annual.sales) / annual.sales;
    if (salesDelta <= 0.005) {
      record.pass("segment-sales-reconciliation", `Segment sales reconcile to annual sales: ${segmentSales}m.`);
    } else if (salesDelta <= 0.04) {
      record.warn("segment-sales-reconciliation", `Segment sales ${segmentSales}m differ from annual sales ${annual.sales}m by ${(salesDelta * 100).toFixed(1)}%; this is acceptable when eliminations are disclosed separately.`);
    } else {
      record.fail("segment-sales-reconciliation", `Segment sales ${segmentSales}m do not reconcile to annual sales ${annual.sales}m.`);
    }

    const profitAnchor = annual.adjustedOperatingProfit ?? annual.operatingProfit ?? segmentProfit;
    const profitDelta = Math.abs(segmentProfit - profitAnchor) / Math.max(profitAnchor, 1);
    if (profitDelta <= 0.005) {
      record.pass("segment-profit-reconciliation", `Segment profit reconciles to annual operating profit: ${segmentProfit}m.`);
    } else if (profitDelta <= 0.06) {
      record.warn("segment-profit-reconciliation", `Segment profit ${segmentProfit}m differs from annual anchor ${profitAnchor}m by ${(profitDelta * 100).toFixed(1)}%; review corporate/unallocated adjustments.`);
    } else {
      record.fail("segment-profit-reconciliation", `Segment profit ${segmentProfit}m does not reconcile to annual anchor ${profitAnchor}m.`);
    }

    data.segments.forEach((segment) => {
      const expectedMargin = segment.operatingProfit / segment.sales;
      if (closeTo(segment.margin, expectedMargin, 0.0025)) {
        record.pass(`segment-margin-${segment.id}`, `${segment.name} margin is calculated from official sales and profit.`);
      } else {
        record.fail(`segment-margin-${segment.id}`, `${segment.name} margin ${segment.margin} does not match profit / sales ${expectedMargin}.`);
      }
    });

    data.periods.forEach((period) => {
      const expectedFcf = period.operatingCashFlow - period.capex;
      if (closeTo(period.freeCashFlow, expectedFcf, 2)) {
        record.pass(`fcf-formula-${period.id}`, `${period.label} FCF equals operating cash flow minus capex.`);
      } else {
        record.fail(`fcf-formula-${period.id}`, `${period.label} FCF ${period.freeCashFlow} does not equal OCF ${period.operatingCashFlow} minus capex ${period.capex}.`);
      }

      const coverage = period.backlog / (period.periodType === "Q" ? period.sales * 4 : period.sales);
      if (Number.isFinite(coverage) && coverage > 0) {
        record.pass(`backlog-coverage-${period.id}`, `${period.label} backlog coverage is ${coverage.toFixed(2)}x run-rate sales.`);
      } else {
        record.fail(`backlog-coverage-${period.id}`, `${period.label} backlog coverage is invalid.`);
      }

      if (period.orderIntake) {
        const bookToBill = period.orderIntake / period.sales;
        if (Number.isFinite(bookToBill) && bookToBill >= 0) {
          const label = period.orderIntakeSourceStatus === "derived" ? "derived" : "official";
          record.pass(`book-to-bill-${period.id}`, `${period.label} ${label} book-to-bill is ${bookToBill.toFixed(2)}x.`);
        } else {
          record.fail(`book-to-bill-${period.id}`, `${period.label} book-to-bill is invalid.`);
        }
      } else {
        record.warn(`book-to-bill-${period.id}`, `${period.label} order intake is missing and is not silently inferred.`);
      }
    });

    const weightSum = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightEvEbit + assumptions.weightPe + assumptions.weightBacklogDurability;
    if (closeTo(weightSum, 1, 1e-9)) {
      record.pass("valuation-weight-sum", "Valuation triangulation weights sum to 100%.");
    } else {
      record.fail("valuation-weight-sum", `Valuation triangulation weights sum to ${(weightSum * 100).toFixed(1)}%.`);
    }

    const probabilitySum = data.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
    if (closeTo(probabilitySum, 1, 1e-9)) {
      record.pass("scenario-probability-sum", "Scenario probabilities sum to 100%.");
    } else {
      record.fail("scenario-probability-sum", `Scenario probabilities sum to ${(probabilitySum * 100).toFixed(1)}%.`);
    }

    assertRange(record, assumptions.wacc, 0.065, 0.11, "wacc-range", "WACC");
    assertRange(record, assumptions.terminalGrowth, 0.01, 0.035, "terminal-growth-range", "Terminal growth");
    assertRange(record, assumptions.operatingMargin, 0.06, 0.16, "margin-range", "Operating margin");
    assertRange(record, assumptions.revenueCagr, 0, 0.12, "revenue-cagr-range", "Revenue CAGR");

    if ((valuation.validationWarnings ?? []).some((warning) => warning.id.includes("terminal-value"))) {
      record.warn("dcf-terminal-value", "DCF terminal value warning is surfaced to the valuation result.");
    } else {
      record.pass("dcf-terminal-value", "DCF terminal-value share is below the warning threshold.");
    }

    if (Number.isFinite(valuation.recommendedFairValue) && valuation.recommendedFairValue > 0) {
      record.pass("valuation-finite", `Recommended fair value is finite: $${valuation.recommendedFairValue.toFixed(2)}.`);
    } else {
      record.fail("valuation-finite", "Recommended fair value is missing or non-positive.");
    }

    const researchOnlySourceErrors = [
      ...data.programs.filter((program) => program.sourceStatus !== "research_only"),
      ...data.risks.filter((risk) => risk.sourceStatus !== "research_only"),
      ...data.reportingEvents.filter((event) => event.aiSummary.sourceStatus !== "research_only"),
    ];
    if (researchOnlySourceErrors.length === 0) {
      record.pass("research-only-isolation", "Program, risk, and AI reporting summaries are marked research-only and are not direct valuation inputs.");
    } else {
      record.fail("research-only-isolation", "At least one qualitative item is not marked research-only.");
    }

    const sourceStatusSet = new Set(data.sources.map((source) => source.sourceStatus));
    ["official_actual", "management_guidance", "forecast_assumption", "research_only", "market_data"].forEach((status) => {
      if (sourceStatusSet.has(status)) record.pass(`source-status-${status}`, `Source map includes ${status}.`);
      else record.fail(`source-status-${status}`, `Source map missing ${status}.`);
    });

    if (data.reportingEvents.length === 8) {
      record.pass("reporting-events-eight-quarters", "Reporting-event intelligence covers eight quarter windows.");
    } else {
      record.fail("reporting-events-eight-quarters", `Expected 8 reporting windows, found ${data.reportingEvents.length}.`);
    }
    const eventsSorted = data.reportingEvents.every((event, index, events) => index === 0 || events[index - 1].eventDate <= event.eventDate);
    if (eventsSorted) {
      record.pass("reporting-events-sorted", "Reporting events are sorted chronologically for scrollbar navigation.");
    } else {
      record.fail("reporting-events-sorted", "Reporting events are not sorted chronologically.");
    }
    const allReportingSourcesMapped = data.reportingEvents.every((event) => data.sourceMap[event.sourceId]);
    if (allReportingSourcesMapped) {
      record.pass("reporting-source-map", "Every reporting event maps back to a source record.");
    } else {
      record.fail("reporting-source-map", "At least one reporting event lacks source-map provenance.");
    }

    if (!hasHanText(data) && !hasHanText(module.tabs)) {
      record.pass("english-only", "Module data and visible tab labels contain no Chinese characters.");
    } else {
      record.fail("english-only", "Module data contains Chinese characters.");
    }

    if (data.marketData.sourceStatus === "market_data") {
      record.pass("market-data-boundary", "Market price and market cap are explicitly separated from official actuals.");
    } else {
      record.fail("market-data-boundary", "Market data is not marked as market_data.");
    }
  } finally {
    await server.close();
  }

  return finalize(ticker, record.results);
}

function finalize(ticker, results) {
  const order = { FAIL: 0, WARNING: 1, PASS: 2 };
  for (const row of results.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id))) {
    console.log(`${row.status.padEnd(7)} ${row.id} - ${row.detail}`);
  }

  const failures = results.filter((row) => row.status === "FAIL");
  const warnings = results.filter((row) => row.status === "WARNING");
  console.log(`\n${ticker} validation summary: ${results.length - failures.length - warnings.length} PASS / ${warnings.length} WARNING / ${failures.length} FAIL`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
  return { failures, warnings, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runDefensePrimeValidation(process.argv[2] ?? "RTX");
}
