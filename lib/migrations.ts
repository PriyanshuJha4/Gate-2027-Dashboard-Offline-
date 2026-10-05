import type { Client } from "@libsql/client";
import fs from "fs";
import path from "path";
import { BACKUP_DIR } from "@/lib/paths";
import { saveDataUrl, storeCardImage } from "@/lib/shots";
import { topicIdByName, migrateProgressKey, TOPIC_BY_ID } from "@/lib/topics";

/**
 * Ordered, run-once migrations. The number of the last one that finished is stored in app_meta.
 * To add a change later: append a new entry. NEVER edit or reorder an old one.
 * Before anything runs, a snapshot of local.db is written to <BACKUP_DIR>/db/pre-migration-*.db.
 */
type Migration = { version: number; name: string; run: (db: Client) => Promise<void> };

async function columnsOf(db: Client, table: string): Promise<Set<string>> {
  const r = await db.execute(`PRAGMA table_info("${table}")`);
  return new Set(r.rows.map((x: any) => String(x.name)));
}

async function addColumnIfMissing(db: Client, table: string, column: string, type: string) {
  const cols = await columnsOf(db, table);
  if (cols.size === 0 || cols.has(column)) return; // table missing or column already there
  await db.execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
}

/** Fill topic_id from the stored topic name (any old spelling). Only touches rows where it is still empty. */
async function backfillTopicId(db: Client, table: string, nameCol: string, subjectCol: string | null) {
  const cols = await columnsOf(db, table);
  if (!cols.has("topic_id") || !cols.has(nameCol)) return;
  const sel = subjectCol && cols.has(subjectCol) ? `, "${subjectCol}" AS s` : `, NULL AS s`;
  const rows = await db.execute(
    `SELECT rowid AS rid, "${nameCol}" AS n${sel} FROM "${table}" WHERE topic_id IS NULL OR topic_id = ''`,
  );
  const stmts = [];
  for (const r of rows.rows as any[]) {
    const id = topicIdByName(r.n, r.s);
    if (id) stmts.push({ sql: `UPDATE "${table}" SET topic_id = ? WHERE rowid = ?`, args: [id, r.rid] });
  }
  if (stmts.length) await db.batch(stmts, "write");
}

export async function migrateSyllabusKeys(db: Client) {
  const rows = await db.execute("SELECT id, user_id, topic_key, completed, updated_at FROM syllabus_progress");
  const done = new Map<string, { user: string; key: string; completed: number; at: string | null }>();
  const stale: string[] = [];
  for (const r of rows.rows as any[]) {
    const key = String(r.topic_key);
    const i = key.lastIndexOf("::");
    const alreadyNew = i > 0 && TOPIC_BY_ID.has(key.slice(0, i));
    const newKey = alreadyNew ? key : migrateProgressKey(key);
    if (!newKey) continue; // unknown topic: leave the row alone, nothing is deleted
    const newId = `${r.user_id}_${newKey}`;
    const prev = done.get(newId);
    // two old spellings can collapse into one topic: a tick wins over an un-tick
    const completed = Math.max(Number(r.completed) ? 1 : 0, prev?.completed ?? 0);
    const at = [prev?.at, r.updated_at].filter(Boolean).sort().pop() ?? null;
    done.set(newId, { user: String(r.user_id), key: newKey, completed, at });
    if (String(r.id) !== newId) stale.push(String(r.id));
  }
  const stmts: { sql: string; args: any[] }[] = [];
  for (const id of stale) stmts.push({ sql: "DELETE FROM syllabus_progress WHERE id = ?", args: [id] });
  for (const [id, v] of done) {
    stmts.push({
      sql: "INSERT OR REPLACE INTO syllabus_progress (id, user_id, topic_key, completed, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, v.user, v.key, v.completed, v.at],
    });
  }
  if (stmts.length) await db.batch(stmts, "write");
}

/** Moves base64 screenshots out of error_logs.images into files. Returns how many were moved. */
export async function moveScreenshotsToFiles(db: Client): Promise<number> {
  const rows = await db.execute("SELECT id, images FROM error_logs WHERE images LIKE '%data:image%'");
  let moved = 0;
  for (const r of rows.rows as any[]) {
    let list: any[];
    try {
      list = JSON.parse(String(r.images));
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    let changed = false;
    const next = list.map((raw: any, i: number) => {
      const item = typeof raw === "string" ? { dataUrl: raw } : raw;
      if (!item || typeof item.dataUrl !== "string" || !item.dataUrl.startsWith("data:")) return raw;
      const id = String(item.id || `${Date.now()}-${i}`);
      // if writing the file fails, the original base64 stays in the DB (nothing is lost)
      const saved = saveDataUrl(String(r.id), id, String(item.name || "image"), item.dataUrl);
      if (!saved) return raw;
      changed = true;
      moved++;
      return saved;
    });
    if (changed) {
      await db.execute({ sql: "UPDATE error_logs SET images = ? WHERE id = ?", args: [JSON.stringify(next), String(r.id)] });
    }
  }
  // legacy full copy made by the old error_logs rebuild: it only duplicates the base64 screenshots
  await db.execute("DROP TABLE IF EXISTS error_logs_backup");
  if (moved > 0) {
    try {
      await db.execute("VACUUM"); // give the freed space back so local.db actually shrinks
    } catch (e) {
      console.warn("VACUUM skipped:", (e as Error).message);
    }
  }
  return moved;
}

/** Moves base64 flashcard images (cards.front_image) into files. Returns how many were moved. */
export async function moveCardImagesToFiles(db: Client): Promise<number> {
  const rows = await db.execute("SELECT id, front_image FROM cards WHERE front_image LIKE 'data:%'");
  let moved = 0;
  for (const r of rows.rows as any[]) {
    const p = storeCardImage(String(r.id), String(r.front_image)); // "" if it could not be written
    if (!p) continue; // keep the base64 rather than lose the image
    await db.execute({ sql: "UPDATE cards SET front_image = ? WHERE id = ?", args: [p, String(r.id)] });
    moved++;
  }
  if (moved > 0) {
    try {
      await db.execute("VACUUM");
    } catch (e) {
      console.warn("VACUUM skipped:", (e as Error).message);
    }
  }
  return moved;
}

export async function addTopicIds(db: Client) {
  await addColumnIfMissing(db, "cards", "topic_id", "TEXT");
  await addColumnIfMissing(db, "pdfs", "topic_id", "TEXT");
  await addColumnIfMissing(db, "error_logs", "topic_id", "TEXT");
  await backfillTopicId(db, "cards", "topic", "subject");
  await backfillTopicId(db, "pdfs", "chapter", "subject");
  await backfillTopicId(db, "error_logs", "topic", "subject");
}

/** Mock test detail: extra columns on mock_tests + two child tables. Safe to run twice. */
export async function addMockTestDetail(db: Client) {
  await addColumnIfMissing(db, "mock_tests", "test_name", "TEXT");
  await addColumnIfMissing(db, "mock_tests", "duration_min", "INTEGER");
  await addColumnIfMissing(db, "mock_tests", "negative_marks", "REAL DEFAULT 0");
  await db.execute(`CREATE TABLE IF NOT EXISTS mock_test_sections (
    test_id TEXT NOT NULL,
    name TEXT NOT NULL,
    attempted INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    marks REAL NOT NULL DEFAULT 0,
    neg_marks REAL NOT NULL DEFAULT 0,
    time_min INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (test_id, name),
    FOREIGN KEY (test_id) REFERENCES mock_tests(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS mock_test_topic_loss (
    test_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    marks_lost REAL NOT NULL,
    reason TEXT,
    PRIMARY KEY (test_id, topic_id),
    FOREIGN KEY (test_id) REFERENCES mock_tests(id) ON DELETE CASCADE
  )`);
}

/** Topics queued for a given day (filled by the Weak-topic detector, shown on the Today page). Safe to run twice. */
export async function addDailyPlanItems(db: Client) {
  await db.execute(`CREATE TABLE IF NOT EXISTS daily_plan_items (
    date TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'weak_topic',
    done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, topic_id)
  )`);
}

/** Pomodoro timer log (used by /api/study-sessions). Safe to run twice. */
export async function addStudySessions(db: Client) {
  await db.execute(`CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    topic_id TEXT,
    duration_sec INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'focus',
    created_at TEXT
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(date)");
}

/**
 * Safety net. Migrations are tracked by ONE number, so if another update ever used number 5 or 6 for something
 * else, ours would be skipped on a database that already passed them. Everything here is IF NOT EXISTS /
 * add-column-if-missing, so running it again is harmless and guarantees all tables exist.
 */

/** Resource library schema: filesystem sync metadata, chapter playlists, and video progress.
 *  PDFs remain canonical in the Notes Viewer store; sync only adds/reuses PDF records and never deletes them.
 */
export async function addResourceSyncSchema(db: Client) {
  await addColumnIfMissing(db, "pdfs", "content_hash", "TEXT");
  await addColumnIfMissing(db, "pdfs", "source_path", "TEXT");
  await addColumnIfMissing(db, "pdfs", "source_mtime", "INTEGER");

  await db.execute(`CREATE TABLE IF NOT EXISTS resource_sync_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    root_path TEXT NOT NULL,
    last_sync_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS chapter_playlists (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    chapter TEXT NOT NULL,
    class_notes_path TEXT,
    dpp_notes_path TEXT,
    video_root_path TEXT,
    class_video_path TEXT,
    dpp_video_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subject, chapter)
  )`);

  await addColumnIfMissing(db, "chapter_playlists", "class_notes_path", "TEXT");
  await addColumnIfMissing(db, "chapter_playlists", "dpp_notes_path", "TEXT");
  await addColumnIfMissing(db, "chapter_playlists", "video_root_path", "TEXT");
  await addColumnIfMissing(db, "chapter_playlists", "class_video_path", "TEXT");
  await addColumnIfMissing(db, "chapter_playlists", "dpp_video_path", "TEXT");

  await db.execute(`CREATE TABLE IF NOT EXISTS chapter_videos (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    title TEXT NOT NULL,
    path_or_url TEXT NOT NULL,
    location_type TEXT NOT NULL DEFAULT 'File Manager',
    category TEXT NOT NULL DEFAULT 'class',
    position INTEGER NOT NULL DEFAULT 1,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    last_position_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES chapter_playlists(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_chapter_videos_playlist_category
    ON chapter_videos (playlist_id, category, position)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pdfs_subject_chapter
    ON pdfs (subject, chapter)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pdfs_source_path
    ON pdfs (source_path)`);

  // Legacy experimental category is no longer part of the UI.
  await db.execute(`DELETE FROM chapter_videos WHERE lower(category) = 'other'`);
}

export async function ensureAllNewTables(db: Client) {
  await addMockTestDetail(db);
  await addDailyPlanItems(db);
  await addStudySessions(db);
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: "topic_id columns + backfill", run: addTopicIds },
  { version: 2, name: "syllabus_progress keys: topic name -> stable topic id", run: migrateSyllabusKeys },
  { version: 3, name: "error-log screenshots: base64 in database -> files", run: async (db) => void (await moveScreenshotsToFiles(db)) },
  { version: 4, name: "flashcard images: base64 in database -> files", run: async (db) => void (await moveCardImagesToFiles(db)) },
  { version: 5, name: "mock test detail: test_name/duration/negative_marks + sections + topic losses", run: addMockTestDetail },
  { version: 6, name: "daily_plan_items (weak-topic revision queue)", run: addDailyPlanItems },
  { version: 7, name: "study_sessions + make sure mock/plan tables exist", run: ensureAllNewTables },
  { version: 8, name: "resource sync schema + protected canonical PDFs", run: addResourceSyncSchema },
];

async function snapshot(db: Client, label: string) {
  try {
    const dir = path.join(BACKUP_DIR, "db");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(dir, `pre-migration-${label}-${stamp}.db`);
    await db.execute(`VACUUM INTO '${dest.replace(/\\/g, "/").replace(/'/g, "''")}'`);
  } catch (e) {
    // A failed snapshot must not stop the app, but we do not want to hide it either
    console.warn("pre-migration snapshot failed:", (e as Error)?.message || e);
  }
}

export async function runMigrations(db: Client) {
  await db.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
  const cur = await db.execute("SELECT value FROM app_meta WHERE key = 'schema_version'");
  const current = cur.rows.length ? Number((cur.rows[0] as any).value) || 0 : 0;
  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) return;

  // Brand-new empty database: nothing worth a snapshot.
  const hasData = await db.execute("SELECT (SELECT COUNT(*) FROM cards) + (SELECT COUNT(*) FROM syllabus_progress) + (SELECT COUNT(*) FROM error_logs) AS n");
  if (Number((hasData.rows[0] as any).n) > 0) await snapshot(db, `v${current}`);

  for (const m of pending) {
    await m.run(db);
    await db.execute({
      sql: "INSERT INTO app_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [String(m.version)],
    });
    console.log(`migration ${m.version} done: ${m.name}`);
  }
}

/** Run after a restore: a backup made by an older version may still contain old keys / base64 images. */
export async function postRestoreFixups(db: Client) {
  await addTopicIds(db);
  await migrateSyllabusKeys(db);
  await moveScreenshotsToFiles(db);
  await moveCardImagesToFiles(db);
}
