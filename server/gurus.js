export const gurus = [
  {
    id: "jeff-bezos",
    name: "Jeff Bezos",
    chineseName: "贝索斯",
    entityName: "BEZOS JEFFREY P",
    cik: "0001043298",
    type: "insider",
    focusTicker: "AMZN",
    focusIssuer: "Amazon.com",
    role: "Amazon founder / executive chair",
    thesisTag: "Founder-controlled liquidity",
    excludeFromHeatmap: true,
    heatmapExclusionReason: "company founder / control-holder ownership distorts external consensus",
    notes: [
      "Personal insiders disclose transactions on Form 4 instead of quarterly 13F portfolio reports.",
      "For Bezos, the app tracks recent AMZN Form 4 transactions and post-transaction share counts."
    ]
  },
  {
    id: "elon-musk",
    name: "Elon Musk",
    chineseName: "马斯克",
    entityName: "MUSK ELON",
    cik: "0001494730",
    type: "insider",
    focusTicker: "TSLA",
    focusIssuer: "Tesla",
    role: "Tesla CEO / controlling owner",
    thesisTag: "Control holder + liquidity signals",
    excludeFromHeatmap: true,
    heatmapExclusionReason: "company founder / control-holder ownership distorts external consensus",
    notes: [
      "Musk's public-company trading disclosures are Form 4 filings, not 13F filings.",
      "The feed can include non-TSLA issuer disclosures when SEC links them to the same reporting owner CIK."
    ]
  },
  {
    id: "gavin-baker",
    name: "Gavin Baker",
    chineseName: "Gavin Baker",
    entityName: "Atreides Management, LP",
    cik: "0001777813",
    type: "manager13f",
    role: "Atreides Management",
    thesisTag: "Tech and growth public equities",
    notes: [
      "Atreides files quarterly Form 13F-HR reports. Changes are computed against the prior 13F quarter."
    ]
  },
  {
    id: "chamath-palihapitiya",
    name: "Chamath Palihapitiya",
    chineseName: "Chamath",
    entityName: "SC US (TTGP), LTD. / Social Capital",
    cik: "0001607841",
    type: "manager13f",
    role: "Social Capital founder / public equity manager proxy",
    thesisTag: "Social Capital public 13F proxy",
    notes: [
      "Chamath's personal Form 4 feed only captures companies where he is a reporting insider, so it is not a complete portfolio view.",
      "This card uses SC US (TTGP), LTD.'s quarterly 13F as the better public-market proxy for Social Capital's disclosed long equity holdings.",
      "It still cannot show private investments, venture positions, crypto, offshore entities, short positions, or holdings below public disclosure thresholds."
    ]
  },
  {
    id: "bill-ackman",
    name: "Bill Ackman",
    chineseName: "Bill Ackman",
    entityName: "Pershing Square Capital Management, L.P.",
    cik: "0001336528",
    type: "manager13f",
    role: "Pershing Square founder / CEO",
    thesisTag: "Concentrated activist compounders",
    notes: [
      "Pershing Square files quarterly Form 13F-HR reports. The app tracks the public long equity portfolio rather than Ackman's private investments.",
      "The strategy is unusually concentrated, so the holding list may look short versus diversified hedge funds.",
      "Public letters, presentations, interviews, and conference remarks can be useful for interpreting major position changes."
    ]
  },
  {
    id: "philippe-laffont",
    name: "Philippe Laffont",
    chineseName: "Philippe Laffont",
    entityName: "COATUE MANAGEMENT LLC",
    cik: "0001135730",
    type: "manager13f",
    role: "Coatue founder / portfolio manager",
    thesisTag: "Tiger Cub technology and growth equities",
    notes: [
      "Coatue Management files quarterly Form 13F-HR reports. The app treats the 13F as Philippe Laffont's public long-equity proxy.",
      "The 13F does not show private investments, shorts, derivatives below disclosure thresholds, or fund-level net exposure."
    ]
  },
  {
    id: "li-lu",
    name: "Li Lu",
    chineseName: "李录",
    entityName: "Himalaya Capital Management LLC",
    cik: "0001709323",
    type: "manager13f",
    role: "Himalaya Capital founder / Munger-style value investor",
    thesisTag: "Concentrated value compounders",
    notes: [
      "Himalaya Capital files quarterly Form 13F-HR reports. The app tracks the disclosed U.S.-listed long equity portfolio.",
      "Li Lu is often associated with Charlie Munger's value-investing circle, but the 13F only captures reportable U.S. securities.",
      "Non-U.S. ordinary shares, private holdings, and positions outside 13F scope are not shown."
    ]
  },
  {
    id: "terry-smith",
    name: "Terry Smith",
    chineseName: "Terry Smith",
    entityName: "Fundsmith LLP",
    cik: "0001569205",
    type: "manager13f",
    role: "Fundsmith founder / CIO",
    thesisTag: "Quality compounders, long holding periods",
    notes: [
      "Fundsmith LLP files quarterly Form 13F-HR reports for U.S.-reportable holdings.",
      "This view captures the U.S. 13F sleeve and can miss non-U.S. ordinary shares held outside the 13F reporting universe."
    ]
  },
  {
    id: "stan-moss",
    name: "Stan Moss",
    chineseName: "Stan Moss",
    entityName: "POLEN CAPITAL MANAGEMENT LLC",
    cik: "0001034524",
    type: "manager13f",
    role: "Polen Capital CEO",
    thesisTag: "Quality growth compounders",
    notes: [
      "Polen Capital Management files quarterly Form 13F-HR reports. This card uses Polen's institutional 13F as the public portfolio proxy for Stan Moss's platform.",
      "The 13F is firm-level and may include multiple strategies, so it should not be read as a personal portfolio."
    ]
  },
  {
    id: "baillie-gifford",
    name: "Baillie Gifford",
    chineseName: "Baillie Gifford",
    entityName: "BAILLIE GIFFORD & CO",
    cik: "0001088875",
    type: "manager13f",
    role: "Long-duration global growth manager",
    thesisTag: "Patient growth and innovation platforms",
    notes: [
      "Baillie Gifford & Co files quarterly Form 13F-HR reports for U.S.-reportable holdings.",
      "The 13F can understate the global portfolio because non-U.S. ordinary shares and some fund holdings are outside the U.S. 13F scope."
    ]
  },
  {
    id: "peter-thiel",
    name: "Peter Thiel",
    chineseName: "Peter Thiel",
    entityName: "THIEL PETER",
    cik: "0001211060",
    type: "insider",
    role: "Founder / board-level investor",
    thesisTag: "Founder and board disclosures",
    excludeFromHeatmap: true,
    heatmapExclusionReason: "company founder / board-level ownership distorts external consensus",
    notes: [
      "Peter Thiel's personal public disclosures are Form 4 filings tied to issuer relationships.",
      "Founders Fund entities can file separate 13Fs, but there is not a single personal quarterly 13F for Thiel."
    ]
  },
  {
    id: "nancy-pelosi",
    name: "Nancy Pelosi",
    chineseName: "佩洛西",
    entityName: "Nancy Pelosi household disclosures",
    type: "congress",
    role: "U.S. Representative / household STOCK Act disclosures",
    thesisTag: "Congressional trading disclosure lag",
    profileUrl: "https://pelositracker.app/stocks",
    sourceLabel: "Pelosi Tracker / STOCK Act",
    notes: [
      "Members of Congress do not file SEC Form 4 or 13F reports for household trades.",
      "This view tracks disclosed household transactions under the STOCK Act; trades can be reported with a delay and amounts are ranges, not exact share counts.",
      "The normalized feed starts from Pelosi Tracker's public congressional disclosure page and links back to the original tracker/source view."
    ]
  },
  {
    id: "alex-karp",
    name: "Alex Karp",
    chineseName: "Alex Karp",
    entityName: "Karp Alexander C.",
    cik: "0001823951",
    type: "insider",
    focusTicker: "PLTR",
    focusIssuer: "Palantir Technologies",
    role: "Palantir co-founder / CEO",
    thesisTag: "Founder CEO Form 4 selling and ownership",
    excludeFromHeatmap: true,
    heatmapExclusionReason: "company founder / control-holder ownership distorts external consensus",
    notes: [
      "Alex Karp's public-company trading disclosures are Form 4 filings tied to Palantir.",
      "Form 144 filings may also appear in SEC submissions, but this app focuses on completed Form 4 ownership-change reports."
    ]
  },
  {
    id: "george-soros",
    name: "George Soros",
    chineseName: "索罗斯",
    entityName: "SOROS FUND MANAGEMENT LLC",
    cik: "0001029160",
    type: "manager13f",
    role: "Soros Fund Management",
    thesisTag: "Multi-strategy public equities",
    notes: [
      "Soros Fund Management files quarterly Form 13F-HR reports. Changes are computed against the prior 13F quarter."
    ]
  }
];
