import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// GET annotations for a specific PDF
export async function GET(req: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(req.url);
    const pdfId = searchParams.get("pdfId");

    if (!pdfId) {
      return NextResponse.json({ error: "pdfId parameter is required" }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT page, items_json FROM pdf_annotations WHERE pdf_id = ?`,
      args: [pdfId],
    });

    const annotations: Record<number, any[]> = {};
    result.rows.forEach((row: any) => {
      try {
        annotations[row.page] = JSON.parse(row.items_json);
      } catch (e) {
        annotations[row.page] = [];
      }
    });

    return NextResponse.json({ annotations });
  } catch (error: any) {
    console.error("Get Annotations Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST / Save annotations for a specific PDF page
export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json();
    const { pdfId, page, items } = body;

    if (!pdfId || page === undefined || !Array.isArray(items)) {
      return NextResponse.json({ error: "pdfId, page, and items array are required" }, { status: 400 });
    }

    const key = `${pdfId}:${page}`;

    if (items.length === 0) {
      // Delete if no annotations left on this page
      await db.execute({
        sql: `DELETE FROM pdf_annotations WHERE key = ?`,
        args: [key],
      });
    } else {
      const itemsJson = JSON.stringify(items);
      // Insert or update
      await db.execute({
        sql: `INSERT INTO pdf_annotations (key, pdf_id, page, items_json, updated_at) 
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(key) DO UPDATE SET items_json = ?, updated_at = CURRENT_TIMESTAMP`,
        args: [key, pdfId, page, itemsJson, itemsJson],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save Annotations Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}