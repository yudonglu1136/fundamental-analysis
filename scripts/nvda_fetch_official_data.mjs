#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const CIK = "0001045810";
const OUT_DIR = path.resolve("data/local/nvda/sec");
const USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis research yudonglu@example.com";
const accessedAt = new Date().toISOString();

const targets = [
  {
    id: "nvda-sec-companyfacts",
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`,
    path: path.join(OUT_DIR, `companyfacts_CIK${CIK}.json`),
  },
  {
    id: "nvda-sec-submissions",
    url: `https://data.sec.gov/submissions/CIK${CIK}.json`,
    path: path.join(OUT_DIR, `submissions_CIK${CIK}.json`),
  },
];

function looksBlocked(text) {
  const sample = String(text ?? "").slice(0, 3000).toLowerCase();
  return sample.includes("undeclared automated tool") || sample.includes("access denied") || sample.includes("captcha");
}

async function fetchJson(target) {
  const response = await fetch(target.url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,text/plain,*/*",
    },
  });
  const text = await response.text();
  if (!response.ok || looksBlocked(text)) {
    throw new Error(`${target.id} fetch failed or was blocked: HTTP ${response.status}`);
  }
  const json = JSON.parse(text);
  fs.writeFileSync(target.path, `${JSON.stringify(json, null, 2)}\n`);
  return {
    id: target.id,
    url: target.url,
    path: path.relative(process.cwd(), target.path),
    status: response.status,
    bytes: Buffer.byteLength(text),
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const records = [];
for (const target of targets) {
  records.push(await fetchJson(target));
}

const submissions = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `submissions_CIK${CIK}.json`), "utf8"));
const extraFiles = submissions.files ?? [];
for (const file of extraFiles) {
  const fileName = file.name;
  if (!fileName) continue;
  const url = `https://data.sec.gov/submissions/${fileName}`;
  const filePath = path.join(OUT_DIR, fileName);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json,text/plain,*/*",
      },
    });
    const text = await response.text();
    if (response.ok && !looksBlocked(text)) {
      const json = JSON.parse(text);
      fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
      records.push({
        id: `nvda-sec-${fileName}`,
        url,
        path: path.relative(process.cwd(), filePath),
        status: response.status,
        bytes: Buffer.byteLength(text),
      });
    }
  } catch (error) {
    records.push({
      id: `nvda-sec-${fileName}`,
      url,
      path: path.relative(process.cwd(), filePath),
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const metadataPath = path.join(OUT_DIR, "fetch_metadata.json");
fs.writeFileSync(metadataPath, `${JSON.stringify({ generatedAt: accessedAt, userAgent: USER_AGENT, records }, null, 2)}\n`);

console.log(`NVDA official SEC fetch complete: ${records.filter((record) => record.status !== "error").length}/${records.length} files cached.`);
console.log(path.relative(process.cwd(), metadataPath));
