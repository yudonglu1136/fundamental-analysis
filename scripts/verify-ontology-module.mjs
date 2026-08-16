import fs from "node:fs";

const sourcePath = new URL("../lib/main.dart", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const forbiddenSourceMarkers = [
  "_dbmfPayload",
  "DbmfCompactDashboard",
  "DBMF Exposure Book",
  "('dbmf', 'DBMF')"
];

for (const marker of forbiddenSourceMarkers) {
  if (source.includes(marker)) {
    throw new Error(`Retired DBMF UI marker found in lib/main.dart: ${marker}`);
  }
}

if (!source.includes("('ontology', 'Ontology')")) {
  throw new Error("Ontology navigation entry is missing from lib/main.dart");
}

if (process.argv.includes("--built")) {
  const builtPath = new URL("../dist/main.dart.js", import.meta.url);
  const built = fs.readFileSync(builtPath, "utf8");
  if (!built.includes("Ontology Intelligence")) {
    throw new Error("Built frontend does not contain Ontology Intelligence");
  }
  if (built.includes("DBMF Exposure Book") || built.includes("DBMF exposure book")) {
    throw new Error("Built frontend still contains the retired DBMF screen");
  }
}

console.log(`Ontology module verification passed${process.argv.includes("--built") ? " for dist" : ""}.`);
