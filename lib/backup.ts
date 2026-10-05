import fs from "fs";
import path from "path";
import { db, initDatabase } from "@/lib/db";
import { DATA_DIR, PDF_DIR, SHOT_DIR, BACKUP_DIR, resolvePdfPath, resolveShotPath } from "@/lib/paths";
import { createZip, readZip, type ZipEntry } from "@/lib/zip";
import { postRestoreFixups } from "@/lib/migrations";
import { migrateProgressKey } from "@/lib/topics";

export const BACKUP_FORMAT = "gate-dashboard-backup";
export const BACKUP_VERSION = 3;

/** Tables that are never exported/imported (internal bookkeeping / legacy copies). */
const SKIP_TABLES = new Set(["app_meta", "error_logs_backup", "error_logs_new"]);
/** pdfs must be loaded before the tables that point at it. */
const FIRST = ["pdfs", "mock_tests"]; // mock_test_sections / mock_test_topic_loss point at mock_tests

const q = (n: string) => `"${n.replace(/"/g, '""')}"`;

function walk(dir: string, base: string, out: { abs: string; rel: string }[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "_trash") continue; // deleted PDFs are not part of a backup
      walk(abs, base, out);
    } else if (e.isFile()) {
      out.push({ abs, rel: path.relative(DATA_DIR, abs).replace(/\\/g, "/") });
    }
  }
  return out;
}

async function listTables(): Promise<string[]> {
  const r = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return r.rows.map((x: any) => String(x.name)).filter((n) => !SKIP_TABLES.has(n));
}

function cell(v: unknown) {
  if (v instanceof ArrayBuffer) return { $b64: Buffer.from(v).toString("base64") };
  if (ArrayBuffer.isView(v)) return { $b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64") };
  if (typeof v === "bigint") return Number(v);
  return v;
}
function uncell(v: any) {
  if (v && typeof v === "object" && typeof v.$b64 === "string") return Buffer.from(v.$b64, "base64");
  return v;
}

/* --------------------------------- export --------------------------------- */

export async function exportBackup(opts: { pdfs: boolean }): Promise<{ zip: Buffer; counts: Record<string, number> }> {
  await initDatabase();
  const entries: ZipEntry[] = [];
  const counts: Record<string, number> = {};

  for (const table of await listTables()) {
    const res = await db.execute(`SELECT * FROM ${q(table)}`);
    const rows = res.rows.map((row: any) => Object.fromEntries(res.columns.map((c, i) => [c, cell(row[i])])));
    counts[table] = rows.length;
    entries.push({ name: `tables/${table}.json`, data: Buffer.from(JSON.stringify({ columns: res.columns, rows })) });
  }

  const shots = walk(SHOT_DIR, DATA_DIR);
  for (const f of shots) entries.push({ name: f.rel, data: fs.readFileSync(f.abs) });
  let pdfCount = 0;
  if (opts.pdfs) {
    for (const f of walk(PDF_DIR, DATA_DIR)) {
      entries.push({ name: f.rel, data: fs.readFileSync(f.abs) });
      pdfCount++;
    }
  }

  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: counts,
    screenshots: shots.length,
    pdfFiles: pdfCount,
    includesPdfFiles: opts.pdfs,
  };
  entries.unshift({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  return { zip: createZip(entries), counts };
}

/* --------------------------------- import --------------------------------- */

export type ImportMode = "merge" | "replace";
export type ImportResult = {
  mode: ImportMode;
  tables: Record<string, number>;
  skippedRows: number;
  skippedTables: string[];
  screenshotsRestored: number;
  pdfFilesRestored: number;
  safetySnapshot: string | null;
};

async function safetySnapshot(): Promise<string | null> {
  try {
    const dir = path.join(BACKUP_DIR, "db");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    await db.execute(`VACUUM INTO '${dest.replace(/\\/g, "/").replace(/'/g, "''")}'`);
    return dest;
  } catch (e) {
    console.warn("pre-restore snapshot failed:", (e as Error).message);
    return null;
  }
}

export async function importZip(buf: Buffer, mode: ImportMode): Promise<ImportResult> {
  await initDatabase();
  const files = readZip(buf);
  const manifestFile = files.find((f) => f.name === "manifest.json");
  let manifest: any;
  try {
    manifest = JSON.parse(manifestFile?.data.toString("utf8") || "");
  } catch {}
  if (!manifest || manifest.format !== BACKUP_FORMAT) throw new Error("This zip is not a GATE dashboard backup.");
  if (Number(manifest.version) > BACKUP_VERSION) throw new Error("This backup was made by a newer version of the app. Update the app first.");

  // parse everything BEFORE touching the database, so a damaged file changes nothing
  const parsed: { table: string; columns: string[]; rows: any[] }[] = [];
  for (const f of files) {
    const m = /^tables\/([A-Za-z0-9_]+)\.json$/.exec(f.name);
    if (!m || SKIP_TABLES.has(m[1])) continue;
    const j = JSON.parse(f.data.toString("utf8"));
    if (!Array.isArray(j.rows)) throw new Error(`Damaged table file: ${f.name}`);
    parsed.push({ table: m[1], columns: j.columns || [], rows: j.rows });
  }
  parsed.sort((a, b) => Number(FIRST.includes(b.table)) - Number(FIRST.includes(a.table)));

  const snapshot = await safetySnapshot();

  const local = new Set(await listTables());
  const result: ImportResult = {
    mode,
    tables: {},
    skippedRows: 0,
    skippedTables: [],
    screenshotsRestored: 0,
    pdfFilesRestored: 0,
    safetySnapshot: snapshot,
  };

  // files first (harmless if the DB step later fails: they are only unreferenced then)
  for (const f of files) {
    if (f.name.startsWith("screenshots/")) {
      const abs = resolveShotPath(f.name);
      if (!abs) continue;
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.data);
      result.screenshotsRestored++;
    } else if (f.name.startsWith("pdfs/")) {
      const abs = resolvePdfPath(f.name);
      if (!abs) continue;
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.data);
      result.pdfFilesRestored++;
    }
  }

  const tx = await db.transaction("write");
  try {
    if (mode === "replace") {
      // children first so ON DELETE CASCADE never surprises us
      for (const p of [...parsed].reverse()) if (local.has(p.table)) await tx.execute(`DELETE FROM ${q(p.table)}`);
    }
    for (const p of parsed) {
      if (!local.has(p.table)) {
        result.skippedTables.push(p.table);
        continue;
      }
      const info = await tx.execute(`PRAGMA table_info(${q(p.table)})`);
      const allowed = new Set(info.rows.map((r: any) => String(r.name)));
      let n = 0;
      for (const row of p.rows) {
        const cols = Object.keys(row).filter((c) => allowed.has(c));
        if (cols.length === 0) continue;
        try {
          await tx.execute({
            sql: `INSERT OR REPLACE INTO ${q(p.table)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
            args: cols.map((c) => uncell(row[c])),
          });
          n++;
        } catch (e) {
          result.skippedRows++; // e.g. a bookmark whose PDF is not in this database
          console.warn(`restore: skipped a row in ${p.table}:`, (e as Error).message);
        }
      }
      result.tables[p.table] = n;
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }

  await postRestoreFixups(db);
  return result;
}

/* ---------------------- old JSON backups (v1 / v2) ------------------------ */

/** Imports the old single-JSON backups (cards, reviews, bookmarks, annotations and, in v2, the other tables). */
export async function importLegacyJson(data: any): Promise<Record<string, number>> {
  await initDatabase();
  if (!data || !data.version || !Array.isArray(data.cards)) throw new Error("This file is not a valid backup.");
  await safetySnapshot();

  const pdfsRes = await db.execute("SELECT id, title FROM pdfs");
  const idByName = new Map<string, string>();
  pdfsRes.rows.forEach((p: any) => {
    if (!idByName.has(p.title)) idByName.set(p.title, p.id);
  });

  const out: Record<string, number> = { cards: 0, reviews: 0, bookmarks: 0, annotations: 0, skipped: 0 };
  const tx = await db.transaction("write");
  try {
    for (const c of data.cards) {
      const mappedId = c.source?.pdfName ? idByName.get(c.source.pdfName) : undefined;
      const source = mappedId && c.source ? { ...c.source, pdfId: mappedId } : c.source;
      await tx.execute({
        sql: `INSERT OR REPLACE INTO cards (id, front, back, front_image, subject, topic, source_json, ease, interval, reps, lapses, due, created_at, last_reviewed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [c.id, c.front, c.back, c.frontImage || "", c.subject, c.topic, source ? JSON.stringify(source) : null, c.ease ?? 2.5, c.interval ?? 0, c.reps ?? 0, c.lapses ?? 0, c.due, c.createdAt || new Date().toISOString(), c.lastReviewed || ""],
      });
      out.cards++;
    }
    for (const r of data.reviews || []) {
      await tx.execute({
        sql: `INSERT INTO reviews (date, count) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET count = MAX(count, excluded.count)`,
        args: [r.date, r.count],
      });
      out.reviews++;
    }
    for (const b of data.bookmarks || []) {
      const pdfId = b.pdfName ? idByName.get(b.pdfName) : b.pdfId;
      if (!pdfId) { out.skipped++; continue; }
      await tx.execute({ sql: `INSERT OR REPLACE INTO pdf_bookmarks (id, pdf_id, page, label, created_at) VALUES (?, ?, ?, ?, ?)`, args: [b.id, pdfId, b.page, b.label, b.createdAt || new Date().toISOString()] });
      out.bookmarks++;
    }
    for (const a of data.annotations || []) {
      const pdfId = a.pdfName ? idByName.get(a.pdfName) : a.pdfId;
      if (!pdfId) { out.skipped++; continue; }
      const itemsJson = JSON.stringify(a.items || []);
      await tx.execute({
        sql: `INSERT INTO pdf_annotations (key, pdf_id, page, items_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(key) DO UPDATE SET items_json = excluded.items_json, updated_at = CURRENT_TIMESTAMP`,
        args: [`${pdfId}:${a.page}`, pdfId, a.page, itemsJson],
      });
      out.annotations++;
    }

    // v2 extras (old names -> real table names; unknown columns are ignored)
    const extras: [string, string, any[] | undefined][] = [
      ["errorLogs", "error_logs", data.errorLogs],
      ["todos", "todo_list", data.todos],
      ["syllabusProgress", "syllabus_progress", data.syllabusProgress],
      ["mockTests", "mock_tests", data.mockTests],
      ["links", "study_links", data.links],
    ];
    for (const [label, table, rows] of extras) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const info = await tx.execute(`PRAGMA table_info(${q(table)})`);
      const allowed = new Set(info.rows.map((r: any) => String(r.name)));
      out[label] = 0;
      for (const row of rows) {
        const r = { ...row };
        if (table === "syllabus_progress" && typeof r.topic_key === "string") {
          const nk = migrateProgressKey(r.topic_key);
          if (nk) { r.topic_key = nk; r.id = `${r.user_id || "default_user"}_${nk}`; }
        }
        const cols = Object.keys(r).filter((c) => allowed.has(c));
        if (!cols.length) continue;
        try {
          await tx.execute({ sql: `INSERT OR REPLACE INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, args: cols.map((c) => (typeof r[c] === "object" && r[c] !== null ? JSON.stringify(r[c]) : r[c])) });
          out[label]++;
        } catch { out.skipped++; }
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }

  // screenshots inside a v2 JSON backup were base64 files keyed by filename: nothing to map them to, ignore
  await postRestoreFixups(db);
  return out;
}
