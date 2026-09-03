import path from "node:path";
import { fileURLToPath } from "node:url";
import { gurus } from "./gurus.js";
import { installGuruAvatarCatalog } from "./guruAvatarCatalog.js";
import { databaseInfo, writeGuruAsset } from "./localDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const avatarDir = path.join(rootDir, "web", "guru-avatars");
const generatedAt = new Date().toISOString();

try {
  const report = installGuruAvatarCatalog({
    avatarDir,
    rootDir,
    configuredGurus: gurus,
    writeAsset: writeGuruAsset,
    generatedAt
  });
  console.log(
    `[avatars] installed ${report.installed}/${report.expected}; ` +
      `${report.totalBytes} bytes; database=${databaseInfo().path}`
  );
} catch (error) {
  console.error(`[avatars] ${error.message}`);
  process.exitCode = 1;
}
