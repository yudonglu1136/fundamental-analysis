#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const stocksDir = path.join(root, "src", "stocks");
const registryPath = path.join(stocksDir, "registry.ts");

const expectedSupportDirs = new Set(["biopharmaResearch", "deepResearch", "defensePrime", "earningsCall", "template"]);
const knownFactoryPatterns = [
  { name: "biopharmaResearch", pattern: /createBiopharmaResearchModule\(/ },
  { name: "deepResearch", pattern: /createDeepResearchStockModule\(/ },
  { name: "defensePrime", pattern: /buildDefenseValuationConfig\(/ },
];

const failures = [];
const warnings = [];

function read(filePath) {
  return readFileSync(filePath, "utf8");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function normalizeKey(key) {
  return key.replace(/\.L$/, "").toLowerCase();
}

function parseRegistry(source) {
  const imports = [...source.matchAll(/import\s+\{\s*([A-Za-z0-9_]+)\s*\}\s+from\s+"\.\/([^/]+)\/config";/g)].map(
    ([, variableName, directory]) => ({ variableName, directory }),
  );
  const importByVariable = new Map(imports.map((entry) => [entry.variableName, entry]));
  const objectMatch = source.match(/export\s+const\s+stockRegistry\s*=\s*\{([\s\S]*?)\n\};/);

  if (!objectMatch) {
    failures.push("Could not parse stockRegistry object in src/stocks/registry.ts");
    return { imports, entries: [] };
  }

  const entries = [...objectMatch[1].matchAll(/^\s*(?:"([^"]+)"|([A-Za-z0-9_.$]+))\s*:\s*([A-Za-z0-9_]+)\s*,?/gm)].map(
    ([, quotedKey, bareKey, variableName]) => {
      const key = quotedKey ?? bareKey;
      return {
        key,
        variableName,
        directory: importByVariable.get(variableName)?.directory ?? null,
      };
    },
  );

  return { imports, entries };
}

function findFactoryName(source) {
  return knownFactoryPatterns.find((factory) => factory.pattern.test(source))?.name ?? null;
}

function validateConfig(entry) {
  if (!entry.directory) {
    failures.push(`Registry entry ${entry.key} references ${entry.variableName}, but that symbol is not imported.`);
    return;
  }

  const configPath = path.join(stocksDir, entry.directory, "config.ts");
  if (!existsSync(configPath)) {
    failures.push(`Missing config.ts for registered module ${entry.key} at ${rel(configPath)}`);
    return;
  }

  const source = read(configPath);
  const factoryName = findFactoryName(source);
  const expectedExport = new RegExp(`export\\s+const\\s+${entry.variableName}\\b`);
  if (!expectedExport.test(source)) {
    failures.push(`${rel(configPath)} does not export ${entry.variableName}.`);
  }

  const requiredSignals = ["data:", "calculateSummary:", "calculateValuation:", "valuationConfig:", "Dashboard:"];
  const missingSignals = requiredSignals.filter((signal) => !source.includes(signal));
  if (missingSignals.length > 0 && !factoryName) {
    failures.push(`${rel(configPath)} is missing StockModule contract signals: ${missingSignals.join(", ")}`);
  }

  const expectedTicker = entry.key;
  const tickerLiteral = source.match(/ticker:\s*"([^"]+)"/)?.[1];
  if (tickerLiteral && tickerLiteral !== expectedTicker) {
    failures.push(`${rel(configPath)} ticker literal is ${tickerLiteral}, but registry key is ${expectedTicker}.`);
  }

  const expectedModulePrefix = `${normalizeKey(entry.key)}Module`;
  if (entry.variableName !== expectedModulePrefix) {
    warnings.push(`${rel(configPath)} uses module export ${entry.variableName}; expected conventional name ${expectedModulePrefix}.`);
  }

  const hasGenericValuationConfig = /export\s+const\s+valuationConfig\b/.test(source);
  if (hasGenericValuationConfig) {
    warnings.push(`${rel(configPath)} exports generic valuationConfig; later phases can standardize ticker-prefixed naming.`);
  }

  const dashboardPath = path.join(stocksDir, entry.directory, "dashboard.tsx");
  if (existsSync(dashboardPath)) {
    const dashboardSource = read(dashboardPath);
    const wrongStorageKeys = [...dashboardSource.matchAll(/["']([a-z0-9.-]+-valuation-assumptions)["']/g)]
      .map((match) => match[1])
      .filter((key) => !key.startsWith(`${normalizeKey(entry.key)}-`));
    for (const key of new Set(wrongStorageKeys)) {
      failures.push(`${rel(dashboardPath)} uses mismatched localStorage key "${key}" for ${entry.key}.`);
    }
  }
}

const registrySource = read(registryPath);
const { imports, entries } = parseRegistry(registrySource);
const importedVariables = new Set(imports.map((entry) => entry.variableName));
const registeredVariables = new Set(entries.map((entry) => entry.variableName));
const registeredDirs = new Set(entries.map((entry) => entry.directory).filter(Boolean));

for (const importEntry of imports) {
  if (!registeredVariables.has(importEntry.variableName)) {
    failures.push(`Imported stock module ${importEntry.variableName} is not used in stockRegistry.`);
  }
}

for (const entry of entries) {
  if (!importedVariables.has(entry.variableName)) {
    failures.push(`Registry entry ${entry.key} uses ${entry.variableName}, but it is not imported.`);
  }
  validateConfig(entry);
}

const duplicateKeys = entries
  .map((entry) => entry.key)
  .filter((key, index, allKeys) => allKeys.indexOf(key) !== index);
if (duplicateKeys.length > 0) {
  failures.push(`Duplicate registry keys found: ${[...new Set(duplicateKeys)].join(", ")}`);
}

const configDirs = readdirSync(stocksDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((directory) => existsSync(path.join(stocksDir, directory, "config.ts")));

const unregisteredConfigDirs = configDirs.filter((directory) => !registeredDirs.has(directory));
for (const directory of unregisteredConfigDirs) {
  failures.push(`Stock config directory ${directory} exists but is not registered in src/stocks/registry.ts.`);
}

const supportDirs = readdirSync(stocksDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((directory) => !configDirs.includes(directory));
const unexpectedSupportDirs = supportDirs.filter((directory) => !expectedSupportDirs.has(directory));
for (const directory of unexpectedSupportDirs) {
  warnings.push(`Directory src/stocks/${directory} has no config.ts and is not in the known support/template directory allowlist.`);
}

const directModules = entries.filter((entry) => {
  if (!entry.directory) return false;
  const configPath = path.join(stocksDir, entry.directory, "config.ts");
  return existsSync(configPath) && !findFactoryName(read(configPath));
}).length;
const factoryModules = entries.length - directModules;

console.log("Stock module contract validation");
console.log(`- Registry entries: ${entries.length}`);
console.log(`- Registered config directories: ${registeredDirs.size}`);
console.log(`- Direct module configs: ${directModules}`);
console.log(`- Factory-backed module configs: ${factoryModules}`);
console.log(`- Support/template directories: ${supportDirs.length ? supportDirs.join(", ") : "none"}`);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nPASS: registry/module contract checks passed.");
}
