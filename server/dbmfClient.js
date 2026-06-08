import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseInfo, readDbmfSnapshot, writeDbmfSnapshot } from "./localDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentsDir = path.resolve(__dirname, "..", "..");
const marketIntelRoot = process.env.DBMF_MARKET_INTEL_ROOT || path.join(documentsDir, "market-intel-dashboard");
const processedDir = path.join(marketIntelRoot, "data", "processed", "dbmf");
const normalizedPath = path.join(marketIntelRoot, "data", "normalized", "dbmf", "dbmf_exposure_db.json");
const officialHoldingsUrl =
  "https://www.imgp.com/us/fund/US53700T8273-imgp-dbi-managed-futures-strategy-etf/";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeReadJson(filePath, fallback = null) {
  try {
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assetName(normalized, key) {
  return normalized?.assetKeyLegend?.[key] || key;
}

function buildSnapshotRows(normalized, date) {
  const snapshot = normalized?.snapshots?.[date];
  if (!snapshot) {
    return { date, assets: [], holdings: [], riskTotal: null, meta: {} };
  }

  const assets = Object.entries(snapshot.assets || {})
    .map(([assetKey, asset]) => ({
      date,
      assetKey,
      assetName: assetName(normalized, assetKey),
      exposure: numberOrNull(asset.exposure),
      delta: numberOrNull(asset.delta),
      riskShare: numberOrNull(asset.riskShare),
      marketValue: numberOrNull(asset.mv),
      componentCount: asset.components?.length || 0
    }))
    .sort((a, b) => Math.abs(b.exposure || 0) - Math.abs(a.exposure || 0));

  const holdings = Object.entries(snapshot.assets || {})
    .flatMap(([assetKey, asset]) => (asset.components || []).map((component, index) => ({
      id: `${date}-${assetKey}-${component.cusip || component.ticker || index}`,
      date,
      assetKey,
      assetName: assetName(normalized, assetKey),
      ticker: component.ticker || "",
      cusip: component.cusip || "",
      securityName: component.desc || "",
      shares: numberOrNull(component.shares),
      marketValue: numberOrNull(component.mv),
      weight: numberOrNull(component.pct)
    })))
    .sort((a, b) => Math.abs(b.weight || 0) - Math.abs(a.weight || 0));

  return {
    date,
    assets,
    holdings,
    riskTotal: numberOrNull(snapshot.riskTotal),
    meta: {
      nav: numberOrNull(snapshot.meta?.nav),
      totalNetAssets: numberOrNull(snapshot.meta?.totalNetAssets),
      sourceFile: snapshot.meta?.sourceFile || ""
    }
  };
}

function buildDbmfPayload() {
  const summary = readJson(path.join(processedDir, "latest_summary.json"));
  const latestExposure = readJson(path.join(processedDir, "latest_exposure.json"));
  const history = readJson(path.join(processedDir, "exposure_history.json"));
  const registry = readJson(path.join(processedDir, "snapshot_registry.json"));
  const normalized = safeReadJson(normalizedPath, null);
  const dates = registry.snapshots?.map((snapshot) => snapshot.date) || normalized?.dates || [];
  const snapshots = dates.map((date) => buildSnapshotRows(normalized, date));

  return {
    schemaVersion: 1,
    provider: "DBMF",
    generatedAt: new Date().toISOString(),
    source: {
      label: "Local DBMF processed data",
      officialLabel: "iMGP official portfolio holdings",
      officialUrl: officialHoldingsUrl,
      processedPath: processedDir,
      normalizedPath
    },
    summary,
    latestExposure,
    history,
    registry,
    snapshots
  };
}

export async function loadDbmfDashboard({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readDbmfSnapshot();
    if (cached) {
      return {
        ...cached,
        cache: {
          source: "sqlite",
          database: databaseInfo().path
        },
        source: {
          ...cached.source,
          label: "Local SQLite DBMF database"
        }
      };
    }
  }

  const payload = buildDbmfPayload();
  writeDbmfSnapshot(payload);
  return {
    ...payload,
    cache: {
      source: "processed-files",
      database: databaseInfo().path
    }
  };
}
