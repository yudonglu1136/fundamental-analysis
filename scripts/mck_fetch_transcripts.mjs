import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const transcriptDir = path.join(root, "data/local/mck/transcripts");
const rawDir = path.join(transcriptDir, "raw");
const processedDir = path.join(transcriptDir, "processed");

async function main() {
  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
  const files = await readdir(rawDir).catch(() => []);
  const textFiles = files.filter((file) => /\.(txt|md|html)$/i.test(file));
  const manifest = [];
  for (const file of textFiles) {
    const fullPath = path.join(rawDir, file);
    const raw = await readFile(fullPath, "utf8");
    const cleanText = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const outputPath = path.join(processedDir, file.replace(/\.(html|md)$/i, ".txt"));
    await writeFile(outputPath, cleanText);
    manifest.push({
      file,
      rawPath: fullPath,
      processedPath: outputPath,
      characters: cleanText.length,
      status: "processed_local_file",
    });
  }
  if (manifest.length === 0) {
    await writeFile(
      path.join(rawDir, "README.md"),
      [
        "# MCK transcript ingestion",
        "",
        "Place McKesson earnings call transcript `.txt`, `.md`, or `.html` files in this folder.",
        "Then run:",
        "",
        "npm run mck:fetch-transcripts",
        "npm run mck:build-qa-pairs",
        "",
        "Transcript-derived data remains research-only until manually promoted.",
      ].join("\n"),
    );
  }
  await writeFile(path.join(transcriptDir, "transcript_manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2));
  console.log(manifest.length === 0 ? "Created MCK transcript ingestion README. Add local transcript files to data/local/mck/transcripts/raw." : `Processed ${manifest.length} local transcript file(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
