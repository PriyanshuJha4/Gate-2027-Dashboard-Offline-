import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db, initDatabase } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO = new Set([".mp4", ".webm", ".m4v", ".mov", ".ogg", ".avi", ".mkv"]);

function isDir(p: string) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p: string) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function absoluteStoredPath(value: string) {
  const raw = String(value || "");
  if (!raw) return "";
  if (path.isAbsolute(raw)) return path.resolve(raw);
  const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (/^(videos|pdfs|screenshots)\//i.test(clean)) return path.resolve(DATA_DIR, clean);
  return path.resolve(raw);
}
function normalize(p: string) { return absoluteStoredPath(p).replace(/\\/g, "/").toLowerCase(); }
function inside(root: string, target: string) {
  const r = normalize(root), t = normalize(target);
  return t === r || t.startsWith(r + "/");
}
function validName(raw: string) {
  const n = String(raw || "").trim();
  if (!n || n === "." || n === ".." || /[<>:"/\\|?*\x00-\x1F]/.test(n)) throw new Error("Invalid resource name");
  return n;
}
function sortEntries(a: fs.Dirent, b: fs.Dirent) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}
function tree(dir: string): any[] {
  return fs.readdirSync(dir, { withFileTypes: true }).sort(sortEntries)
    .filter((e) => e.isDirectory() || /\.pdf$/i.test(e.name) || VIDEO.has(path.extname(e.name).toLowerCase()))
    .map((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return { name: e.name, path: p, type: "folder", children: tree(p) };
      return { name: e.name, path: p, type: "file", fileType: /\.pdf$/i.test(e.name) ? "pdf" : "video" };
    });
}
async function getRoot() {
  await initDatabase();
  const r = await db.execute("SELECT root_path FROM resource_sync_config WHERE id=1 LIMIT 1");
  const value = String((r.rows[0] as any)?.root_path || "");
  if (!value || !isDir(value)) throw new Error("Set a valid Resource Root first.");
  return path.resolve(value);
}

async function rewritePaths(oldPath: string, newPath: string) {
  const oldNorm = normalize(oldPath), newAbs = path.resolve(newPath).replace(/\\/g, "/");
  const tables = [
    ["chapter_videos", "path_or_url"],
    ["chapter_playlists", "video_root_path"],
    ["chapter_playlists", "class_video_path"],
    ["chapter_playlists", "dpp_video_path"],
    ["pdfs", "source_path"],
  ] as const;

  for (const [table, column] of tables) {
    const rows = await db.execute(`SELECT rowid AS rid, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`);
    for (const row of rows.rows as any[]) {
      const value = String(row.value || "");
      if (!value) continue;
      const n = normalize(value);
      if (n === oldNorm || n.startsWith(oldNorm + "/")) {
        const suffix = n.slice(oldNorm.length);
        const replacement = newAbs + suffix;
        await db.execute({ sql: `UPDATE ${table} SET ${column}=? WHERE rowid=?`, args: [replacement, row.rid] });
      }
    }
  }
}

async function removeVideoRecords(target: string) {
  const norm = normalize(target);
  const rows = await db.execute("SELECT id, path_or_url FROM chapter_videos");
  for (const row of rows.rows as any[]) {
    const p = normalize(String(row.path_or_url || ""));
    if (p === norm || p.startsWith(norm + "/")) await db.execute({ sql: "DELETE FROM chapter_videos WHERE id=?", args: [row.id] });
  }

  const playlists = await db.execute("SELECT id, video_root_path FROM chapter_playlists");
  for (const row of playlists.rows as any[]) {
    const p = normalize(String(row.video_root_path || ""));
    if (p && (p === norm || p.startsWith(norm + "/"))) {
      await db.execute({ sql: "DELETE FROM chapter_videos WHERE playlist_id=?", args: [row.id] });
      await db.execute({ sql: "DELETE FROM chapter_playlists WHERE id=?", args: [row.id] });
    }
  }
}

export async function GET() {
  try {
    const root = await getRoot();
    return NextResponse.json({ rootPath: root, tree: tree(root) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load resource tree" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    await initDatabase();
    const body = await req.json();
    const action = String(body.action || "");

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

    const root = await getRoot();
    const target = path.resolve(String(body.path || ""));
    if (!inside(root, target) || target === root) return NextResponse.json({ error: "Invalid resource path" }, { status: 400 });
    if (!isDir(target) && !isFile(target)) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

    if (action === "rename") {
      const name = validName(body.name);
      const next = path.join(path.dirname(target), name);
      if (!inside(root, next) || fs.existsSync(next)) return NextResponse.json({ error: "A resource with that name already exists." }, { status: 409 });
      fs.renameSync(target, next);
      await rewritePaths(target, next);
      return NextResponse.json({ success: true, oldPath: target, newPath: next });
    }

    if (action === "delete") {
      // IMPORTANT: deleting a source PDF never deletes the canonical Notes Viewer PDF row,
      // annotations, bookmarks or flashcard links. The source simply disappears from the tree.
      await removeVideoRecords(target);
      fs.rmSync(target, { recursive: true, force: true });
      return NextResponse.json({ success: true, deletedPath: target });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Resource operation failed" }, { status: 500 });
  }
}
