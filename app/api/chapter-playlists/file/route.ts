import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { db, initDatabase } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = new Set([".mp4", ".webm", ".m4v", ".mov", ".ogg"]);

export async function GET(request: Request) {
  try {
    await initDatabase();
    const raw = new URL(request.url).searchParams.get("path");
    if (!raw) return NextResponse.json({ error: "path required" }, { status: 400 });
    const normalized = raw.replace(/\\/g, path.sep);
    let abs: string;
    if (path.isAbsolute(normalized)) {
      const found = await db.execute({ sql: "SELECT 1 FROM chapter_videos WHERE path_or_url=? LIMIT 1", args: [raw] });
      if (!found.rows.length) return NextResponse.json({ error: "Unregistered video path" }, { status: 403 });
      abs = path.resolve(normalized);
    } else {
      const rel = raw.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!rel.toLowerCase().startsWith("videos/")) return NextResponse.json({ error: "Only registered video files are allowed" }, { status: 403 });
      abs = path.resolve(DATA_DIR, rel);
      const root = path.resolve(DATA_DIR, "Videos") + path.sep;
      if (!abs.startsWith(root)) return NextResponse.json({ error: "Invalid video path" }, { status: 403 });
    }
    const ext = path.extname(abs).toLowerCase();
    if (!ALLOWED.has(ext)) return NextResponse.json({ error: "Unsupported video type" }, { status: 415 });
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return NextResponse.json({ error: "Video not found" }, { status: 404 });
    const stat = fs.statSync(abs); const size = stat.size; const range = request.headers.get("range");
    const mime = ext === ".webm" ? "video/webm" : ext === ".ogg" ? "video/ogg" : "video/mp4";
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) { const start=Number(m[1]); const end=m[2]?Number(m[2]):Math.min(start+1024*1024-1,size-1); if(start>=size||end<start)return new NextResponse(null,{status:416,headers:{"Content-Range":`bytes */${size}`}}); const stream=fs.createReadStream(abs,{start,end}); return new NextResponse(Readable.toWeb(stream) as any,{status:206,headers:{"Content-Type":mime,"Content-Length":String(end-start+1),"Content-Range":`bytes ${start}-${end}/${size}`,"Accept-Ranges":"bytes","Cache-Control":"no-store"}}); }
    }
    return new NextResponse(Readable.toWeb(fs.createReadStream(abs)) as any,{headers:{"Content-Type":mime,"Content-Length":String(size),"Accept-Ranges":"bytes","Cache-Control":"no-store"}});
  } catch (error:any) { return NextResponse.json({error:error?.message||"Failed to stream video"},{status:500}); }
}
