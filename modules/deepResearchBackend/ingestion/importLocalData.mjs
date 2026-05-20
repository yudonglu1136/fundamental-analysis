import { listDeepResearchBackendProfiles, getDeepResearchBackendProfile } from "../config.mjs";

const MS_PER_DAY = 86400000;

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function quarterEndDate(year, quarter) {
  if (quarter === 1) return `${year}-03-31`;
  if (quarter === 2) return `${year}-06-30`;
  if (quarter === 3) return `${year}-09-30`;
  return `${year}-12-31`;
}

function eventDate(year, quarter) {
  if (quarter === 1) return `${year}-04-25`;
  if (quarter === 2) return `${year}-07-25`;
  if (quarter === 3) return `${year}-10-25`;
  return `${year + 1}-02-15`;
}

function makeQuarters() {
  const quarters = [];
  for (let year = 2018; year <= 2025; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      quarters.push({ year, quarter });
    }
  }
  quarters.push({ year: 2026, quarter: 1 });
  return quarters;
}

function fiscalPeriod(year, quarter) {
  return `FY${year} Q${quarter}`;
}

function id(profile, suffix) {
  return `${profile.slug}-${suffix}`;
}

function cyclicalOverlay(index, profile) {
  const base = Math.sin(index / 3.4) * 0.035 + Math.cos(index / 5.7) * 0.025;
  if (profile.slug === "eqt") return Math.sin(index / 2.3) * 0.11;
  if (profile.slug === "ktos" || profile.slug === "avav") return Math.sin(index / 4.1) * 0.055;
  if (profile.slug === "jpm" || profile.slug === "bac") return Math.cos(index / 4.8) * 0.04;
  if (profile.slug === "cb" || profile.slug === "trv") return Math.sin(index / 6.2) * 0.03;
  return base;
}

function eventFinancial(profile, quarter, index, total) {
  const progress = total <= 1 ? 1 : index / (total - 1);
  const cycle = cyclicalOverlay(index, profile);
  const revenue = Math.max(1, interpolate(profile.revenueStart, profile.revenueEnd, progress) * (1 + cycle));
  const operatingMargin = clamp(interpolate(profile.operatingMarginStart, profile.operatingMarginEnd, progress) + cycle * 0.15, -0.2, 0.75);
  const fcfMargin = clamp(interpolate(profile.fcfMarginStart, profile.fcfMarginEnd, progress) + cycle * 0.2, -0.35, 0.65);
  const operatingIncome = revenue * operatingMargin;
  const netIncome = operatingIncome * 0.74;
  const operatingCashFlow = revenue * Math.max(fcfMargin + 0.035, -0.2);
  const capex = Math.abs(revenue * 0.035);
  const freeCashFlow = operatingCashFlow - capex;
  const dilutedShares = interpolate(profile.sharesStart, profile.sharesEnd, progress);
  const currentPrice = Math.max(0.5, interpolate(profile.priceStart, profile.priceEnd, progress) * (1 + cycle * 1.8));
  const netDebt = interpolate(profile.netDebtEnd * 0.55, profile.netDebtEnd, progress);
  const dilutedEps = dilutedShares ? netIncome / dilutedShares : null;
  return {
    progress,
    revenue,
    operatingMargin,
    fcfMargin,
    operatingIncome,
    netIncome,
    dilutedShares,
    operatingCashFlow,
    capex,
    freeCashFlow,
    dilutedEps,
    adjustedEps: dilutedEps,
    currentPrice,
    netDebt,
    cashAndShortTermInvestments: Math.max(0, -netDebt) + revenue * 0.18,
    debt: Math.max(0, netDebt) + revenue * 0.22,
    dividendsPaid: revenue * Math.max(0, profile.baseAssumptions.dividendYield ?? 0) * 0.45,
    buybacks: Math.max(0, revenue * Math.max(0, profile.baseAssumptions.buybackYield ?? 0) * 1.4),
    periodId: `${quarter.year}Q${quarter.quarter}`,
    quarterEnd: quarterEndDate(quarter.year, quarter.quarter),
    eventDate: eventDate(quarter.year, quarter.quarter),
    fiscalPeriod: fiscalPeriod(quarter.year, quarter.quarter),
  };
}

function assumptionSet(profile, financial, scenario) {
  const base = profile.baseAssumptions;
  const scenarioAdjustments = {
    Bear: {
      revenueCagr3Y: -0.45,
      normalizedFcfMargin: -0.22,
      exitFcfMultiple: -0.28,
      evRevenueMultiple: -0.3,
      discountRate: 0.018,
      qualityAdjustment: -0.08,
      riskHaircut: 0.12,
    },
    Base: {},
    Bull: {
      revenueCagr3Y: 0.35,
      normalizedFcfMargin: 0.16,
      exitFcfMultiple: 0.22,
      evRevenueMultiple: 0.24,
      discountRate: -0.01,
      qualityAdjustment: 0.08,
      riskHaircut: -0.07,
    },
  }[scenario] ?? {};
  const earlyStageDiscount = (1 - financial.progress) * 0.24;
  const revenueCagr3Y = clamp(base.revenueCagr3Y * (1 + (scenarioAdjustments.revenueCagr3Y ?? 0)) - earlyStageDiscount * 0.25, -0.18, 0.55);
  const normalizedFcfMargin = clamp(base.normalizedFcfMargin * (1 + (scenarioAdjustments.normalizedFcfMargin ?? 0)) - earlyStageDiscount * 0.08, -0.12, 0.55);
  return {
    revenueBase: financial.revenue * 4,
    revenueCagr3Y,
    terminalGrowth: base.terminalGrowth,
    normalizedFcfMargin,
    exitFcfMultiple: Math.max(1, base.exitFcfMultiple * (1 + (scenarioAdjustments.exitFcfMultiple ?? 0))),
    evRevenueMultiple: Math.max(0, base.evRevenueMultiple * (1 + (scenarioAdjustments.evRevenueMultiple ?? 0))),
    discountRate: clamp(base.discountRate + (scenarioAdjustments.discountRate ?? 0), 0.05, 0.22),
    netCashDebt: -financial.netDebt,
    dilutedShares: financial.dilutedShares,
    qualityAdjustment: clamp(base.qualityAdjustment + (scenarioAdjustments.qualityAdjustment ?? 0), 0.65, 1.35),
    riskHaircut: clamp(base.riskHaircut + (scenarioAdjustments.riskHaircut ?? 0) + earlyStageDiscount * 0.16, 0, 0.5),
    dividendYield: base.dividendYield,
    buybackYield: base.buybackYield,
  };
}

function warningRows(profile) {
  const createdAt = nowIso();
  return [
    {
      id: id(profile, "warning-source-proxy"),
      ticker: profile.ticker,
      scope: "source_quality",
      severity: "medium",
      title: "Research proxy financial history",
      detail: "Quarterly financial, segment, guidance and transcript rows are model-ready research proxies, not official filing imports.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt,
    },
    {
      id: id(profile, "warning-event-visible"),
      ticker: profile.ticker,
      scope: "no_future_leakage",
      severity: "low",
      title: "Event-visible valuation runs",
      detail: "Valuation assumptions are stored per reporting event and selected by asOfDate <= eventDate. Current thesis framing is not reused for old events.",
      relatedTable: "valuation_runs",
      relatedRecordId: null,
      createdAt,
    },
    {
      id: id(profile, "warning-price-source"),
      ticker: profile.ticker,
      scope: "market_data",
      severity: "medium",
      title: "Price bars require import refresh",
      detail: "Run the generic import-prices workflow to replace seeded event-price proxies with Yahoo adjusted daily bars for the stock and SPY.",
      relatedTable: "daily_price_bars",
      relatedRecordId: null,
      createdAt,
    },
  ];
}

export function buildDeepResearchBackendSeedPayload(slugOrTicker) {
  const profile = getDeepResearchBackendProfile(slugOrTicker);
  if (!profile) throw new Error(`Unknown deep research backend ticker: ${slugOrTicker}`);
  const quarters = makeQuarters();
  const createdAt = nowIso();

  const tables = {
    reportingEvents: [],
    sourceDocuments: [],
    financialPeriods: [],
    segmentFinancials: [],
    marketSnapshots: [],
    peerSnapshots: [],
    guidanceItems: [],
    transcriptEvents: [],
    transcriptExtractions: [],
    modelVersions: [
      {
        id: id(profile, "model-version"),
        ticker: profile.ticker,
        version: profile.modelVersion,
        name: `${profile.ticker} deep research backend pilot`,
        description: "Shared backend model for new deep-research modules. It uses event-visible proxy fundamentals, imported daily prices where available, and explicit source-quality warnings.",
        codeCommitSha: null,
        valuationMethodsJson: JSON.stringify(["DCF", "Forward FCF multiple", "EV / revenue cross-check"]),
        assumptionSchemaJson: JSON.stringify(Object.keys(profile.baseAssumptions)),
        createdAt,
      },
    ],
    assumptionSets: [],
    validationWarnings: warningRows(profile),
    dailyPriceBars: [],
  };

  const eventFinancials = quarters.map((quarter, index) => eventFinancial(profile, quarter, index, quarters.length));

  eventFinancials.forEach((financial, index) => {
    const eventId = id(profile, `event-${financial.periodId.toLowerCase()}`);
    const documentId = id(profile, `source-${financial.periodId.toLowerCase()}`);
    tables.reportingEvents.push({
      id: eventId,
      ticker: profile.ticker,
      eventDate: financial.eventDate,
      fiscalPeriod: financial.fiscalPeriod,
      fiscalYear: Number(financial.periodId.slice(0, 4)),
      fiscalQuarter: Number(financial.periodId.slice(-1)),
      eventType: "quarterly_results",
      label: `${profile.ticker} ${financial.fiscalPeriod} research event`,
      sourceType: "research_proxy",
      sourcePath: null,
      sourceUrl: profile.irUrl,
      createdAt,
    });
    tables.sourceDocuments.push({
      id: documentId,
      ticker: profile.ticker,
      sourceType: "research_proxy",
      sourceName: `${profile.ticker} ${financial.fiscalPeriod} local research pack`,
      sourcePath: null,
      sourceUrl: profile.irUrl,
      retrievedAt: createdAt,
      publishedDate: financial.eventDate,
      provenance: "manual_research_proxy",
      confidence: "medium",
      checksum: null,
      metadataJson: JSON.stringify({ sourceNote: profile.sourceNote, fiscalPeriod: financial.fiscalPeriod }),
    });
    tables.financialPeriods.push({
      id: id(profile, `financial-${financial.periodId.toLowerCase()}`),
      ticker: profile.ticker,
      periodId: financial.periodId,
      fiscalYear: Number(financial.periodId.slice(0, 4)),
      fiscalQuarter: Number(financial.periodId.slice(-1)),
      periodType: "quarter",
      eventId,
      asOfDate: financial.eventDate,
      sourceType: "research_proxy",
      revenue: financial.revenue,
      organicRevenueGrowth: index === 0 ? null : financial.revenue / eventFinancials[index - 1].revenue - 1,
      recurringRevenue: null,
      subscriptionRevenue: null,
      adjustedEbitda: financial.operatingIncome * 1.18,
      adjustedEbitdaMargin: financial.operatingMargin * 1.08,
      operatingIncome: financial.operatingIncome,
      operatingMargin: financial.operatingMargin,
      netIncome: financial.netIncome,
      adjustedEps: financial.adjustedEps,
      dilutedEps: financial.dilutedEps,
      dilutedShares: financial.dilutedShares,
      operatingCashFlow: financial.operatingCashFlow,
      capex: financial.capex,
      freeCashFlow: financial.freeCashFlow,
      depreciationAmortization: Math.abs(financial.revenue * 0.028),
      dividendsPaid: financial.dividendsPaid,
      buybacks: financial.buybacks,
      cashAndShortTermInvestments: financial.cashAndShortTermInvestments,
      debt: financial.debt,
      netDebt: financial.netDebt,
      fxImpact: 0,
      currentPrice: financial.currentPrice,
      researchOnly: 1,
      rawJson: JSON.stringify({
        dataQuality: "research_proxy",
        sourceNote: profile.sourceNote,
        quarterEnd: financial.quarterEnd,
      }),
    });
    let mixRemainder = 1;
    profile.segments.forEach((segment, segmentIndex) => {
      const mix = segmentIndex === profile.segments.length - 1
        ? mixRemainder
        : clamp(interpolate(segment.startMix, segment.endMix, financial.progress), 0.02, 0.95);
      mixRemainder = Math.max(0, mixRemainder - mix);
      const segmentRevenue = financial.revenue * mix;
      tables.segmentFinancials.push({
        id: id(profile, `segment-${financial.periodId.toLowerCase()}-${segmentIndex + 1}`),
        ticker: profile.ticker,
        periodId: financial.periodId,
        eventId,
        asOfDate: financial.eventDate,
        segment: segment.name,
        taxonomy: profile.archetype,
        revenue: segmentRevenue,
        operatingIncome: segmentRevenue * segment.margin,
        operatingMargin: segment.margin,
        adjustedEbitda: segmentRevenue * (segment.margin + 0.035),
        adjustedEbitdaMargin: segment.margin + 0.035,
        organicGrowth: index === 0 ? null : segmentRevenue / Math.max(1, eventFinancials[index - 1].revenue * mix) - 1,
        recurringRevenuePct: null,
        fxImpact: 0,
        sourceType: "research_proxy",
        researchOnly: 1,
        notes: "Segment rows are research taxonomy proxies until official segment imports are added.",
        rawJson: JSON.stringify({ mix, sourceNote: profile.sourceNote }),
      });
    });
    const shares = financial.dilutedShares;
    const marketCap = financial.currentPrice * shares;
    tables.marketSnapshots.push({
      id: id(profile, `market-${financial.periodId.toLowerCase()}`),
      ticker: profile.ticker,
      asOfDate: financial.eventDate,
      priceDate: financial.eventDate,
      currentPrice: financial.currentPrice,
      currency: profile.currency,
      marketCap,
      enterpriseValue: marketCap + financial.netDebt,
      sharesOutstanding: shares,
      previousClose: financial.currentPrice,
      fiftyTwoWeekHigh: financial.currentPrice * 1.22,
      fiftyTwoWeekLow: financial.currentPrice * 0.74,
      dividendYield: profile.baseAssumptions.dividendYield,
      beta: 1.05,
      source: "research_proxy_event_price",
      fetchedAt: createdAt,
      rawJson: JSON.stringify({ sourceNote: "Seeded event price proxy; import-prices replaces this for backtests." }),
    });
    tables.dailyPriceBars.push({
      id: id(profile, `event-bar-${financial.periodId.toLowerCase()}`),
      ticker: profile.ticker,
      priceDate: financial.eventDate,
      open: financial.currentPrice,
      high: financial.currentPrice,
      low: financial.currentPrice,
      close: financial.currentPrice,
      adjustedClose: financial.currentPrice,
      volume: null,
      dividendAmount: 0,
      splitCoefficient: 1,
      source: "research_proxy_event_price",
      sourceType: "market_data_proxy",
      fetchedAt: createdAt,
      rawJson: JSON.stringify({ sourceNote: "Seeded event price proxy." }),
    });
    profile.peers.forEach((peerTicker, peerIndex) => {
      tables.peerSnapshots.push({
        id: id(profile, `peer-${financial.periodId.toLowerCase()}-${peerTicker.toLowerCase()}`),
        ticker: profile.ticker,
        asOfDate: financial.eventDate,
        peerTicker,
        peerName: peerTicker,
        companyName: peerTicker,
        category: "peer",
        peerGroup: profile.archetype,
        marketCap: null,
        enterpriseValue: null,
        trailingPe: 12 + peerIndex * 3 + financial.progress * 4,
        forwardPe: 10 + peerIndex * 2 + financial.progress * 3,
        forwardEvEbitda: 8 + peerIndex * 1.3,
        priceToSales: 2 + peerIndex * 0.7,
        dividendYield: null,
        beta: null,
        currency: profile.currency,
        source: "research_proxy_peer_set",
        fetchedAt: createdAt,
        confidenceLevel: "low",
        absoluteValueUse: "relative_context_only",
        rawJson: JSON.stringify({ sourceNote: "Peer multiples are placeholders for model structure only." }),
      });
    });
    profile.debateQuestions.slice(0, 2).forEach((question, questionIndex) => {
      tables.guidanceItems.push({
        id: id(profile, `guidance-${financial.periodId.toLowerCase()}-${questionIndex + 1}`),
        ticker: profile.ticker,
        eventId,
        asOfDate: financial.eventDate,
        fiscalPeriodTarget: financial.fiscalPeriod,
        metric: question,
        guidanceType: "research_question",
        lowValue: null,
        highValue: null,
        midpointValue: null,
        unit: "qualitative",
        quote: question,
        speaker: "research_model",
        sourcePath: null,
        confidence: "medium",
        humanReviewStatus: "needs_official_source",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: JSON.stringify({ sourceNote: profile.sourceNote }),
      });
    });
    const transcriptId = id(profile, `transcript-${financial.periodId.toLowerCase()}`);
    tables.transcriptEvents.push({
      id: id(profile, `transcript-event-${financial.periodId.toLowerCase()}`),
      ticker: profile.ticker,
      eventId,
      eventDate: financial.eventDate,
      fiscalPeriod: financial.fiscalPeriod,
      eventType: "earnings_call_proxy",
      transcriptId,
      hasQa: 1,
      sourcePath: null,
      sourceUrl: profile.irUrl,
      provenance: "research_proxy",
      confidence: "medium",
      metadataJson: JSON.stringify({ sourceNote: "Research Q&A proxy; official transcript ingestion pending." }),
    });
    [...profile.debateQuestions, ...profile.riskTopics].slice(0, 5).forEach((topic, topicIndex) => {
      tables.transcriptExtractions.push({
        id: id(profile, `extraction-${financial.periodId.toLowerCase()}-${topicIndex + 1}`),
        ticker: profile.ticker,
        transcriptId,
        eventId,
        extractionType: topicIndex < profile.debateQuestions.length ? "investment_question" : "risk_topic",
        topic,
        segment: profile.segments[topicIndex % profile.segments.length]?.name ?? null,
        speaker: "research_model",
        section: "qa_proxy",
        supportingQuoteShort: topic,
        confidence: "medium",
        needsHumanReview: 1,
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: JSON.stringify({ sourceNote: profile.sourceNote }),
      });
    });
    for (const scenario of ["Bear", "Base", "Bull"]) {
      tables.assumptionSets.push({
        id: id(profile, `assumptions-${financial.periodId.toLowerCase()}-${scenario.toLowerCase()}`),
        ticker: profile.ticker,
        name: `${profile.ticker} ${financial.fiscalPeriod} ${scenario}`,
        scenario,
        modelVersion: profile.modelVersion,
        asOfDate: financial.eventDate,
        assumptionsJson: JSON.stringify(assumptionSet(profile, financial, scenario)),
        sourceType: "event_visible_research_proxy",
        createdAt,
      });
    }
  });

  return { profile, ...tables };
}

export function listDeepResearchBackendSeedPayloads() {
  return listDeepResearchBackendProfiles().map((profile) => buildDeepResearchBackendSeedPayload(profile.slug));
}

export function buildProxyDailyPriceBars(profile, { startDate = profile.historyStartDate, endDate = profile.latestDate, benchmarkTicker = "SPY" } = {}) {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  const days = Math.max(1, Math.floor((end - start) / MS_PER_DAY));
  const rows = [];
  const createdAt = nowIso();
  for (let offset = 0; offset <= days; offset += 1) {
    const date = new Date(start + offset * MS_PER_DAY);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    const progress = offset / days;
    const cycle = Math.sin(offset / 37) * 0.08 + Math.cos(offset / 83) * 0.05;
    const stockPrice = Math.max(0.5, interpolate(profile.priceStart, profile.priceEnd, progress) * (1 + cycle));
    const spyPrice = Math.max(50, interpolate(270, 640, progress) * (1 + Math.sin(offset / 91) * 0.035));
    [
      [profile.ticker, stockPrice],
      [benchmarkTicker, spyPrice],
    ].forEach(([ticker, price]) => {
      const priceDate = date.toISOString().slice(0, 10);
      rows.push({
        id: `${profile.slug}-${String(ticker).toLowerCase()}-proxy-bar-${priceDate}`,
        ticker,
        priceDate,
        open: price * 0.997,
        high: price * 1.012,
        low: price * 0.988,
        close: price,
        adjustedClose: price,
        volume: null,
        dividendAmount: 0,
        splitCoefficient: 1,
        source: "generated_proxy_price_curve",
        sourceType: "market_data_proxy_generated",
        fetchedAt: createdAt,
        rawJson: JSON.stringify({ sourceNote: "Generated fallback used only when Yahoo daily price import is unavailable." }),
      });
    });
  }
  return rows;
}
