import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workerSource = require.resolve("pdfjs-dist/build/pdf.worker.min.js");
const publicDir = path.resolve(process.cwd(), "public");
const workerTarget = path.join(publicDir, "pdf.worker.min.js");

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(workerSource, workerTarget);
console.log(`[postinstall] Copied PDF worker to ${workerTarget}`);
