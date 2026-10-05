import { NextRequest, NextResponse } from "next/server";
import { exportBackup, importZip, importLegacyJson, type ImportMode } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/backup            -> full backup zip (database + screenshots)
// GET /api/backup?pdfs=1     -> same, plus the PDF files
export async function GET(req: NextRequest) {
  try {
    const pdfs = req.nextUrl.searchParams.get("pdfs") === "1";
    const { zip, counts } = await exportBackup({ pdfs });
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const name = `gate-2027-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}${pdfs ? "-with-pdfs" : ""}.zip`;
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Backup-Counts": JSON.stringify(counts),
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Export Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/backup?mode=merge|replace
//   Content-Type: application/zip   -> full backup (this version)
//   Content-Type: application/json  -> old v1/v2 JSON backup (flashcards export)
export async function POST(req: NextRequest) {
  try {
    const type = (req.headers.get("content-type") || "").toLowerCase();
    if (type.includes("application/json")) {
      const counts = await importLegacyJson(await req.json());
      return NextResponse.json({ legacy: true, tables: counts });
    }
    const mode: ImportMode = req.nextUrl.searchParams.get("mode") === "replace" ? "replace" : "merge";
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: "Empty file." }, { status: 400 });
    const result = await importZip(buf, mode);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Import Error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
