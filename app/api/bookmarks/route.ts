import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// GET bookmarks for a specific PDF
export async function GET(req: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(req.url);
    const pdfId = searchParams.get("pdfId");

    if (!pdfId) {
      return NextResponse.json({ error: "pdfId parameter is required" }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT id, pdf_id as pdfId, page, label, created_at as createdAt FROM pdf_bookmarks WHERE pdf_id = ? ORDER BY page ASC`,
      args: [pdfId],
    });

    return NextResponse.json({ bookmarks: result.rows });
  } catch (error: any) {
    console.error("Get Bookmarks Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST / Save a bookmark
export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json();
    const { id, pdfId, page, label, createdAt } = body;

    if (!id || !pdfId || page === undefined || !label) {
      return NextResponse.json({ error: "id, pdfId, page, and label are required" }, { status: 400 });
    }

    await db.execute({
      sql: `INSERT OR REPLACE INTO pdf_bookmarks (id, pdf_id, page, label, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [id, pdfId, page, label, createdAt || new Date().toISOString()],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save Bookmark Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE a bookmark
export async function DELETE(req: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    await db.execute({
      sql: `DELETE FROM pdf_bookmarks WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete Bookmark Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}