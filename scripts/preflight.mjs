// Runs before every `npm start` (see package.json). It STOPS the app (exit code 1) when starting would put
// your study data at risk, instead of letting the app silently open a different or empty database.
//   1. DATA_DIR must be set, the folder must exist and be writable.
//   2. If local.db is missing but old backups exist, refuse (you probably have the wrong drive / path).
//   3. Warnings (do not stop the app): old local.db inside the project folder, backups on the same drive.
import { accessSync, constants, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
const env = { ...readEnvFile(path.join(root, ".env.local")), ...process.env };

const problems = [];
const warnings = [];

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) warnings.push(`Node ${process.versions.node} is older than the recommended Node 20 LTS.`);

if (!env.DATA_DIR) {
  problems.push(
    "DATA_DIR is not set.\n" +
      "  Open .env.local (next to package.json) and add:  DATA_DIR=D:/GATE-Data\n" +
      "  Without it the app would open a different database inside the project folder.",
  );
} else {
  const dataDir = path.resolve(env.DATA_DIR);
  const dbFile = path.join(dataDir, "local.db");
  const backupRoot = env.BACKUP_DIR ? path.resolve(env.BACKUP_DIR) : path.join(dataDir, "backups");

  if (!existsSync(dataDir)) {
    problems.push(`DATA_DIR folder not found: ${dataDir}\n  Is the drive connected? Create the folder only if this is a brand-new setup.`);
  } else {
    try {
      accessSync(dataDir, constants.W_OK);
      const probe = path.join(dataDir, ".write-test");
      writeFileSync(probe, "ok");
      rmSync(probe, { force: true });
    } catch (e) {
      problems.push(`DATA_DIR is not writable: ${dataDir} (${e.message})`);
    }

    if (!existsSync(dbFile)) {
      let haveBackups = false;
      try {
        haveBackups = readdirSync(path.join(backupRoot, "db")).some((f) => /^local-.*\.db$/.test(f));
      } catch {}
      if (haveBackups && env.ALLOW_NEW_DB !== "1") {
        problems.push(
          `No local.db in ${dataDir}, but backups exist in ${backupRoot}${path.sep}db.\n` +
            "  Starting now would create an EMPTY database. Check the DATA_DIR path / drive, or restore a backup:\n" +
            "  copy the newest db\\local-....db to local.db (delete local.db-wal and local.db-shm), then start again.\n" +
            "  (Really want a fresh empty database? Add ALLOW_NEW_DB=1 to .env.local for one start.)",
        );
      } else {
        console.log(`Note: no local.db in ${dataDir} yet - a new database will be created.`);
      }
    }

    const stale = path.join(root, "local.db");
    if (path.resolve(stale) !== path.resolve(dbFile) && existsSync(stale)) {
      warnings.push(
        `An old local.db exists inside the project folder (${stale}). It is NOT used (your data is in ${dbFile}).\n` +
          "  Keep a copy somewhere else if you want, then delete it so it can never be opened by mistake.",
      );
    }

    const driveOf = (p) => path.parse(p).root.toLowerCase();
    if (!env.BACKUP_DIR_2 && driveOf(backupRoot) === driveOf(dataDir)) {
      warnings.push(
        "Backups are on the SAME drive as your data. If that disk fails you lose both.\n" +
          "  Add BACKUP_DIR_2=<folder on another disk / USB / cloud-synced folder> to .env.local.",
      );
    }
  }
}

for (const w of warnings) console.warn("\nWARNING: " + w);
if (problems.length) {
  console.error("\n==================== GATE DASHBOARD DID NOT START ====================");
  for (const p of problems) console.error("\nPROBLEM: " + p);
  console.error("\nYour data was NOT touched. Fix the problem above and start again.");
  console.error("======================================================================\n");
  process.exit(1);
}
console.log("Preflight OK.");
