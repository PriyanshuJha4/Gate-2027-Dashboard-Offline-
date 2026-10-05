import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db, initDatabase } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".mov", ".ogg", ".avi", ".mkv"]);

function cleanTitle(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/^\s*\d+[\s._-]*/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function naturalSort(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
function normalize(value: string) { return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase().trim(); }
function normalizeChapterName(value: string) { return normalize(String(value || "").replace(/^\s*\d+\s*[_.)-]\s*/, "")); }
function idFor(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha1").update(value.toLowerCase()).digest("hex").slice(0, 28)}`; }
function hashFile(file: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
function mapVideo(row: any) {
  return {
    id: String(row.id), title: String(row.title), pathOrUrl: String(row.path_or_url),
    locationType: String(row.location_type || "File Manager"),
    category: String(row.category || "class"), position: Number(row.position || 1),
    durationSeconds: Number(row.duration_seconds || 0), completed: Boolean(row.completed),
    lastPositionSeconds: Number(row.last_position_seconds || 0),
  };
}
function resolvePdfStored(rel: string) {
  const clean = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean.toLowerCase().startsWith("pdfs/")) return "";
  return path.resolve(DATA_DIR, clean);
}
async function dedupe() {
  const rows = await db.execute("SELECT id, subject, chapter FROM chapter_playlists ORDER BY created_at ASC, rowid ASC");
  const groups = new Map<string, any[]>();
  for (const row of rows.rows as any[]) {
    const key = `${normalize(String(row.subject))}\n${normalizeChapterName(String(row.chapter))}`;
    const arr = groups.get(key) || []; arr.push(row); groups.set(key, arr);
  }
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const keep = arr.find((row) => {
      const p = String(row.video_root_path || "").trim();
      return !!p && fs.existsSync(path.resolve(p)) && fs.statSync(path.resolve(p)).isDirectory();
    }) || arr[0];
    for (const dup of arr.filter((row) => row.id !== keep.id)) {
      const vids = await db.execute({ sql: "SELECT * FROM chapter_videos WHERE playlist_id=?", args: [dup.id] });
      for (const v of vids.rows as any[]) {
        const existing = await db.execute({
          sql: `SELECT id FROM chapter_videos WHERE playlist_id=? AND category=? AND lower(replace(path_or_url,'\\\\','/'))=lower(?) LIMIT 1`,
          args: [keep.id, v.category, normalize(String(v.path_or_url))],
        });
        if (existing.rows.length) {
          await db.execute({ sql: "UPDATE chapter_videos SET completed=MAX(completed,?), last_position_seconds=MAX(last_position_seconds,?) WHERE id=?", args: [Number(v.completed || 0), Number(v.last_position_seconds || 0), (existing.rows[0] as any).id] });
          await db.execute({ sql: "DELETE FROM chapter_videos WHERE id=?", args: [v.id] });
        } else {
          await db.execute({ sql: "UPDATE chapter_videos SET playlist_id=? WHERE id=?", args: [keep.id, v.id] });
        }
      }
      await db.execute({ sql: "DELETE FROM chapter_playlists WHERE id=?", args: [dup.id] });
    }
  }
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chapter_playlists_normalized
    ON chapter_playlists(lower(trim(subject)), lower(trim(chapter)))`);
}
async function resourcesFor(subject: string, chapter: string) {
  const config = await db.execute("SELECT root_path FROM resource_sync_config WHERE id=1 LIMIT 1");
  const root = path.resolve(String((config.rows[0] as any)?.root_path || ""));
  const result = await db.execute({
    sql: "SELECT id, title, original_filename, relative_path, file_size, created_at, source_path, source_mtime FROM pdfs WHERE lower(trim(subject))=lower(trim(?)) AND lower(trim(chapter))=lower(trim(?)) ORDER BY created_at ASC, rowid ASC",
    args: [subject, chapter],
  });

  // One visible entry per actual PDF content. Notes Viewer uploads and Resource Root
  // scans can create two metadata rows for the same PDF; the UI must still show one.
  const candidates = (result.rows as any[]).map((row) => {
    const storedPath = resolvePdfStored(String(row.relative_path || ""));
    const source = String(row.source_path || "");
    const storedExists = !!storedPath && fs.existsSync(storedPath) && fs.statSync(storedPath).isFile();
    const sourceExists = !!source && fs.existsSync(source) && fs.statSync(source).isFile();
    const underActiveRoot = sourceExists && !!root && (normalize(source) === normalize(root) || normalize(source).startsWith(normalize(root) + "/"));
    let currentSource = false;
    if (sourceExists && underActiveRoot) {
      const stat = fs.statSync(source);
      currentSource = Number(row.file_size || 0) === stat.size && Number(row.source_mtime || 0) === Math.trunc(stat.mtimeMs);
    }
    // A root-linked record is visible only while its source file is the current
    // version. Manually uploaded Notes Viewer PDFs remain visible independently.
    if (!storedExists || (!sourceExists && source) || (sourceExists && !currentSource && underActiveRoot)) return null;
    let contentHash = "";
    try { contentHash = hashFile(storedPath); } catch { contentHash = `row:${String(row.id)}`; }
    return {
      id: String(row.id),
      title: String(row.title),
      filename: String(row.original_filename),
      path: String(row.relative_path),
      size: Number(row.file_size || 0),
      createdAt: row.created_at,
      contentHash,
      // Prefer a root-linked record because it represents the current source file.
      priority: currentSource ? 0 : sourceExists ? 1 : 2,
    };
  }).filter(Boolean) as any[];

  const byContent = new Map<string, any>();
  for (const item of candidates) {
    const existing = byContent.get(item.contentHash);
    if (!existing || item.priority < existing.priority || (item.priority === existing.priority && String(item.createdAt) < String(existing.createdAt))) {
      byContent.set(item.contentHash, item);
    }
  }

  return {
    all: [...byContent.values()]
      .sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true, sensitivity: "base" }))
      .map(({ contentHash, priority, createdAt, ...pdf }) => pdf),
  };
}
function getPathFromRow(row: any) { return String(row.path_or_url || ""); }

export async function GET(request: Request) {
  try {
    await initDatabase(); await dedupe();
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject"); const chapter = searchParams.get("chapter");
    const playlistResult = subject && chapter
      ? await db.execute({ sql: "SELECT * FROM chapter_playlists WHERE lower(trim(subject))=lower(trim(?)) AND lower(trim(chapter))=lower(trim(?)) LIMIT 1", args: [subject, chapter] })
      : await db.execute("SELECT * FROM chapter_playlists ORDER BY lower(trim(subject)), lower(trim(chapter)), chapter");

    const rootConfig = await db.execute("SELECT root_path FROM resource_sync_config WHERE id=1 LIMIT 1");
    const rootKey = normalize(String((rootConfig.rows[0] as any)?.root_path || ""));
    const playlists: any[] = [];
    const seen = new Set<string>();
    for (const row of playlistResult.rows as any[]) {
      // Only expose playlists backed by a real current filesystem chapter.
      // This hides stale/blank DB entries immediately after an external rename,
      // instead of waiting for another database cleanup path.
      const sourcePath = String(row.video_root_path || row.class_video_path || row.dpp_video_path || "").trim();
      if (sourcePath) {
        const resolved = path.resolve(sourcePath);
        const resolvedKey = normalize(resolved);
        const underRoot = rootKey && (resolvedKey === rootKey || resolvedKey.startsWith(rootKey + "/"));
        if (underRoot && (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory())) continue;
      }
      const key = `${normalize(String(row.subject))}\n${normalizeChapterName(String(row.chapter))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const videos = await db.execute({ sql: "SELECT * FROM chapter_videos WHERE playlist_id=? AND category IN ('class','dpp') ORDER BY CASE category WHEN 'class' THEN 0 ELSE 1 END, position ASC, created_at ASC", args: [row.id] });
      const resources = await resourcesFor(String(row.subject), String(row.chapter));
      playlists.push({
        id: String(row.id), subject: String(row.subject), chapter: String(row.chapter),
        videoRootPath: String(row.video_root_path || ""), classVideoPath: String(row.class_video_path || ""), dppVideoPath: String(row.dpp_video_path || ""),
        videos: videos.rows.map(mapVideo), resources,
      });
    }
    return NextResponse.json(subject && chapter ? playlists[0] || { subject, chapter, resources: await resourcesFor(subject, chapter), videos: [] } : playlists);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load playlist" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDatabase(); await dedupe();
    const body = await request.json();
    if (body.action === "playlist") {
      const { id, subject, chapter, videoRootPath = "", classVideoPath = "", dppVideoPath = "" } = body;
      if (!id || !subject || !chapter) return NextResponse.json({ error: "id, subject and chapter are required" }, { status: 400 });
      await db.execute({ sql: `INSERT INTO chapter_playlists (id, subject, chapter, class_notes_path, dpp_notes_path, video_root_path, class_video_path, dpp_video_path) VALUES (?, ?, ?, '', '', ?, ?, ?) ON CONFLICT(subject, chapter) DO UPDATE SET video_root_path=excluded.video_root_path, class_video_path=excluded.class_video_path, dpp_video_path=excluded.dpp_video_path, updated_at=CURRENT_TIMESTAMP`, args: [id, subject, chapter, String(videoRootPath).trim(), String(classVideoPath).trim(), String(dppVideoPath).trim()] });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to save playlist" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await initDatabase();
    const { videoId, completed, lastPositionSeconds } = await request.json();
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    await db.execute({
      sql: `UPDATE chapter_videos SET completed=COALESCE(?,completed), last_position_seconds=COALESCE(?,last_position_seconds), updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      args: [completed === undefined ? null : completed ? 1 : 0, lastPositionSeconds === undefined ? null : Number(lastPositionSeconds), videoId],
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to update video" }, { status: 500 });
  }
}
