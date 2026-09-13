import path from "node:path";
import { fileURLToPath } from "node:url";
import { gurus } from "./gurus.js";
import { installGuruAvatarCatalog } from "./guruAvatarCatalog.js";
import { installedGuruAvatarState } from "./guruAvatarDeployment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const avatarDir = path.join(rootDir, "web", "guru-avatars");
const databasePath = process.env.SQLITE_DB_PATH || path.join(__dirname, "data", "guru-analysis.sqlite");

try {
  const state = installedGuruAvatarState({ avatarDir, rootDir, databasePath });
  if (state.upToDate) {
    console.log(`[avatars] unchanged ${state.audit.expected}/${state.audit.expected}; validated source files; no database writes`);
  } else {
    const { databaseInfo, writeGuruAsset } = await import("./localDatabase.js");
    const report = installGuruAvatarCatalog({
      avatarDir, rootDir, configuredGurus: gurus, writeAsset: writeGuruAsset,
      generatedAt: new Date().toISOString()
    });
    console.log(`[avatars] installed ${report.installed}/${report.expected}; ` +
      `${report.totalBytes} bytes; database=${databaseInfo().path}`);
  }
} catch (error) {
  console.error(`[avatars] ${error.message}`);
  process.exitCode = 1;
}
