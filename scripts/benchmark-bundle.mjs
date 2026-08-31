#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function filesUnder(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(location));
    else result.push(location);
  }
  return result;
}

function sizes(file) {
  const body = fs.readFileSync(file);
  return {
    path: file,
    rawBytes: body.length,
    gzipBytes: gzipSync(body, { level: 6 }).length,
    brotliBytes: brotliCompressSync(body, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 }
    }).length
  };
}

const directory = path.resolve(argument("dir", "dist"));
const output = argument("output");
const label = argument("label", "unlabeled");
const commit = argument("commit", "unknown");
const files = filesUnder(directory);
const importantPaths = new Set([
  "main.dart.js",
  "flutter_bootstrap.js",
  path.join("ontology", "app.js"),
  path.join("ontology", "styles.css")
]);
const important = files
  .filter((file) => {
    const relative = path.relative(directory, file);
    return importantPaths.has(relative) || ["canvaskit.js", "canvaskit.wasm"].includes(path.basename(file));
  })
  .map((file) => ({ ...sizes(file), path: path.relative(directory, file) }));
const report = {
  schemaVersion: 1,
  label,
  commit,
  generatedAt: new Date().toISOString(),
  directory: path.relative(process.cwd(), directory) || ".",
  fileCount: files.length,
  totalRawBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
  important
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
}
process.stdout.write(serialized);
