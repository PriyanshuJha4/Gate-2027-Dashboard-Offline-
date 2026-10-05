import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

fs.mkdirSync(dataDir, { recursive: true });
console.log(`[preflight] Data directory: ${dataDir}`);
