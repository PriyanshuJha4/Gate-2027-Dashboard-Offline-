import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { dedupeAndNormalizePdfs } from "@/lib/pdfCatalog";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDatabase();
    await dedupeAndNormalizePdfs();
    const result = await db.execute("SELECT * FROM pdfs ORDER BY created_at DESC");

    const pdfs = result.rows.map((row: any) => ({
      id: row.id,
      name: row.title,
      originalName: row.original_filename,
      relativePath: row.relative_path,
      subject: row.subject,
      chapter: row.chapter,
      size: row.file_size,
      addedAt: row.created_at,
      lastPage: row.last_page,
    }));

    return NextResponse.json({ pdfs });
  } catch (error: any) {
    console.error("List PDFs Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}