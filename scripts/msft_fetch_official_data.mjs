import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("data/local/msft/official");
const ACCESSED_AT = new Date().toISOString();

const quarters = [
  { id: "fy24-q4", label: "FY24 Q4", fiscalYear: "fy-2024", quarter: "q4" },
  { id: "fy25-q1", label: "FY25 Q1", fiscalYear: "fy-2025", quarter: "q1" },
  { id: "fy25-q2", label: "FY25 Q2", fiscalYear: "fy-2025", quarter: "q2" },
  { id: "fy25-q3", label: "FY25 Q3", fiscalYear: "fy-2025", quarter: "q3" },
  { id: "fy25-q4", label: "FY25 Q4", fiscalYear: "fy-2025", quarter: "q4" },
  { id: "fy26-q1", label: "FY26 Q1", fiscalYear: "fy-2026", quarter: "q1" },
  { id: "fy26-q2", label: "FY26 Q2", fiscalYear: "fy-2026", quarter: "q2" },
  { id: "fy26-q3", label: "FY26 Q3", fiscalYear: "fy-2026", quarter: "q3" },
];

const quarterTargets = quarters.flatMap((quarter) => {
  const slug = `${quarter.fiscalYear}-${quarter.quarter}`;
  return [
    {
      id: `msft-${quarter.id}-release`,
      title: `${quarter.label} Press Release and Webcast`,
      url: `https://www.microsoft.com/en-us/investor/earnings/${slug}/press-release-webcast`,
      reportingPeriod: quarter.label,
    },
    {
      id: `msft-${quarter.id}-metrics`,
      title: `${quarter.label} Investor Metrics`,
      url: `https://www.microsoft.com/en-us/investor/earnings/${slug}/metrics`,
      reportingPeriod: quarter.label,
    },
    {
      id: `msft-${quarter.id}-performance`,
      title: `${quarter.label} Performance`,
      url: `https://www.microsoft.com/en-us/investor/earnings/${slug}/performance`,
      reportingPeriod: quarter.label,
    },
    {
      id: `msft-${quarter.id}-segments`,
      title: `${quarter.label} Segment Results`,
      url: `https://www.microsoft.com/en-us/investor/earnings/${slug}/segment-revenues`,
      reportingPeriod: quarter.label,
    },
    {
      id: `msft-${quarter.id}-call`,
      title: `${quarter.label} Earnings Call`,
      url: `https://www.microsoft.com/en-us/investor/events/${quarter.fiscalYear}/earnings-${slug}`,
      reportingPeriod: quarter.label,
    },
  ];
});

const targets = [
  {
    id: "msft-ar25",
    title: "Microsoft 2025 Annual Report",
    url: "https://www.microsoft.com/investor/reports/ar25/index.html",
    reportingPeriod: "FY2025",
  },
  ...quarterTargets,
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function looksBlocked(status, text) {
  const sample = text.slice(0, 8_000).toLowerCase();
  return (
    status >= 400 ||
    sample.includes("access denied") ||
    sample.includes("captcha") ||
    sample.includes("are you a robot") ||
    sample.includes("bot detection") ||
    sample.includes("challenge page")
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const metadata = [];

for (const target of targets) {
  const baseName = slugify(target.title);
  const htmlPath = path.join(OUT_DIR, `${baseName}.html`);
  const textPath = path.join(OUT_DIR, `${baseName}.txt`);
  const record = {
    ...target,
    downloadedAt: ACCESSED_AT,
    htmlPath: path.relative(process.cwd(), htmlPath),
    textPath: path.relative(process.cwd(), textPath),
    blocked: false,
    parseFailed: false,
    status: null,
    bytes: 0,
  };

  try {
    const response = await fetch(target.url, {
      headers: {
        "user-agent": "Mozilla/5.0 fundamental-analysis research cache",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const html = await response.text();
    record.status = response.status;
    record.bytes = Buffer.byteLength(html);
    record.blocked = looksBlocked(response.status, html);
    if (!fs.existsSync(htmlPath)) fs.writeFileSync(htmlPath, html);
    if (!fs.existsSync(textPath)) fs.writeFileSync(textPath, htmlToText(html));
  } catch (error) {
    record.blocked = true;
    record.parseFailed = true;
    record.error = error instanceof Error ? error.message : String(error);
  }

  metadata.push(record);
}

const metadataPath = path.join(OUT_DIR, "fetch_metadata.json");
fs.writeFileSync(metadataPath, JSON.stringify({ generatedAt: ACCESSED_AT, targets: metadata }, null, 2));

const blockedCount = metadata.filter((item) => item.blocked).length;
console.log(`MSFT official fetch completed: ${metadata.length - blockedCount}/${metadata.length} pages cached without block flags.`);
if (blockedCount) {
  console.log(`Blocked or parse_failed pages: ${blockedCount}. See ${path.relative(process.cwd(), metadataPath)}.`);
}
