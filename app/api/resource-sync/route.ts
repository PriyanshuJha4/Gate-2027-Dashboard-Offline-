import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db, initDatabase } from "@/lib/db";
import { DATA_DIR, PDF_DIR } from "@/lib/paths";
import { dedupeAndNormalizePdfs } from "@/lib/pdfCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".mov", ".ogg", ".avi", ".mkv"]);
const PDF_EXT = ".pdf";

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function cleanTitle(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d+[\s._-]*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase().trim();
}

function normalizeName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChapterName(value: string) {
  // Folder numbering is display/order metadata, not part of the chapter identity.
  // This makes `6_Structure and Union` and `Structure and Union` the same chapter.
  return normalizeName(String(value || "").replace(/^\s*\d+\s*[_.)-]\s*/, ""));
}

function sameChapterName(a: string, b: string) {
  return normalizeChapterName(a) === normalizeChapterName(b);
}

function isVideoFolderName(name: string, kind: "class" | "dpp") {
  const normalized = normalizeName(name);
  if (kind === "class") {
    return /^(class|classes)(?:\s+(?:video|videos|lecture|lectures))?$/.test(normalized)
      || /^class\s+vid(?:eo|eos)?$/.test(normalized);
  }
  return /^(dpp|dpps)(?:\s+(?:video|videos|lecture|lectures))?$/.test(normalized)
    || /^dpp\s+vid(?:eo|eos)?$/.test(normalized);
}

function isDir(p: string) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p: string) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function samePath(a: string, b: string) {
  return normalizeKey(path.resolve(a)) === normalizeKey(path.resolve(b));
}
function idFor(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha1").update(value.toLowerCase()).digest("hex").slice(0, 28)}`;
}
function relVideo(abs: string) {
  const rel = path.relative(DATA_DIR, abs).split(path.sep).join("/");
  return rel && !rel.startsWith("..") ? rel : abs;
}
function relPdf(abs: string) {
  return path.relative(DATA_DIR, abs).split(path.sep).join("/");
}
function safeCopyName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}
function walkDirs(root: string): string[] {
  if (!isDir(root)) return [];
  const out = [root];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walkDirs(path.join(root, entry.name)));
  }
  return out;
}
function looksLikeChapter(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some((entry) =>
    entry.isDirectory() && (isVideoFolderName(entry.name, "class") || isVideoFolderName(entry.name, "dpp"))
  ) || entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(PDF_EXT));
}
function findChapterDirs(root: string) {
  return walkDirs(root).filter(looksLikeChapter).filter((dir) => dir !== root).sort(naturalSort);
}
function subjectFor(root: string, chapterDir: string) {
  const rel = path.relative(root, chapterDir).split(path.sep).filter(Boolean);
  return rel[0] || path.basename(root);
}
function chapterFor(chapterDir: string) {
  return path.basename(chapterDir);
}
function videoDir(chapterDir: string, kind: "class" | "dpp") {
  const entries = fs.readdirSync(chapterDir, { withFileTypes: true });
  const entry = entries.find((e) => e.isDirectory() && isVideoFolderName(e.name, kind));
  return entry ? path.join(chapterDir, entry.name) : "";
}
function videoFiles(folder: string) {
  if (!folder || !isDir(folder)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(p);
    }
  };
  walk(folder);
  return out.sort(naturalSort);
}
function pdfFiles(chapterDir: string) {
  if (!isDir(chapterDir)) return [];
  return fs.readdirSync(chapterDir, { withFileTypes: true })
    .filter((e) => e.isFile() && path.extname(e.name).toLowerCase() === PDF_EXT)
    .map((e) => path.join(chapterDir, e.name))
    .sort(naturalSort);
}
function hashFile(file: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
function resolveStoredPdf(relativePath: string) {
  const rel = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel.toLowerCase().startsWith("pdfs/")) return "";
  return path.resolve(DATA_DIR, rel);
}

async function dedupePlaylists() {
  const rows = await db.execute("SELECT id, subject, chapter FROM chapter_playlists ORDER BY created_at ASC, rowid ASC");
  const groups = new Map<string, any[]>();
  for (const row of rows.rows as any[]) {
    const key = `${String(row.subject).trim().toLowerCase()}\n${normalizeChapterName(String(row.chapter))}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Prefer the playlist whose chapter folder still exists on disk. After a
    // Windows Explorer rename, the stale record may be older and otherwise
    // win the dedupe, which can make the real renamed chapter disappear.
    const keeper = group.find((row) => {
      const p = String(row.video_root_path || "").trim();
      return !!p && fs.existsSync(path.resolve(p)) && fs.statSync(path.resolve(p)).isDirectory();
    }) || group[0];
    for (const duplicate of group.filter((row) => row.id !== keeper.id)) {
      const videos = await db.execute({ sql: "SELECT * FROM chapter_videos WHERE playlist_id=?", args: [duplicate.id] });
      for (const video of videos.rows as any[]) {
        const existing = await db.execute({
          sql: `SELECT id, completed, last_position_seconds, position FROM chapter_videos
                WHERE playlist_id=? AND category=?
                AND lower(replace(path_or_url,'\\\\','/'))=lower(?) LIMIT 1`,
          args: [keeper.id, video.category, normalizeKey(String(video.path_or_url))],
        });
        if (existing.rows.length) {
          const keep = existing.rows[0] as any;
          await db.execute({
            sql: `UPDATE chapter_videos SET completed=MAX(completed,?), last_position_seconds=MAX(last_position_seconds,?), position=MIN(position,?) WHERE id=?`,
            args: [Number(video.completed || 0), Number(video.last_position_seconds || 0), Number(video.position || 1), keep.id],
          });
          await db.execute({ sql: "DELETE FROM chapter_videos WHERE id=?", args: [video.id] });
        } else {
          await db.execute({ sql: "UPDATE chapter_videos SET playlist_id=? WHERE id=?", args: [keeper.id, video.id] });
        }
      }
      await db.execute({ sql: "DELETE FROM chapter_playlists WHERE id=?", args: [duplicate.id] });
    }
  }

  // Prevent future duplicates differing only by case/whitespace.
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chapter_playlists_normalized
    ON chapter_playlists(lower(trim(subject)), lower(trim(chapter)))`);
}

async function ensurePlaylist(subject: string, chapter: string, chapterDir: string) {
  // First match by the actual chapter directory. This preserves progress when the
  // user renames a subject/chapter folder through Resource Manager.
  const byDir = await db.execute("SELECT id, video_root_path FROM chapter_playlists WHERE video_root_path IS NOT NULL AND video_root_path <> ''");
  const sameDir = (byDir.rows as any[]).find((row) => normalizeKey(String(row.video_root_path)) === normalizeKey(chapterDir));
  if (sameDir) {
    const id = String(sameDir.id);
    await db.execute({ sql: "UPDATE chapter_playlists SET subject=?, chapter=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", args: [subject, chapter, id] });
    return id;
  }

  const existingRows = await db.execute({
    sql: "SELECT id, chapter FROM chapter_playlists WHERE lower(trim(subject))=lower(trim(?))",
    args: [subject],
  });
  const existingMatch = (existingRows.rows as any[]).find((row) => normalizeChapterName(String(row.chapter)) === normalizeChapterName(chapter));
  const existing = existingMatch ? { rows: [existingMatch] } : { rows: [] as any[] };
  if (existing.rows.length) {
    const id = String((existing.rows[0] as any).id);
    await db.execute({ sql: "UPDATE chapter_playlists SET subject=?, chapter=?, video_root_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", args: [subject, chapter, chapterDir, id] });
    return id;
  }

  const id = idFor("playlist", `${subject}\n${chapter}`);
  await db.execute({
    sql: `INSERT INTO chapter_playlists
      (id, subject, chapter, class_notes_path, dpp_notes_path, video_root_path, class_video_path, dpp_video_path)
      VALUES (?, ?, ?, '', '', ?, '', '')`,
    args: [id, subject, chapter, chapterDir],
  });
  return id;
}

async function syncVideos(playlistId: string, category: "class" | "dpp", folder: string) {
  const existingResult = await db.execute({
    sql: "SELECT id, path_or_url, position FROM chapter_videos WHERE playlist_id=? AND category=?",
    args: [playlistId, category],
  });
  const existing = existingResult.rows as any[];
  const byPath = new Map<string, any>();
  for (const row of existing) byPath.set(normalizeKey(String(row.path_or_url)), row);

  const files = videoFiles(folder);
  const seen = new Set<string>();
  let added = 0;
  let updated = 0;

  for (let i = 0; i < files.length; i++) {
    const stored = relVideo(files[i]);
    const key = normalizeKey(files[i]);
    seen.add(key);
    const current = byPath.get(normalizeKey(stored)) || [...byPath.values()].find((r) => normalizeKey(String(r.path_or_url)) === key);

    if (current) {
      updated++;
      await db.execute({
        sql: "UPDATE chapter_videos SET title=?, path_or_url=?, position=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        args: [cleanTitle(path.basename(files[i])), stored, i + 1, current.id],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO chapter_videos
          (id, playlist_id, title, path_or_url, location_type, category, position, duration_seconds)
          VALUES (?, ?, ?, ?, 'File Manager', ?, ?, 0)`,
        args: [idFor("video", `${playlistId}\n${category}\n${stored}`), playlistId, cleanTitle(path.basename(files[i])), stored, category, i + 1],
      });
      added++;
    }
  }

  // Hard sync: a video deleted from the source folder must disappear from the library.
  for (const row of existing) {
    const key = normalizeKey(String(row.path_or_url));
    const stillExists = files.some((file) => key === normalizeKey(file) || key === normalizeKey(relVideo(file)));
    if (!stillExists) await db.execute({ sql: "DELETE FROM chapter_videos WHERE id=?", args: [row.id] });
  }

  return { found: files.length, added, updated, removed: Math.max(0, existing.length - files.length) };
}

async function syncPdf(file: string, subject: string, chapter: string) {
  const stat = fs.statSync(file);
  const sourcePath = path.resolve(file);
  const sourceHash = hashFile(file);

  const candidates = await db.execute({
    sql: "SELECT id, relative_path, original_filename, source_path, source_mtime, file_size, title FROM pdfs WHERE lower(trim(subject))=lower(trim(?)) AND lower(trim(chapter))=lower(trim(?)) ORDER BY created_at ASC, rowid ASC",
    args: [subject, chapter],
  });

  // First priority: the same Resource Root file. If its content changed, update
  // the existing canonical record instead of creating a second PDF and losing
  // the connection to its annotations/bookmarks/flashcards.
  let match: any = (candidates.rows as any[]).find((candidate) =>
    normalizeKey(String(candidate.source_path || "")) === normalizeKey(sourcePath)
  );

  if (match) {
    const stored = resolveStoredPdf(String(match.relative_path || ""));
    if (!stored || !isFile(stored)) {
      const destDir = path.join(PDF_DIR, "scanned", safeCopyName(subject), safeCopyName(chapter));
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, safeCopyName(path.basename(file)));
      fs.copyFileSync(file, dest);
      await db.execute({
        sql: `UPDATE pdfs SET title=?, original_filename=?, stored_filename=?, relative_path=?, file_size=?, source_mtime=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        args: [cleanTitle(path.basename(file)), path.basename(file), path.basename(dest), relPdf(dest), stat.size, Math.trunc(stat.mtimeMs), match.id],
      });
    } else {
      fs.copyFileSync(file, stored);
      await db.execute({
        sql: `UPDATE pdfs SET title=?, original_filename=?, file_size=?, source_mtime=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        args: [cleanTitle(path.basename(file)), path.basename(file), stat.size, Math.trunc(stat.mtimeMs), match.id],
      });
    }
    return { action: "updated", id: String(match.id) };
  }

  // Second priority: exact same PDF content already imported under this chapter.
  // This merges duplicate copies without collapsing genuinely different PDFs.
  for (const candidate of candidates.rows as any[]) {
    if (Number(candidate.file_size || 0) !== stat.size) continue;
    const stored = resolveStoredPdf(String(candidate.relative_path || ""));
    if (!stored || !isFile(stored)) continue;
    try {
      if (hashFile(stored) === sourceHash) {
        match = candidate;
        break;
      }
    } catch { /* ignore corrupt/inaccessible stored copy */ }
  }

  if (match) {
    await db.execute({
      sql: `UPDATE pdfs SET original_filename=?, title=?, source_path=?, source_mtime=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      args: [path.basename(file), cleanTitle(path.basename(file)), sourcePath, Math.trunc(stat.mtimeMs), match.id],
    });
    return { action: "linked", id: String(match.id) };
  }

  const destDir = path.join(PDF_DIR, "scanned", safeCopyName(subject), safeCopyName(chapter));
  fs.mkdirSync(destDir, { recursive: true });
  const base = safeCopyName(path.basename(file));
  let dest = path.join(destDir, base);
  if (isFile(dest)) dest = path.join(destDir, `${sourceHash.slice(0, 12)}_${base}`);
  fs.copyFileSync(file, dest);

  const id = idFor("scanned_pdf", `${subject}\n${chapter}\n${sourcePath}\n${sourceHash}`);
  await db.execute({
    sql: `INSERT INTO pdfs
      (id, title, original_filename, stored_filename, relative_path, subject, chapter, file_size, mime_type, last_page, source_path, source_mtime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', 1, ?, ?)`,
    args: [id, cleanTitle(path.basename(file)), path.basename(file), path.basename(dest), relPdf(dest), subject, chapter, stat.size, sourcePath, Math.trunc(stat.mtimeMs)],
  });
  return { action: "imported", id };
}

async function removeStalePlaylists(root: string, discovered: Set<string>) {
  // The filesystem is the source of truth. A playlist whose chapter directory
  // is no longer one of the currently discovered chapter directories is stale,
  // even when an ancestor folder still exists (the old implementation could
  // incorrectly keep such records alive).
  const rows = await db.execute("SELECT id, subject, chapter, video_root_path, class_video_path, dpp_video_path FROM chapter_playlists");
  const rootKey = normalizeKey(root);
  const discoveredKeys = new Set([...discovered].map((value) => normalizeKey(value)));

  for (const row of rows.rows as any[]) {
    const source = String(row.video_root_path || row.class_video_path || row.dpp_video_path || "").trim();
    if (!source) continue;

    const resolved = path.resolve(source);
    const resolvedKey = normalizeKey(resolved);
    const underRoot = resolvedKey === rootKey || resolvedKey.startsWith(rootKey + "/");
    if (!underRoot) continue;

    // Keep only playlists backed by a currently discovered chapter directory.
    // This removes old entries left behind after a Windows File Explorer rename,
    // move, or delete, including blank duplicate chapters.
    if (!discoveredKeys.has(resolvedKey) || !isDir(resolved)) {
      await db.execute({ sql: "DELETE FROM chapter_videos WHERE playlist_id=?", args: [row.id] });
      await db.execute({ sql: "DELETE FROM chapter_playlists WHERE id=?", args: [row.id] });
    }
  }

  // Also purge video rows whose physical source was renamed/deleted outside
  // the dashboard. This prevents blank video entries from surviving.
  const videos = await db.execute("SELECT id, playlist_id, path_or_url FROM chapter_videos");
  for (const row of videos.rows as any[]) {
    const raw = String(row.path_or_url || "").trim();
    if (!raw) continue;
    const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(DATA_DIR, raw);
    const absKey = normalizeKey(abs);
    if (!(absKey === rootKey || absKey.startsWith(rootKey + "/"))) continue;
    if (!isFile(abs)) await db.execute({ sql: "DELETE FROM chapter_videos WHERE id=?", args: [row.id] });
  }
}

async function syncChapter(root: string, chapterDir: string) {
  const subject = subjectFor(root, chapterDir);
  const chapter = chapterFor(chapterDir);
  const playlistId = await ensurePlaylist(subject, chapter, chapterDir);
  const classFolder = videoDir(chapterDir, "class");
  const dppFolder = videoDir(chapterDir, "dpp");
  const classVideos = await syncVideos(playlistId, "class", classFolder);
  const dppVideos = await syncVideos(playlistId, "dpp", dppFolder);
  await db.execute({
    sql: "UPDATE chapter_playlists SET video_root_path=?, class_video_path=?, dpp_video_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    args: [chapterDir, classFolder, dppFolder, playlistId],
  });

  const pdfs: any[] = [];
  for (const file of pdfFiles(chapterDir)) pdfs.push(await syncPdf(file, subject, chapter));
  return { subject, chapter, videos: { class: classVideos, dpp: dppVideos }, pdfs };
}

function underRoot(root: string, target: string) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

export async function GET() {
  try {
    await initDatabase();
    await dedupePlaylists();
    await dedupeAndNormalizePdfs();
    const r = await db.execute("SELECT root_path, last_sync_at FROM resource_sync_config WHERE id=1 LIMIT 1");
    return NextResponse.json({
      rootPath: String((r.rows[0] as any)?.root_path || ""),
      lastSyncAt: String((r.rows[0] as any)?.last_sync_at || ""),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load sync settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initDatabase();
    await dedupePlaylists();
    await dedupeAndNormalizePdfs();
    const body = await req.json();
    const action = String(body.action || "sync");

    if (action === "set-root") {
      const rootPath = path.resolve(String(body.rootPath || "").trim());
      if (!rootPath || !isDir(rootPath)) return NextResponse.json({ error: "Resource root folder not found" }, { status: 400 });
      await db.execute({
        sql: `INSERT INTO resource_sync_config (id, root_path, last_sync_at) VALUES (1, ?, '')
              ON CONFLICT(id) DO UPDATE SET root_path=excluded.root_path, updated_at=CURRENT_TIMESTAMP`,
        args: [rootPath],
      });
      return NextResponse.json({ success: true, rootPath });
    }

    if (action !== "sync") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    const cfg = await db.execute("SELECT root_path FROM resource_sync_config WHERE id=1 LIMIT 1");
    const rootPath = path.resolve(String((cfg.rows[0] as any)?.root_path || ""));
    if (!rootPath || !isDir(rootPath)) return NextResponse.json({ error: "Set a valid Resource Root first." }, { status: 400 });

    const requestedSubject = String(body.subject || "").trim();
    const requestedChapter = String(body.chapter || "").trim();
    const allDirs = findChapterDirs(rootPath);
    const dirs = allDirs.filter((dir) => {
      const subject = subjectFor(rootPath, dir);
      const chapter = chapterFor(dir);
      return (!requestedSubject || normalizeName(subject) === normalizeName(requestedSubject)) &&
        (!requestedChapter || sameChapterName(chapter, requestedChapter));
    });
    // Reconciliation always uses the complete current filesystem inventory, even
    // for a single-chapter sync. Otherwise syncing one chapter could incorrectly
    // delete every other valid chapter from the database.
    const discovered = new Set(allDirs.map((dir) => dir));

    const results = [];
    for (const dir of dirs) results.push(await syncChapter(rootPath, dir));
    await removeStalePlaylists(rootPath, discovered);
    await dedupePlaylists();
    await dedupeAndNormalizePdfs();

    const now = new Date().toISOString();
    await db.execute({ sql: "UPDATE resource_sync_config SET last_sync_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", args: [now] });
    return NextResponse.json({ success: true, rootPath, syncedChapters: results.length, results, lastSyncAt: now });
  } catch (e: any) {
    console.error("Resource sync failed", e);
    return NextResponse.json({ error: e?.message || "Resource sync failed" }, { status: 500 });
  }
}
