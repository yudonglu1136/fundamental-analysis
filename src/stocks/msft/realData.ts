export type MsftAnchorPoint = {
  label: string;
  value: number;
  source: "actual" | "consensus" | "derived" | "assumption";
  format: "currency" | "percent" | "number" | "multiple";
  description: string;
};

export type MsftRealData = {
  actual: {
    quarterlyRevenue: number;
    microsoftCloudRevenue: number;
    azureGrowth: number;
    microsoftCloudGrossMargin: number;
    commercialRpo: number;
    quarterlyCapex: number;
    fcfMargin: number;
    operatingMargin: number;
    cloudMarginGuideNextQuarter: number;
  };
  consensus: {
    fy26Eps: number;
    fy27Eps: number;
  };
  taxRate: number;
  dividendYield: number;
  anchors: MsftAnchorPoint[];
};

export const msftRealData: MsftRealData = {
  actual: {
    quarterlyRevenue: 82.9,
    microsoftCloudRevenue: 54.5,
    azureGrowth: 0.4,
    microsoftCloudGrossMargin: 0.66,
    commercialRpo: 627,
    quarterlyCapex: 31.9,
    fcfMargin: 0.3,
    operatingMargin: 0.45,
    cloudMarginGuideNextQuarter: 0.64,
  },
  consensus: {
    fy26Eps: 16,
    fy27Eps: 19,
  },
  taxRate: 0.18,
  dividendYield: 0.008,
  anchors: [
    { label: "Quarterly Revenue", value: 82.9, source: "actual", format: "currency", description: "Most recent quarterly revenue anchor." },
    { label: "Microsoft Cloud Revenue", value: 54.5, source: "actual", format: "currency", description: "Disclosed Microsoft Cloud revenue anchor." },
    { label: "Azure Growth", value: 0.4, source: "actual", format: "percent", description: "Latest disclosed Azure growth anchor." },
    { label: "Microsoft Cloud Gross Margin", value: 0.66, source: "actual", format: "percent", description: "Cloud gross margin anchor before scenario stress." },
    { label: "Commercial RPO", value: 627, source: "actual", format: "currency", description: "Commercial RPO provides demand visibility and backlog support." },
    { label: "Quarterly CapEx", value: 31.9, source: "actual", format: "currency", description: "Quarterly capital expenditure anchor for AI build-out." },
    { label: "FCF Margin", value: 0.3, source: "actual", format: "percent", description: "Reported free cash flow margin anchor." },
    { label: "Operating Margin", value: 0.45, source: "actual", format: "percent", description: "Company operating margin anchor." },
    { label: "FY26 EPS Consensus", value: 16, source: "consensus", format: "currency", description: "Street FY26 EPS consensus anchor." },
    { label: "FY27 EPS Consensus", value: 19, source: "consensus", format: "currency", description: "Street FY27 EPS consensus anchor." },
  ],
};
