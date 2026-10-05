import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { resolvePdfPath } from "@/lib/paths";

// Force dynamic rendering to prevent static prerender errors with searchParams/request.url
export const dynamic = "force-dynamic";

// Serves ONLY .pdf files that live inside the pdfs/ folder (never local.db, .env.local, source code...).
// Supports HTTP Range requests so big PDFs open fast and pdf.js can stream pages.
export async function GET(req: NextRequest) {
  try {
    const p = new URL(req.url).searchParams.get("path");
    if (!p) return NextResponse.json({ error: "Path parameter is required" }, { status: 400 });

    const abs = resolvePdfPath(p);
    if (!abs || !abs.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
    }
    if (!fs.existsSync(abs)) {
      return NextResponse.json({ error: "File not found on server" }, { status: 404 });
    }

    const size = fs.statSync(abs).size;
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };

    const range = req.headers.get("range");
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
      let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      const buf = Buffer.alloc(end - start + 1);
      const fd = fs.openSync(abs, "r");
      try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
      return new NextResponse(new Uint8Array(buf), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(buf.length) },
      });
    }

    return new NextResponse(new Uint8Array(fs.readFileSync(abs)), {
      headers: { ...headers, "Content-Length": String(size) },
    });
  } catch (error: any) {
    console.error("Serve PDF Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
