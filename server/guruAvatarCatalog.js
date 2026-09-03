import fs from "node:fs";
import path from "node:path";
import { gurus } from "./gurus.js";

export const guruAvatarDimensions = Object.freeze({ width: 144, height: 144 });
export const guruAvatarStyle = "semi-cartoon institutional avatar";

const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
const configuredGuruIds = new Set(gurus.map((guru) => guru.id));

function normalizedGuruId(value) {
  return String(value || "").trim();
}

export function canonicalGuruAvatarUrl(guruId) {
  const id = normalizedGuruId(guruId);
  return configuredGuruIds.has(id) ? `/guru-avatars/${id}.png` : "";
}

export function inspectGuruAvatarPng(
  filePath,
  { width = guruAvatarDimensions.width, height = guruAvatarDimensions.height } = {}
) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) throw new Error("not a regular file");

  const data = fs.readFileSync(filePath);
  if (data.length < 45 || !data.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("not a PNG file");
  }

  let offset = pngSignature.length;
  let chunkIndex = 0;
  let foundIdat = false;
  let foundIend = false;
  let actualWidth = 0;
  let actualHeight = 0;

  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error("truncated PNG chunk header");
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > data.length) throw new Error(`truncated PNG ${type || "unknown"} chunk`);

    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) throw new Error("PNG must begin with a 13-byte IHDR chunk");
      actualWidth = data.readUInt32BE(offset + 8);
      actualHeight = data.readUInt32BE(offset + 12);
    } else if (type === "IHDR") {
      throw new Error("PNG contains more than one IHDR chunk");
    }

    if (type === "IDAT") foundIdat = true;
    if (type === "IEND") {
      if (length !== 0) throw new Error("PNG IEND chunk must be empty");
      foundIend = true;
      offset = chunkEnd;
      break;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  if (!foundIdat) throw new Error("PNG has no IDAT image data");
  if (!foundIend) throw new Error("PNG has no IEND chunk");
  if (offset !== data.length) throw new Error("PNG has trailing bytes after IEND");
  if (actualWidth !== width || actualHeight !== height) {
    throw new Error(`expected ${width}x${height}, found ${actualWidth}x${actualHeight}`);
  }

  return { width: actualWidth, height: actualHeight, bytes: data.length };
}

export function auditGuruAvatarDirectory({ avatarDir, configuredGurus = gurus }) {
  const invalidConfiguration = [];
  const expectedNames = new Map();
  for (const guru of configuredGurus) {
    const id = normalizedGuruId(guru?.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      invalidConfiguration.push(`invalid guru id: ${id || "<empty>"}`);
      continue;
    }
    const fileName = `${id}.png`;
    if (expectedNames.has(fileName)) invalidConfiguration.push(`duplicate guru id: ${id}`);
    expectedNames.set(fileName, guru);
  }

  if (!fs.existsSync(avatarDir)) {
    return {
      ok: false,
      expected: expectedNames.size,
      found: 0,
      totalBytes: 0,
      missing: [...expectedNames.keys()].sort(),
      unexpected: [],
      invalid: [],
      invalidConfiguration,
      message: `avatar directory is missing: ${avatarDir}`
    };
  }

  const entries = fs.readdirSync(avatarDir, { withFileTypes: true });
  const actualNames = new Set(entries.map((entry) => entry.name));
  const missing = [...expectedNames.keys()].filter((name) => !actualNames.has(name)).sort();
  const unexpected = entries
    .filter((entry) => !expectedNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const invalid = [];
  let totalBytes = 0;

  for (const fileName of [...expectedNames.keys()].sort()) {
    if (!actualNames.has(fileName)) continue;
    const entry = entries.find((candidate) => candidate.name === fileName);
    if (!entry?.isFile()) {
      invalid.push({ fileName, reason: "not a regular file" });
      continue;
    }
    try {
      const metadata = inspectGuruAvatarPng(path.join(avatarDir, fileName));
      totalBytes += metadata.bytes;
    } catch (error) {
      invalid.push({ fileName, reason: error.message });
    }
  }

  const ok =
    invalidConfiguration.length === 0 &&
    missing.length === 0 &&
    unexpected.length === 0 &&
    invalid.length === 0;
  return {
    ok,
    expected: expectedNames.size,
    found: entries.length,
    totalBytes,
    missing,
    unexpected,
    invalid,
    invalidConfiguration,
    message: ok ? "Guru avatar catalog is complete and valid." : "Guru avatar catalog validation failed."
  };
}

function avatarAuditFailureMessage(report) {
  const reasons = [];
  if (report.invalidConfiguration.length) {
    reasons.push(`configuration: ${report.invalidConfiguration.join(", ")}`);
  }
  if (report.missing.length) reasons.push(`missing: ${report.missing.join(", ")}`);
  if (report.unexpected.length) reasons.push(`unexpected: ${report.unexpected.join(", ")}`);
  if (report.invalid.length) {
    reasons.push(
      `invalid: ${report.invalid.map(({ fileName, reason }) => `${fileName} (${reason})`).join(", ")}`
    );
  }
  return `${report.message} ${reasons.join("; ")}`.trim();
}

export function installGuruAvatarCatalog({
  avatarDir,
  rootDir,
  configuredGurus = gurus,
  writeAsset,
  generatedAt = new Date().toISOString(),
  style = guruAvatarStyle
}) {
  if (typeof writeAsset !== "function") throw new TypeError("writeAsset must be a function");
  const audit = auditGuruAvatarDirectory({ avatarDir, configuredGurus });
  if (!audit.ok) throw new Error(avatarAuditFailureMessage(audit));

  for (const guru of configuredGurus) {
    const fileName = `${guru.id}.png`;
    const localPath = path.join(avatarDir, fileName);
    writeAsset(guru.id, {
      assetType: "avatar",
      url: `/guru-avatars/${fileName}`,
      localPath: path.relative(rootDir, localPath),
      style,
      prompt: `AI-generated ${style} for ${guru.name}`,
      generatedAt
    });
  }

  return { ...audit, installed: configuredGurus.length, generatedAt };
}
