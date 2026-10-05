import fs from "fs";
import path from "path";

/**
 * Where ALL your personal data lives (database + PDFs + screenshots + backups).
 * Default = project folder (same as before, nothing moves).
 * Set DATA_DIR in .env.local (e.g. DATA_DIR=D:/GATE-Data) to keep your data
 * OUTSIDE the code folder, so re-extracting a new zip can never overwrite it.
 */
// Safety rule: never "guess" where your data is.
//  - DATA_DIR missing  -> the app would silently open a different (old / empty) local.db in the project folder.
//  - DATA_DIR folder missing (e.g. the D: drive is not connected) -> the app would create a brand-new empty set of folders.
// Both cases stop with a clear message instead. (`next build` does not touch data, so it is exempt.)
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";
const RAW_DATA_DIR = (process.env.DATA_DIR || "").trim();

if (!IS_BUILD) {
  if (!RAW_DATA_DIR && process.env.ALLOW_PROJECT_DATA_DIR !== "1") {
    throw new Error(
      "DATA_DIR is not set. Create .env.local next to package.json with a line like DATA_DIR=D:/GATE-Data " +
        "(see .env.local.example). The app refuses to start without it so it can never open the wrong database.",
    );
  }
  if (RAW_DATA_DIR && !fs.existsSync(path.resolve(RAW_DATA_DIR))) {
    throw new Error(
      `DATA_DIR folder not found: ${path.resolve(RAW_DATA_DIR)}. Is the drive connected? ` +
        "The app will not start (and will not create an empty database) until this folder exists.",
    );
  }
}

export const DATA_DIR = RAW_DATA_DIR ? path.resolve(RAW_DATA_DIR) : process.cwd();

export const DB_PATH = path.join(DATA_DIR, "local.db");
export const PDF_DIR = path.join(DATA_DIR, "pdfs");
/** Error-log screenshots (one sub-folder per error entry). */
export const SHOT_DIR = path.join(DATA_DIR, "screenshots");
/** Same rule as scripts/backup.mjs */
export const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(DATA_DIR, "backups");

/** Turn a stored "pdfs/Subject/Chapter/file.pdf" into an absolute path, or null if it escapes PDF_DIR. */
export function resolvePdfPath(relativePath: string): string | null {
  const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel.toLowerCase().startsWith("pdfs/")) return null;
  const abs = path.resolve(DATA_DIR, rel);
  const root = PDF_DIR + path.sep;
  if (!abs.startsWith(root)) return null;
  return abs;
}

/** Turn a stored "screenshots/<errorId>/<n>.png" into an absolute path, or null if it escapes SHOT_DIR. */
export function resolveShotPath(relativePath: string): string | null {
  const rel = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel.toLowerCase().startsWith("screenshots/")) return null;
  const abs = path.resolve(DATA_DIR, rel);
  const root = SHOT_DIR + path.sep;
  if (!abs.startsWith(root)) return null;
  return abs;
}
