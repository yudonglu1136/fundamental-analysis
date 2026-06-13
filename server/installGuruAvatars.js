import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gurus } from "./gurus.js";
import { databaseInfo, writeGuruAsset } from "./localDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const avatarDir = path.join(rootDir, "web", "guru-avatars");
const generatedAt = new Date().toISOString();
const style = "semi-cartoon institutional portrait";

if (!fs.existsSync(avatarDir)) {
  console.error(`[avatars] missing directory: ${avatarDir}`);
  process.exitCode = 1;
} else {
  let installed = 0;
  for (const guru of gurus) {
    const fileName = `${guru.id}.png`;
    const localPath = path.join(avatarDir, fileName);
    if (!fs.existsSync(localPath)) {
      console.warn(`[avatars] missing ${fileName}`);
      continue;
    }
    writeGuruAsset(guru.id, {
      assetType: "avatar",
      url: `/guru-avatars/${fileName}`,
      localPath: path.relative(rootDir, localPath),
      style,
      prompt: `AI-generated ${style} for ${guru.name}`,
      generatedAt
    });
    installed += 1;
    console.log(`[avatars] installed ${guru.id}`);
  }
  console.log(
    `[avatars] done ${installed}/${gurus.length} in ${databaseInfo().path}`
  );
}
