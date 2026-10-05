// Copies the pdf.js worker into /public so the Notes Viewer works fully offline.
// Runs automatically after `npm install` (see "postinstall" in package.json).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.js");
const destDir = path.join(root, "public");
const dest = path.join(destDir, "pdf.worker.min.js");

if (!existsSync(src)) {
  console.warn("[pdf worker] pdfjs-dist is not installed yet - skipping copy.");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[pdf worker] copied to public/pdf.worker.min.js");
