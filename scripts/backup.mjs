// Safe backup: runs before `npm start`, from run-backup.bat (scheduled, see schedule-backup.bat), or manually: `npm run backup`.
//  - local.db  -> timestamped snapshot (VACUUM INTO = consistent even while the app runs)
//  - the snapshot is CHECKED (PRAGMA integrity_check). A damaged snapshot is renamed *.BAD and reported loudly.
//  - pdfs/ and screenshots/ -> ONE mirrored copy (new or changed files are copied, nothing is ever deleted from the backup)
//  - optional SECOND location: BACKUP_DIR_2 in .env.local (another disk / USB / cloud-synced folder) gets the same things
//  - retention: newest 30 snapshots + the newest snapshot of every day for the last 90 days. pre-migration / pre-restore copies: newest 10.
//  - NEVER blocks the app from starting: on any error it prints a warning and exits 0
import { createClient } from "@libsql/client";
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Plain `node` does not read .env.local, so read the settings we need ourselves.
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
const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : root;
const dbFile = path.join(dataDir, "local.db");
const targets = [env.BACKUP_DIR ? path.resolve(env.BACKUP_DIR) : path.join(dataDir, "backups")];
if (env.BACKUP_DIR_2) targets.push(path.resolve(env.BACKUP_DIR_2));

const sqlPath = (p) => p.replace(/\\/g, "/").replace(/'/g, "''");
const pad = (n) => String(n).padStart(2, "0");
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

/** Copies new / changed files. Never deletes anything in the destination. Returns how many files were copied. */
function mirror(src, dest) {
  let copied = 0;
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      copied += mirror(s, d);
    } else if (e.isFile()) {
      const ss = statSync(s);
      let need = true;
      if (existsSync(d)) {
        const ds = statSync(d);
        need = ds.size !== ss.size || Math.abs(ds.mtimeMs - ss.mtimeMs) > 2000;
      }
      if (need) {
        copyFileSync(s, d);
        utimesSync(d, ss.atime, ss.mtime); // keep the original time so the next run can tell "unchanged"
        copied++;
      }
    }
  }
  return copied;
}

/** newest 30 + newest of each day (last 90 days) are kept; the rest of the automatic snapshots go. */
function prune(dbDir) {
  const re = /^local-(\d{4}-\d{2}-\d{2})_\d{2}-\d{2}-\d{2}\.db$/;
  const snaps = readdirSync(dbDir).filter((f) => re.test(f)).sort(); // oldest -> newest
  const keep = new Set(snaps.slice(-30));
  const cutoff = new Date(Date.now() - 90 * 86400000);
  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
  const newestOfDay = new Map();
  for (const f of snaps) newestOfDay.set(re.exec(f)[1], f); // later files overwrite earlier ones of the same day
  for (const [day, f] of newestOfDay) if (day >= cutoffStr) keep.add(f);
  for (const f of snaps) if (!keep.has(f)) rmSync(path.join(dbDir, f), { force: true });

  const safety = readdirSync(dbDir).filter((f) => /^pre-(migration|restore)-.*\.db$/.test(f)).sort();
  for (const old of safety.slice(0, Math.max(0, safety.length - 10))) rmSync(path.join(dbDir, old), { force: true });
}

async function snapshotIsHealthy(file) {
  const c = createClient({ url: `file:${file}` });
  try {
    const r = await c.execute("PRAGMA integrity_check");
    return r.rows.length === 1 && String(Object.values(r.rows[0])[0]).toLowerCase() === "ok";
  } finally {
    c.close();
  }
}

const status = { time: new Date().toISOString(), ok: false, file: null, problems: [] };

try {
  if (!existsSync(dbFile)) {
    log("Backup skipped: no local.db yet.");
    process.exit(0);
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const name = `local-${stamp}.db`;

  // 1) snapshot into the first (main) backup folder
  const mainDbDir = path.join(targets[0], "db");
  mkdirSync(mainDbDir, { recursive: true });
  const dest = path.join(mainDbDir, name);
  rmSync(dest, { force: true }); // VACUUM INTO refuses an existing file (two starts in the same second)

  const db = createClient({ url: `file:${dbFile}` });
  try {
    await db.execute(`VACUUM INTO '${sqlPath(dest)}'`);
  } finally {
    db.close();
  }

  // 2) check the snapshot. A bad one must never be mistaken for a good backup.
  let healthy = false;
  try {
    healthy = await snapshotIsHealthy(dest);
  } catch (e) {
    status.problems.push(`could not check the snapshot: ${e?.message || e}`);
  }
  let good = dest;
  if (!healthy) {
    good = null;
    const bad = dest + ".BAD";
    try { renameSync(dest, bad); } catch {}
    status.problems.push(`The snapshot FAILED the integrity check and was renamed ${bad}. Your live database may be damaged!`);
    warn("\n!!!!! BACKUP WARNING: the database failed its integrity check. Do NOT delete old backups. !!!!!\n");
  }

  // 3) files + second location
  for (const [i, t] of targets.entries()) {
    try {
      if (i > 0 && good) {
        const dbDir = path.join(t, "db");
        mkdirSync(dbDir, { recursive: true });
        copyFileSync(good, path.join(dbDir, name));
      }
      for (const sub of ["pdfs", "screenshots"]) {
        const src = path.join(dataDir, sub);
        if (existsSync(src)) mirror(src, path.join(t, sub));
      }
      prune(path.join(t, "db"));
    } catch (e) {
      status.problems.push(`backup location ${t} failed: ${e?.message || e}`);
      warn(`Backup to ${t} FAILED:`, e?.message || e);
    }
  }

  status.ok = !!good && status.problems.length === 0;
  status.file = good;
  if (good) log("Backup done:", good, targets.length > 1 ? `(+ copy in ${targets.slice(1).join(", ")})` : "(only ONE location - set BACKUP_DIR_2 for a second copy)");
} catch (err) {
  status.problems.push(String(err?.message || err));
  warn("Backup FAILED (app will still start):", err?.message || err);
}

try {
  mkdirSync(targets[0], { recursive: true });
  writeFileSync(path.join(targets[0], "last-backup.json"), JSON.stringify(status, null, 2));
} catch {}
process.exit(0);
