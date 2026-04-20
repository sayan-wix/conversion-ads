import mammoth from "mammoth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const parentDir = path.resolve(projectRoot, "..");
const outDir = path.join(parentDir, "_preprocessed");

const docs = [
  {
    src: "Evergreen ad headline templates and examples.docx",
    out: "headline-templates-raw.txt",
  },
  {
    src: "Power word examples for ad headlines.docx",
    out: "power-words-raw.txt",
  },
  {
    src: "Head Turner Frameworks and Examples.docx",
    out: "head-turner-raw.txt",
  },
];

for (const doc of docs) {
  const srcPath = path.join(parentDir, doc.src);
  const outPath = path.join(outDir, doc.out);
  console.log(`Extracting ${doc.src} ...`);
  const result = await mammoth.extractRawText({ path: srcPath });
  fs.writeFileSync(outPath, result.value, "utf8");
  console.log(`  Wrote ${outPath} (${result.value.length} chars)`);
}

// Copy the txt file
const txtSrc = path.join(parentDir, "Copy blocks training directors cut.txt");
const txtOut = path.join(outDir, "copy-blocks-raw.txt");
const txtContent = fs.readFileSync(txtSrc, "utf8");
fs.writeFileSync(txtOut, txtContent, "utf8");
console.log(`Copied copy-blocks file (${txtContent.length} chars)`);

console.log("Done.");
