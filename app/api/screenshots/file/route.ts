import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { resolveShotPath } from "@/lib/paths";
import { MIME_BY_EXT } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/screenshots/file?p=screenshots/<errorId>/<imageId>.png
export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get("p") || "";
  const abs = resolveShotPath(rel);
  const ext = path.extname(rel).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!abs || !mime || !fs.existsSync(abs)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": mime,
      "X-Content-Type-Options": "nosniff",
      // file names contain a unique image id, content never changes
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
