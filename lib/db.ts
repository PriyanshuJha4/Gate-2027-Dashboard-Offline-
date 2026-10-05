import { createClient } from "@libsql/client";

import { DB_PATH } from "@/lib/paths";
import { runMigrations } from "@/lib/migrations";

// ============================================================
// DATABASE CONFIGURATION
// ============================================================

export const DB_FILE = DB_PATH;

export const db = createClient({
  url: `file:${DB_FILE}`,
});

// SQLite can temporarily report SQLITE_BUSY when multiple
// Next.js workers/processes access the same database.
// These settings make initialization resilient to that.
const SQLITE_BUSY_TIMEOUT = 15_000;
const MAX_RETRIES = 8;
const INITIAL_RETRY_DELAY = 100;

// ============================================================
// SQLITE ERROR HELPERS
// ============================================================

function isSqliteBusyError(error: unknown): boolean {
  if (!error) return false;

  const candidate = error as {
    code?: string;
    message?: string;
    cause?: {
      code?: string;
      message?: string;
    };
  };

  const code = String(
    candidate.code ?? candidate.cause?.code ?? ""
  ).toUpperCase();

  const message = String(
    candidate.message ?? candidate.cause?.message ?? ""
  ).toUpperCase();

  return (
    code.includes("SQLITE_BUSY") ||
    code.includes("SQLITE_LOCKED") ||
    message.includes("SQLITE_BUSY") ||
    message.includes("DATABASE IS LOCKED") ||
    message.includes("SQLITE_LOCKED")
  );
}

// ============================================================
// RETRY HELPER
// ============================================================

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSqliteRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Do not retry unrelated database errors.
      if (!isSqliteBusyError(error)) {
        throw error;
      }

      // Last attempt: let the original error propagate.
      if (attempt === MAX_RETRIES) {
        break;
      }

      const delay = Math.min(
        INITIAL_RETRY_DELAY * 2 ** (attempt - 1),
        5_000
      );

      console.warn(
        `SQLite busy during ${operationName}. ` +
          `Retrying ${attempt}/${MAX_RETRIES - 1} in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================================
// CONNECTION / PRAGMA SETUP
// ============================================================
//
// IMPORTANT:
// Do NOT execute these with Promise.all().
//
// PRAGMA journal_mode=WAL can require a database lock.
// Running it concurrently with other PRAGMAs was the main
// cause of the SQLITE_BUSY errors during `next build`.
//

async function configureDatabase(): Promise<void> {
  // busy_timeout is connection-local and should be configured first.
  await db.execute(
    `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT}`
  );

  // Foreign keys are also connection-local.
  await db.execute(`PRAGMA foreign_keys = ON`);

  // WAL mode can require an exclusive database operation.
  // Therefore it is executed AFTER the connection has a
  // busy timeout and is protected by retry logic.
  await withSqliteRetry(
    async () => {
      await db.execute(`PRAGMA journal_mode = WAL`);
    },
    "PRAGMA journal_mode=WAL"
  );
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

let initPromise: Promise<void> | null = null;

export function initDatabase(): Promise<void> {
  // Initialize only once per server process.
  if (!initPromise) {
    initPromise = initializeDatabase().catch((error) => {
      // Allow a future request to retry initialization if the
      // complete initialization failed.
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

// ============================================================
// COMPLETE DATABASE INITIALIZATION
// ============================================================

async function initializeDatabase(): Promise<void> {
  // Configure SQLite first.
  await configureDatabase();

  // Create/upgrade the complete schema.
  //
  // The entire operation is retryable because multiple Next.js
  // build workers may try to initialize the same SQLite file.
  await withSqliteRetry(
    async () => {
      await createTables();
    },
    "database initialization"
  );
}

// ============================================================
// TABLE CREATION
// ============================================================

async function createTables(): Promise<void> {
  // ----------------------------------------------------------
  // 1. Users
  // ----------------------------------------------------------

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      security_question TEXT,
      security_answer TEXT,
      role TEXT DEFAULT 'student',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ----------------------------------------------------------
  // 2. PDFs
  // ----------------------------------------------------------

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pdfs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT DEFAULT 'application/pdf',
      last_page INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_path TEXT DEFAULT '',
      source_mtime INTEGER DEFAULT 0
    )
  `);

  // ----------------------------------------------------------
  // 3. PDF Annotations
  // ----------------------------------------------------------

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pdf_annotations (
      key TEXT PRIMARY KEY,
      pdf_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      items_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pdf_id)
        REFERENCES pdfs(id)
        ON DELETE CASCADE
    )
  `);

  // ----------------------------------------------------------
  // 4. PDF Bookmarks
  // ----------------------------------------------------------

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pdf_bookmarks (
      id TEXT PRIMARY KEY,
      pdf_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pdf_id)
        REFERENCES pdfs(id)
        ON DELETE CASCADE
    )
  `);

  // ----------------------------------------------------------
  // 5. Flashcards
  // ----------------------------------------------------------

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      front_image TEXT,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      source_json TEXT,
      ease REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      due TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_reviewed TEXT DEFAULT ''
    )
  `);

  // ----------------------------------------------------------
  // 6. Review History
  // ----------------------------------------------------------

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      date TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    )
  `);

  // ----------------------------------------------------------
  // 7. Library / Dashboard Tables
  // ----------------------------------------------------------

  const additionalTables = [
    `
      CREATE TABLE IF NOT EXISTS library_resources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        location_type TEXT,
        path_or_url TEXT,
        type TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS subject_wise_resources (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        title TEXT NOT NULL,
        location_type TEXT,
        path_or_url TEXT,
        type TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS chapter_wise_resources (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        chapter TEXT NOT NULL,
        title TEXT NOT NULL,
        location_type TEXT,
        path_or_url TEXT,
        type TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS chapter_playlists (
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
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS chapter_videos (
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
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS resource_sync_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        root_path TEXT NOT NULL DEFAULT '',
        last_sync_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS syllabus_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        topic_key TEXT NOT NULL,
        completed BOOLEAN NOT NULL,
        updated_at TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS mock_tests (
        id TEXT PRIMARY KEY,
        test_date TEXT NOT NULL,
        subject TEXT NOT NULL,
        score REAL NOT NULL,
        max_score REAL NOT NULL,
        created_at TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS study_links (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        category TEXT,
        created_at TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS todo_list (
        date TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        completed BOOLEAN NOT NULL,
        updated_at TEXT
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS roadmap_schedule (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT
      )
    `,
  ];

  for (const sql of additionalTables) {
    await db.execute(sql);
  }

  // Scanned PDF source metadata migrations.
  try {
    const pdfColumns = await db.execute("PRAGMA table_info(pdfs)");
    const names = new Set((pdfColumns.rows as any[]).map((row) => String(row.name)));
    if (!names.has("source_path")) await db.execute("ALTER TABLE pdfs ADD COLUMN source_path TEXT DEFAULT ''");
    if (!names.has("source_mtime")) await db.execute("ALTER TABLE pdfs ADD COLUMN source_mtime INTEGER DEFAULT 0");
  } catch (error) {
    console.warn("pdf source metadata migration skipped:", error);
  }

  // Chapter playlist folder-path migrations.
  try {
    const playlistColumns = await db.execute("PRAGMA table_info(chapter_playlists)");
    const names = new Set((playlistColumns.rows as any[]).map((row) => String(row.name)));
    if (!names.has("video_root_path")) await db.execute("ALTER TABLE chapter_playlists ADD COLUMN video_root_path TEXT DEFAULT ''");
    if (!names.has("class_video_path")) await db.execute("ALTER TABLE chapter_playlists ADD COLUMN class_video_path TEXT DEFAULT ''");
    if (!names.has("dpp_video_path")) await db.execute("ALTER TABLE chapter_playlists ADD COLUMN dpp_video_path TEXT DEFAULT ''");
  } catch (error) {
    console.warn("chapter_playlists path migration skipped:", error);
  }

  // Chapter video category migration for databases created before bulk playlists.
  try {
    const columns = await db.execute("PRAGMA table_info(chapter_videos)");
    const hasCategory = (columns.rows as any[]).some((row) => String(row.name) === "category");
    if (!hasCategory) {
      await db.execute("ALTER TABLE chapter_videos ADD COLUMN category TEXT NOT NULL DEFAULT 'class'");
    }
  } catch (error) {
    console.warn("chapter_videos category migration skipped:", error);
  }

  // ----------------------------------------------------------
  // 8. Error Logs
  // ----------------------------------------------------------
  //
  // This schema has legacy upgrade logic of its own.
  //

  const { ensureErrorLogs } = await import("@/lib/errorLogsSchema");

  await ensureErrorLogs();

  // ----------------------------------------------------------
  // 9. Data Migrations
  // ----------------------------------------------------------

  await runMigrations(db);
}

// ============================================================
// OPTIONAL: DATABASE HEALTH CHECK
// ============================================================
//
// Useful for debugging without modifying the database.
//

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await withSqliteRetry(
      async () => {
        await db.execute(`SELECT 1`);
      },
      "database health check"
    );

    return true;
  } catch (error) {
    console.error("SQLite health check failed:", error);
    return false;
  }
}