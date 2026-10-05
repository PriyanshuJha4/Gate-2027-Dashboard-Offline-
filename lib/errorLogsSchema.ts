import { db } from "@/lib/db";

/**
 * Columns the app uses. Everything except `id` is nullable on purpose,
 * so an old/legacy schema can never block an INSERT again.
 * `mistake` and `correct_concept` are legacy columns kept for old data.
 */
export const ERROR_LOG_COLUMNS: Record<string, string> = {
  created_at: "TEXT",
  log_date: "TEXT",
  subject: "TEXT",
  topic: "TEXT",
  topic_id: "TEXT", // stable id from lib/topics.ts
  question: "TEXT",
  reason: "TEXT",
  mistake: "TEXT",
  correct_concept: "TEXT",
  images: "TEXT", // JSON: [{id,name,path}]  (path = "screenshots/<errorId>/<n>.png")
  source_url: "TEXT",
  my_answer: "TEXT",
  correct_answer: "TEXT",
  what_went_wrong: "TEXT",
  solution: "TEXT",
  // Revision tracking (used by the Review page)
  mastered: "INTEGER",
  review_count: "INTEGER",
  last_reviewed: "TEXT",
  // Spaced revision: YYYY-MM-DD of the next revision. Empty/NULL = due now.
  // "Pending" everywhere in the app = not mastered AND (next_review empty OR <= today), see lib/errorReview.ts
  next_review: "TEXT",
};

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

type ColumnInfo = { name: string; type: string; notnull: number; pk: number };

async function getColumns(): Promise<ColumnInfo[]> {
  const info = await db.execute("PRAGMA table_info(error_logs)");
  return info.rows.map((r: any) => ({
    name: String(r.name),
    type: String(r.type || "TEXT"),
    notnull: Number(r.notnull),
    pk: Number(r.pk),
  }));
}

async function runMigration() {
  await db.execute(`CREATE TABLE IF NOT EXISTS error_logs (id TEXT PRIMARY KEY, created_at TEXT)`);

  let columns = await getColumns();
  const existing = new Set(columns.map((c) => c.name));
  for (const [name, type] of Object.entries(ERROR_LOG_COLUMNS)) {
    if (!existing.has(name)) {
      await db.execute(`ALTER TABLE error_logs ADD COLUMN ${quote(name)} ${type}`);
    }
  }

  // Old tables can have leftover NOT NULL columns (e.g. `correct_concept`): rebuild with all columns nullable.
  columns = await getColumns();
  const hasStrictColumns = columns.some((c) => c.notnull === 1 && c.pk === 0);
  if (hasStrictColumns) {
    const names = columns.map((c) => c.name);
    const colDefs = columns
      .map((c) => (c.name === "id" ? `${quote("id")} TEXT PRIMARY KEY` : `${quote(c.name)} ${c.type || "TEXT"}`))
      .join(", ");
    const colList = names.map(quote).join(", ");
    // The rebuild below is atomic (one batch). No extra full-table copy is kept any more
    // (the old "error_logs_backup" copy doubled the size of every screenshot in the database).
    await db.batch(
      [
        "DROP TABLE IF EXISTS error_logs_new",
        `CREATE TABLE error_logs_new (${colDefs})`,
        `INSERT INTO error_logs_new (${colList}) SELECT ${colList} FROM error_logs`,
        "DROP TABLE error_logs",
        "ALTER TABLE error_logs_new RENAME TO error_logs",
      ],
      "write",
    );
  }
}

let initPromise: Promise<void> | null = null;
/** Creates / upgrades the error_logs table once per server process (retries if it fails). */
export function ensureErrorLogs(): Promise<void> {
  if (!initPromise) {
    initPromise = runMigration().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}
